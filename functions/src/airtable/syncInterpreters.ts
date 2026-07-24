import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { normalizeIdentityName, normalizeIdentityPhone } from './identityMatching';
import {
  mergeProfessionalRows,
  ProfessionalProfileStatus,
  resolveImportedProfessionalAccountStatus,
  resolveImportedProfessionalStatus,
} from './professionalImportPolicy';

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

const db = admin.firestore();
const DEFAULT_BASE_ID = 'appnglRJzSscwJJph';
const INTERPRETERS_TABLE = 'Interpreters';

const normalize = (value: unknown): string => {
  if (Array.isArray(value)) return normalize(value[0]);
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const assertAdmin = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Administrator authentication is required');
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || snap.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(snap.data()?.role || ''))) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can import interpreters');
  }
};

const fetchInterpreterRecords = async (): Promise<AirtableRecord[]> => {
  const apiKey = String(process.env.AIRTABLE_API_KEY || '').trim();
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured');
  }

  const baseId = String(process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID).trim();
  const records: AirtableRecord[] = [];
  let offset = '';

  do {
    const response = await axios.get(
      `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(INTERPRETERS_TABLE)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: {
          pageSize: 100,
          ...(offset ? { offset } : {}),
        },
        timeout: 30000,
      }
    );
    records.push(...((response.data?.records || []) as AirtableRecord[]));
    offset = String(response.data?.offset || '');
  } while (offset);

  return records;
};

export const syncAirtableInterpreters = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB',
}).https.onCall(async (data, context) => {
  await assertAdmin(context.auth?.uid);
  const dryRun = data?.dryRun !== false;
  const records = await fetchInterpreterRecords();
  const merged = mergeProfessionalRows(records);
  const imports = merged.imports;

  const [usersSnap, interpretersSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('interpreters').get(),
  ]);

  const usersByEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  const interpreterUsersByProfileId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  usersSnap.docs.forEach(item => {
    const email = normalize(item.data().email).toLowerCase();
    if (email) usersByEmail.set(email, [...(usersByEmail.get(email) || []), item]);
    if (normalize(item.data().role) !== 'INTERPRETER') return;
    const profileId = normalize(item.data().profileId);
    if (profileId) {
      interpreterUsersByProfileId.set(
        profileId,
        [...(interpreterUsersByProfileId.get(profileId) || []), item],
      );
    }
  });

  const interpretersByEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  const interpretersBySourceId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  const interpretersByNamePhone = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  interpretersSnap.docs.forEach(item => {
    const value = item.data();
    const email = normalize(value.email).toLowerCase();
    if (email) {
      interpretersByEmail.set(email, [...(interpretersByEmail.get(email) || []), item]);
    }
    const sourceIds = Array.from(new Set([
      normalize(value.sourceRecordId),
      ...(Array.isArray(value.airtableRecordIds) ? value.airtableRecordIds.map(String) : []),
    ].filter(Boolean)));
    sourceIds.forEach(sourceId => (
      interpretersBySourceId.set(sourceId, [...(interpretersBySourceId.get(sourceId) || []), item])
    ));
    const namePhoneKey = `${normalizeIdentityName(normalize(value.name))}|${normalizeIdentityPhone(normalize(value.normalizedPhone || value.phone))}`;
    if (namePhoneKey !== '|') {
      interpretersByNamePhone.set(namePhoneKey, [...(interpretersByNamePhone.get(namePhoneKey) || []), item]);
    }
  });

  const sourceStatusCounts = imports.reduce<Record<string, number>>((counts, item) => {
    counts[item.sourceStatus] = (counts[item.sourceStatus] || 0) + 1;
    return counts;
  }, {});
  const stats = {
    sourceRows: records.length,
    total: imports.length,
    deduplicated: imports.filter(item => item.airtableRecordIds.length > 1).length,
    ambiguousSourceRows: merged.ambiguousSourceRecordIds.length,
    portalEligible: imports.filter(item => item.portalEligible).length,
    passiveProfiles: imports.filter(item => !item.portalEligible).length,
    profilesWithoutEmail: imports.filter(item => !item.email).length,
    bySourceStatus: sourceStatusCounts,
    created: 0,
    updated: 0,
    profileOnly: 0,
    usersCreated: 0,
    usersUpdated: 0,
    accountConflicts: 0,
    conflict: 0,
    skipped: 0,
    errors: 0,
  };
  const details: Array<{
    name: string;
    email: string;
    action: string;
    status?: string;
    sourceRecordIds?: string[];
    reason?: string;
  }> = [];
  const writes: Array<() => Promise<void>> = [];
  const now = new Date().toISOString();
  const ambiguousSourceRecordIds = new Set(merged.ambiguousSourceRecordIds);

  for (const item of imports) {
    try {
      const ambiguousIds = item.airtableRecordIds.filter(sourceId => ambiguousSourceRecordIds.has(sourceId));
      if (ambiguousIds.length > 0) {
        stats.conflict += 1;
        stats.skipped += 1;
        details.push({
          name: item.name,
          email: item.email,
          action: 'conflict',
          status: item.sourceStatus,
          sourceRecordIds: item.airtableRecordIds,
          reason: `Conflicting Airtable identity evidence on source record(s): ${ambiguousIds.join(', ')}`,
        });
        continue;
      }

      const sourceMatches = Array.from(new Map(
        item.airtableRecordIds
          .flatMap(sourceId => interpretersBySourceId.get(sourceId) || [])
          .map(profile => [profile.id, profile]),
      ).values());
      if (sourceMatches.length > 1) {
        stats.conflict += 1;
        stats.skipped += 1;
        details.push({
          name: item.name,
          email: item.email,
          action: 'conflict',
          status: item.sourceStatus,
          sourceRecordIds: item.airtableRecordIds,
          reason: `Airtable source records already point to multiple profiles: ${sourceMatches.map(profile => profile.id).join(', ')}`,
        });
        continue;
      }

      const normalizedName = normalizeIdentityName(item.name);
      const normalizedPhone = normalizeIdentityPhone(item.phone);
      const emailProfileMatches = (item.email ? interpretersByEmail.get(item.email) || [] : []).filter(profile => {
        const profileData = profile.data();
        const sameName = normalizedName
          && normalizeIdentityName(normalize(profileData.normalizedName || profileData.name)) === normalizedName;
        const samePhone = normalizedPhone
          && normalizeIdentityPhone(normalize(profileData.normalizedPhone || profileData.phone)) === normalizedPhone;
        return Boolean(sameName || samePhone);
      });
      const namePhoneMatches = normalizedName && normalizedPhone
        ? interpretersByNamePhone.get(`${normalizedName}|${normalizedPhone}`) || []
        : [];
      const identityMatches = Array.from(new Map(
        [...emailProfileMatches, ...namePhoneMatches].map(profile => [profile.id, profile]),
      ).values());
      const emailUsers = item.email ? usersByEmail.get(item.email) || [] : [];
      const interpreterUsers = emailUsers.filter(user => normalize(user.data().role) === 'INTERPRETER');
      const linkedProfileIds = interpreterUsers.map(user => normalize(user.data().profileId)).filter(Boolean);
      const linkedProfiles = linkedProfileIds
        .map(profileId => interpretersSnap.docs.find(profile => profile.id === profileId))
        .filter((profile): profile is FirebaseFirestore.QueryDocumentSnapshot => Boolean(profile))
        .filter(profile => {
          const profileData = profile.data();
          return (
            normalizeIdentityName(normalize(profileData.normalizedName || profileData.name)) === normalizedName
            || (
              Boolean(normalizedPhone)
              && normalizeIdentityPhone(normalize(profileData.normalizedPhone || profileData.phone)) === normalizedPhone
            )
          );
        });
      const existingInterpreter = sourceMatches[0]
        || (linkedProfiles.length === 1 ? linkedProfiles[0] : undefined)
        || (identityMatches.length === 1 ? identityMatches[0] : undefined);
      const interpreterRef = existingInterpreter?.ref
        || db.collection('interpreters').doc(`airtable_${item.sourceRecordId}`);
      const profileUsers = interpreterUsersByProfileId.get(interpreterRef.id) || [];
      const candidateInterpreterUsers = Array.from(new Map(
        [...profileUsers, ...interpreterUsers].map(user => [user.id, user]),
      ).values());
      const existingStatus = normalize(existingInterpreter?.data().status);
      const profileStatus = resolveImportedProfessionalStatus(
        item.profileStatus as ProfessionalProfileStatus,
        existingStatus,
      );
      const workEligibleStatus = profileStatus === 'ACTIVE' || profileStatus === 'ONLY_TRANSL';
      const accountEligible = item.portalEligible && workEligibleStatus;
      const existingUser = candidateInterpreterUsers.length === 1
        && (!normalize(candidateInterpreterUsers[0].data().profileId) || normalize(candidateInterpreterUsers[0].data().profileId) === interpreterRef.id)
        ? candidateInterpreterUsers[0]
        : undefined;
      const accountConflict = Boolean(item.email) && (
        emailUsers.some(user => normalize(user.data().role) !== 'INTERPRETER')
        || interpreterUsers.length > 1
        || (interpreterUsers.length === 1
          && Boolean(normalize(interpreterUsers[0].data().profileId))
          && normalize(interpreterUsers[0].data().profileId) !== interpreterRef.id)
      ) || profileUsers.length > 1;
      const shouldWriteUser = Boolean(existingUser)
        || (!accountConflict && accountEligible && Boolean(item.email) && emailUsers.length === 0);
      if (accountConflict) stats.accountConflicts += 1;
      if (!shouldWriteUser) stats.profileOnly += 1;

      const interpreterPayload = {
        id: interpreterRef.id,
        name: item.name,
        normalizedName,
        normalizedPhone,
        email: item.email || normalize(existingInterpreter?.data().email),
        phone: item.phone || normalize(existingInterpreter?.data().phone),
        languages: item.languages.length ? item.languages : existingInterpreter?.data().languages || [],
        languageProficiencies: item.languageProficiencies.length
          ? item.languageProficiencies
          : existingInterpreter?.data().languageProficiencies || [],
        address: {
          houseNumber: existingInterpreter?.data().address?.houseNumber || '',
          street: item.address.street || existingInterpreter?.data().address?.street || '',
          town: item.address.town || existingInterpreter?.data().address?.town || '',
          county: item.address.county || existingInterpreter?.data().address?.county || '',
          postcode: item.address.postcode || existingInterpreter?.data().address?.postcode || '',
          country: item.address.country || existingInterpreter?.data().address?.country || 'UK',
          ...(existingInterpreter?.data().address?.lat !== undefined
            ? { lat: existingInterpreter.data().address.lat }
            : {}),
          ...(existingInterpreter?.data().address?.lng !== undefined
            ? { lng: existingInterpreter.data().address.lng }
            : {}),
        },
        qualifications: item.qualifications.length
          ? item.qualifications
          : existingInterpreter?.data().qualifications || [],
        regions: item.regions.length ? item.regions : existingInterpreter?.data().regions || [],
        gender: existingInterpreter?.data().gender || 'O',
        hasCar: existingInterpreter?.data().hasCar ?? false,
        keyInterpreter: existingInterpreter?.data().keyInterpreter ?? false,
        documentUrls: existingInterpreter?.data().documentUrls || [],
        dbs: existingInterpreter?.data().dbs || { level: 'N/A', autoRenew: false },
        nrpsi: existingInterpreter?.data().nrpsi || { registered: false },
        badge: existingInterpreter?.data().badge || { idStatus: 'Not made yet' },
        onboarding: existingInterpreter?.data().onboarding || {
          dbs: { status: 'MISSING' },
          idCheck: { status: 'MISSING' },
          certifications: { status: 'MISSING' },
          rightToWork: { status: 'MISSING' },
          overallStatus: 'DOCUMENTS_PENDING',
        },
        isAvailable: workEligibleStatus ? existingInterpreter?.data().isAvailable ?? false : false,
        status: profileStatus,
        airtableStatus: item.sourceStatus,
        airtableStatuses: item.sourceStatuses,
        translationOnly: item.translationOnly,
        passiveMode: !accountEligible,
        portalEligible: accountEligible,
        accountProvisioning: shouldWriteUser
          ? existingUser
            ? accountEligible ? 'EXISTING_ACCOUNT' : 'EXISTING_ACCOUNT_SUSPENDED'
            : 'IMPORTED_PENDING_ACTIVATION'
          : accountConflict ? 'ACCOUNT_IDENTITY_CONFLICT' : 'PROFILE_ONLY',
        organizationId: existingInterpreter?.data().organizationId || 'lingland-main',
        sourceSystem: 'AIRTABLE',
        sourceBaseId: String(process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID),
        sourceTable: INTERPRETERS_TABLE,
        sourceRecordId: item.sourceRecordId,
        airtableRecordIds: item.airtableRecordIds,
        sourceRecordCount: item.airtableRecordIds.length,
        legacyRef: item.name,
        sourceSnapshot: item.sourceSnapshot,
        lastSyncedAt: now,
        updatedAt: now,
        createdAt: existingInterpreter?.data().createdAt || now,
      };

      const userRef = shouldWriteUser ? existingUser?.ref || db.collection('users').doc() : null;
      const existingUserStatus = normalize(existingUser?.data().status);
      const userStatus = resolveImportedProfessionalAccountStatus(accountEligible, existingUserStatus);
      const userPayload = userRef ? {
        id: userRef.id,
        displayName: item.name,
        email: item.email || normalize(existingUser?.data().email),
        role: 'INTERPRETER',
        status: userStatus,
        profileId: interpreterRef.id,
        organizationId: existingUser?.data().organizationId || 'lingland-main',
        updatedAt: now,
        createdAt: existingUser?.data().createdAt || now,
      } : null;

      if (existingInterpreter) stats.updated += 1;
      else stats.created += 1;
      if (userRef) {
        if (existingUser) stats.usersUpdated += 1;
        else stats.usersCreated += 1;
      }
      details.push({
        name: item.name,
        email: item.email,
        action: existingInterpreter ? 'updated' : 'created',
        status: profileStatus,
        sourceRecordIds: item.airtableRecordIds,
        ...(accountConflict ? { reason: 'Profile imported without changing the conflicting account identity.' } : {}),
      });

      if (!dryRun) {
        writes.push(async () => {
          const batch = db.batch();
          batch.set(interpreterRef, interpreterPayload, { merge: true });
          if (userRef && userPayload) batch.set(userRef, userPayload, { merge: true });
          await batch.commit();
        });
      }
    } catch (error: any) {
      stats.errors += 1;
      details.push({ name: item.name, email: item.email, action: 'error', reason: error?.message || 'Unknown import error' });
    }
  }

  if (!dryRun) {
    for (let index = 0; index < writes.length; index += 20) {
      await Promise.all(writes.slice(index, index + 20).map(write => write()));
    }
  }

  await db.collection('syncRuns').add({
    type: 'AIRTABLE_INTERPRETERS',
    dryRun,
    stats,
    triggeredBy: context.auth!.uid,
    sourceBaseId: String(process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID),
    sourceTable: INTERPRETERS_TABLE,
    createdAt: now,
  });

  return {
    success: stats.errors === 0 && stats.conflict === 0,
    dryRun,
    stats,
    details: details.slice(0, 200),
  };
});
