import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';
import { createHash } from 'crypto';
import { resolveClientPortalAccess } from '../clients/clientPortalAccess';

const db = admin.firestore();

const cleanString = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const cleanEmail = (value: unknown) => cleanString(value, 320).toLowerCase();
const normalizeOrganizationName = (value: unknown) => cleanString(value, 250)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const stableId = (prefix: string, value: string) => `${prefix}_${createHash('sha1').update(value).digest('hex').slice(0, 20)}`;
const placeholderOrganizations = new Set(['client', 'airtable client', 'unknown client', 'guest org', 'home', 'n a']);
const sharedMailboxPrefixes = /^(accounts?|admin|appointments?|bookings?|enquiries?|finance|info|invoices?|office|payments?|reception|referrals?|team)([._+-]|$)/i;

const canonicalClientDocument = async (document: FirebaseFirestore.DocumentSnapshot) => {
  let current = document;
  for (let depth = 0; depth < 4; depth += 1) {
    const redirectId = cleanString(current.data()?.mergedIntoClientId, 160);
    if (!redirectId || redirectId === current.id) return current;
    const redirect = await db.collection('clients').doc(redirectId).get();
    if (!redirect.exists) return current;
    current = redirect;
  }
  return current;
};

const resolvePublicOrganization = async (organizationName: string) => {
  const normalizedCompanyName = normalizeOrganizationName(organizationName);
  if (!normalizedCompanyName || placeholderOrganizations.has(normalizedCompanyName)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid organisation name is required.');
  }

  const [normalizedMatches, literalMatches] = await Promise.all([
    db.collection('clients').where('normalizedCompanyName', '==', normalizedCompanyName).limit(10).get(),
    db.collection('clients').where('companyName', '==', organizationName).limit(10).get(),
  ]);
  const matchedDocuments = Array.from(new Map(
    [...normalizedMatches.docs, ...literalMatches.docs].map(document => [document.id, document]),
  ).values());
  const canonicalMatches = await Promise.all(matchedDocuments.map(canonicalClientDocument));
  const canonicalById = new Map(canonicalMatches.map(document => [document.id, document]));
  if (canonicalById.size === 1) {
    const document = Array.from(canonicalById.values())[0];
    return {
      clientId: document.id,
      clientName: cleanString(document.data()?.companyName || organizationName, 250),
      status: 'RESOLVED' as const,
      candidateClientIds: [document.id],
      createPatch: null,
    };
  }
  if (canonicalById.size > 1) {
    return {
      clientId: '',
      clientName: organizationName,
      status: 'AMBIGUOUS' as const,
      candidateClientIds: Array.from(canonicalById.keys()).sort(),
      createPatch: null,
    };
  }

  const clientId = stableId('public_client', normalizedCompanyName);
  const clientRef = db.collection('clients').doc(clientId);
  const existing = await clientRef.get();
  if (existing.exists) {
    const canonical = await canonicalClientDocument(existing);
    return {
      clientId: canonical.id,
      clientName: cleanString(canonical.data()?.companyName || organizationName, 250),
      status: 'RESOLVED' as const,
      candidateClientIds: [canonical.id],
      createPatch: null,
    };
  }

  return {
    clientId,
    clientName: organizationName,
    status: 'PROVISIONAL' as const,
    candidateClientIds: [clientId],
    createPatch: {
      ref: clientRef,
      data: {
        id: clientId,
        organizationId: 'lingland-main',
        companyName: organizationName,
        normalizedCompanyName,
        contactPerson: '',
        email: '',
        phone: '',
        invoiceEmail: '',
        billingAddress: 'Address pending update',
        paymentTermsDays: 30,
        defaultCostCodeType: 'PO',
        status: 'GUEST',
        identityReviewStatus: 'PENDING',
        sourceSystem: 'PUBLIC_INTAKE',
        syncStatus: 'LOCAL_ONLY',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
  };
};

const cleanValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return value.trim().slice(0, 10000);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => cleanValue(item, depth + 1)).filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [key.slice(0, 100), cleanValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined));
  }
  return undefined;
};

const requireAnonymousOrUser = (context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'A secure submission session is required.');
  }
};

const enforceRateLimit = async (
  kind: string,
  context: functions.https.CallableContext,
  email: string
) => {
  const identity = `${kind}:${context.auth?.uid || ''}:${email}`;
  const id = createHash('sha256').update(identity).digest('hex');
  const ref = db.collection('publicSubmissionLimits').doc(id);
  const now = Date.now();

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const lastSubmittedAt = Number(snap.data()?.lastSubmittedAt || 0);
    if (lastSubmittedAt && now - lastSubmittedAt < 30_000) {
      throw new functions.https.HttpsError('resource-exhausted', 'Please wait before submitting again.');
    }
    tx.set(ref, {
      kind,
      authUid: context.auth?.uid,
      emailHash: createHash('sha256').update(email).digest('hex'),
      lastSubmittedAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000)
    }, { merge: true });
  });
};

const notifyAdmins = async (payload: Record<string, unknown>) => {
  const admins = await db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN']).get();
  if (admins.empty) return;
  const batch = db.batch();
  admins.docs.forEach(adminDoc => {
    batch.set(db.collection('notifications').doc(), {
      userId: adminDoc.id,
      read: false,
      createdAt: new Date().toISOString(),
      ...payload
    });
  });
  await batch.commit();
};

const allocateJobNumber = async (language: string) => {
  const settingsRef = db.collection('system').doc('settings');
  return db.runTransaction(async tx => {
    const settingsSnap = await tx.get(settingsRef);
    const numbering = settingsSnap.data()?.platformMode?.jobNumbering || {};
    const year = Number(numbering.year || Number(String(new Date().getFullYear()).slice(-2)));
    const prefix = cleanString(numbering.prefix || 'LING', 12).toUpperCase();
    const counterRef = db.collection('systemCounters').doc(`${prefix}${year}`);
    const counterSnap = await tx.get(counterRef);
    const sequence = counterSnap.exists
      ? Number(counterSnap.data()?.lastSequence || 0) + 1
      : Number(numbering.nextSequence || 1);
    const base = `${prefix}${String(year).padStart(2, '0')}.${sequence}`;
    const display = numbering.displayIncludesLanguage === false || !language ? base : `${base} ${language}`;
    tx.set(settingsRef, {
      platformMode: {
        jobNumbering: {
          prefix,
          year,
          nextSequence: sequence + 1,
          displayIncludesLanguage: numbering.displayIncludesLanguage !== false
        }
      }
    }, { merge: true });
    tx.set(counterRef, {
      prefix,
      year,
      lastSequence: sequence,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!counterSnap.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {})
    }, { merge: true });
    return { base, display };
  });
};

const sanitizeBookingPayload = (raw: Record<string, any>) => {
  const serviceType = cleanString(raw.serviceType, 80);
  const locationType = cleanString(raw.locationType, 20).toUpperCase() === 'ONLINE' ? 'ONLINE' : 'ONSITE';
  const durationMinutes = Math.max(0, Math.min(Number(raw.durationMinutes || 0), 24 * 60));
  const sourceFiles = (Array.isArray(raw.sourceFiles) ? raw.sourceFiles : []).slice(0, 20).map((file: any) => ({
    name: cleanString(file?.name, 250),
    url: cleanString(file?.url, 2000),
  })).filter((file: any) => file.url);
  return {
    serviceType,
    languageFrom: cleanString(raw.languageFrom || 'English', 120),
    languageTo: cleanString(raw.languageTo, 120),
    date: cleanString(raw.date, 20),
    startTime: cleanString(raw.startTime, 10),
    durationMinutes,
    locationType,
    location: cleanString(raw.location, 500),
    address: cleanString(raw.address, 1000),
    postcode: cleanString(raw.postcode, 30),
    onlineLink: cleanString(raw.onlineLink, 2000),
    costCode: cleanString(raw.costCode, 120),
    notes: cleanString(raw.notes, 5000),
    caseType: cleanString(raw.caseType, 250),
    genderPreference: ['Male', 'Female', 'None'].includes(String(raw.genderPreference)) ? raw.genderPreference : 'None',
    patientReference: cleanString(raw.patientReference, 250),
    patientName: cleanString(raw.patientName, 250),
    professionalName: cleanString(raw.professionalName, 250),
    translationFormat: cleanString(raw.translationFormat, 120),
    translationFormatOther: cleanString(raw.translationFormatOther, 250),
    quoteRequested: Boolean(raw.quoteRequested),
    sourceFiles,
    deliveryEmail: cleanEmail(raw.deliveryEmail),
    gdprConsent: raw.gdprConsent === true,
    agreedToTerms: raw.agreedToTerms === true,
  };
};

export const submitPublicInterpreterApplication = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB'
}).https.onCall(async (data, context) => {
  requireAnonymousOrUser(context);
  const raw = cleanValue(data) as Record<string, any>;
  const email = cleanEmail(raw.email);
  const name = cleanString(raw.name, 200);
  if (!email || !email.includes('@') || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'Name and a valid email are required.');
  }
  await enforceRateLimit('INTERPRETER_APPLICATION', context, email);

  const applicationRef = db.collection('applications').doc();
  const submittedAt = new Date().toISOString();
  await applicationRef.set({
    ...raw,
    id: applicationRef.id,
    name,
    email,
    status: 'PENDING',
    submittedAt,
    submittedByUid: context.auth!.uid,
    submissionSource: 'PUBLIC_FORM',
    organizationId: 'lingland-main'
  });

  await notifyAdmins({
    title: 'New Interpreter Application',
    message: `${name} submitted a new interpreter application.`,
    type: 'INFO',
    link: '/admin/applications?tab=PENDING',
    data: { applicationId: applicationRef.id }
  }).catch(error => console.error('[public-intake] Failed to notify admins about application', error));

  return { success: true, applicationId: applicationRef.id, submittedAt };
});

export const submitPublicBookingRequest = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB'
}).https.onCall(async (data, context) => {
  requireAnonymousOrUser(context);
  const raw = cleanValue(data) as Record<string, any>;
  const bookingInput = sanitizeBookingPayload(raw);
  const guest = (raw.guestContact || {}) as Record<string, any>;
  const email = cleanEmail(guest.email);
  const contactName = cleanString(guest.name, 200);
  const languageTo = bookingInput.languageTo;
  if (!email || !email.includes('@') || !contactName || !languageTo) {
    throw new functions.https.HttpsError('invalid-argument', 'Contact name, email and target language are required.');
  }
  if (!bookingInput.gdprConsent || !bookingInput.agreedToTerms) {
    throw new functions.https.HttpsError('failed-precondition', 'Consent and terms acceptance are required.');
  }
  await enforceRateLimit('BOOKING_REQUEST', context, email);

  const organizationName = cleanString(guest.organisation, 250);
  const organization = await resolvePublicOrganization(organizationName);
  const clientId = organization.clientId;
  const billingEmail = cleanEmail(guest.billingEmail);
  if (organization.createPatch && billingEmail && billingEmail.includes('@')) {
    organization.createPatch.data.invoiceEmail = billingEmail;
  }
  const agentMatches = await db.collection('clientAgents').where('normalizedEmail', '==', email).limit(2).get();
  const agentMatchStatus = agentMatches.size > 1 ? 'AMBIGUOUS' : agentMatches.empty ? 'PROVISIONAL' : 'MATCHED';
  const existingAgent = agentMatches.size === 1 ? agentMatches.docs[0] : null;
  const agentId = agentMatchStatus === 'AMBIGUOUS'
    ? ''
    : existingAgent?.id || stableId('client_agent', email);
  const agentData = existingAgent?.data() || {};
  const mailboxPrefix = email.split('@')[0] || '';
  const agentType = cleanString(agentData.agentType, 40).toUpperCase()
    || (sharedMailboxPrefixes.test(mailboxPrefix) ? 'SHARED_MAILBOX' : 'PERSON');
  const membershipId = clientId && agentId ? stableId('client_membership', `${clientId}|${agentId}`) : '';
  const membershipRef = membershipId ? db.collection('clientMemberships').doc(membershipId) : null;
  const membershipDocument = membershipRef ? await membershipRef.get() : null;
  const membershipData = membershipDocument?.data() || {};
  const agentIdentityStatus = agentMatchStatus === 'AMBIGUOUS'
    ? 'AMBIGUOUS'
    : cleanString(membershipData.status, 40).toUpperCase() === 'ACTIVE'
      ? 'RESOLVED'
      : 'PENDING_VERIFICATION';
  const contactPhone = cleanString(guest.phone, 80);
  const requesterRoles = billingEmail && billingEmail === email ? ['REQUESTER', 'FINANCE'] : ['REQUESTER'];

  const separateFinanceEmail = billingEmail && billingEmail.includes('@') && billingEmail !== email ? billingEmail : '';
  const financeAgentMatches = separateFinanceEmail
    ? await db.collection('clientAgents').where('normalizedEmail', '==', separateFinanceEmail).limit(2).get()
    : null;
  const financeAgentDocument = financeAgentMatches?.size === 1 ? financeAgentMatches.docs[0] : null;
  const financeAgentId = !separateFinanceEmail || (financeAgentMatches && financeAgentMatches.size > 1)
    ? ''
    : financeAgentDocument?.id || stableId('client_agent', separateFinanceEmail);
  const financeAgentData = financeAgentDocument?.data() || {};
  const financeMembershipId = clientId && financeAgentId
    ? stableId('client_membership', `${clientId}|${financeAgentId}`)
    : '';
  const financeMembershipRef = financeMembershipId
    ? db.collection('clientMemberships').doc(financeMembershipId)
    : null;
  const financeMembershipDocument = financeMembershipRef ? await financeMembershipRef.get() : null;
  const financeMembershipData = financeMembershipDocument?.data() || {};
  const financeIdentityStatus = !separateFinanceEmail
    ? 'SAME_AS_REQUESTER'
    : financeAgentMatches && financeAgentMatches.size > 1
      ? 'AMBIGUOUS'
      : cleanString(financeMembershipDocument?.data()?.status, 40).toUpperCase() === 'ACTIVE'
        ? 'RESOLVED'
        : 'PENDING_VERIFICATION';

  const numbering = await allocateJobNumber(languageTo);
  const bookingRef = db.collection('bookings').doc();
  const isTranslation = bookingInput.serviceType.toLowerCase() === 'translation';
  const booking = {
    ...bookingInput,
    id: bookingRef.id,
    clientId,
    clientName: organization.clientName,
    clientIdentityStatus: organization.status,
    clientIdentityCandidateIds: organization.candidateClientIds,
    requestedByAgentId: agentId,
    requestedByAgentSource: agentId ? 'PUBLIC_INTAKE' : '',
    requesterIdentityStatus: agentIdentityStatus,
    billingContactAgentId: financeAgentId || (billingEmail === email ? agentId : ''),
    financeIdentityStatus,
    clientSnapshot: {
      organizationName,
      departmentName: '',
      requesterName: contactName,
      requesterEmail: email,
    },
    guestContact: { ...guest, email },
    bookingRef: numbering.base,
    displayRef: numbering.display,
    jobNumber: numbering.base,
    legacyRef: numbering.display,
    status: 'INCOMING',
    serviceCategory: isTranslation ? 'TRANSLATION' : 'INTERPRETATION',
    durationMinutes: bookingInput.durationMinutes,
    sourceSystem: 'CLIENT_PORTAL',
    syncStatus: 'LOCAL_ONLY',
    organizationId: 'lingland-main',
    submittedByUid: context.auth!.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const intakeBatch = db.batch();
  if (organization.createPatch) {
    intakeBatch.set(organization.createPatch.ref, organization.createPatch.data, { merge: false });
  }
  if (agentId) {
    const agentRef = db.collection('clientAgents').doc(agentId);
    intakeBatch.set(agentRef, {
      displayName: cleanString(agentData.displayName || contactName, 200),
      names: admin.firestore.FieldValue.arrayUnion(contactName),
      email,
      normalizedEmail: email,
      ...(contactPhone ? { phoneNumbers: admin.firestore.FieldValue.arrayUnion(contactPhone) } : {}),
      agentType,
      roles: admin.firestore.FieldValue.arrayUnion(...requesterRoles),
      status: cleanString(agentData.status, 40)
        || (cleanString(membershipData.status, 40).toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'),
      organizationId: 'lingland-main',
      sourceSystem: cleanString(agentData.sourceSystem, 80) || 'PUBLIC_INTAKE',
      syncStatus: cleanString(agentData.syncStatus, 80) || 'LOCAL_ONLY',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!existingAgent ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  if (membershipRef) {
    intakeBatch.set(membershipRef, {
      clientId,
      agentId,
      ...(!membershipDocument?.exists ? { departmentIds: [] } : {}),
      accessLevel: cleanString(membershipData.accessLevel, 40) || 'AGENT',
      roles: admin.firestore.FieldValue.arrayUnion(...requesterRoles),
      status: cleanString(membershipData.status, 40) || 'INACTIVE',
      organizationId: 'lingland-main',
      sourceSystem: cleanString(membershipData.sourceSystem, 80) || 'PUBLIC_INTAKE',
      syncStatus: cleanString(membershipData.syncStatus, 80) || 'LOCAL_ONLY',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!membershipDocument?.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  if (financeAgentId) {
    const financeLocalPart = separateFinanceEmail.split('@')[0] || '';
    intakeBatch.set(db.collection('clientAgents').doc(financeAgentId), {
      displayName: cleanString(financeAgentData.displayName || `Finance - ${organizationName}`, 200),
      names: admin.firestore.FieldValue.arrayUnion(cleanString(financeAgentData.displayName || `Finance - ${organizationName}`, 200)),
      email: separateFinanceEmail,
      normalizedEmail: separateFinanceEmail,
      agentType: cleanString(financeAgentData.agentType, 40).toUpperCase()
        || (sharedMailboxPrefixes.test(financeLocalPart) ? 'SHARED_MAILBOX' : 'PERSON'),
      roles: admin.firestore.FieldValue.arrayUnion('FINANCE'),
      status: cleanString(financeAgentData.status, 40)
        || (cleanString(financeMembershipData.status, 40).toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'),
      organizationId: 'lingland-main',
      sourceSystem: cleanString(financeAgentData.sourceSystem, 80) || 'PUBLIC_INTAKE',
      syncStatus: cleanString(financeAgentData.syncStatus, 80) || 'LOCAL_ONLY',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!financeAgentDocument ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  if (financeMembershipRef) {
    intakeBatch.set(financeMembershipRef, {
      clientId,
      agentId: financeAgentId,
      ...(!financeMembershipDocument?.exists ? { departmentIds: [] } : {}),
      accessLevel: cleanString(financeMembershipData.accessLevel, 40) || 'CLIENT_FINANCE',
      roles: admin.firestore.FieldValue.arrayUnion('FINANCE'),
      status: cleanString(financeMembershipData.status, 40) || 'INACTIVE',
      organizationId: 'lingland-main',
      sourceSystem: cleanString(financeMembershipData.sourceSystem, 80) || 'PUBLIC_INTAKE',
      syncStatus: cleanString(financeMembershipData.syncStatus, 80) || 'LOCAL_ONLY',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!financeMembershipDocument?.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
  intakeBatch.set(bookingRef, booking);
  intakeBatch.set(db.collection('jobEvents').doc(`public_${bookingRef.id}_created`), {
    jobId: bookingRef.id,
    organizationId: 'lingland-main',
    type: 'JOB_CREATED',
    source: 'client',
    actorUserId: context.auth!.uid,
    metadata: {
      publicRequest: true,
      clientId: clientId || null,
      clientIdentityStatus: organization.status,
      requestedByAgentId: agentId || null,
      requesterIdentityStatus: agentIdentityStatus,
      billingContactAgentId: financeAgentId || (billingEmail === email ? agentId || null : null),
      financeIdentityStatus,
    },
    createdAt: new Date().toISOString()
  });
  await intakeBatch.commit();

  await Promise.allSettled([
    notifyAdmins({
      title: 'New Booking Request',
      message: `${numbering.display}: ${contactName} requested ${languageTo}.`,
      type: 'URGENT',
      link: `/admin/bookings/${bookingRef.id}`,
      data: { bookingId: bookingRef.id }
    }),
    queueBookingStatusEmails(bookingRef.id, booking, 'INCOMING', {}, bookingRef.id),
  ]);

  return {
    success: true,
    booking: {
      ...booking,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
});

export const submitClientBookingRequest = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB'
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Client authentication is required');
  const user = await db.collection('users').doc(context.auth.uid).get();
  const userData = user.data() || {};
  if (!user.exists) throw new functions.https.HttpsError('not-found', 'Platform user not found');
  const access = await resolveClientPortalAccess(context.auth.uid, userData);
  if (!access.canRequest) {
    throw new functions.https.HttpsError('permission-denied', 'This membership does not include requester access.');
  }
  const clientId = access.clientId;
  const clientData = access.client;
  if (['SUSPENDED', 'INACTIVE', 'BLOCKED'].includes(String(clientData.status || '').toUpperCase())) {
    throw new functions.https.HttpsError('failed-precondition', 'This client account cannot create bookings');
  }

  const raw = cleanValue(data) as Record<string, any>;
  const bookingInput = sanitizeBookingPayload(raw);
  if (!bookingInput.languageTo) throw new functions.https.HttpsError('invalid-argument', 'Target language is required');
  if (!bookingInput.gdprConsent || !bookingInput.agreedToTerms) {
    throw new functions.https.HttpsError('failed-precondition', 'Consent and terms acceptance are required');
  }
  let clientDepartmentId = cleanString(raw.clientDepartmentId, 160);
  if (!clientDepartmentId && access.allowedDepartmentIds.length === 1) {
    [clientDepartmentId] = access.allowedDepartmentIds;
  }
  if (clientDepartmentId && !access.allowedDepartmentIds.includes(clientDepartmentId)) {
    throw new functions.https.HttpsError('permission-denied', 'The selected department is outside this membership scope.');
  }
  if (!clientDepartmentId && access.allowedDepartmentIds.length > 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Select the department requesting this booking.');
  }
  const department = access.departments.find(item => item.id === clientDepartmentId);
  const requesterName = cleanString(access.agent?.displayName || userData.displayName, 200);
  const requesterEmail = cleanEmail(access.agent?.email || userData.email);
  const email = requesterEmail || cleanEmail(clientData.bookingEmail || clientData.email);
  await enforceRateLimit('CLIENT_BOOKING', context, email);

  const numbering = await allocateJobNumber(bookingInput.languageTo);
  const bookingRef = db.collection('bookings').doc();
  const isTranslation = bookingInput.serviceType.toLowerCase() === 'translation';
  const contactName = requesterName || cleanString(clientData.bookingContactName || clientData.contactPerson || userData.displayName, 200);
  const clientName = cleanString(clientData.companyName || userData.displayName, 250);
  const booking = {
    ...bookingInput,
    id: bookingRef.id,
    clientId,
    clientName,
    clientDepartmentId: clientDepartmentId || null,
    clientDepartmentSource: clientDepartmentId ? 'CLIENT_PORTAL' : null,
    requestedByAgentId: access.agentId || null,
    requestedByAgentSource: access.agentId ? 'CLIENT_PORTAL' : null,
    clientSnapshot: {
      organizationName: clientName,
      departmentName: cleanString(department?.data.name, 160),
      requesterName: contactName,
      requesterEmail: email,
    },
    guestContact: {
      name: contactName,
      email,
      phone: cleanString(access.agent?.phoneNumbers?.[0] || clientData.bookingPhone || clientData.phone, 80),
      organisation: clientName,
    },
    bookingRef: numbering.base,
    displayRef: numbering.display,
    jobNumber: numbering.base,
    legacyRef: numbering.display,
    status: 'INCOMING',
    serviceCategory: isTranslation ? 'TRANSLATION' : 'INTERPRETATION',
    sourceSystem: 'CLIENT_PORTAL',
    syncStatus: 'LOCAL_ONLY',
    organizationId: clientData.organizationId || 'lingland-main',
    requestedByUserId: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(bookingRef, booking);
  batch.set(db.collection('jobEvents').doc(`client_${bookingRef.id}_created`), {
    jobId: bookingRef.id,
    organizationId: booking.organizationId,
    type: 'JOB_CREATED',
    source: 'client_portal',
    actorUserId: context.auth.uid,
    metadata: {
      clientId,
      clientDepartmentId: clientDepartmentId || null,
      requestedByAgentId: access.agentId || null,
      clientMembershipId: access.membershipId || null,
    },
    createdAt: new Date().toISOString(),
  });
  await batch.commit();
  await Promise.allSettled([
    notifyAdmins({
      title: 'New Client Booking',
      message: `${numbering.display}: ${clientName} requested ${bookingInput.languageTo}.`,
      type: 'URGENT',
      link: `/admin/bookings/${bookingRef.id}`,
      data: { bookingId: bookingRef.id },
    }),
    queueBookingStatusEmails(bookingRef.id, booking, 'INCOMING', {}, bookingRef.id),
  ]);
  return {
    success: true,
    booking: { ...booking, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };
});
