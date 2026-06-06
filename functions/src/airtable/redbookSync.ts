import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type SyncAction = 'created' | 'updated' | 'skipped' | 'conflict' | 'error';

type SyncMode = {
  dryRun: boolean;
  limitRecords: number;
  triggeredBy: 'manual' | 'schedule';
  userId?: string;
};

const db = admin.firestore();
const DEFAULT_BASE_ID = 'appF50EzH7zVQdwAv';
const DEFAULT_TABLE_NAME = 'REDBOOK';
const MAX_DETAILS = 50;

const normalize = (value: unknown): string => {
  if (Array.isArray(value)) return normalize(value[0]);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const pick = (fields: Record<string, unknown>, names: string[]): string => {
  for (const name of names) {
    const direct = normalize(fields[name]);
    if (direct) return direct;
  }

  const normalizedMap = new Map<string, string>();
  Object.entries(fields).forEach(([key, value]) => {
    normalizedMap.set(key.toLowerCase().replace(/[^a-z0-9]/g, ''), normalize(value));
  });

  for (const name of names) {
    const val = normalizedMap.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (val) return val;
  }

  return '';
};

const parseJobNumber = (value: string): string => {
  const match = value.match(/LING\d{2}\.\d+/i);
  return match ? match[0].toUpperCase() : value;
};

const parseLanguageTo = (fields: Record<string, unknown>, reference: string): string => {
  const explicit = pick(fields, ['Language Requested', 'Language', 'LANGUAGE', 'Language To', 'Target Language']);
  if (explicit) {
    const toMatch = explicit.match(/\bto\s+(.+)$/i);
    return toMatch ? toMatch[1].trim() : explicit;
  }

  const refMatch = reference.match(/LING\d{2}\.\d+\s+(.+)$/i);
  return refMatch ? refMatch[1].trim() : 'Unknown';
};

const parseDateTime = (fields: Record<string, unknown>) => {
  const rawDateTime = pick(fields, ['Booking Date & Time', 'Booked For', 'Date & Time', 'Start Date Time', 'Appointment']);
  const rawDate = pick(fields, ['Booking Date', 'Date', 'Session Date', 'Booked Date']);
  const rawTime = pick(fields, ['Start Time', 'Time', 'Booking Time', 'Session Time']);
  const raw = rawDateTime || [rawDate, rawTime].filter(Boolean).join(' ');
  const parsed = raw ? new Date(raw) : null;

  if (parsed && !Number.isNaN(parsed.getTime())) {
    return {
      date: parsed.toISOString().split('T')[0],
      startTime: parsed.toTimeString().slice(0, 5)
    };
  }

  return {
    date: rawDate || new Date().toISOString().split('T')[0],
    startTime: rawTime || '09:00'
  };
};

const parseDuration = (value: string): number => {
  const minutes = Number(value.match(/\d+/)?.[0] || 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
};

const mapStatus = (rawStatus: string): string => {
  const status = rawStatus.toLowerCase();
  if (status.includes('cancel')) return 'CANCELLED';
  if (status.includes('paid')) return 'PAID';
  if (status.includes('invoice')) return status.includes('ready') ? 'READY_FOR_INVOICE' : 'INVOICED';
  if (status.includes('timesheet')) return 'TIMESHEET_SUBMITTED';
  if (status.includes('complete') || status.includes('done')) return 'SESSION_COMPLETED';
  if (status.includes('pending')) return 'ASSIGNMENT_PENDING';
  if (status.includes('assign') || status.includes('book')) return 'OPENED';
  return 'INCOMING';
};

const mapLocationType = (sessionType: string, location: string): 'ONSITE' | 'ONLINE' => {
  const value = `${sessionType} ${location}`.toLowerCase();
  return value.includes('online') || value.includes('virtual') || value.includes('video') || value.includes('phone')
    ? 'ONLINE'
    : 'ONSITE';
};

const stableHash = (value: unknown): string => {
  const json = JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i += 1) {
    hash = ((hash << 5) - hash) + json.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
};

const getPlatformMode = async () => {
  const settings = await db.collection('system').doc('settings').get();
  return settings.data()?.platformMode || {};
};

const assertAdmin = async (context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
  }

  const user = await db.collection('users').doc(context.auth.uid).get();
  const role = user.data()?.role;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can sync REDBOOK.');
  }
};

const fetchAirtableRecords = async (limitRecords: number) => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_REDBOOK_BASE_ID || DEFAULT_BASE_ID;
  const tableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;

  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured.');
  }

  const records: AirtableRecord[] = [];
  let offset = '';

  do {
    const params: Record<string, string | number> = { pageSize: 100 };
    if (offset) params.offset = offset;

    const response = await axios.get<{ records: AirtableRecord[]; offset?: string }>(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        params
      }
    );

    records.push(...response.data.records);
    offset = response.data.offset || '';
  } while (offset && records.length < limitRecords);

  return records.slice(0, limitRecords);
};

const findExistingBooking = async (record: AirtableRecord, jobNumber: string, legacyRef: string) => {
  const bySource = await db.collection('bookings')
    .where('sourceRecordId', '==', record.id)
    .limit(1)
    .get();
  if (!bySource.empty && bySource.docs[0].data().sourceSystem === 'AIRTABLE') return bySource.docs[0].ref;

  if (legacyRef) {
    const byLegacy = await db.collection('bookings').where('legacyAirtableRef', '==', legacyRef).limit(1).get();
    if (!byLegacy.empty) return byLegacy.docs[0].ref;
  }

  if (jobNumber) {
    const byJob = await db.collection('bookings').where('jobNumber', '==', jobNumber).limit(1).get();
    if (!byJob.empty) return byJob.docs[0].ref;
  }

  return db.collection('bookings').doc(`airtable_${record.id}`);
};

const mapRecordToBooking = (record: AirtableRecord) => {
  const fields = record.fields;
  const legacyRef = pick(fields, ['Job Number', 'Job Number / Language', 'Job ID', 'Reference', 'Booking Ref', 'REDBOOK ID']);
  const jobNumber = parseJobNumber(legacyRef) || `AIRTABLE-${record.id}`;
  const languageTo = parseLanguageTo(fields, legacyRef);
  const schedule = parseDateTime(fields);
  const sessionType = pick(fields, ['Session Type', 'Type', 'Method', 'Service Mode']);
  const location = pick(fields, ['Session Location', 'Location', 'Address', 'Venue']);
  const status = mapStatus(pick(fields, ['Status', 'Job Status', 'Booking Status']));

  const sourceSnapshot = {
    legacyRef,
    jobNumber,
    clientName: pick(fields, ['Organisation / Department', 'Organisation', 'Organization', 'Client', 'Customer', 'Department']) || 'Airtable Client',
    professionalName: pick(fields, ['Booking By', 'Professional', 'Contact Name', 'Requester', 'Requested By']),
    contactEmail: pick(fields, ['Contact Email', 'Email', 'Requester Email']).toLowerCase(),
    languageFrom: pick(fields, ['Language From', 'Source Language']) || 'English',
    languageTo,
    date: schedule.date,
    startTime: schedule.startTime,
    durationMinutes: parseDuration(pick(fields, ['Duration', 'Duration Minutes', 'Length'])),
    sessionType,
    location,
    postcode: pick(fields, ['Postcode', 'Post Code', 'ZIP']),
    onlineLink: pick(fields, ['Online Link', 'Video Link', 'Meeting Link']),
    costCode: pick(fields, ['Cost Code', 'Cost Code...', 'PO', 'Purchase Order']),
    notes: pick(fields, ['Notes', 'Special Instructions', 'Comments']),
    status,
    interpreterName: pick(fields, ['Interpreter', 'Interpreter Name', 'Assigned Interpreter'])
  };

  return {
    booking: {
      clientId: '',
      clientName: sourceSnapshot.clientName,
      requestedByUserId: '',
      organizationId: 'lingland-main',
      serviceCategory: 'INTERPRETATION',
      serviceType: 'Interpreting',
      languageFrom: sourceSnapshot.languageFrom,
      languageTo: sourceSnapshot.languageTo,
      date: sourceSnapshot.date,
      startTime: sourceSnapshot.startTime,
      durationMinutes: sourceSnapshot.durationMinutes,
      locationType: mapLocationType(sourceSnapshot.sessionType, sourceSnapshot.location),
      location: sourceSnapshot.location,
      address: sourceSnapshot.location,
      postcode: sourceSnapshot.postcode,
      onlineLink: sourceSnapshot.onlineLink,
      status: sourceSnapshot.status,
      costCode: sourceSnapshot.costCode,
      notes: sourceSnapshot.notes,
      professionalName: sourceSnapshot.professionalName,
      interpreterName: sourceSnapshot.interpreterName,
      bookingRef: sourceSnapshot.jobNumber,
      jobNumber: sourceSnapshot.jobNumber,
      displayRef: legacyRef || sourceSnapshot.jobNumber,
      legacyAirtableRef: legacyRef || sourceSnapshot.jobNumber,
      sourceSystem: 'AIRTABLE',
      sourceRecordId: record.id,
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date().toISOString(),
      airtableCreatedTime: record.createdTime || '',
      airtableSnapshotHash: stableHash(sourceSnapshot),
      guestContact: sourceSnapshot.contactEmail ? {
        name: sourceSnapshot.professionalName,
        organisation: sourceSnapshot.clientName,
        email: sourceSnapshot.contactEmail
      } : undefined,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    sourceSnapshot
  };
};

const syncRecords = async (mode: SyncMode) => {
  const platformMode = await getPlatformMode();
  const importMode = platformMode.airtableImportMode || 'ON';
  const records = await fetchAirtableRecords(mode.limitRecords);
  const runRef = db.collection('syncRuns').doc();
  const startedAt = new Date().toISOString();

  const stats: Record<SyncAction, number> = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflict: 0,
    error: 0
  };
  const details: Array<Record<string, unknown>> = [];

  if (importMode === 'OFF') {
    return {
      success: false,
      dryRun: mode.dryRun,
      importMode,
      message: 'Airtable import mode is OFF.',
      stats,
      details
    };
  }

  for (const record of records) {
    try {
      const mapped = mapRecordToBooking(record);
      const existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
      const existingSnap = await existingRef.get();
      const existing = existingSnap.exists ? existingSnap.data() : null;
      const previousHash = existing?.airtableSnapshotHash;
      const action: SyncAction = existingSnap.exists ? (previousHash === mapped.booking.airtableSnapshotHash ? 'skipped' : 'updated') : 'created';

      if (mode.dryRun || importMode === 'READ_ONLY') {
        stats[action] += 1;
      } else if (action === 'skipped') {
        stats.skipped += 1;
      } else {
        await existingRef.set({
          ...mapped.booking,
          createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await db.collection('jobEvents').add({
          jobId: existingRef.id,
          organizationId: 'lingland-main',
          type: existingSnap.exists ? 'SYNC_UPDATED_FROM_AIRTABLE' : 'SYNC_CREATED_FROM_AIRTABLE',
          source: 'airtable',
          description: existingSnap.exists ? 'REDBOOK record updated from Airtable sync.' : 'REDBOOK record created from Airtable sync.',
          metadata: {
            sourceRecordId: record.id,
            legacyAirtableRef: mapped.booking.legacyAirtableRef,
            dryRun: false
          },
          createdAt: new Date().toISOString()
        });

        stats[action] += 1;
      }

      if (details.length < MAX_DETAILS) {
        details.push({
          action,
          sourceRecordId: record.id,
          jobNumber: mapped.booking.jobNumber,
          displayRef: mapped.booking.displayRef,
          clientName: mapped.booking.clientName,
          status: mapped.booking.status
        });
      }
    } catch (error) {
      stats.error += 1;
      if (details.length < MAX_DETAILS) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const result = {
    success: stats.error === 0,
    dryRun: mode.dryRun || importMode === 'READ_ONLY',
    importMode,
    triggeredBy: mode.triggeredBy,
    userId: mode.userId || '',
    totalRecords: records.length,
    startedAt,
    finishedAt,
    stats,
    details
  };

  if (!mode.dryRun) {
    await runRef.set({
      ...result,
      kind: 'AIRTABLE_REDBOOK',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('system').doc('airtableRedbookSync').set({
      lastRunId: runRef.id,
      lastRunAt: finishedAt,
      lastStats: stats,
      lastTotalRecords: records.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return result;
};

export const syncRedbookJobs = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const dryRun = Boolean(data?.dryRun);
  const limitRecords = Math.min(Number(data?.limitRecords || 500), 5000);

  return syncRecords({
    dryRun,
    limitRecords,
    triggeredBy: 'manual',
    userId: context.auth?.uid
  });
});

export const scheduledRedbookSync = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).pubsub.schedule('every 10 minutes').timeZone('Europe/London').onRun(async () => {
  const platformMode = await getPlatformMode();
  const syncConfig = await db.collection('system').doc('airtableRedbookSync').get();
  if (syncConfig.data()?.scheduleEnabled !== true) {
    console.log('[REDBOOK Sync] Scheduled sync is disabled. Manual Dry Run/Sync remains available.');
    return null;
  }

  if ((platformMode.airtableImportMode || 'ON') !== 'ON') {
    console.log('[REDBOOK Sync] Skipped because import mode is not ON.');
    return null;
  }

  await syncRecords({
    dryRun: false,
    limitRecords: 5000,
    triggeredBy: 'schedule'
  });

  return null;
});
