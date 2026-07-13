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
exports.syncAirtableInterpreters = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const identityMatching_1 = require("./identityMatching");
const db = admin.firestore();
const DEFAULT_BASE_ID = 'appnglRJzSscwJJph';
const INTERPRETERS_TABLE = 'Interpreters';
const normalize = (value) => {
    if (Array.isArray(value))
        return normalize(value[0]);
    if (value === null || value === undefined)
        return '';
    return String(value).trim();
};
const normalizeName = identityMatching_1.normalizeIdentityName;
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Administrator authentication is required');
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists || snap.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(snap.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can import interpreters');
    }
};
const fetchActiveInterpreterRecords = async () => {
    const apiKey = String(process.env.AIRTABLE_API_KEY || '').trim();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured');
    }
    const baseId = String(process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID).trim();
    const records = [];
    let offset = '';
    do {
        const response = await axios_1.default.get(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(INTERPRETERS_TABLE)}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            params: {
                filterByFormula: "{active!}='active'",
                pageSize: 100,
                ...(offset ? { offset } : {}),
            },
            timeout: 30000,
        });
        records.push(...(response.data?.records || []));
        offset = String(response.data?.offset || '');
    } while (offset);
    return records;
};
const mergeInterpreterRows = (records) => {
    const merged = new Map();
    for (const record of records) {
        const fields = record.fields || {};
        const name = normalize(fields['NAME MASTER']);
        const email = normalize(fields.EMAIL).toLowerCase();
        if (!name)
            continue;
        const key = email || normalizeName(name);
        const language = normalize(fields.LANGUAGE);
        const priority = Number.parseInt(normalize(fields.L1), 10) || 18;
        const existing = merged.get(key);
        if (existing) {
            existing.airtableRecordIds = Array.from(new Set([...existing.airtableRecordIds, record.id]));
            if (language && !existing.languages.some(item => item.toLowerCase() === language.toLowerCase())) {
                existing.languages.push(language);
                existing.languageProficiencies.push({ language, l1: priority, translateOrder: 'no' });
            }
            continue;
        }
        const town = normalize(fields.TOWN);
        merged.set(key, {
            name,
            email,
            phone: normalize(fields.PHONE),
            languages: language ? [language] : [],
            languageProficiencies: language ? [{ language, l1: priority, translateOrder: 'no' }] : [],
            address: {
                street: normalize(fields.STREET),
                town,
                county: normalize(fields.COUNTY),
                postcode: normalize(fields.POSTCODE),
                country: 'UK',
            },
            qualifications: normalize(fields.QUALIFICATIONS) ? [normalize(fields.QUALIFICATIONS)] : [],
            regions: town ? [town] : [],
            sourceRecordId: record.id,
            airtableRecordIds: [record.id],
            sourceSnapshot: fields,
        });
    }
    return Array.from(merged.values());
};
exports.syncAirtableInterpreters = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB',
}).https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const dryRun = data?.dryRun !== false;
    const records = await fetchActiveInterpreterRecords();
    const imports = mergeInterpreterRows(records);
    const [usersSnap, interpretersSnap] = await Promise.all([
        db.collection('users').where('role', '==', 'INTERPRETER').get(),
        db.collection('interpreters').get(),
    ]);
    const usersByEmail = new Map();
    usersSnap.docs.forEach(item => {
        const email = normalize(item.data().email).toLowerCase();
        if (email)
            usersByEmail.set(email, item);
    });
    const interpretersByEmail = new Map();
    const interpretersBySourceId = new Map();
    interpretersSnap.docs.forEach(item => {
        const value = item.data();
        const email = normalize(value.email).toLowerCase();
        if (email)
            interpretersByEmail.set(email, item);
        const sourceIds = Array.isArray(value.airtableRecordIds)
            ? value.airtableRecordIds.map(String)
            : [normalize(value.sourceRecordId)].filter(Boolean);
        sourceIds.forEach(sourceId => interpretersBySourceId.set(sourceId, item));
    });
    const stats = { total: imports.length, deduplicated: imports.filter(item => item.airtableRecordIds.length > 1).length, created: 0, updated: 0, skipped: 0, errors: 0 };
    const details = [];
    const writes = [];
    const now = new Date().toISOString();
    for (const item of imports) {
        if (!item.email) {
            stats.skipped += 1;
            details.push({ name: item.name, email: '', action: 'skipped', reason: 'Missing email' });
            continue;
        }
        try {
            const existingUser = usersByEmail.get(item.email);
            const linkedProfileId = normalize(existingUser?.data().profileId);
            const existingInterpreter = (linkedProfileId ? interpretersSnap.docs.find(doc => doc.id === linkedProfileId) : undefined)
                || interpretersByEmail.get(item.email)
                || item.airtableRecordIds.map(id => interpretersBySourceId.get(id)).find(Boolean);
            const interpreterRef = existingInterpreter?.ref || db.collection('interpreters').doc();
            const existingStatus = normalize(existingInterpreter?.data().status);
            const profileStatus = ['ACTIVE', 'ONBOARDING', 'SUSPENDED', 'BLOCKED'].includes(existingStatus)
                ? existingStatus
                : 'IMPORTED';
            const interpreterPayload = {
                id: interpreterRef.id,
                name: item.name,
                normalizedName: normalizeName(item.name),
                normalizedPhone: (0, identityMatching_1.normalizeIdentityPhone)(item.phone),
                email: item.email,
                phone: item.phone,
                languages: item.languages,
                languageProficiencies: item.languageProficiencies,
                address: item.address,
                qualifications: item.qualifications,
                regions: item.regions,
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
                isAvailable: existingInterpreter?.data().isAvailable ?? false,
                status: profileStatus,
                organizationId: existingInterpreter?.data().organizationId || 'lingland-main',
                sourceSystem: 'AIRTABLE',
                sourceBaseId: String(process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID),
                sourceTable: INTERPRETERS_TABLE,
                sourceRecordId: item.sourceRecordId,
                airtableRecordIds: item.airtableRecordIds,
                legacyRef: item.name,
                sourceSnapshot: item.sourceSnapshot,
                lastSyncedAt: now,
                updatedAt: now,
                createdAt: existingInterpreter?.data().createdAt || now,
            };
            const userRef = existingUser?.ref || db.collection('users').doc();
            const userStatus = ['ACTIVE', 'PENDING', 'SUSPENDED'].includes(normalize(existingUser?.data().status))
                ? normalize(existingUser?.data().status)
                : 'IMPORTED';
            const userPayload = {
                id: userRef.id,
                displayName: item.name,
                email: item.email,
                role: 'INTERPRETER',
                status: userStatus,
                profileId: interpreterRef.id,
                organizationId: existingUser?.data().organizationId || 'lingland-main',
                updatedAt: now,
                createdAt: existingUser?.data().createdAt || now,
            };
            if (existingInterpreter)
                stats.updated += 1;
            else
                stats.created += 1;
            details.push({ name: item.name, email: item.email, action: existingInterpreter ? 'updated' : 'created' });
            if (!dryRun) {
                writes.push(async () => {
                    const batch = db.batch();
                    batch.set(interpreterRef, interpreterPayload, { merge: true });
                    batch.set(userRef, userPayload, { merge: true });
                    await batch.commit();
                });
            }
        }
        catch (error) {
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
        triggeredBy: context.auth.uid,
        createdAt: now,
    });
    return { success: stats.errors === 0, dryRun, stats, details: details.slice(0, 100) };
});
//# sourceMappingURL=syncInterpreters.js.map