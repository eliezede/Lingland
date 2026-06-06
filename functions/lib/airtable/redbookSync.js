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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledRedbookSync = exports.syncRedbookJobs = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const db = admin.firestore();
const DEFAULT_BASE_ID = 'appF50EzH7zVQdwAv';
const DEFAULT_TABLE_NAME = 'REDBOOK';
const MAX_DETAILS = 50;
const normalize = (value) => {
    if (Array.isArray(value))
        return normalize(value[0]);
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return '';
};
const pick = (fields, names) => {
    for (const name of names) {
        const direct = normalize(fields[name]);
        if (direct)
            return direct;
    }
    const normalizedMap = new Map();
    Object.entries(fields).forEach(([key, value]) => {
        normalizedMap.set(key.toLowerCase().replace(/[^a-z0-9]/g, ''), normalize(value));
    });
    for (const name of names) {
        const val = normalizedMap.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (val)
            return val;
    }
    return '';
};
const parseJobNumber = (value) => {
    const match = value.match(/LING\d{2}\.\d+/i);
    return match ? match[0].toUpperCase() : value;
};
const parseLanguageTo = (fields, reference) => {
    const explicit = pick(fields, ['Language Requested', 'Language', 'LANGUAGE', 'Language To', 'Target Language']);
    if (explicit) {
        const toMatch = explicit.match(/\bto\s+(.+)$/i);
        return toMatch ? toMatch[1].trim() : explicit;
    }
    const refMatch = reference.match(/LING\d{2}\.\d+\s+(.+)$/i);
    return refMatch ? refMatch[1].trim() : 'Unknown';
};
const parseDateTime = (fields) => {
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
const parseDuration = (value) => {
    const minutes = Number(value.match(/\d+/)?.[0] || 60);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
};
const mapStatus = (rawStatus) => {
    const status = rawStatus.toLowerCase();
    if (status.includes('cancel'))
        return 'CANCELLED';
    if (status.includes('paid'))
        return 'PAID';
    if (status.includes('invoice'))
        return status.includes('ready') ? 'READY_FOR_INVOICE' : 'INVOICED';
    if (status.includes('timesheet'))
        return 'TIMESHEET_SUBMITTED';
    if (status.includes('complete') || status.includes('done'))
        return 'SESSION_COMPLETED';
    if (status.includes('pending'))
        return 'ASSIGNMENT_PENDING';
    if (status.includes('assign') || status.includes('book'))
        return 'OPENED';
    return 'INCOMING';
};
const mapLocationType = (sessionType, location) => {
    const value = `${sessionType} ${location}`.toLowerCase();
    return value.includes('online') || value.includes('virtual') || value.includes('video') || value.includes('phone')
        ? 'ONLINE'
        : 'ONSITE';
};
const stableHash = (value) => {
    const json = JSON.stringify(value, Object.keys(value).sort());
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
        hash = ((hash << 5) - hash) + json.charCodeAt(i);
        hash |= 0;
    }
    return String(hash);
};
const titleCase = (value) => {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.length <= 3 && part === part.toUpperCase()
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
};
const cleanEmail = (value) => value.trim().toLowerCase();
const resolveInterpreter = async (email, name) => {
    const normalizedEmail = cleanEmail(email);
    if (normalizedEmail) {
        const userByEmail = await db.collection('users')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (!userByEmail.empty) {
            const user = userByEmail.docs[0].data();
            if (user.profileId) {
                const profile = await db.collection('interpreters').doc(user.profileId).get();
                return {
                    id: user.profileId,
                    name: profile.data()?.name || user.displayName || name,
                    email: user.email || normalizedEmail,
                    photoUrl: profile.data()?.photoUrl || ''
                };
            }
        }
        const interpreterByEmail = await db.collection('interpreters')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (!interpreterByEmail.empty) {
            const profile = interpreterByEmail.docs[0].data();
            return {
                id: interpreterByEmail.docs[0].id,
                name: profile.name || name,
                email: profile.email || normalizedEmail,
                photoUrl: profile.photoUrl || ''
            };
        }
    }
    const normalizedName = name.trim();
    if (normalizedName) {
        const interpreterByName = await db.collection('interpreters')
            .where('name', '==', normalizedName)
            .limit(1)
            .get();
        if (!interpreterByName.empty) {
            const profile = interpreterByName.docs[0].data();
            return {
                id: interpreterByName.docs[0].id,
                name: profile.name || normalizedName,
                email: profile.email || normalizedEmail,
                photoUrl: profile.photoUrl || ''
            };
        }
    }
    return null;
};
const slugify = (value) => {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'unknown';
};
const resolveClient = async (source, dryRun) => {
    const sourceKey = slugify(source.uniqueClientKey || source.clientName);
    const clientId = `airtable_client_${sourceKey}`;
    const existingById = await db.collection('clients').doc(clientId).get();
    if (existingById.exists) {
        return { id: existingById.id, action: 'matched', created: false };
    }
    if (source.contactEmail) {
        const byEmail = await db.collection('clients')
            .where('email', '==', source.contactEmail)
            .limit(1)
            .get();
        if (!byEmail.empty) {
            if (!dryRun) {
                await byEmail.docs[0].ref.set({
                    sourceSystem: 'AIRTABLE',
                    sourceKey,
                    airtableClientKey: source.uniqueClientKey || source.clientName,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            return { id: byEmail.docs[0].id, action: 'matched-email', created: false };
        }
    }
    const clientData = {
        id: clientId,
        organizationId: 'lingland-main',
        companyName: source.clientName,
        contactPerson: source.contactName || source.clientName,
        email: source.contactEmail || '',
        phone: source.contactPhone || '',
        status: 'ACTIVE',
        billingAddress: source.location || 'Address Pending Update',
        paymentTermsDays: 30,
        defaultCostCodeType: 'PO',
        sourceSystem: 'AIRTABLE',
        sourceKey,
        airtableClientKey: source.uniqueClientKey || source.clientName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (!dryRun) {
        await db.collection('clients').doc(clientId).set(clientData, { merge: true });
    }
    return { id: clientId, action: dryRun ? 'would-create' : 'created', created: true };
};
const getPlatformMode = async () => {
    const settings = await db.collection('system').doc('settings').get();
    return settings.data()?.platformMode || {};
};
const assertAdmin = async (context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
    }
    const user = await db.collection('users').doc(context.auth.uid).get();
    const role = user.data()?.role;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can sync REDBOOK.');
    }
};
const fetchAirtableRecords = async (limitRecords) => {
    const apiKey = (process.env.AIRTABLE_API_KEY || '').trim();
    const baseId = process.env.AIRTABLE_REDBOOK_BASE_ID || DEFAULT_BASE_ID;
    const tableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured.');
    }
    const records = [];
    let offset = '';
    do {
        const params = {
            pageSize: Math.min(100, limitRecords),
            maxRecords: limitRecords
        };
        if (offset)
            params.offset = offset;
        const response = await axios_1.default.get(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            params,
            timeout: 20000
        });
        records.push(...response.data.records);
        offset = response.data.offset || '';
    } while (offset && records.length < limitRecords);
    return records.slice(0, limitRecords);
};
const findExistingBooking = async (record, jobNumber, legacyRef) => {
    const bySource = await db.collection('bookings')
        .where('sourceRecordId', '==', record.id)
        .limit(1)
        .get();
    if (!bySource.empty && bySource.docs[0].data().sourceSystem === 'AIRTABLE')
        return bySource.docs[0].ref;
    if (legacyRef) {
        const byLegacy = await db.collection('bookings').where('legacyAirtableRef', '==', legacyRef).limit(1).get();
        if (!byLegacy.empty)
            return byLegacy.docs[0].ref;
    }
    if (jobNumber) {
        const byJob = await db.collection('bookings').where('jobNumber', '==', jobNumber).limit(1).get();
        if (!byJob.empty)
            return byJob.docs[0].ref;
    }
    return db.collection('bookings').doc(`airtable_${record.id}`);
};
const mapRecordToBooking = async (record) => {
    const fields = record.fields;
    const legacyRef = pick(fields, ['Job Number', 'Job Number / Language', 'Job ID', 'Reference', 'Booking Ref', 'REDBOOK ID']);
    const jobNumber = parseJobNumber(legacyRef) || `AIRTABLE-${record.id}`;
    const languageTo = parseLanguageTo(fields, legacyRef);
    const schedule = parseDateTime(fields);
    const sessionType = pick(fields, ['Session Type', 'Type', 'Method', 'Service Mode']);
    const location = pick(fields, ['Session Location', 'Location', 'Address', 'Venue']);
    const status = mapStatus(pick(fields, ['Status', 'Job Status', 'Booking Status']));
    const patientName = pick(fields, ['Name of your client', 'Patient Name', 'Client Name', 'Service User']);
    const uniqueClientKey = pick(fields, ['Unique Client Key']);
    const agency = pick(fields, ['Agency, institution or company  ', 'Agency, institution or company', 'Organisation / Department', 'Organisation', 'Organization', 'Department']);
    const clientName = agency || (uniqueClientKey ? titleCase(uniqueClientKey) : '') || patientName || 'Airtable Client';
    const bookingAgent = pick(fields, ['Booking Agent', 'Booking By', 'Requester', 'Requested By']);
    const caseworker = pick(fields, ['Name of Caseworker', 'Caseworker', 'Professional', 'Contact Name']);
    const contactName = bookingAgent || caseworker || patientName || clientName;
    const contactEmail = cleanEmail(pick(fields, ['Booking Email', 'Contact Email', 'Email', 'Requester Email']));
    const contactPhone = pick(fields, ['Booking phone contact number', 'Contact Phone', 'Phone']);
    const interpreterName = pick(fields, ['full name', 'NAME MASTER (from assign to)', 'Interpreter', 'Interpreter Name', 'Assigned Interpreter']);
    const interpreterEmail = cleanEmail(pick(fields, ['INT EMAIL', 'EMAIL (from assign to)', 'Interpreter Email']));
    const interpreterPhone = pick(fields, ['PHONE (from assign to)', 'Interpreter Phone']);
    const interpreterAirtableRecordId = pick(fields, ['assign to']);
    const resolvedInterpreter = await resolveInterpreter(interpreterEmail, interpreterName);
    const sourceSnapshot = {
        legacyRef,
        jobNumber,
        clientName,
        patientName,
        uniqueClientKey,
        contactName,
        bookingAgent,
        caseworker,
        professionalName: contactName,
        contactEmail,
        contactPhone,
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
        interpreterName,
        interpreterEmail,
        interpreterPhone,
        interpreterAirtableRecordId,
        interpreterResolved: Boolean(resolvedInterpreter?.id)
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
            patientName: sourceSnapshot.patientName,
            interpreterId: resolvedInterpreter?.id || '',
            interpreterName: resolvedInterpreter?.name || sourceSnapshot.interpreterName,
            interpreterPhotoUrl: resolvedInterpreter?.photoUrl || '',
            interpreterEmail: resolvedInterpreter?.email || sourceSnapshot.interpreterEmail,
            interpreterAirtableRecordId: sourceSnapshot.interpreterAirtableRecordId,
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
                name: sourceSnapshot.contactName,
                organisation: sourceSnapshot.clientName,
                email: sourceSnapshot.contactEmail,
                phone: sourceSnapshot.contactPhone
            } : undefined,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        sourceSnapshot
    };
};
const syncRecords = async (mode) => {
    const platformMode = await getPlatformMode();
    const importMode = platformMode.airtableImportMode || 'ON';
    const records = await fetchAirtableRecords(mode.limitRecords);
    const runRef = db.collection('syncRuns').doc();
    const startedAt = new Date().toISOString();
    const stats = {
        created: 0,
        updated: 0,
        skipped: 0,
        conflict: 0,
        error: 0
    };
    const details = [];
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
            const mapped = await mapRecordToBooking(record);
            const clientResolution = await resolveClient({
                clientName: mapped.sourceSnapshot.clientName,
                uniqueClientKey: mapped.sourceSnapshot.uniqueClientKey,
                contactName: mapped.sourceSnapshot.contactName,
                contactEmail: mapped.sourceSnapshot.contactEmail,
                contactPhone: mapped.sourceSnapshot.contactPhone,
                location: mapped.sourceSnapshot.location
            }, mode.dryRun || importMode === 'READ_ONLY');
            mapped.booking.clientId = clientResolution.id;
            let existingRef = null;
            let existingSnap = null;
            let existing = null;
            if (mode.dryRun) {
                const bySource = await db.collection('bookings')
                    .where('sourceRecordId', '==', record.id)
                    .limit(1)
                    .get();
                existingSnap = bySource.empty ? null : bySource.docs[0];
                existing = existingSnap?.exists ? existingSnap.data() || null : null;
            }
            else {
                existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
                existingSnap = await existingRef.get();
                existing = existingSnap.exists ? existingSnap.data() || null : null;
            }
            const previousHash = existing?.airtableSnapshotHash;
            const action = existingSnap?.exists ? (previousHash === mapped.booking.airtableSnapshotHash ? 'skipped' : 'updated') : 'created';
            if (mode.dryRun || importMode === 'READ_ONLY') {
                stats[action] += 1;
            }
            else if (action === 'skipped') {
                stats.skipped += 1;
            }
            else {
                if (!existingRef || !existingSnap)
                    throw new Error('Missing booking reference for REDBOOK sync write.');
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
                    patientName: mapped.booking.patientName,
                    clientId: mapped.booking.clientId,
                    clientAction: clientResolution.action,
                    interpreterName: mapped.booking.interpreterName,
                    interpreterId: mapped.booking.interpreterId,
                    interpreterResolved: Boolean(mapped.booking.interpreterId),
                    status: mapped.booking.status
                });
            }
        }
        catch (error) {
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
        mappingVersion: 'redbook-client-interpreter-v2',
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
exports.syncRedbookJobs = functions.runWith({
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
exports.scheduledRedbookSync = functions.runWith({
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
//# sourceMappingURL=redbookSync.js.map