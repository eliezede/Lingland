"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminBooking = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const bookingEmail_1 = require("../mail/bookingEmail");
const db = admin.firestore();
const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const nonNegativeNumber = (value, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, max)) : 0;
};
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can create staff bookings');
    }
};
const allocateJobNumber = async (language) => db.runTransaction(async (transaction) => {
    const settingsRef = db.collection('system').doc('settings');
    const settings = await transaction.get(settingsRef);
    const numbering = settings.data()?.platformMode?.jobNumbering || {};
    const year = Number(numbering.year || Number(String(new Date().getFullYear()).slice(-2)));
    const prefix = text(numbering.prefix || 'LING', 12).toUpperCase();
    const counterRef = db.collection('systemCounters').doc(`${prefix}${year}`);
    const counter = await transaction.get(counterRef);
    const sequence = counter.exists ? Number(counter.data()?.lastSequence || 0) + 1 : Number(numbering.nextSequence || 1);
    const base = `${prefix}${String(year).padStart(2, '0')}.${sequence}`;
    const display = numbering.displayIncludesLanguage === false || !language ? base : `${base} ${language}`;
    transaction.set(counterRef, {
        prefix,
        year,
        lastSequence: sequence,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(!counter.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    transaction.set(settingsRef, { platformMode: { jobNumbering: {
                prefix,
                year,
                nextSequence: sequence + 1,
                displayIncludesLanguage: numbering.displayIncludesLanguage !== false,
            } } }, { merge: true });
    return { base, display };
});
exports.createAdminBooking = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const languageTo = text(data?.languageTo, 120);
    const serviceType = text(data?.serviceType, 120);
    const date = text(data?.date, 20);
    const guest = data?.guestContact || {};
    const clientId = text(data?.clientId, 160);
    if (!languageTo || !serviceType || !date) {
        throw new functions.https.HttpsError('invalid-argument', 'Service, target language and date are required');
    }
    if (!clientId && !text(guest?.name, 200)) {
        throw new functions.https.HttpsError('invalid-argument', 'A registered client or guest contact is required');
    }
    if (clientId) {
        const client = await db.collection('clients').doc(clientId).get();
        if (!client.exists)
            throw new functions.https.HttpsError('not-found', 'Selected client not found');
    }
    const interpreterId = text(data?.interpreterId, 160);
    const interpreter = interpreterId ? await db.collection('interpreters').doc(interpreterId).get() : null;
    if (interpreterId && !interpreter?.exists)
        throw new functions.https.HttpsError('not-found', 'Selected interpreter not found');
    const numbering = await allocateJobNumber(languageTo);
    const bookingRef = db.collection('bookings').doc();
    const assignmentRef = interpreterId ? db.collection('assignments').doc() : null;
    const isTranslation = serviceType.toUpperCase() === 'TRANSLATION';
    const status = interpreterId ? 'PENDING_ASSIGNMENT' : 'INCOMING';
    const now = new Date().toISOString();
    const sourceFiles = (Array.isArray(data?.sourceFiles) ? data.sourceFiles : []).slice(0, 50).map((file) => ({
        name: text(file?.name, 250),
        url: text(file?.url, 2000),
    })).filter((file) => file.url);
    const booking = {
        id: bookingRef.id,
        organizationId: text(data?.organizationId, 160) || 'lingland-main',
        clientId,
        clientName: text(data?.clientName || guest?.organisation || guest?.name, 250),
        guestContact: {
            name: text(guest?.name, 200),
            email: text(guest?.email, 320).toLowerCase(),
            phone: text(guest?.phone, 80),
            organisation: text(guest?.organisation, 250),
        },
        serviceType,
        serviceCategory: isTranslation ? 'TRANSLATION' : 'INTERPRETATION',
        languageFrom: text(data?.languageFrom || 'English', 120),
        languageTo,
        date,
        startTime: text(data?.startTime, 10),
        durationMinutes: Math.max(0, Math.min(Number(data?.durationMinutes || 0), 24 * 60)),
        locationType: text(data?.locationType, 20).toUpperCase() === 'ONLINE' ? 'ONLINE' : 'ONSITE',
        address: text(data?.address, 1000),
        postcode: text(data?.postcode, 30),
        houseNumber: text(data?.houseNumber, 50),
        onlineLink: text(data?.onlineLink, 2000),
        notes: text(data?.notes, 5000),
        costCode: text(data?.costCode, 120),
        genderPreference: ['Male', 'Female', 'None'].includes(String(data?.genderPreference)) ? data.genderPreference : 'None',
        translationFormat: text(data?.translationFormat, 120),
        translationFormatOther: text(data?.translationFormatOther, 250),
        translationDeadline: text(data?.translationDeadline || (isTranslation ? data?.date : ''), 20),
        quoteRequested: Boolean(data?.quoteRequested),
        wordCount: nonNegativeNumber(data?.wordCount, 10000000),
        numberOfDocs: nonNegativeNumber(data?.numberOfDocs, 10000),
        finalQuote: nonNegativeNumber(data?.finalQuote, 10000000),
        totalAmount: nonNegativeNumber(data?.finalQuote, 10000000),
        sourceFiles,
        deliveryEmail: text(data?.deliveryEmail, 320).toLowerCase(),
        lat: Number.isFinite(Number(data?.lat)) ? Number(data.lat) : null,
        lng: Number.isFinite(Number(data?.lng)) ? Number(data.lng) : null,
        interpreterId: interpreterId || null,
        interpreterName: interpreter?.data()?.name || null,
        interpreterPhotoUrl: interpreter?.data()?.photoUrl || null,
        offeredInterpreterIds: interpreterId ? [interpreterId] : [],
        status,
        jobNumber: numbering.base,
        bookingRef: numbering.base,
        displayRef: numbering.display,
        legacyRef: numbering.display,
        requestedByUserId: context.auth.uid,
        sourceSystem: 'STAFF_MANUAL',
        syncStatus: 'LOCAL_ONLY',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.set(bookingRef, booking);
    if (assignmentRef)
        batch.set(assignmentRef, {
            bookingId: bookingRef.id,
            interpreterId,
            status: 'OFFERED',
            offeredAt: now,
            assignmentType: 'DIRECT',
            createdBy: context.auth.uid,
        });
    batch.set(db.collection('jobEvents').doc(), {
        jobId: bookingRef.id,
        organizationId: booking.organizationId,
        type: interpreterId ? 'DIRECT_ASSIGNMENT_SENT' : 'JOB_CREATED',
        source: 'admin',
        actorUserId: context.auth.uid,
        metadata: { interpreterId: interpreterId || null, assignmentId: assignmentRef?.id || null },
        createdAt: now,
    });
    await batch.commit();
    await (0, bookingEmail_1.queueBookingStatusEmails)(bookingRef.id, booking, 'INCOMING', {}, bookingRef.id);
    if (interpreterId)
        await (0, bookingEmail_1.queueBookingStatusEmails)(bookingRef.id, booking, status, {
            interpreterEmail: text(interpreter?.data()?.email, 320).toLowerCase(),
            interpreterName: text(interpreter?.data()?.name, 200),
        }, assignmentRef.id);
    return { success: true, booking: { ...booking, createdAt: now, updatedAt: now } };
});
//# sourceMappingURL=createAdminBooking.js.map