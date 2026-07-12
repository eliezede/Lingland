import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';
import { createHash } from 'crypto';

const db = admin.firestore();

const cleanString = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const cleanEmail = (value: unknown) => cleanString(value, 320).toLowerCase();

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

  const existingClientSnap = await db.collection('clients').where('email', '==', email).limit(1).get();
  let clientId = existingClientSnap.empty ? '' : existingClientSnap.docs[0].id;
  if (!clientId) {
    const clientRef = db.collection('clients').doc();
    clientId = clientRef.id;
    await clientRef.set({
      id: clientId,
      companyName: cleanString(guest.organisation || contactName, 250),
      normalizedCompanyName: cleanString(guest.organisation || contactName, 250).toLowerCase(),
      contactPerson: contactName,
      email,
      phone: cleanString(guest.phone, 80),
      invoiceEmail: cleanEmail(guest.billingEmail || email),
      billingAddress: 'Address pending update',
      paymentTermsDays: 30,
      defaultCostCodeType: 'PO',
      status: 'GUEST',
      sourceSystem: 'CLIENT_PORTAL',
      syncStatus: 'LOCAL_ONLY',
      organizationId: 'lingland-main',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  const numbering = await allocateJobNumber(languageTo);
  const bookingRef = db.collection('bookings').doc();
  const isTranslation = bookingInput.serviceType.toLowerCase() === 'translation';
  const booking = {
    ...bookingInput,
    id: bookingRef.id,
    clientId,
    clientName: cleanString(guest.organisation || contactName, 250),
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
    requestedByUserId: context.auth!.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const intakeBatch = db.batch();
  intakeBatch.set(bookingRef, booking);
  intakeBatch.set(db.collection('jobEvents').doc(`public_${bookingRef.id}_created`), {
    jobId: bookingRef.id,
    organizationId: 'lingland-main',
    type: 'JOB_CREATED',
    source: 'client',
    actorUserId: context.auth!.uid,
    metadata: { publicRequest: true, clientId },
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
  if (!user.exists || userData.status !== 'ACTIVE' || userData.role !== 'CLIENT' || !userData.profileId) {
    throw new functions.https.HttpsError('permission-denied', 'An active client account is required');
  }
  const clientId = String(userData.profileId);
  const client = await db.collection('clients').doc(clientId).get();
  if (!client.exists || ['SUSPENDED', 'INACTIVE', 'BLOCKED'].includes(String(client.data()?.status || '').toUpperCase())) {
    throw new functions.https.HttpsError('failed-precondition', 'This client account cannot create bookings');
  }

  const raw = cleanValue(data) as Record<string, any>;
  const bookingInput = sanitizeBookingPayload(raw);
  if (!bookingInput.languageTo) throw new functions.https.HttpsError('invalid-argument', 'Target language is required');
  if (!bookingInput.gdprConsent || !bookingInput.agreedToTerms) {
    throw new functions.https.HttpsError('failed-precondition', 'Consent and terms acceptance are required');
  }
  const clientData = client.data() || {};
  const email = cleanEmail(clientData.bookingEmail || clientData.email || userData.email);
  await enforceRateLimit('CLIENT_BOOKING', context, email);

  const numbering = await allocateJobNumber(bookingInput.languageTo);
  const bookingRef = db.collection('bookings').doc();
  const isTranslation = bookingInput.serviceType.toLowerCase() === 'translation';
  const contactName = cleanString(clientData.bookingContactName || clientData.contactPerson || userData.displayName, 200);
  const clientName = cleanString(clientData.companyName || userData.displayName, 250);
  const booking = {
    ...bookingInput,
    id: bookingRef.id,
    clientId,
    clientName,
    guestContact: {
      name: contactName,
      email,
      phone: cleanString(clientData.bookingPhone || clientData.phone, 80),
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
    metadata: { clientId },
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
