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
exports.scheduledRedbookSync = exports.syncAirtableMaintenance = exports.syncAirtableData = exports.syncRedbookJobs = exports.repairMissingRedbookRecords = exports.getFinancialReconciliationAudit = exports.getAirtableSyncAuditTrail = exports.getAirtableMirrorAudit = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const statusMapping_1 = require("./statusMapping");
const axios_1 = __importDefault(require("axios"));
const identityMatching_1 = require("./identityMatching");
const crypto_1 = require("crypto");
const recordStability_1 = require("./recordStability");
const clientFinanceScope_1 = require("../clients/clientFinanceScope");
const db = admin.firestore();
const DEFAULT_BASE_ID = 'appnglRJzSscwJJph'; // Lingland MASTER 24 NEW
const DEFAULT_TABLE_NAME = 'REDBOOK';
const CLIENTS_TABLE = 'Clients';
const CLIENTS_BOOK_TABLE = 'Clients Book';
const TRANSLATIONS_TABLE = 'Translations';
const WEB_TRANSLATIONS_TABLE = 'Web translations';
const CLIENT_INVOICES_TABLE = 'Invoices';
const INTERPRETER_INVOICES_TABLE = 'INV interp';
const TRANSLATION_CLIENT_INVOICES_TABLE = 'TR invoices';
const TRANSLATOR_INVOICES_TABLE = 'INV TR';
const MAX_DETAILS = 50;
const MODULE_DETAIL_LIMIT = 30;
const REDBOOK_PROCESS_CONCURRENCY = 8;
const ASSIGNMENTS_COLLECTION = 'assignments';
const DEFAULT_SYNC_STRATEGY = 'OPEN_WORKFLOW';
const FINANCE_PROJECTION_VERSION = 3;
const FULL_SYNC_MODULES = [
    'clients',
    'redbook',
    'translations',
    'clientInvoices',
    'interpreterInvoices',
    'translationClientInvoices',
    'translatorInvoices'
];
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
const normalizeKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (fields, names) => {
    for (const name of names) {
        const direct = normalize(fields[name]);
        if (direct)
            return direct;
    }
    const normalizedMap = new Map();
    Object.entries(fields).forEach(([key, value]) => {
        normalizedMap.set(normalizeKey(key), normalize(value));
    });
    for (const name of names) {
        const val = normalizedMap.get(normalizeKey(name));
        if (val)
            return val;
    }
    return '';
};
const pickRaw = (fields, names) => {
    for (const name of names) {
        if (fields[name] !== undefined && fields[name] !== null)
            return fields[name];
    }
    const normalizedMap = new Map();
    Object.entries(fields).forEach(([key, value]) => {
        normalizedMap.set(normalizeKey(key), value);
    });
    for (const name of names) {
        const val = normalizedMap.get(normalizeKey(name));
        if (val !== undefined && val !== null)
            return val;
    }
    return undefined;
};
const asArray = (value) => {
    if (Array.isArray(value))
        return value;
    if (value === null || value === undefined || value === '')
        return [];
    return [value];
};
const collectRawValues = (fields, names) => {
    const requested = new Set(names.map(normalizeKey));
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
        const keyName = normalizeKey(key);
        const matches = Array.from(requested).some(name => keyName === name || keyName.endsWith(name));
        if (matches && value !== undefined && value !== null) {
            values.push(...asArray(value));
        }
    });
    return values;
};
const mapAirtableAttachment = (file) => {
    const normalized = normalize(file);
    if (normalized)
        return normalized;
    if (!file || typeof file !== 'object' || Array.isArray(file))
        return null;
    const data = file;
    const url = normalize(data.url);
    const name = normalize(data.filename) || normalize(data.name);
    const type = normalize(data.type);
    const size = safeNumber(data.size);
    if (!url && !name)
        return null;
    return cleanData({ name, url, type, size: size || undefined });
};
const pickLinkedIds = (fields, names) => {
    return collectRawValues(fields, names)
        .map(value => normalize(value))
        .filter(Boolean);
};
const safeNumber = (value) => {
    if (Array.isArray(value))
        return safeNumber(value[0]);
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const parseMoneyValue = (value) => {
    if (Array.isArray(value)) {
        for (const entry of value) {
            const parsed = parseMoneyValue(entry);
            if (parsed !== null)
                return parsed;
        }
        return null;
    }
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/\d/.test(value))
        return null;
    const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.')
        return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};
const selectMoneyField = (fields, preferredNames, fallbackHints = []) => {
    const entries = Object.entries(fields);
    const byNormalizedName = new Map(entries.map(([key, value]) => [normalizeKey(key), { key, value }]));
    const preferredMatches = preferredNames
        .map(name => byNormalizedName.get(normalizeKey(name)))
        .filter((entry) => Boolean(entry))
        .map(entry => ({ ...entry, parsed: parseMoneyValue(entry.value) }))
        .filter(entry => entry.parsed !== null);
    const preferred = preferredMatches.find(entry => Math.abs(entry.parsed || 0) > 0) || preferredMatches[0];
    if (preferred) {
        return { value: preferred.parsed || 0, fieldName: preferred.key, found: true };
    }
    const normalizedHints = fallbackHints.map(normalizeKey).filter(Boolean);
    const excludedKeyParts = [
        'date', 'status', 'number', 'nbr', 'reference', 'recordid', 'email', 'phone',
        'wordcount', 'words', 'documents', 'docs', 'quantity', 'rate', 'percentage', 'vatnumber'
    ];
    const discovered = entries
        .map(([key, value]) => ({ key, normalizedKey: normalizeKey(key), parsed: parseMoneyValue(value) }))
        .filter(entry => entry.parsed !== null)
        .filter(entry => normalizedHints.some(hint => entry.normalizedKey.includes(hint)))
        .filter(entry => !excludedKeyParts.some(excluded => entry.normalizedKey.includes(excluded)));
    const fallback = discovered.find(entry => Math.abs(entry.parsed || 0) > 0) || discovered[0];
    return fallback
        ? { value: fallback.parsed || 0, fieldName: fallback.key, found: true }
        : { value: 0, fieldName: '', found: false };
};
const truthyField = (fields, names) => {
    const raw = pickRaw(fields, names);
    if (Array.isArray(raw))
        return raw.some(value => truthyField({ value }, ['value']));
    if (typeof raw === 'boolean')
        return raw;
    const value = normalize(raw).toLowerCase();
    return ['true', 'yes', 'y', '1', 'paid', 'verified', 'sent'].includes(value);
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
const describeMappedStatus = (status, signals, hasInterpreter) => {
    const rank = statusMapping_1.STATUS_RANK[status] || 0;
    return {
        operationalStatus: status,
        assignmentState: status === 'CANCELLED'
            ? 'CANCELLED'
            : hasInterpreter
                ? (rank >= statusMapping_1.STATUS_RANK.BOOKED ? 'ACCEPTED' : 'ASSIGNED_PENDING_ACCEPTANCE')
                : 'UNASSIGNED',
        timesheetState: status === 'CANCELLED'
            ? 'NOT_REQUIRED'
            : (rank >= statusMapping_1.STATUS_RANK.READY_FOR_INVOICE || signals.verified)
                ? 'VERIFIED'
                : (rank >= statusMapping_1.STATUS_RANK.TIMESHEET_SUBMITTED || signals.timesheetReceived || signals.hasInterpreterInvoice)
                    ? 'SUBMITTED'
                    : 'NOT_RECEIVED',
        billingState: status === 'PAID'
            ? 'PAID'
            : (rank >= statusMapping_1.STATUS_RANK.INVOICED || signals.hasClientInvoice || signals.invoiceNumber)
                ? 'INVOICED'
                : (rank >= statusMapping_1.STATUS_RANK.READY_FOR_INVOICE)
                    ? 'READY_FOR_INVOICE'
                    : 'NOT_READY',
        cancellationState: status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE'
    };
};
const mapStatus = (fields, hasInterpreter) => {
    const rawStatus = pick(fields, ['Status', 'Job Status', 'Booking Status']);
    const normalized = rawStatus.toLowerCase();
    const explicitStatus = (0, statusMapping_1.mapExplicitRedbookStatus)(rawStatus);
    const invoiceStatus = pick(fields, ['Status (from invoices table)', 'Invocing Status']);
    const invoiceNumber = pick(fields, ['Invoice Nbr (from 💷 Invoices)', 'INV ID (from 💷 Invoices)', 'Invoice Nbr', 'INV ID']);
    const schedule = parseDateTime(fields);
    const bookingStart = new Date(`${schedule.date}T${schedule.startTime}`);
    const isFuture = !Number.isNaN(bookingStart.getTime()) && bookingStart.getTime() > Date.now();
    const hasClientInvoice = !isFuture && Boolean(invoiceNumber || pick(fields, ['Invoiced on']) || safeNumber(pickRaw(fields, ['job invoice', 'Total invoiced', 'Invoiced + VAT'])));
    const hasInterpreterInvoice = !isFuture && Boolean(pick(fields, ['INV interp', 'interpreter invoice form', 'Google timesheet']));
    const timesheetReceived = !isFuture && (truthyField(fields, ['timesheet']) || Boolean(pick(fields, ['timesheet link', 'Google timesheet'])));
    const verified = !isFuture && (truthyField(fields, ['Verified', 'Verified (from Job Number from redbook)', 'Verified (from Job Number from redbook) 2'])
        || Boolean(pick(fields, ['verification date'])));
    const paid = !isFuture && (truthyField(fields, ['Paid']) || invoiceStatus.toLowerCase().includes('paid') || normalized.includes('paid'));
    let status = explicitStatus || 'INCOMING';
    if (explicitStatus)
        status = explicitStatus;
    else if (normalized.includes('cancel'))
        status = 'CANCELLED';
    else if (paid)
        status = 'PAID';
    else if (hasClientInvoice || invoiceStatus.toLowerCase().includes('invoice'))
        status = 'INVOICED';
    else if (verified)
        status = 'READY_FOR_INVOICE';
    else if (timesheetReceived || hasInterpreterInvoice || (!isFuture && normalized.includes('timesheet')))
        status = 'TIMESHEET_SUBMITTED';
    else if (!isFuture && (normalized.includes('complete') || normalized.includes('done')))
        status = 'SESSION_COMPLETED';
    else if (normalized.includes('pending'))
        status = 'ASSIGNMENT_PENDING';
    else if (normalized.includes('open'))
        status = hasInterpreter ? 'OPENED' : 'INCOMING';
    else if (normalized.includes('assign'))
        status = hasInterpreter ? 'OPENED' : 'NEEDS_ASSIGNMENT';
    else if (normalized.includes('book') || hasInterpreter)
        status = 'BOOKED';
    const signals = {
        invoiceStatus,
        invoiceNumber,
        hasClientInvoice,
        hasInterpreterInvoice,
        timesheetReceived,
        verified,
        paid,
        explicitStatusMatched: Boolean(explicitStatus)
    };
    return {
        status,
        rawStatus,
        statusMappedAt: new Date().toISOString(),
        state: describeMappedStatus(status, signals, hasInterpreter),
        signals
    };
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
const buildSourceTracking = (record, tableName, legacyRef, snapshot, runId) => {
    const snapshotHash = stableHash(snapshot);
    return cleanData({
        sourceSystem: 'AIRTABLE',
        sourceBaseId: DEFAULT_BASE_ID,
        sourceTable: tableName,
        sourceRecordId: record.id,
        legacyRef,
        snapshotHash,
        airtableSnapshotHash: snapshotHash,
        lastSyncedAt: new Date().toISOString(),
        lastSyncRunId: runId,
        syncStatus: 'SYNCED'
    });
};
const needsSourceTrackingBackfill = (existing, expected) => {
    if (!existing)
        return false;
    const requiredFields = ['sourceSystem', 'sourceBaseId', 'sourceTable', 'sourceRecordId', 'snapshotHash'];
    return requiredFields.some(field => !existing[field] && expected[field]);
};
const writeSyncConflict = async (input) => {
    if (!input.runId || input.dryRun)
        return;
    const conflictId = slugify([
        input.entityType,
        input.sourceTable,
        input.sourceRecordId,
        input.reason
    ].join('_'));
    const conflictRef = db.collection('syncConflicts').doc(conflictId);
    const existing = await conflictRef.get();
    await conflictRef.set(cleanData({
        id: conflictId,
        runId: input.runId,
        entityType: input.entityType,
        entityId: input.entityId || '',
        sourceSystem: 'AIRTABLE',
        sourceBaseId: input.sourceBaseId || DEFAULT_BASE_ID,
        sourceTable: input.sourceTable,
        sourceRecordId: input.sourceRecordId,
        legacyRef: input.legacyRef || '',
        severity: input.severity,
        reason: input.reason,
        currentValue: input.currentValue,
        incomingValue: input.incomingValue,
        recommendedAction: input.recommendedAction,
        dryRun: input.dryRun,
        resolutionStatus: 'OPEN',
        resolvedAt: null,
        resolvedBy: '',
        resolutionMethod: '',
        resolutionRunId: '',
        firstSeenAt: existing.exists ? existing.data()?.firstSeenAt : admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
};
const createConflictReconciliationContext = () => ({
    processedScopes: new Set()
});
const conflictScopeKey = (sourceTable, sourceRecordId) => (`${normalizeKey(sourceTable)}|${sourceRecordId.trim()}`);
const markConflictScopeProcessed = (context, sourceTable, sourceRecordId) => {
    if (!context || !sourceRecordId)
        return;
    context.processedScopes.add(conflictScopeKey(sourceTable, sourceRecordId));
};
const resolveStaleSyncConflicts = async (runId, context, dryRun) => {
    if (dryRun || context.processedScopes.size === 0)
        return 0;
    const openConflicts = await db.collection('syncConflicts')
        .where('resolutionStatus', '==', 'OPEN')
        .get();
    const staleConflicts = openConflicts.docs.filter(item => {
        const data = item.data();
        const scope = conflictScopeKey(normalize(data.sourceTable), normalize(data.sourceRecordId));
        return context.processedScopes.has(scope) && normalize(data.runId) !== runId;
    });
    for (let start = 0; start < staleConflicts.length; start += 400) {
        const batch = db.batch();
        staleConflicts.slice(start, start + 400).forEach(item => {
            batch.set(item.ref, {
                resolutionStatus: 'RESOLVED',
                resolutionMethod: 'AUTOMATIC_SYNC_RECONCILIATION',
                resolutionReason: 'Source record reprocessed successfully without reproducing this conflict.',
                resolutionRunId: runId,
                resolvedBy: 'SYSTEM',
                resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();
    }
    return staleConflicts.length;
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
const toInterpreterResolution = (id, profile, fallback, matchMethod, matchConfidence) => ({
    id,
    name: profile?.name || fallback.name,
    email: profile?.email || fallback.email,
    photoUrl: profile?.photoUrl || '',
    matchMethod,
    matchConfidence
});
let interpreterDirectoryPromise = null;
const getInterpreterDirectory = () => {
    if (!interpreterDirectoryPromise) {
        interpreterDirectoryPromise = db.collection('interpreters').get().then(snapshot => (snapshot.docs.map(item => ({ id: item.id, data: item.data() }))));
    }
    return interpreterDirectoryPromise;
};
const matchInterpreterDirectory = (directory, predicate, fallback, matchMethod, matchConfidence) => {
    const matches = directory.filter(predicate);
    if (matches.length === 1) {
        return toInterpreterResolution(matches[0].id, matches[0].data, fallback, matchMethod, matchConfidence);
    }
    if (matches.length > 1) {
        return {
            id: '',
            name: fallback.name,
            email: fallback.email,
            photoUrl: '',
            matchMethod,
            matchConfidence: 0,
            ambiguousCandidates: matches.map(item => item.id)
        };
    }
    return null;
};
const resolveInterpreter = async (email, name, airtableRecordId = '', phone = '') => {
    const normalizedEmail = cleanEmail(email);
    const normalizedName = name.trim();
    const normalizedNameKey = (0, identityMatching_1.normalizeIdentityName)(normalizedName);
    const normalizedPhoneKey = (0, identityMatching_1.normalizeIdentityPhone)(phone);
    const fallback = { name: normalizedName, email: normalizedEmail };
    const directory = await getInterpreterDirectory();
    if (airtableRecordId) {
        const bySource = matchInterpreterDirectory(directory, item => String(item.data.sourceRecordId || '') === airtableRecordId, fallback, 'sourceRecordId', 100);
        if (bySource)
            return bySource;
        const byLinkedRecord = matchInterpreterDirectory(directory, item => Array.isArray(item.data.airtableRecordIds) && item.data.airtableRecordIds.map(String).includes(airtableRecordId), fallback, 'airtableRecordIds', 98);
        if (byLinkedRecord)
            return byLinkedRecord;
    }
    if (normalizedEmail) {
        const interpreterByEmail = matchInterpreterDirectory(directory, item => cleanEmail(String(item.data.email || '')) === normalizedEmail, fallback, 'profileEmail', 94);
        if (interpreterByEmail)
            return interpreterByEmail;
        const userByEmail = await db.collection('users')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (!userByEmail.empty) {
            const user = userByEmail.docs[0].data();
            if (user.profileId) {
                const directoryProfile = directory.find(item => item.id === user.profileId);
                const profile = directoryProfile?.data || (await db.collection('interpreters').doc(user.profileId).get()).data();
                return toInterpreterResolution(user.profileId, profile, { name: user.displayName || name, email: user.email || normalizedEmail }, 'userEmail', 96);
            }
        }
    }
    if (normalizedPhoneKey) {
        const byPhone = matchInterpreterDirectory(directory, item => (0, identityMatching_1.normalizeIdentityPhone)(String(item.data.normalizedPhone || item.data.phone || '')) === normalizedPhoneKey, fallback, 'profilePhone', 90);
        if (byPhone)
            return byPhone;
    }
    if (normalizedName) {
        const byExactName = matchInterpreterDirectory(directory, item => String(item.data.name || '').trim() === normalizedName, fallback, 'exactName', 82);
        if (byExactName)
            return byExactName;
        const byNormalizedName = matchInterpreterDirectory(directory, item => (0, identityMatching_1.normalizeIdentityName)(String(item.data.normalizedName || item.data.name || '')) === normalizedNameKey, fallback, 'normalizedName', 74);
        if (byNormalizedName)
            return byNormalizedName;
    }
    return null;
};
const interpreterCache = new Map();
const resolveInterpreterCached = async (email, name, airtableRecordId = '', phone = '') => {
    const key = `${airtableRecordId}|${cleanEmail(email)}|${(0, identityMatching_1.normalizeIdentityName)(name)}|${(0, identityMatching_1.normalizeIdentityPhone)(phone)}`;
    if (!interpreterCache.has(key)) {
        interpreterCache.set(key, resolveInterpreter(email, name, airtableRecordId, phone));
    }
    return interpreterCache.get(key);
};
const slugify = (value) => {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'unknown';
};
const normalizeForMatch = (value) => {
    return normalize(value)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\b(ltd|limited|plc|nhs|trust|cic|llp|department|dept|service|services)\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
};
const uniqueValues = (...values) => {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
};
const pickClientIdentity = (fields) => {
    const companyName = pick(fields, [
        'Name',
        'Agency, institution or company',
        'Agency, institution or company  ',
        'Web Client',
        'Client',
        'Organisation',
        'Organization'
    ]) || 'Airtable Client';
    const bookingAgent = pick(fields, ['Booking Agent', 'Requester', 'Requested By', 'TR Requested By', 'Contact Name']);
    const email = cleanEmail(pick(fields, [
        'BA email',
        'Booking Email',
        'invoice email',
        'Invoicing email',
        'TR client email',
        'Web Clients email',
        'Email'
    ]));
    const phone = pick(fields, [
        'BA telephone',
        'Booking phone contact number',
        'invoice phone',
        'Web Clients phone',
        'Phone'
    ]);
    const billingAddress = pick(fields, [
        'BA Address',
        'Invoice address',
        'Invoicing address',
        'BA PCode',
        'Address'
    ]);
    const uniqueClientKey = pick(fields, ['Unique Client Key', 'Sage Account Ref', 'Sage ref', 'Client Key']);
    const sageAccountRef = pick(fields, ['Sage Account Ref', 'Sage ref', 'Sage Code', 'SAGE Account']);
    const invoiceContact = pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact']);
    const invoiceEmail = cleanEmail(pick(fields, ['invoice email', 'Invoicing email', 'Accounts email', 'Finance email']));
    const invoicePhone = pick(fields, ['invoice phone', 'Invoicing phone', 'Accounts phone', 'Finance phone']);
    const departmentName = pick(fields, ['Department', 'Dept', 'Ward', 'Service', 'Client Department']);
    const locationName = pick(fields, ['Location', 'Site', 'Hospital', 'Venue']);
    const normalizedCompanyName = normalizeForMatch(companyName);
    return {
        companyName,
        normalizedCompanyName,
        bookingAgent,
        email,
        phone,
        billingAddress,
        uniqueClientKey,
        sageAccountRef,
        invoiceContact,
        invoiceEmail,
        invoicePhone,
        departmentName,
        locationName,
        clientStatus: pick(fields, ['Client Status', 'Client Category', 'Status']),
        clientTrade: pick(fields, ['Client trade', 'Client Category'])
    };
};
const canonicalClientRef = (snapshot) => {
    const snapshotData = snapshot.data() || {};
    const mergedIntoClientId = normalize(snapshotData.mergedIntoClientId);
    return snapshotData.recordState === 'MERGED' && mergedIntoClientId
        ? db.collection('clients').doc(mergedIntoClientId)
        : snapshot.ref;
};
const resolveClient = async (source, dryRun, allowCreate = true, allowNormalizedNameMatch = true) => {
    const sourceKey = slugify(source.uniqueClientKey || source.clientName);
    const clientId = `airtable_client_${sourceKey}`;
    const existingById = await db.collection('clients').doc(clientId).get();
    if (existingById.exists) {
        const clientRef = canonicalClientRef(existingById);
        return { id: clientRef.id, action: clientRef.id === existingById.id ? 'matched' : 'matched-merged-alias', created: false };
    }
    if (source.uniqueClientKey) {
        const byAirtableKey = await db.collection('clients')
            .where('airtableClientKey', '==', source.uniqueClientKey)
            .limit(10)
            .get();
        const canonicalIds = Array.from(new Set(byAirtableKey.docs.map(document => canonicalClientRef(document).id)));
        if (canonicalIds.length === 1)
            return { id: canonicalIds[0], action: 'matched-airtable-key', created: false };
    }
    if (source.sageAccountRef) {
        const bySage = await db.collection('clients')
            .where('sageAccountRef', '==', source.sageAccountRef)
            .limit(1)
            .get();
        if (!bySage.empty)
            return { id: canonicalClientRef(bySage.docs[0]).id, action: 'matched-sage', created: false };
    }
    const normalizedCompanyName = source.normalizedCompanyName || normalizeForMatch(source.clientName);
    if (allowNormalizedNameMatch && normalizedCompanyName && !['airtable client', 'translation client', 'unknown client', 'client'].includes(normalizedCompanyName)) {
        const byName = await db.collection('clients')
            .where('normalizedCompanyName', '==', normalizedCompanyName)
            .limit(10)
            .get();
        const canonicalIds = Array.from(new Set(byName.docs.map(document => canonicalClientRef(document).id)));
        if (canonicalIds.length === 1)
            return { id: canonicalIds[0], action: 'matched-normalized-name', created: false };
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
        normalizedCompanyName: source.normalizedCompanyName || normalizeForMatch(source.clientName),
        sageAccountRef: source.sageAccountRef || '',
        invoiceContact: source.invoiceContact || '',
        invoiceEmail: source.invoiceEmail || '',
        sourceSystem: 'AIRTABLE',
        sourceKey,
        airtableClientKey: source.uniqueClientKey || source.clientName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (!allowCreate) {
        return { id: clientId, action: 'unresolved-client', created: false };
    }
    if (!dryRun) {
        await db.collection('clients').doc(clientId).set(clientData, { merge: true });
    }
    return { id: clientId, action: dryRun ? 'would-create' : 'created', created: true };
};
const clientCache = new Map();
const bookingByAirtableRecordCache = new Map();
const resolveClientCached = async (source, dryRun, allowCreate = true, allowNormalizedNameMatch = true) => {
    const key = `${dryRun ? 'dry' : 'write'}|${allowCreate ? 'create' : 'match'}|${allowNormalizedNameMatch ? 'name' : 'strict'}|${slugify(source.uniqueClientKey || source.sageAccountRef || source.clientName)}|${source.contactEmail}|${source.invoiceEmail || ''}`;
    if (!clientCache.has(key)) {
        clientCache.set(key, resolveClient(source, dryRun, allowCreate, allowNormalizedNameMatch));
    }
    return clientCache.get(key);
};
const resolveInvoiceClient = async (firstBookingClientId, clientName, fields, dryRun) => {
    if (firstBookingClientId)
        return { id: firstBookingClientId, action: 'matched-job', created: false };
    const uniqueClientKey = pick(fields, [
        'Unique Client Key', 'Client Key', 'Account Ref', 'Account Code', 'Account (from invoice to)', 'invoice to',
    ]);
    const sageAccountRef = pick(fields, ['Sage Account Ref', 'Sage ref', 'Sage Code', 'SAGE Account']);
    const contactEmail = cleanEmail(pick(fields, [
        'invoice email', 'Invoicing email', 'Accounts email', 'Finance email', 'TR client email', 'Email',
    ]));
    const normalizedCompanyName = normalizeForMatch(clientName);
    const placeholderName = ['airtable client', 'translation client', 'unknown client', 'client'].includes(normalizedCompanyName);
    if (placeholderName && !uniqueClientKey && !sageAccountRef && !contactEmail) {
        return {
            id: `airtable_client_${slugify(clientName)}`,
            action: 'unresolved-placeholder',
            created: false,
        };
    }
    return resolveClientCached({
        clientName,
        uniqueClientKey: uniqueClientKey || sageAccountRef || clientName,
        contactName: pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact', 'TR Requested By']),
        contactEmail,
        contactPhone: pick(fields, ['invoice phone', 'Invoicing phone', 'Accounts phone', 'Finance phone']),
        location: pick(fields, ['Invoice address', 'Invoicing address', 'Address']),
        sageAccountRef,
        invoiceEmail: contactEmail,
        invoiceContact: pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact']),
        normalizedCompanyName,
    }, dryRun, false, false);
};
const findExistingClientRef = async (record, tableName, identity) => {
    const bySource = await db.collection('clients')
        .where('sourceRecordId', '==', record.id)
        .limit(1)
        .get();
    if (!bySource.empty && bySource.docs[0].data().sourceTable === tableName)
        return canonicalClientRef(bySource.docs[0]);
    if (identity.uniqueClientKey || identity.sageAccountRef) {
        for (const key of uniqueValues(identity.uniqueClientKey, identity.sageAccountRef)) {
            const byKey = await db.collection('clients')
                .where('airtableClientKey', '==', key)
                .limit(1)
                .get();
            if (!byKey.empty)
                return canonicalClientRef(byKey.docs[0]);
            const bySage = await db.collection('clients')
                .where('sageAccountRef', '==', key)
                .limit(1)
                .get();
            if (!bySage.empty)
                return canonicalClientRef(bySage.docs[0]);
        }
    }
    if (identity.normalizedCompanyName) {
        const byName = await db.collection('clients')
            .where('normalizedCompanyName', '==', identity.normalizedCompanyName)
            .limit(2)
            .get();
        if (byName.size === 1)
            return canonicalClientRef(byName.docs[0]);
    }
    return db.collection('clients').doc(`airtable_client_${slugify(identity.uniqueClientKey || identity.companyName || record.id)}`);
};
const mapClientRecord = (record, tableName) => {
    const fields = record.fields;
    const identity = pickClientIdentity(fields);
    const sourceTracking = buildSourceTracking(record, tableName, identity.uniqueClientKey || identity.sageAccountRef || identity.companyName, { tableName, identity });
    return {
        identity,
        client: cleanData({
            organizationId: 'lingland-main',
            companyName: identity.companyName,
            contactPerson: identity.bookingAgent || identity.invoiceContact || identity.companyName,
            email: identity.email || identity.invoiceEmail || '',
            phone: identity.phone,
            status: identity.clientStatus?.toLowerCase().includes('inactive') ? 'SUSPENDED' : 'ACTIVE',
            billingAddress: identity.billingAddress || 'Address Pending Update',
            paymentTermsDays: 30,
            defaultCostCodeType: identity.sageAccountRef ? 'PO' : 'Client Name',
            normalizedCompanyName: identity.normalizedCompanyName,
            ...sourceTracking,
            sourceKey: slugify(identity.uniqueClientKey || identity.companyName || record.id),
            airtableClientKey: identity.uniqueClientKey || identity.sageAccountRef || identity.companyName,
            sageAccountRef: identity.sageAccountRef,
            bookingContactName: identity.bookingAgent,
            bookingEmail: identity.email,
            bookingPhone: identity.phone,
            invoiceContact: identity.invoiceContact,
            invoiceEmail: identity.invoiceEmail,
            invoicePhone: identity.invoicePhone,
            departmentName: identity.departmentName,
            locationName: identity.locationName,
            accountAliases: uniqueValues(identity.uniqueClientKey, identity.sageAccountRef, identity.companyName, identity.normalizedCompanyName),
            clientTrade: identity.clientTrade,
            airtableCreatedTime: record.createdTime || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
    };
};
const buildBookingLookupCandidates = (value) => {
    const normalized = normalize(value);
    if (!normalized)
        return [];
    return Array.from(new Set([
        normalized,
        parseJobNumber(normalized)
    ].filter(Boolean)));
};
const queryBookingByField = async (field, value) => {
    const snap = await db.collection('bookings').where(field, '==', value).limit(1).get();
    return snap.empty ? null : snap.docs[0];
};
const getBookingByAirtableRecordId = async (sourceRecordId) => {
    const candidates = buildBookingLookupCandidates(sourceRecordId);
    if (!candidates.length)
        return null;
    const cacheKey = candidates.join('|').toLowerCase();
    if (!bookingByAirtableRecordCache.has(cacheKey)) {
        bookingByAirtableRecordCache.set(cacheKey, (async () => {
            const fields = ['sourceRecordId', 'jobNumber', 'legacyAirtableRef', 'displayRef', 'bookingRef'];
            for (const candidate of candidates) {
                for (const field of fields) {
                    const snap = await queryBookingByField(field, candidate);
                    if (snap?.exists)
                        return snap;
                }
            }
            return null;
        })());
    }
    return bookingByAirtableRecordCache.get(cacheKey);
};
const getBookingsByAirtableRecordIds = async (sourceRecordIds) => {
    const uniqueIds = Array.from(new Set(sourceRecordIds.flatMap(buildBookingLookupCandidates)));
    const snaps = await Promise.all(uniqueIds.map(id => getBookingByAirtableRecordId(id)));
    const seen = new Set();
    return snaps.filter((snap) => {
        if (!snap?.exists || seen.has(snap.id))
            return false;
        seen.add(snap.id);
        return true;
    });
};
const mapClientInvoiceStatus = (fields) => {
    const raw = pick(fields, [
        'Invocing Status',
        'Invoicing Status',
        'Invoice Status',
        'TR Invoice Status',
        'TR Status',
        'Status',
        'Payment Status'
    ]);
    return (0, statusMapping_1.mapClientInvoiceStatusValue)(raw, {
        paid: truthyField(fields, ['Paid', 'Payment received', 'Settled']),
        sent: truthyField(fields, ['Email', 'Sent', 'Invoice sent', 'Emailed'])
    });
};
const mapInterpreterInvoiceStatus = (fields) => {
    return (0, statusMapping_1.mapInterpreterInvoiceStatusValue)(pick(fields, [
        'Invoice Status',
        'INV Status',
        'TR Invoice Status',
        'Status',
        'Payment Status',
        'Approval Status'
    ]));
};
const dateOnly = (value) => {
    const normalizedValue = normalize(value);
    const parsed = normalizedValue ? new Date(normalizedValue) : null;
    if (parsed && !Number.isNaN(parsed.getTime()))
        return parsed.toISOString();
    return new Date().toISOString();
};
const summarizeInvoiceLine = (booking, fallbackJob, amount) => {
    const bookingData = booking?.data() || {};
    const units = Math.max(Number(bookingData.durationMinutes || 60) / 60, 1);
    return {
        bookingId: booking?.id || '',
        timesheetId: '',
        description: `Airtable REDBOOK job ${bookingData.jobNumber || bookingData.displayRef || fallbackJob || booking?.id || 'unknown'}`,
        units,
        rate: units > 0 ? Number((amount / units).toFixed(2)) : amount,
        lineAmount: amount,
        total: amount,
        sourceSystem: 'AIRTABLE',
        source: 'redbook_finance_sync'
    };
};
const getStaleImportedInvoiceLineRefs = async (collectionName, invoiceId, sourceRecordId, expectedLineIds) => {
    const existingLines = await db.collection(collectionName).where('invoiceId', '==', invoiceId).get();
    return existingLines.docs
        .filter(line => {
        const data = line.data();
        return data.sourceSystem === 'AIRTABLE' || data.sourceRecordId === sourceRecordId;
    })
        .filter(line => !expectedLineIds.has(line.id))
        .map(line => line.ref);
};
const getMirroredTimesheetId = (bookingId) => `airtable_timesheet_${bookingId}`;
const getBookingDateTime = (booking) => {
    const date = normalize(booking.date) || new Date().toISOString().split('T')[0];
    const startTime = normalize(booking.startTime) || '09:00';
    const durationMinutes = safeNumber(booking.durationMinutes) || 60;
    const actualStart = `${date}T${startTime.length === 5 ? `${startTime}:00` : startTime}`;
    const parsedStart = new Date(actualStart);
    const startIso = Number.isNaN(parsedStart.getTime()) ? new Date().toISOString() : parsedStart.toISOString();
    const actualEnd = new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString();
    return { actualStart: startIso, actualEnd, durationMinutes };
};
const shouldMirrorTimesheet = (booking) => {
    const status = normalize(booking.status);
    const signals = booking.airtableStatusSignals;
    return (statusMapping_1.STATUS_RANK[status] || 0) >= statusMapping_1.STATUS_RANK.TIMESHEET_SUBMITTED
        || Boolean(signals?.timesheetReceived)
        || Boolean(signals?.verified)
        || Boolean(signals?.completed)
        || Boolean(signals?.hasClientInvoice)
        || Boolean(signals?.hasInterpreterInvoice)
        || Boolean(signals?.invoiceNumber)
        || Boolean(signals?.paid);
};
const mirroredTimesheetStatus = (booking) => {
    const status = normalize(booking.status);
    if ((statusMapping_1.STATUS_RANK[status] || 0) >= statusMapping_1.STATUS_RANK.INVOICED)
        return 'INVOICED';
    if ((statusMapping_1.STATUS_RANK[status] || 0) >= statusMapping_1.STATUS_RANK.READY_FOR_INVOICE)
        return 'APPROVED';
    return 'SUBMITTED';
};
const mirroredAssignmentStatus = (booking) => {
    const status = normalize(booking.status);
    if (status === 'CANCELLED')
        return 'REMOVED';
    if ((statusMapping_1.STATUS_RANK[status] || 0) >= statusMapping_1.STATUS_RANK.BOOKED)
        return 'ACCEPTED';
    return 'OFFERED';
};
const predictWorkflowArtifacts = (booking) => {
    const hasAssignment = Boolean(normalize(booking.interpreterId));
    const hasTimesheet = shouldMirrorTimesheet(booking) && Boolean(normalize(booking.interpreterId)) && Boolean(normalize(booking.clientId));
    return {
        assignment: hasAssignment ? mirroredAssignmentStatus(booking) : '',
        timesheet: hasTimesheet ? mirroredTimesheetStatus(booking) : '',
        events: [
            hasAssignment ? 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE' : '',
            hasTimesheet ? 'TIMESHEET_MIRRORED_FROM_AIRTABLE' : ''
        ].filter(Boolean)
    };
};
const setMirroredJobEvent = (batch, bookingId, booking, type, description, metadata = {}) => {
    const eventId = `airtable_${bookingId}_${type.toLowerCase()}`;
    batch.set(db.collection('jobEvents').doc(eventId), cleanData({
        jobId: bookingId,
        organizationId: normalize(booking.organizationId) || 'lingland-main',
        type,
        source: 'airtable',
        description,
        metadata: cleanData({
            ...metadata,
            sourceRecordId: booking.sourceRecordId,
            sourceTable: booking.sourceTable,
            mirroredFromAirtable: true
        }),
        createdAt: normalize(booking.lastSyncedAt) || new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
};
const mirrorAssignmentArtifact = (batch, bookingId, booking) => {
    const interpreterId = normalize(booking.interpreterId);
    if (!interpreterId)
        return '';
    const status = mirroredAssignmentStatus(booking);
    const now = new Date().toISOString();
    const assignmentId = `airtable_assignment_${bookingId}_${interpreterId}`;
    batch.set(db.collection(ASSIGNMENTS_COLLECTION).doc(assignmentId), cleanData({
        id: assignmentId,
        bookingId,
        interpreterId,
        status,
        offeredAt: normalize(booking.lastSyncedAt) || now,
        respondedAt: status === 'ACCEPTED' || status === 'REMOVED' ? (normalize(booking.lastSyncedAt) || now) : undefined,
        assignmentType: 'AIRTABLE_MIRROR',
        recordedByStaff: true,
        sourceSystem: 'AIRTABLE',
        sourceRecordId: booking.sourceRecordId,
        bookingSnapshot: {
            id: bookingId,
            jobNumber: booking.jobNumber,
            displayRef: booking.displayRef,
            clientName: booking.clientName,
            date: booking.date,
            startTime: booking.startTime,
            languageFrom: booking.languageFrom,
            languageTo: booking.languageTo,
            locationType: booking.locationType,
            status: booking.status
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    setMirroredJobEvent(batch, bookingId, booking, status === 'ACCEPTED' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE', status === 'ACCEPTED'
        ? 'Interpreter acceptance was mirrored from Airtable.'
        : 'Interpreter assignment was mirrored from Airtable.', { interpreterId, assignmentId, assignmentStatus: status });
    return status;
};
const mirrorTimesheetArtifact = (batch, bookingId, booking) => {
    const interpreterId = normalize(booking.interpreterId);
    const clientId = normalize(booking.clientId);
    if (!shouldMirrorTimesheet(booking) || !interpreterId || !clientId)
        return '';
    const timesheetId = getMirroredTimesheetId(bookingId);
    const { actualStart, actualEnd, durationMinutes } = getBookingDateTime(booking);
    const durationHours = Math.max(durationMinutes / 60, 1);
    const serviceCategory = normalize(booking.serviceCategory);
    const wordCount = safeNumber(booking.wordCount);
    const units = serviceCategory === 'TRANSLATION' ? (wordCount || safeNumber(booking.numberOfDocs) || 1) : durationHours;
    const status = mirroredTimesheetStatus(booking);
    const approved = status === 'APPROVED' || status === 'INVOICED';
    const clientInvoiceId = normalize(booking.clientInvoiceId);
    const interpreterInvoiceId = normalize(booking.interpreterInvoiceId);
    const readyForClientInvoice = status === 'APPROVED' && !clientInvoiceId;
    const readyForInterpreterInvoice = approved && !interpreterInvoiceId;
    batch.set(db.collection('timesheets').doc(timesheetId), cleanData({
        id: timesheetId,
        bookingId,
        jobId: bookingId,
        interpreterId,
        interpreterName: booking.interpreterName,
        clientId,
        clientName: booking.clientName,
        organizationId: normalize(booking.organizationId) || 'lingland-main',
        status,
        submittedAt: normalize(booking.lastSyncedAt) || new Date().toISOString(),
        actualStart,
        actualEnd,
        sessionDurationMinutes: durationMinutes,
        breakDurationMinutes: 0,
        units: serviceCategory === 'TRANSLATION' ? 'words' : 'hours',
        wordCount,
        numberOfDocs: safeNumber(booking.numberOfDocs),
        adminApproved: approved,
        adminApprovedAt: approved ? (normalize(booking.lastSyncedAt) || new Date().toISOString()) : undefined,
        readyForClientInvoice,
        readyForInterpreterInvoice,
        unitsBillableToClient: units,
        unitsPayableToInterpreter: units,
        clientAmountCalculated: safeNumber(booking.totalAmount) || safeNumber(booking.finalQuote),
        interpreterAmountCalculated: safeNumber(booking.interpreterInvoiceTotal),
        totalToPay: safeNumber(booking.interpreterInvoiceTotal),
        clientInvoiceId: clientInvoiceId || null,
        interpreterInvoiceId: interpreterInvoiceId || null,
        source: 'AIRTABLE_MIRROR',
        sourceSystem: 'AIRTABLE',
        sourceRecordId: booking.sourceRecordId,
        sourceTable: booking.sourceTable,
        importedFromAirtable: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    setMirroredJobEvent(batch, bookingId, booking, status === 'APPROVED' || status === 'INVOICED' ? 'TIMESHEET_VERIFIED' : 'TIMESHEET_SUBMITTED', status === 'APPROVED' || status === 'INVOICED'
        ? 'Timesheet verification was mirrored from Airtable.'
        : 'Timesheet receipt was mirrored from Airtable.', { timesheetId, timesheetStatus: status });
    return status;
};
const mirrorWorkflowArtifacts = async (bookingRef, booking) => {
    const batch = db.batch();
    const assignment = mirrorAssignmentArtifact(batch, bookingRef.id, booking);
    const timesheet = mirrorTimesheetArtifact(batch, bookingRef.id, booking);
    const events = [
        assignment ? 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE' : '',
        timesheet ? 'TIMESHEET_MIRRORED_FROM_AIRTABLE' : ''
    ].filter(Boolean);
    if (!assignment && !timesheet)
        return { assignment, timesheet, events };
    await batch.commit();
    return { assignment, timesheet, events };
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
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role) || user.data()?.status !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can sync REDBOOK.');
    }
};
const normalizeSyncStrategy = (value) => {
    const normalized = normalize(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if ([
        'OPEN_WORKFLOW',
        'UPDATED_SINCE_LAST_SYNC',
        'RECENT_OPEN',
        'FULL_AUDIT',
        'CUSTOM_LIMIT'
    ].includes(normalized)) {
        return normalized;
    }
    return DEFAULT_SYNC_STRATEGY;
};
const effectiveLimitForStrategy = (strategy, requestedLimit) => {
    if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT')
        return Math.min(Math.max(requestedLimit || 500, 1), 5000);
    if (strategy === 'UPDATED_SINCE_LAST_SYNC')
        return Math.min(Math.max(requestedLimit || 1000, 1), 3000);
    if (strategy === 'RECENT_OPEN')
        return Math.min(Math.max(requestedLimit || 1500, 1), 3000);
    return Math.min(Math.max(requestedLimit || 5000, 1), 5000);
};
const getLastSyncIso = async () => {
    const syncCenter = await db.collection('system').doc('airtableSyncCenter').get();
    const legacy = await db.collection('system').doc('airtableRedbookSync').get();
    return normalize(syncCenter.data()?.lastRunAt) || normalize(legacy.data()?.lastRunAt) || '';
};
const airtableDateLiteral = (iso) => iso.replace(/"/g, '');
const buildAirtableFormula = (strategy, tableName, lastSyncIso = '') => {
    if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT')
        return undefined;
    const statusOpenFormula = `NOT(REGEX_MATCH(LOWER({Status} & ''), 'paid|cancelled|canceled'))`;
    const updatedFormula = lastSyncIso
        ? `IS_AFTER(LAST_MODIFIED_TIME(), DATETIME_PARSE("${airtableDateLiteral(lastSyncIso)}"))`
        : '';
    const recentFormula = `IS_AFTER(CREATED_TIME(), DATEADD(TODAY(), -60, 'days'))`;
    if (strategy === 'UPDATED_SINCE_LAST_SYNC') {
        return updatedFormula || recentFormula;
    }
    const isWorkflowTable = [
        DEFAULT_TABLE_NAME,
        process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME,
        TRANSLATIONS_TABLE,
        WEB_TRANSLATIONS_TABLE
    ].includes(tableName);
    if (strategy === 'RECENT_OPEN') {
        return isWorkflowTable
            ? `OR(${statusOpenFormula}, ${updatedFormula || recentFormula}, ${recentFormula})`
            : `OR(${updatedFormula || recentFormula}, ${recentFormula})`;
    }
    return isWorkflowTable
        ? `OR(${statusOpenFormula}, ${updatedFormula || recentFormula})`
        : (updatedFormula || undefined);
};
const FINANCIALLY_OPEN_STATUSES = [
    'INCOMING',
    'NEEDS_ASSIGNMENT',
    'ASSIGNMENT_PENDING',
    'OPENED',
    'QUOTE_PENDING',
    'BOOKED',
    'SESSION_COMPLETED',
    'TIMESHEET_SUBMITTED',
    'TIMESHEET_VERIFIED',
    'READY_FOR_INVOICE',
    'INVOICING',
    'INVOICED',
    'ADMIN',
    'ADMIN_HOLD'
];
const isTerminalStableStatus = (status) => ['PAID', 'CANCELLED'].includes(normalize(status).toUpperCase());
const getWorkflowSourceRecordIds = async (strategy) => {
    if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT')
        return new Set();
    const ids = new Set();
    await Promise.all(FINANCIALLY_OPEN_STATUSES.map(async (status) => {
        const snap = await db.collection('bookings')
            .where('sourceSystem', '==', 'AIRTABLE')
            .where('status', '==', status)
            .limit(750)
            .get();
        snap.docs.forEach(doc => {
            const sourceRecordId = normalize(doc.data().sourceRecordId);
            if (sourceRecordId)
                ids.add(sourceRecordId);
        });
    }));
    return ids;
};
const getFinanceLinkedSourceIds = (record, tableName) => {
    const fields = record.fields;
    if (tableName === CLIENT_INVOICES_TABLE) {
        return pickLinkedIds(fields, ['Job Number from redbook', 'ðŸ–¥ï¸ REDBOOK', 'Redbook ID (from Job Number from redbook)']);
    }
    if (tableName === INTERPRETER_INVOICES_TABLE) {
        return pickLinkedIds(fields, ['ðŸ–¥ï¸ REDBOOK', 'Redbook ID (from ðŸ–¥ï¸ REDBOOK)']);
    }
    if (tableName === TRANSLATION_CLIENT_INVOICES_TABLE || tableName === TRANSLATOR_INVOICES_TABLE) {
        return pickLinkedIds(fields, ['Translations', 'TR NUMBER (from Translations)', 'TR ID']);
    }
    return [];
};
const filterFinanceRecordsForWorkflow = (records, tableName, workflowSourceRecordIds, strategy) => {
    if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT' || workflowSourceRecordIds.size === 0) {
        return { records, dropped: 0, filterActive: false };
    }
    const filtered = records.filter(record => {
        const linkedIds = getFinanceLinkedSourceIds(record, tableName);
        return linkedIds.length === 0 || linkedIds.some(id => workflowSourceRecordIds.has(id));
    });
    return {
        records: filtered,
        dropped: records.length - filtered.length,
        filterActive: true
    };
};
const fetchAirtableRecordBatch = async (limitRecords, tableName = DEFAULT_TABLE_NAME, startOffset = '', options = {}) => {
    const apiKey = (process.env.AIRTABLE_API_KEY || '').trim();
    const baseId = process.env.AIRTABLE_REDBOOK_BASE_ID || DEFAULT_BASE_ID;
    const resolvedTableName = tableName === DEFAULT_TABLE_NAME
        ? (process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME)
        : tableName;
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured.');
    }
    const records = [];
    let offset = startOffset;
    let appliedFormula = options.filterByFormula || '';
    do {
        const params = {
            pageSize: Math.min(100, Math.max(limitRecords - records.length, 1))
        };
        if (offset)
            params.offset = offset;
        if (appliedFormula)
            params.filterByFormula = appliedFormula;
        let response = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                response = await axios_1.default.get(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(resolvedTableName)}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    params,
                    timeout: 30000
                });
                break;
            }
            catch (error) {
                const isFinalAttempt = attempt === 3;
                console.warn(`[REDBOOK Sync] Airtable fetch failed for ${resolvedTableName} attempt ${attempt}.`);
                if (appliedFormula && attempt === 1 && !options.strictFormula) {
                    console.warn(`[REDBOOK Sync] Formula filter rejected or unavailable for ${resolvedTableName}; retrying without server-side filter.`);
                    delete params.filterByFormula;
                    appliedFormula = '';
                }
                if (isFinalAttempt) {
                    throw new functions.https.HttpsError('deadline-exceeded', `Airtable did not respond in time while fetching ${resolvedTableName}. Please retry the sync.`);
                }
                await new Promise(resolve => setTimeout(resolve, attempt * 750));
            }
        }
        if (!response) {
            throw new functions.https.HttpsError('internal', `Airtable fetch failed for ${resolvedTableName}.`);
        }
        records.push(...response.data.records);
        offset = response.data.offset || '';
    } while (offset && records.length < limitRecords);
    let stabilizedRecords = records.slice(0, limitRecords);
    let stabilizedNextOffset = offset;
    let stabilizedFormula = appliedFormula;
    if (options.stabilize && !startOffset && !offset && stabilizedRecords.length > 0 && stabilizedRecords.length < limitRecords) {
        const secondPass = await fetchAirtableRecordBatch(limitRecords, tableName, '', { ...options, filterByFormula: appliedFormula, stabilize: false });
        const firstFingerprint = (0, recordStability_1.fingerprintAirtableSnapshot)(stabilizedRecords);
        const secondFingerprint = (0, recordStability_1.fingerprintAirtableSnapshot)(secondPass.records);
        const snapshots = [stabilizedRecords, secondPass.records];
        let latestPass = secondPass;
        if (firstFingerprint !== secondFingerprint && !secondPass.nextOffset) {
            const thirdPass = await fetchAirtableRecordBatch(limitRecords, tableName, '', { ...options, filterByFormula: secondPass.filterByFormula, stabilize: false });
            snapshots.push(thirdPass.records);
            latestPass = thirdPass;
        }
        stabilizedRecords = (0, recordStability_1.mergeAirtableSnapshots)(...snapshots).slice(0, limitRecords);
        stabilizedNextOffset = latestPass.nextOffset;
        stabilizedFormula = latestPass.filterByFormula;
    }
    return {
        records: stabilizedRecords,
        nextOffset: stabilizedNextOffset,
        tableName: resolvedTableName,
        filterByFormula: stabilizedFormula,
        strategy: options.strategy || DEFAULT_SYNC_STRATEGY
    };
};
const fetchAirtableRecords = async (limitRecords, tableName = DEFAULT_TABLE_NAME) => {
    const batch = await fetchAirtableRecordBatch(limitRecords, tableName);
    return batch.records;
};
const getExistingRedbookBySourceId = async () => {
    const snap = await db.collection('bookings')
        .where('sourceTable', '==', DEFAULT_TABLE_NAME)
        .get();
    return new Map(snap.docs
        .map(doc => [normalize(doc.data().sourceRecordId), doc])
        .filter(([sourceRecordId]) => Boolean(sourceRecordId)));
};
const fetchAirtableRecordsByIds = async (sourceRecordIds, tableName = DEFAULT_TABLE_NAME) => {
    const uniqueIds = Array.from(new Set(sourceRecordIds.map(normalize).filter(Boolean))).slice(0, 100);
    if (!uniqueIds.length) {
        return {
            records: [],
            nextOffset: '',
            tableName,
            filterByFormula: '',
            strategy: DEFAULT_SYNC_STRATEGY
        };
    }
    const chunks = [];
    for (let index = 0; index < uniqueIds.length; index += 80) {
        chunks.push(uniqueIds.slice(index, index + 80));
    }
    const batches = await Promise.all(chunks.map(chunk => fetchAirtableRecordBatch(chunk.length, tableName, '', {
        filterByFormula: `OR(${chunk.map(id => `RECORD_ID()='${id.replace(/'/g, "\\'")}'`).join(',')})`,
        strategy: DEFAULT_SYNC_STRATEGY,
        strictFormula: true
    })));
    return {
        records: batches.flatMap(batch => batch.records),
        nextOffset: '',
        tableName: batches[0]?.tableName || tableName,
        filterByFormula: 'RECORD_ID() IN selected missing ids',
        strategy: DEFAULT_SYNC_STRATEGY
    };
};
const shouldUseSelectiveRedbookProcessing = (strategy) => (strategy === 'OPEN_WORKFLOW' || strategy === 'RECENT_OPEN');
const shouldProcessRedbookRecord = (record, existingBySourceId) => {
    const existingSnap = existingBySourceId.get(record.id);
    if (!existingSnap)
        return true;
    const existing = existingSnap.data();
    const rawStatus = normalize(record.fields.Status);
    const existingStatus = normalize(existing.sourceStatusRaw)
        || normalize(existing.airtableOperationalStatus)
        || normalize(existing.status);
    const sourceBackfillNeeded = needsSourceTrackingBackfill(existing, {
        sourceSystem: 'AIRTABLE',
        sourceBaseId: DEFAULT_BASE_ID,
        sourceTable: DEFAULT_TABLE_NAME,
        sourceRecordId: record.id,
        snapshotHash: 'pending'
    });
    if (sourceBackfillNeeded)
        return true;
    if (normalize(existing.airtableRawRecordHash) !== (0, recordStability_1.hashAirtableRecordFields)(record.fields))
        return true;
    if (rawStatus && rawStatus.toLowerCase() !== existingStatus.toLowerCase())
        return true;
    return false;
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
    const resolvedInterpreter = await resolveInterpreterCached(interpreterEmail, interpreterName, interpreterAirtableRecordId, interpreterPhone);
    const statusMapping = mapStatus(fields, Boolean(resolvedInterpreter?.id || interpreterName || interpreterEmail || interpreterAirtableRecordId));
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
        status: statusMapping.status,
        statusRaw: statusMapping.rawStatus,
        interpreterName,
        interpreterEmail,
        interpreterPhone,
        interpreterAirtableRecordId,
        interpreterResolved: Boolean(resolvedInterpreter?.id),
        interpreterMatchMethod: resolvedInterpreter?.matchMethod || '',
        interpreterMatchConfidence: resolvedInterpreter?.matchConfidence || 0,
        interpreterAmbiguousCandidates: resolvedInterpreter?.ambiguousCandidates || []
    };
    const sourceTracking = buildSourceTracking(record, DEFAULT_TABLE_NAME, legacyRef || sourceSnapshot.jobNumber, sourceSnapshot);
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
            ...sourceTracking,
            airtableRawRecordHash: (0, recordStability_1.hashAirtableRecordFields)(fields),
            airtableCreatedTime: record.createdTime || '',
            airtableOperationalStatus: statusMapping.rawStatus,
            airtableFinancialStatus: statusMapping.signals.invoiceStatus,
            airtableStatusSignals: statusMapping.signals,
            sourceStatusRaw: statusMapping.rawStatus,
            statusMappedAt: statusMapping.statusMappedAt,
            statusMappingState: statusMapping.state,
            assignmentState: statusMapping.state.assignmentState,
            timesheetState: statusMapping.state.timesheetState,
            billingState: statusMapping.state.billingState,
            cancellationState: statusMapping.state.cancellationState,
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
const mapTranslationStatus = (fields, hasTranslator) => {
    const rawStatus = pick(fields, ['TR Status', 'Status', 'Translation Status']);
    const normalized = rawStatus.toLowerCase();
    const explicitStatus = (0, statusMapping_1.mapExplicitTranslationStatus)(rawStatus);
    const completed = truthyField(fields, ['COMPLETED', 'TR Verified']) || normalized.includes('complete') || normalized.includes('verified');
    const delivered = truthyField(fields, ['Delivered', 'Delivery sent', 'Sent to client']) || normalized.includes('delivered') || normalized.includes('sent');
    const invoiceNumber = pick(fields, ['Invoice No', 'INVOICE NO/DATE', 'TR Invoice Nbr']);
    const paid = truthyField(fields, ['Invoice Paid', 'TR barbara paid']) || normalized.includes('paid');
    const quoteRequested = truthyField(fields, ['Needs quote?']) || normalized.includes('quote');
    let status = explicitStatus || 'INCOMING';
    if (explicitStatus)
        status = explicitStatus;
    else if (normalized.includes('cancel'))
        status = 'CANCELLED';
    else if (paid)
        status = 'PAID';
    else if (invoiceNumber || normalized.includes('invoice'))
        status = 'INVOICED';
    else if (completed || delivered)
        status = 'READY_FOR_INVOICE';
    else if (quoteRequested)
        status = 'QUOTE_PENDING';
    else if (hasTranslator)
        status = 'BOOKED';
    const billingState = status === 'PAID' ? 'PAID'
        : status === 'INVOICED' ? 'INVOICED'
            : status === 'READY_FOR_INVOICE' ? 'READY_FOR_INVOICE'
                : 'NOT_READY';
    const deliveryState = status === 'CANCELLED' ? 'CANCELLED'
        : delivered ? 'DELIVERED'
            : completed ? 'COMPLETED'
                : quoteRequested ? 'QUOTE_PENDING'
                    : hasTranslator ? 'IN_PROGRESS'
                        : 'NOT_STARTED';
    const state = {
        operationalStatus: status,
        assignmentState: status === 'CANCELLED' ? 'CANCELLED' : hasTranslator ? 'ACCEPTED' : 'UNASSIGNED',
        timesheetState: 'NOT_REQUIRED',
        billingState,
        cancellationState: status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
        deliveryState
    };
    return {
        status,
        rawStatus,
        statusMappedAt: new Date().toISOString(),
        state,
        signals: {
            completed,
            delivered,
            invoiceNumber,
            paid,
            quoteRequested,
            explicitStatusMatched: Boolean(explicitStatus)
        }
    };
};
const parseTranslationLanguages = (rawTargetLanguage, rawSourceLanguage) => {
    const combined = rawTargetLanguage.match(/^\s*(.+?)\s+(?:to|->|→)\s+(.+?)\s*$/i);
    if (combined) {
        return {
            sourceLanguage: titleCase(combined[1].trim()),
            targetLanguage: titleCase(combined[2].trim())
        };
    }
    return {
        sourceLanguage: rawSourceLanguage || 'English',
        targetLanguage: rawTargetLanguage || 'Unknown'
    };
};
const mapTranslationRecordToBooking = async (record, tableName) => {
    const fields = record.fields;
    const legacyRef = pick(fields, ['TR NUMBER', 'Web Number', 'TR ID', 'Name', 'Reference']) || `TR-${record.id}`;
    const jobNumber = legacyRef || `TR-${record.id}`;
    const language = pick(fields, ['LANGUAGE', 'web language', 'Language', 'Target Language']) || 'Unknown';
    const sourceLanguageRaw = pick(fields, ['Source Language', 'Language From', 'FROM LANGUAGE']) || 'English';
    const { sourceLanguage, targetLanguage } = parseTranslationLanguages(language, sourceLanguageRaw);
    const clientIdentity = pickClientIdentity(fields);
    const translatorName = pick(fields, ['TRANSLATOR', 'Assign to TR', 'Assign to', 'Interpreters']);
    const translatorEmail = cleanEmail(pick(fields, ['EMAIL (from Assign to TR)', 'EMAIL (from assign to)', 'EMAIL', 'Translator Email']));
    const translatorPhone = pick(fields, ['PHONE (from Assign to TR)', 'PHONE (from assign to)', 'Translator Phone']);
    const translatorAirtableRecordId = pick(fields, ['Assign to TR', 'Assign to', 'Interpreters']);
    const resolvedTranslator = await resolveInterpreterCached(translatorEmail, translatorName, translatorAirtableRecordId, translatorPhone);
    const statusMapping = mapTranslationStatus(fields, Boolean(resolvedTranslator?.id || translatorName || translatorEmail));
    const createdOrCompleted = pickRaw(fields, ['COMPLETED', 'TR CREATED', 'Created', 'Last Modified']) || record.createdTime;
    const parsedDate = dateOnly(createdOrCompleted);
    const deadline = dateOnly(pickRaw(fields, ['Deadline', 'Delivery Date', 'Due Date', 'TR Deadline', 'Return by', 'Required by']));
    const completedAt = dateOnly(pickRaw(fields, ['COMPLETED', 'TR Verified', 'Completed']));
    const deliveredAt = dateOnly(pickRaw(fields, ['Delivered', 'Delivery sent', 'Sent to client']));
    const wordCount = safeNumber(pickRaw(fields, ['WORD COUNT', 'RTR INV WORDS']));
    const numberOfDocs = safeNumber(pickRaw(fields, ['Number of docs', 'RTR INV DOCS']));
    const finalQuote = safeNumber(pickRaw(fields, ['FINAL QUOTE', 'FQ+VAT', 'OUR FEE']));
    const format = pick(fields, ['Format for client', 'Web Format', 'Other formats']);
    const notes = pick(fields, ['TR Notes', 'Notes', 'RTR INV COMMENTS']);
    const sourceFiles = asArray(pickRaw(fields, ['Document to Translate', 'Documents']))
        .map(mapAirtableAttachment)
        .filter(Boolean);
    const sourceSnapshot = {
        tableName,
        legacyRef,
        jobNumber,
        language: targetLanguage,
        clientIdentity,
        translatorName,
        translatorEmail,
        translatorPhone,
        translatorAirtableRecordId,
        translatorResolved: Boolean(resolvedTranslator?.id),
        translatorMatchMethod: resolvedTranslator?.matchMethod || '',
        translatorMatchConfidence: resolvedTranslator?.matchConfidence || 0,
        translatorAmbiguousCandidates: resolvedTranslator?.ambiguousCandidates || [],
        wordCount,
        numberOfDocs,
        finalQuote,
        format,
        deadline,
        completedAt,
        deliveredAt,
        sourceLanguage,
        notes,
        sourceFiles,
        status: statusMapping.status,
        statusRaw: statusMapping.rawStatus,
        statusMappingState: statusMapping.state
    };
    const sourceTracking = buildSourceTracking(record, tableName, legacyRef, sourceSnapshot);
    return {
        booking: {
            clientId: '',
            clientName: clientIdentity.companyName,
            requestedByUserId: '',
            organizationId: 'lingland-main',
            serviceCategory: 'TRANSLATION',
            serviceType: 'Translation',
            languageFrom: sourceLanguage,
            languageTo: targetLanguage,
            date: (deadline || parsedDate).split('T')[0],
            startTime: '09:00',
            durationMinutes: 0,
            locationType: 'ONLINE',
            location: 'Document delivery',
            status: statusMapping.status,
            costCode: pick(fields, ['TR COST CODE', 'Cost Code']),
            notes,
            professionalName: clientIdentity.bookingAgent || clientIdentity.companyName,
            patientName: pick(fields, ['TR Requested By', 'Web Client']) || clientIdentity.companyName,
            interpreterId: resolvedTranslator?.id || '',
            interpreterName: resolvedTranslator?.name || translatorName,
            interpreterPhotoUrl: resolvedTranslator?.photoUrl || '',
            interpreterEmail: resolvedTranslator?.email || translatorEmail,
            interpreterAirtableRecordId: translatorAirtableRecordId,
            bookingRef: jobNumber,
            jobNumber,
            displayRef: legacyRef,
            legacyAirtableRef: legacyRef,
            ...sourceTracking,
            airtableCreatedTime: record.createdTime || '',
            airtableOperationalStatus: statusMapping.rawStatus,
            airtableFinancialStatus: pick(fields, ['Invoice Paid', 'Status']),
            airtableStatusSignals: statusMapping.signals,
            sourceStatusRaw: statusMapping.rawStatus,
            statusMappedAt: statusMapping.statusMappedAt,
            statusMappingState: statusMapping.state,
            assignmentState: statusMapping.state.assignmentState,
            timesheetState: statusMapping.state.timesheetState,
            billingState: statusMapping.state.billingState,
            cancellationState: statusMapping.state.cancellationState,
            translationFormat: format,
            translationFormatOther: pick(fields, ['Other formats']),
            translationDeadline: deadline,
            translationCompletedAt: completedAt,
            translationDeliveredAt: deliveredAt,
            quoteRequested: statusMapping.signals.quoteRequested,
            sourceFiles,
            deliveryEmail: clientIdentity.email || clientIdentity.invoiceEmail,
            wordCount,
            numberOfDocs,
            finalQuote,
            guestContact: {
                name: clientIdentity.bookingAgent || clientIdentity.companyName,
                organisation: clientIdentity.companyName,
                email: clientIdentity.email || clientIdentity.invoiceEmail || '',
                phone: clientIdentity.phone
            },
            totalAmount: finalQuote,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        sourceSnapshot
    };
};
const cleanData = (data) => {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
};
const cleanReportData = (data) => JSON.parse(JSON.stringify(data, (_key, value) => {
    if (value && typeof value === 'object' && typeof value._seconds === 'number') {
        return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000)).toISOString();
    }
    return value;
}));
const isPlainObject = (value) => (Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype);
const cleanFirestoreValue = (value) => {
    if (value === undefined)
        return undefined;
    if (Array.isArray(value)) {
        return value
            .map(cleanFirestoreValue)
            .filter(item => item !== undefined);
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value)
            .map(([key, child]) => [key, cleanFirestoreValue(child)])
            .filter(([, child]) => child !== undefined));
    }
    return value;
};
const cleanFirestoreData = (data) => cleanFirestoreValue(data);
const pushErrorDetail = (details, detail, limit = MODULE_DETAIL_LIMIT) => {
    const cleanDetail = cleanReportData(detail);
    if (details.length < limit) {
        details.push(cleanDetail);
        return;
    }
    const firstNonErrorIndex = details.findIndex(item => item.action !== 'error');
    if (firstNonErrorIndex >= 0) {
        details[firstNonErrorIndex] = cleanDetail;
    }
};
const detailPriority = (detail) => {
    if (detail.action === 'error')
        return 100;
    if (Array.isArray(detail.conflictReasons) && detail.conflictReasons.length > 0)
        return 90;
    if (detail.interpreterResolved === false)
        return 80;
    if (detail.action === 'created')
        return 60;
    if (detail.action === 'updated')
        return 40;
    return 10;
};
const pushPrioritizedDetail = (details, detail, limit = MODULE_DETAIL_LIMIT) => {
    const cleanDetail = cleanReportData(detail);
    if (details.length < limit) {
        details.push(cleanDetail);
        return;
    }
    const incomingPriority = detailPriority(cleanDetail);
    let lowestPriority = Number.POSITIVE_INFINITY;
    let replaceIndex = -1;
    details.forEach((item, index) => {
        const priority = detailPriority(item);
        if (priority < lowestPriority) {
            lowestPriority = priority;
            replaceIndex = index;
        }
    });
    if (replaceIndex >= 0 && incomingPriority > lowestPriority) {
        details[replaceIndex] = cleanDetail;
    }
};
const processWithConcurrency = async (items, concurrency, worker) => {
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
        while (nextIndex < items.length) {
            const item = items[nextIndex];
            nextIndex += 1;
            await worker(item);
        }
    });
    await Promise.all(runners);
};
const emptyActionStats = () => ({
    created: 0,
    updated: 0,
    skipped: 0,
    conflict: 0,
    error: 0
});
const syncClients = async (records, tableName, mode, runId) => {
    const stats = emptyActionStats();
    const details = [];
    for (const record of records) {
        try {
            const mapped = mapClientRecord(record, tableName);
            const clientRef = await findExistingClientRef(record, tableName, mapped.identity);
            const existing = await clientRef.get();
            const existingData = existing.data();
            const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, mapped.client);
            const action = existing.exists
                ? (existingData?.airtableSnapshotHash === mapped.client.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            if (!mode.dryRun && action !== 'skipped') {
                await clientRef.set({
                    ...mapped.client,
                    id: clientRef.id,
                    lastSyncRunId: runId,
                    createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.client.sourceBaseId,
                    sourceTable: tableName,
                    snapshotHash: mapped.client.snapshotHash,
                    syncRunId: !mode.dryRun ? runId : undefined,
                    clientName: mapped.identity.companyName,
                    email: mapped.identity.email || mapped.identity.invoiceEmail,
                    clientId: clientRef.id,
                    message: action === 'created' && mode.dryRun ? 'Would create client' : undefined
                });
            }
        }
        catch (error) {
            stats.error += 1;
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action: 'error',
                    sourceRecordId: record.id,
                    sourceTable: tableName,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }
    return { stats, details };
};
const syncTranslationBookings = async (records, tableName, mode, sourceOfTruth, runId, conflictContext) => {
    const stats = emptyActionStats();
    const details = [];
    for (const record of records) {
        try {
            const mapped = await mapTranslationRecordToBooking(record, tableName);
            if (!mode.dryRun && runId)
                mapped.booking.lastSyncRunId = runId;
            const clientResolution = await resolveClientCached({
                clientName: mapped.sourceSnapshot.clientIdentity.companyName,
                uniqueClientKey: mapped.sourceSnapshot.clientIdentity.uniqueClientKey || mapped.sourceSnapshot.clientIdentity.sageAccountRef,
                contactName: mapped.sourceSnapshot.clientIdentity.bookingAgent || mapped.sourceSnapshot.clientIdentity.invoiceContact,
                contactEmail: mapped.sourceSnapshot.clientIdentity.email || mapped.sourceSnapshot.clientIdentity.invoiceEmail,
                contactPhone: mapped.sourceSnapshot.clientIdentity.phone,
                location: mapped.sourceSnapshot.clientIdentity.billingAddress,
                sageAccountRef: mapped.sourceSnapshot.clientIdentity.sageAccountRef,
                invoiceEmail: mapped.sourceSnapshot.clientIdentity.invoiceEmail,
                invoiceContact: mapped.sourceSnapshot.clientIdentity.invoiceContact,
                normalizedCompanyName: mapped.sourceSnapshot.clientIdentity.normalizedCompanyName
            }, mode.dryRun);
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
            mapped.booking.status = (0, statusMapping_1.preserveStatusIfLocalAhead)(existing?.status, mapped.booking.status, sourceOfTruth);
            const hasTranslatorSignal = Boolean(mapped.sourceSnapshot.translatorName
                || mapped.sourceSnapshot.translatorEmail
                || mapped.sourceSnapshot.translatorPhone
                || mapped.sourceSnapshot.translatorAirtableRecordId);
            const unresolvedTranslator = hasTranslatorSignal && !mapped.booking.interpreterId;
            if (unresolvedTranslator) {
                mapped.booking.syncStatus = 'CONFLICT';
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'booking',
                    entityId: existingSnap?.id,
                    sourceTable: tableName,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.booking.sourceBaseId,
                    legacyRef: mapped.booking.legacyAirtableRef,
                    severity: mapped.sourceSnapshot.translatorAmbiguousCandidates?.length ? 'HIGH' : 'MEDIUM',
                    reason: mapped.sourceSnapshot.translatorAmbiguousCandidates?.length ? 'PROFESSIONAL_MATCH_AMBIGUOUS' : 'PROFESSIONAL_NOT_RESOLVED',
                    currentValue: mapped.sourceSnapshot.translatorAmbiguousCandidates || [],
                    incomingValue: {
                        name: mapped.sourceSnapshot.translatorName,
                        email: mapped.sourceSnapshot.translatorEmail,
                        phone: mapped.sourceSnapshot.translatorPhone,
                        airtableRecordId: mapped.sourceSnapshot.translatorAirtableRecordId
                    },
                    recommendedAction: 'Review translator identity, link the Airtable professional to an interpreter profile, then rerun sync.',
                    dryRun: mode.dryRun
                });
            }
            if (existing?.status && existing.status !== mapped.booking.status && sourceOfTruth !== 'AIRTABLE') {
                mapped.booking.syncStatus = 'CONFLICT';
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'booking',
                    entityId: existingSnap?.id,
                    sourceTable: tableName,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.booking.sourceBaseId,
                    legacyRef: mapped.booking.legacyAirtableRef,
                    severity: 'MEDIUM',
                    reason: 'STATUS_SOURCE_OF_TRUTH_MISMATCH',
                    currentValue: existing.status,
                    incomingValue: mapped.sourceSnapshot.statusRaw,
                    recommendedAction: 'Review whether Airtable or Lingland should own this job status before applying automated status changes.',
                    dryRun: mode.dryRun
                });
            }
            const sourceBackfillNeeded = existingSnap?.exists && needsSourceTrackingBackfill(existing, mapped.booking);
            const action = existingSnap?.exists
                ? (existing?.airtableSnapshotHash === mapped.booking.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            let workflowArtifacts = predictWorkflowArtifacts(mapped.booking);
            if (!mode.dryRun && action !== 'skipped') {
                if (!existingRef || !existingSnap)
                    throw new Error('Missing booking reference for translation sync write.');
                await existingRef.set(cleanFirestoreData({
                    ...mapped.booking,
                    createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                await db.collection('jobEvents').add({
                    jobId: existingRef.id,
                    organizationId: 'lingland-main',
                    type: existingSnap.exists ? 'SYNC_UPDATED_FROM_AIRTABLE' : 'SYNC_CREATED_FROM_AIRTABLE',
                    source: 'airtable',
                    description: existingSnap.exists ? 'Translation record updated from Airtable sync.' : 'Translation record created from Airtable sync.',
                    metadata: {
                        sourceRecordId: record.id,
                        sourceTable: tableName,
                        sourceBaseId: mapped.booking.sourceBaseId,
                        snapshotHash: mapped.booking.snapshotHash,
                        legacyAirtableRef: mapped.booking.legacyAirtableRef,
                        dryRun: false
                    },
                    createdAt: new Date().toISOString()
                });
            }
            if (!mode.dryRun && existingRef) {
                workflowArtifacts = await mirrorWorkflowArtifacts(existingRef, {
                    ...existing,
                    ...mapped.booking
                });
            }
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.booking.sourceBaseId,
                    sourceTable: tableName,
                    snapshotHash: mapped.booking.snapshotHash,
                    jobNumber: mapped.booking.jobNumber,
                    displayRef: mapped.booking.displayRef,
                    clientName: mapped.booking.clientName,
                    clientId: mapped.booking.clientId,
                    clientAction: clientResolution.action,
                    interpreterName: mapped.booking.interpreterName,
                    interpreterId: mapped.booking.interpreterId,
                    interpreterResolved: Boolean(mapped.booking.interpreterId),
                    interpreterMatchMethod: mapped.sourceSnapshot.translatorMatchMethod,
                    interpreterMatchConfidence: mapped.sourceSnapshot.translatorMatchConfidence,
                    ambiguousCandidates: mapped.sourceSnapshot.translatorAmbiguousCandidates,
                    status: mapped.booking.status,
                    skipReason: action === 'skipped' && isTerminalStableStatus(mapped.booking.status)
                        ? 'TERMINAL_STABLE_ALREADY_MIRRORED'
                        : undefined,
                    wordCount: mapped.booking.wordCount,
                    totalAmount: mapped.booking.totalAmount,
                    workflowArtifacts
                });
            }
            markConflictScopeProcessed(conflictContext, tableName, record.id);
        }
        catch (error) {
            stats.error += 1;
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action: 'error',
                    sourceRecordId: record.id,
                    sourceTable: tableName,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }
    return { stats, details };
};
const syncClientInvoices = async (records, mode, sourceOfTruth, runId, conflictContext) => {
    const stats = emptyActionStats();
    const details = [];
    let batch = db.batch();
    let batchOps = 0;
    const commitIfNeeded = async (force = false) => {
        if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450))
            return;
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
    };
    for (const record of records) {
        try {
            const fields = record.fields;
            const rawInvoiceNumber = pick(fields, [
                'Invoice Nbr',
                'Invoice Number',
                'INV ID',
                'SAGE Invoice No',
                'Sage Invoice Number',
                'Invoice Reference',
                'Reference',
                'Name'
            ]);
            const hasInvoiceReference = Boolean(rawInvoiceNumber) && !/^rec[a-z0-9]+$/i.test(rawInvoiceNumber);
            const invoiceNumber = hasInvoiceReference ? rawInvoiceNumber : `AIRTABLE-INV-${record.id}`;
            const displayReference = hasInvoiceReference ? rawInvoiceNumber : 'Reference missing';
            const invoiceId = `airtable_client_invoice_${slugify(invoiceNumber || record.id)}`;
            const linkedRedbookIds = pickLinkedIds(fields, ['Job Number from redbook', '🖥️ REDBOOK', 'Redbook ID (from Job Number from redbook)']);
            const bookings = await getBookingsByAirtableRecordIds(linkedRedbookIds);
            const hasJobLinkConflict = linkedRedbookIds.length === 0 || bookings.length === 0;
            const firstBooking = bookings[0]?.data() || {};
            const grossSelection = selectMoneyField(fields, [
                'SAGE Invoice + VAT',
                'Invoice Total',
                'Invoice Amount',
                'Total Amount',
                'Total + VAT',
                'Total inc VAT',
                'Total Including VAT',
                'Total invoiced',
                'Invoiced + VAT',
                'Amount Due',
                'Amount',
                'Value'
            ], ['invoicetotal', 'invoiceamount', 'totalinvoiced', 'totalamount', 'amountdue', 'grossamount']);
            const subtotalSelection = selectMoneyField(fields, [
                'SAGE Invoice total',
                'Subtotal',
                'Net',
                'Net Total',
                'Total ex VAT',
                'Total excluding VAT'
            ]);
            const invoiceTotal = grossSelection.value || subtotalSelection.value;
            const subtotal = subtotalSelection.value || invoiceTotal;
            const amountSourceField = grossSelection.fieldName || subtotalSelection.fieldName;
            const status = mapClientInvoiceStatus(fields);
            const clientName = pick(fields, ['Agency, institution or company  (from feed from redbook)', 'Account (from invoice to)', 'invoice to'])
                || firstBooking.clientName
                || 'Airtable Client';
            const clientResolution = await resolveInvoiceClient(firstBooking.clientId, clientName, fields, mode.dryRun);
            const clientId = clientResolution.id;
            const issueDate = dateOnly(pickRaw(fields, [
                'Invoice Date',
                'Issue Date',
                'Invoiced on',
                'Date Invoiced',
                'Last Modified'
            ]) || record.createdTime);
            const dueDateRaw = pickRaw(fields, ['Due Date', 'Payment Due Date', 'Payment Due', 'Due']);
            const dueDate = dueDateRaw ? dateOnly(dueDateRaw) : '';
            const paidDateRaw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
            const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
            const lineCount = Math.max(bookings.length, 1);
            const financialIntegrityStatus = Math.abs(invoiceTotal) < 0.005
                ? 'AMOUNT_MISSING'
                : hasJobLinkConflict
                    ? 'LINK_MISSING'
                    : 'VERIFIED';
            const hierarchy = (0, clientFinanceScope_1.projectClientFinanceHierarchy)(bookings.map(booking => ({
                id: booking.id,
                ...(booking.data() || {}),
            })));
            const existing = await db.collection('clientInvoices').doc(invoiceId).get();
            const snapshotHash = stableHash({
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceNumber,
                status,
                invoiceTotal,
                subtotal,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                dueDate,
                paidDate,
                clientId,
                clientName,
                clientResolutionAction: clientResolution.action,
                linkedRedbookIds,
                hierarchy
            });
            const sourceTracking = buildSourceTracking(record, CLIENT_INVOICES_TABLE, invoiceNumber, {
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceNumber,
                status,
                invoiceTotal,
                subtotal,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                dueDate,
                paidDate,
                clientId,
                clientName,
                clientResolutionAction: clientResolution.action,
                linkedRedbookIds,
                hierarchy
            }, runId);
            const existingData = existing.data();
            const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
            const action = existing.exists
                ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            if (hasJobLinkConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: linkedRedbookIds.length === 0 ? 'MEDIUM' : 'HIGH',
                    reason: linkedRedbookIds.length === 0 ? 'INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'INVOICE_JOB_LINK_NOT_RESOLVED',
                    currentValue: { matchedBookings: bookings.length },
                    incomingValue: { linkedRedbookIds },
                    recommendedAction: 'Review the Airtable invoice link fields and connect this invoice to the correct mirrored job before financial sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (clientResolution.action.startsWith('unresolved')) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'HIGH',
                    reason: 'INVOICE_CLIENT_NOT_RESOLVED',
                    currentValue: { clientId: existingData?.clientId || '' },
                    incomingValue: { clientId, clientName, clientResolutionAction: clientResolution.action },
                    recommendedAction: 'Link the invoice to a canonical Client CRM organisation. Invoice imports must not create client records.',
                    dryRun: mode.dryRun,
                });
            }
            if (financialIntegrityStatus === 'AMOUNT_MISSING') {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'HIGH',
                    reason: 'INVOICE_AMOUNT_MISSING',
                    currentValue: { totalAmount: existingData?.totalAmount || 0 },
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map the Airtable invoice total field or enter a verified amount before sending, paying or reporting this invoice.',
                    dryRun: mode.dryRun
                });
            }
            if (!hasInvoiceReference) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'MEDIUM',
                    reason: 'INVOICE_REFERENCE_MISSING',
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map or enter the external invoice reference before financial sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (!mode.dryRun && action !== 'skipped') {
                if (batchOps > 350)
                    await commitIfNeeded(true);
                const lineBookings = bookings.length ? bookings : [null];
                const expectedLineIds = new Set(lineBookings.map((booking, index) => (`${invoiceId}_${booking?.id || record.id}_${index}`)));
                const staleLineRefs = await getStaleImportedInvoiceLineRefs('clientInvoiceLines', invoiceId, record.id, expectedLineIds);
                staleLineRefs.forEach(lineRef => {
                    batch.delete(lineRef);
                    batchOps += 1;
                });
                const invoiceRef = db.collection('clientInvoices').doc(invoiceId);
                batch.set(invoiceRef, cleanData({
                    id: invoiceId,
                    organizationId: 'lingland-main',
                    clientId,
                    clientName,
                    reference: displayReference,
                    invoiceNumber: hasInvoiceReference ? invoiceNumber : undefined,
                    status,
                    issueDate,
                    dueDate,
                    periodStart: issueDate,
                    periodEnd: issueDate,
                    subtotal,
                    vatRate: invoiceTotal && subtotal ? Number(((invoiceTotal - subtotal) / subtotal).toFixed(4)) : 0,
                    vatAmount: invoiceTotal && subtotal ? Number((invoiceTotal - subtotal).toFixed(2)) : 0,
                    totalAmount: invoiceTotal || subtotal,
                    currency: 'GBP',
                    items: [],
                    lineCount,
                    financialIntegrityStatus,
                    amountSourceField: amountSourceField || undefined,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
                    financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                    ...hierarchy,
                    ...sourceTracking,
                    linkedRedbookRecordIds: linkedRedbookIds,
                    airtableStatus: pick(fields, ['Invocing Status', 'Invoicing Status', 'Invoice Status', 'Status', 'Payment Status']),
                    paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                batchOps += 1;
                lineBookings.forEach((booking, index) => {
                    const amountPerLine = (0, statusMapping_1.allocateInvoiceLineAmount)(invoiceTotal || subtotal, index, lineBookings.length);
                    const subtotalPerLine = (0, statusMapping_1.allocateInvoiceLineAmount)(subtotal, index, lineBookings.length);
                    const vatPerLine = Number((amountPerLine - subtotalPerLine).toFixed(2));
                    const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
                    const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
                    const line = summarizeInvoiceLine(booking, invoiceNumber, amountPerLine);
                    const lineHierarchy = (0, clientFinanceScope_1.projectClientInvoiceLineHierarchy)(booking ? {
                        id: booking.id,
                        ...(booking.data() || {}),
                    } : null);
                    batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
                        ...line,
                        timesheetId,
                        id: lineId,
                        invoiceId,
                        clientInvoiceId: invoiceId,
                        clientId,
                        ...lineHierarchy,
                        sourceRecordId: record.id,
                        sourceTable: CLIENT_INVOICES_TABLE,
                        sourceBaseId: DEFAULT_BASE_ID,
                        snapshotHash,
                        lastSyncRunId: runId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }), { merge: true });
                    batchOps += 1;
                    if (booking?.exists) {
                        const bookingData = booking.data() || {};
                        const nextStatus = (0, statusMapping_1.preserveStatusIfLocalAhead)(bookingData.status, (0, statusMapping_1.mapClientInvoiceStatusToBookingStatus)(status), sourceOfTruth);
                        const projectedTotal = amountPerLine || safeNumber(bookingData.clientInvoiceTotal) || safeNumber(bookingData.totalAmount);
                        const projectedSubtotal = subtotalPerLine || safeNumber(bookingData.clientInvoiceSubtotal) || projectedTotal;
                        const projectedVat = Math.abs(invoiceTotal || subtotal) >= 0.005
                            ? vatPerLine
                            : safeNumber(bookingData.clientInvoiceVatAmount ?? bookingData.vatAmount);
                        batch.update(booking.ref, cleanData({
                            clientInvoiceId: invoiceId,
                            clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceReference: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceStatus: status,
                            clientInvoiceTotal: projectedTotal,
                            clientInvoiceSubtotal: projectedSubtotal,
                            clientInvoiceVatAmount: projectedVat,
                            vatAmount: projectedVat,
                            totalAmount: projectedTotal,
                            paymentStatus: (0, statusMapping_1.mapClientInvoiceStatusToPaymentStatus)(status),
                            billingState: status === 'PAID' ? 'PAID' : status === 'SENT' ? 'INVOICED' : status === 'CANCELLED' ? 'ISSUE' : 'INVOICING',
                            status: nextStatus,
                            invoicedAt: issueDate,
                            paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }));
                        batchOps += 1;
                        mirrorTimesheetArtifact(batch, booking.id, {
                            ...bookingData,
                            clientInvoiceId: invoiceId,
                            clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceStatus: status,
                            clientInvoiceTotal: projectedTotal,
                            clientInvoiceSubtotal: projectedSubtotal,
                            clientInvoiceVatAmount: projectedVat,
                            totalAmount: projectedTotal,
                            status: nextStatus,
                            paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt
                        });
                        batchOps += 2;
                    }
                });
            }
            if (details.length < MAX_DETAILS) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    sourceTable: CLIENT_INVOICES_TABLE,
                    snapshotHash,
                    syncRunId: !mode.dryRun ? runId : undefined,
                    invoiceNumber,
                    clientName,
                    clientResolutionAction: clientResolution.action,
                    linkedJobs: linkedRedbookIds.length,
                    matchedBookings: bookings.length,
                    conflict: hasJobLinkConflict ? (linkedRedbookIds.length === 0 ? 'INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
                    status,
                    totalAmount: invoiceTotal || subtotal,
                    amountSourceField: amountSourceField || undefined,
                    financialIntegrityStatus,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
                });
            }
            await commitIfNeeded();
            markConflictScopeProcessed(conflictContext, CLIENT_INVOICES_TABLE, record.id);
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
    await commitIfNeeded(true);
    return { stats, details };
};
const syncInterpreterInvoices = async (records, mode, sourceOfTruth, runId, conflictContext) => {
    const stats = emptyActionStats();
    const details = [];
    let batch = db.batch();
    let batchOps = 0;
    const commitIfNeeded = async (force = false) => {
        if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450))
            return;
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
    };
    for (const record of records) {
        try {
            const fields = record.fields;
            const linkedRedbookIds = pickLinkedIds(fields, ['🖥️ REDBOOK', 'Redbook ID (from 🖥️ REDBOOK)']);
            const bookings = await getBookingsByAirtableRecordIds(linkedRedbookIds);
            const hasJobLinkConflict = linkedRedbookIds.length === 0 || bookings.length === 0;
            const firstBooking = bookings[0]?.data() || {};
            const rawInvoiceReference = pick(fields, [
                'Invoice Number',
                'Invoice Reference',
                'Invoice Ref',
                'INV Number',
                'Reference',
                'Name',
                'INV name'
            ]);
            const hasInvoiceReference = Boolean(rawInvoiceReference) && !/^rec[a-z0-9]+$/i.test(rawInvoiceReference);
            const invoiceRefText = hasInvoiceReference ? rawInvoiceReference : `AIRTABLE-INT-${record.id}`;
            const interpreterEmail = cleanEmail(pick(fields, ['INT EMAIL (from 🖥️ REDBOOK)']));
            const interpreterName = pick(fields, ['INV name', 'assign to (from 🖥️ REDBOOK)']) || firstBooking.interpreterName || 'Interpreter';
            const interpreterPhone = pick(fields, [
                'PHONE (from assign to)',
                'PHONE (from assign to (from 🖥️ REDBOOK))',
                'Interpreter Phone',
                'INT PHONE'
            ]);
            const resolvedInterpreter = firstBooking.interpreterId
                ? {
                    id: firstBooking.interpreterId,
                    name: firstBooking.interpreterName || interpreterName,
                    email: firstBooking.interpreterEmail || interpreterEmail,
                    photoUrl: firstBooking.interpreterPhotoUrl || ''
                }
                : await resolveInterpreterCached(interpreterEmail, interpreterName, '', interpreterPhone);
            const hasPersonConflict = !resolvedInterpreter?.id;
            const interpreterId = resolvedInterpreter?.id || `airtable_interpreter_${slugify(interpreterEmail || interpreterName || record.id)}`;
            const invoiceId = `airtable_interpreter_invoice_${record.id}`;
            const totalSelection = selectMoneyField(fields, [
                'INV Total',
                'Invoice Total',
                'Total Amount',
                'Amount',
                'Payable',
                'INT Total',
                'Interpreter Total',
                'INV Session fees',
                'Session Fees',
                'Fees'
            ], ['invoicetotal', 'totalamount', 'payable', 'interpretertotal', 'sessionfees', 'invoicefees']);
            const totalAmount = totalSelection.value;
            const amountSourceField = totalSelection.fieldName;
            const status = mapInterpreterInvoiceStatus(fields);
            const issueDate = dateOnly(pickRaw(fields, [
                'Invoice Date',
                'Issue Date',
                'Submitted Date',
                'Last Modified'
            ]) || record.createdTime);
            const paidDateRaw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
            const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
            const lineCount = Math.max(bookings.length, 1);
            const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
                ? 'AMOUNT_MISSING'
                : hasJobLinkConflict || hasPersonConflict
                    ? 'LINK_MISSING'
                    : 'VERIFIED';
            const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
            const snapshotHash = stableHash({
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceRefText,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                interpreterId,
                paidDate,
                linkedRedbookIds
            });
            const sourceTracking = buildSourceTracking(record, INTERPRETER_INVOICES_TABLE, invoiceRefText, {
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceRefText,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                interpreterId,
                paidDate,
                linkedRedbookIds
            }, runId);
            const existingData = existing.data();
            const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
            const action = existing.exists
                ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            if (hasJobLinkConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: INTERPRETER_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: linkedRedbookIds.length === 0 ? 'MEDIUM' : 'HIGH',
                    reason: linkedRedbookIds.length === 0 ? 'PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'PAYABLE_JOB_LINK_NOT_RESOLVED',
                    currentValue: { matchedBookings: bookings.length },
                    incomingValue: { linkedRedbookIds },
                    recommendedAction: 'Review the Airtable payable link fields and connect this payable to the correct mirrored interpreting job before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (hasPersonConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: INTERPRETER_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'HIGH',
                    reason: 'PAYABLE_PERSON_NOT_RESOLVED',
                    currentValue: { interpreterId },
                    incomingValue: { interpreterEmail, interpreterName, interpreterPhone },
                    recommendedAction: 'Link this Airtable payable to an existing interpreter profile or passive imported interpreter before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (financialIntegrityStatus === 'AMOUNT_MISSING') {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: INTERPRETER_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'HIGH',
                    reason: 'PAYABLE_AMOUNT_MISSING',
                    currentValue: { totalAmount: existingData?.totalAmount || 0 },
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map the Airtable payable total field or enter a verified amount before approval or payment.',
                    dryRun: mode.dryRun
                });
            }
            if (!hasInvoiceReference) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: INTERPRETER_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'MEDIUM',
                    reason: 'PAYABLE_REFERENCE_MISSING',
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map or enter the supplier invoice reference before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (!mode.dryRun && action !== 'skipped') {
                if (batchOps > 350)
                    await commitIfNeeded(true);
                const lineBookings = bookings.length ? bookings : [null];
                const expectedLineIds = new Set(lineBookings.map((booking, index) => (`${invoiceId}_${booking?.id || record.id}_${index}`)));
                const staleLineRefs = await getStaleImportedInvoiceLineRefs('interpreterInvoiceLines', invoiceId, record.id, expectedLineIds);
                staleLineRefs.forEach(lineRef => {
                    batch.delete(lineRef);
                    batchOps += 1;
                });
                batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
                    id: invoiceId,
                    organizationId: 'lingland-main',
                    interpreterId,
                    interpreterName: resolvedInterpreter?.name || interpreterName,
                    interpreterEmail: resolvedInterpreter?.email || interpreterEmail,
                    model: 'UPLOAD',
                    status,
                    externalInvoiceReference: hasInvoiceReference ? invoiceRefText : 'Reference missing',
                    totalAmount,
                    issueDate,
                    items: [],
                    lineCount,
                    financialIntegrityStatus,
                    amountSourceField: amountSourceField || undefined,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
                    financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                    currency: 'GBP',
                    ...sourceTracking,
                    linkedRedbookRecordIds: linkedRedbookIds,
                    airtableStatus: pick(fields, ['Invoice Status', 'INV Status', 'Status', 'Payment Status', 'Approval Status']),
                    paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                batchOps += 1;
                lineBookings.forEach((booking, index) => {
                    const amountPerLine = (0, statusMapping_1.allocateInvoiceLineAmount)(totalAmount, index, lineBookings.length);
                    const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
                    const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
                    const line = summarizeInvoiceLine(booking, invoiceRefText, amountPerLine);
                    batch.set(db.collection('interpreterInvoiceLines').doc(lineId), cleanData({
                        ...line,
                        timesheetId,
                        id: lineId,
                        invoiceId,
                        interpreterInvoiceId: invoiceId,
                        interpreterId,
                        sourceRecordId: record.id,
                        sourceTable: INTERPRETER_INVOICES_TABLE,
                        sourceBaseId: DEFAULT_BASE_ID,
                        snapshotHash,
                        lastSyncRunId: runId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }), { merge: true });
                    batchOps += 1;
                    if (booking?.exists) {
                        const bookingData = booking.data() || {};
                        const nextStatus = (0, statusMapping_1.preserveStatusIfLocalAhead)(bookingData.status, statusMapping_1.STATUS_RANK[bookingData.status] >= statusMapping_1.STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED', sourceOfTruth);
                        const projectedPayable = amountPerLine
                            || safeNumber(bookingData.interpreterInvoiceTotal)
                            || safeNumber(bookingData.interpreterAmountCalculated)
                            || safeNumber(bookingData.professionalCost);
                        batch.update(booking.ref, cleanData({
                            interpreterInvoiceId: invoiceId,
                            interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceReference: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceStatus: status,
                            interpreterPaymentStatus: status,
                            interpreterInvoiceTotal: projectedPayable,
                            interpreterAmountCalculated: projectedPayable,
                            professionalCost: projectedPayable,
                            interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
                            status: nextStatus,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }));
                        batchOps += 1;
                        mirrorTimesheetArtifact(batch, booking.id, {
                            ...bookingData,
                            interpreterInvoiceId: invoiceId,
                            interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceStatus: status,
                            interpreterPaymentStatus: status,
                            interpreterInvoiceTotal: projectedPayable,
                            interpreterAmountCalculated: projectedPayable,
                            totalToPay: projectedPayable,
                            interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
                            status: nextStatus
                        });
                        batchOps += 2;
                    }
                });
            }
            if (details.length < MAX_DETAILS) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    sourceTable: INTERPRETER_INVOICES_TABLE,
                    snapshotHash,
                    syncRunId: !mode.dryRun ? runId : undefined,
                    invoiceNumber: invoiceRefText,
                    interpreterName: resolvedInterpreter?.name || interpreterName,
                    interpreterId,
                    linkedJobs: linkedRedbookIds.length,
                    matchedBookings: bookings.length,
                    conflict: [
                        hasJobLinkConflict ? (linkedRedbookIds.length === 0 ? 'PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'PAYABLE_JOB_LINK_NOT_RESOLVED') : '',
                        hasPersonConflict ? 'PAYABLE_PERSON_NOT_RESOLVED' : ''
                    ].filter(Boolean).join(', ') || undefined,
                    status,
                    totalAmount,
                    amountSourceField: amountSourceField || undefined,
                    financialIntegrityStatus,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
                });
            }
            await commitIfNeeded();
            markConflictScopeProcessed(conflictContext, INTERPRETER_INVOICES_TABLE, record.id);
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
    await commitIfNeeded(true);
    return { stats, details };
};
const syncTranslationClientInvoices = async (records, mode, sourceOfTruth, runId, conflictContext) => {
    const stats = emptyActionStats();
    const details = [];
    let batch = db.batch();
    let batchOps = 0;
    const commitIfNeeded = async (force = false) => {
        if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450))
            return;
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
    };
    for (const record of records) {
        try {
            const fields = record.fields;
            const rawInvoiceNumber = pick(fields, [
                'TR Invoice Nbr',
                'Invoice Number',
                'Invoice No',
                'Invoice Reference',
                'Reference',
                'Name'
            ]);
            const hasInvoiceReference = Boolean(rawInvoiceNumber) && !/^rec[a-z0-9]+$/i.test(rawInvoiceNumber);
            const invoiceNumber = hasInvoiceReference ? rawInvoiceNumber : `AIRTABLE-TR-INV-${record.id}`;
            const displayReference = hasInvoiceReference ? rawInvoiceNumber : 'Reference missing';
            const invoiceId = `airtable_translation_client_invoice_${slugify(invoiceNumber || record.id)}`;
            const linkedTranslationIds = pickLinkedIds(fields, ['Translations', 'TR NUMBER (from Translations)', 'TR ID']);
            const bookings = await getBookingsByAirtableRecordIds(linkedTranslationIds);
            const hasJobLinkConflict = linkedTranslationIds.length === 0 || bookings.length === 0;
            const firstBooking = bookings[0]?.data() || {};
            const totalSelection = selectMoneyField(fields, [
                'FQ+VAT',
                'FINAL QUOTE',
                'Invoice Total',
                'Invoice Amount',
                'Total Amount',
                'TR Invoice Total',
                'Total inc VAT',
                'Amount Due',
                'Amount',
                'TR owed fees'
            ], ['invoicetotal', 'invoiceamount', 'totalamount', 'translationtotal', 'amountdue']);
            const totalAmount = totalSelection.value;
            const amountSourceField = totalSelection.fieldName;
            const status = mapClientInvoiceStatus(fields);
            const clientName = pick(fields, ['TR Agency', 'TR Requested By', 'TR client email']) || firstBooking.clientName || 'Translation Client';
            const clientResolution = await resolveInvoiceClient(firstBooking.clientId, clientName, fields, mode.dryRun);
            const clientId = clientResolution.id;
            const issueDate = dateOnly(pickRaw(fields, ['Invoice Date', 'Issue Date', 'Invoiced on', 'COMPLETED', 'Last Modified']) || record.createdTime);
            const dueDateRaw = pickRaw(fields, ['Due Date', 'Payment Due Date', 'Payment Due', 'Due']);
            const dueDate = dueDateRaw ? dateOnly(dueDateRaw) : '';
            const paidDateRaw = pickRaw(fields, ['paid date', 'Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
            const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
            const lineCount = Math.max(bookings.length, 1);
            const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
                ? 'AMOUNT_MISSING'
                : hasJobLinkConflict
                    ? 'LINK_MISSING'
                    : 'VERIFIED';
            const hierarchy = (0, clientFinanceScope_1.projectClientFinanceHierarchy)(bookings.map(booking => ({
                id: booking.id,
                ...(booking.data() || {}),
            })));
            const existing = await db.collection('clientInvoices').doc(invoiceId).get();
            const snapshotHash = stableHash({
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceNumber,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                dueDate,
                paidDate,
                clientId,
                clientName,
                clientResolutionAction: clientResolution.action,
                linkedTranslationIds,
                hierarchy
            });
            const sourceTracking = buildSourceTracking(record, TRANSLATION_CLIENT_INVOICES_TABLE, invoiceNumber, {
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceNumber,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                dueDate,
                paidDate,
                clientId,
                clientName,
                clientResolutionAction: clientResolution.action,
                linkedTranslationIds,
                hierarchy
            }, runId);
            const existingData = existing.data();
            const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
            const action = existing.exists
                ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            if (hasJobLinkConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: linkedTranslationIds.length === 0 ? 'MEDIUM' : 'HIGH',
                    reason: linkedTranslationIds.length === 0 ? 'TRANSLATION_INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATION_INVOICE_JOB_LINK_NOT_RESOLVED',
                    currentValue: { matchedBookings: bookings.length },
                    incomingValue: { linkedTranslationIds },
                    recommendedAction: 'Review the Airtable translation invoice link fields and connect this invoice to the correct mirrored translation job before financial sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (clientResolution.action.startsWith('unresolved')) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'HIGH',
                    reason: 'INVOICE_CLIENT_NOT_RESOLVED',
                    currentValue: { clientId: existingData?.clientId || '' },
                    incomingValue: { clientId, clientName, clientResolutionAction: clientResolution.action },
                    recommendedAction: 'Link the translation invoice to a canonical Client CRM organisation. Invoice imports must not create client records.',
                    dryRun: mode.dryRun,
                });
            }
            if (financialIntegrityStatus === 'AMOUNT_MISSING') {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'HIGH',
                    reason: 'TRANSLATION_INVOICE_AMOUNT_MISSING',
                    currentValue: { totalAmount: existingData?.totalAmount || 0 },
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map the translation invoice total field or enter a verified amount before sending, paying or reporting this invoice.',
                    dryRun: mode.dryRun
                });
            }
            if (!hasInvoiceReference) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'clientInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceNumber,
                    severity: 'MEDIUM',
                    reason: 'TRANSLATION_INVOICE_REFERENCE_MISSING',
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map or enter the external translation invoice reference before financial sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (!mode.dryRun && action !== 'skipped') {
                if (batchOps > 350)
                    await commitIfNeeded(true);
                const lineBookings = bookings.length ? bookings : [null];
                const expectedLineIds = new Set(lineBookings.map((booking, index) => (`${invoiceId}_${booking?.id || record.id}_${index}`)));
                const staleLineRefs = await getStaleImportedInvoiceLineRefs('clientInvoiceLines', invoiceId, record.id, expectedLineIds);
                staleLineRefs.forEach(lineRef => {
                    batch.delete(lineRef);
                    batchOps += 1;
                });
                batch.set(db.collection('clientInvoices').doc(invoiceId), cleanData({
                    id: invoiceId,
                    organizationId: 'lingland-main',
                    clientId,
                    clientName,
                    reference: displayReference,
                    invoiceNumber: hasInvoiceReference ? invoiceNumber : undefined,
                    status,
                    issueDate,
                    dueDate,
                    periodStart: issueDate,
                    periodEnd: issueDate,
                    subtotal: totalAmount,
                    vatRate: 0,
                    vatAmount: 0,
                    totalAmount,
                    currency: 'GBP',
                    items: [],
                    serviceCategory: 'TRANSLATION',
                    lineCount,
                    financialIntegrityStatus,
                    amountSourceField: amountSourceField || undefined,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
                    financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                    ...hierarchy,
                    ...sourceTracking,
                    linkedTranslationRecordIds: linkedTranslationIds,
                    airtableStatus: pick(fields, ['TR Status', 'Status']),
                    paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                batchOps += 1;
                lineBookings.forEach((booking, index) => {
                    const amountPerLine = (0, statusMapping_1.allocateInvoiceLineAmount)(totalAmount, index, lineBookings.length);
                    const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
                    const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
                    const lineHierarchy = (0, clientFinanceScope_1.projectClientInvoiceLineHierarchy)(booking ? {
                        id: booking.id,
                        ...(booking.data() || {}),
                    } : null);
                    batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
                        id: lineId,
                        invoiceId,
                        clientInvoiceId: invoiceId,
                        clientId,
                        ...lineHierarchy,
                        bookingId: booking?.id || '',
                        timesheetId,
                        description: `Airtable translation ${booking?.data()?.jobNumber || invoiceNumber}`,
                        units: safeNumber(pickRaw(fields, ['WORD COUNT', 'TR owed words'])) || 1,
                        rate: amountPerLine,
                        lineAmount: amountPerLine,
                        total: amountPerLine,
                        serviceCategory: 'TRANSLATION',
                        sourceSystem: 'AIRTABLE',
                        sourceRecordId: record.id,
                        sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                        sourceBaseId: DEFAULT_BASE_ID,
                        snapshotHash,
                        lastSyncRunId: runId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }), { merge: true });
                    batchOps += 1;
                    if (booking?.exists) {
                        const bookingData = booking.data() || {};
                        const nextStatus = (0, statusMapping_1.preserveStatusIfLocalAhead)(bookingData.status, (0, statusMapping_1.mapClientInvoiceStatusToBookingStatus)(status), sourceOfTruth);
                        const projectedTotal = amountPerLine || safeNumber(bookingData.clientInvoiceTotal) || safeNumber(bookingData.totalAmount);
                        batch.update(booking.ref, cleanData({
                            clientInvoiceId: invoiceId,
                            clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceReference: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceStatus: status,
                            clientInvoiceTotal: projectedTotal,
                            totalAmount: projectedTotal,
                            paymentStatus: (0, statusMapping_1.mapClientInvoiceStatusToPaymentStatus)(status),
                            billingState: status === 'PAID' ? 'PAID' : status === 'SENT' ? 'INVOICED' : status === 'CANCELLED' ? 'ISSUE' : 'INVOICING',
                            status: nextStatus,
                            invoicedAt: issueDate,
                            paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }));
                        batchOps += 1;
                        mirrorTimesheetArtifact(batch, booking.id, {
                            ...bookingData,
                            clientInvoiceId: invoiceId,
                            clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
                            clientInvoiceStatus: status,
                            clientInvoiceTotal: projectedTotal,
                            totalAmount: projectedTotal,
                            status: nextStatus,
                            paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt
                        });
                        batchOps += 2;
                    }
                });
            }
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                    snapshotHash,
                    syncRunId: !mode.dryRun ? runId : undefined,
                    invoiceNumber,
                    clientName,
                    clientResolutionAction: clientResolution.action,
                    linkedJobs: linkedTranslationIds.length,
                    matchedBookings: bookings.length,
                    conflict: hasJobLinkConflict ? (linkedTranslationIds.length === 0 ? 'TRANSLATION_INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATION_INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
                    status,
                    totalAmount,
                    amountSourceField: amountSourceField || undefined,
                    financialIntegrityStatus,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
                });
            }
            await commitIfNeeded();
            markConflictScopeProcessed(conflictContext, TRANSLATION_CLIENT_INVOICES_TABLE, record.id);
        }
        catch (error) {
            stats.error += 1;
            pushErrorDetail(details, {
                action: 'error',
                sourceRecordId: record.id,
                sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    await commitIfNeeded(true);
    return { stats, details };
};
const syncTranslatorInvoices = async (records, mode, sourceOfTruth, runId, conflictContext) => {
    const stats = emptyActionStats();
    const details = [];
    let batch = db.batch();
    let batchOps = 0;
    const commitIfNeeded = async (force = false) => {
        if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450))
            return;
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
    };
    for (const record of records) {
        try {
            const fields = record.fields;
            const linkedTranslationIds = pickLinkedIds(fields, ['Translations', 'TR ID', 'TR NUMBER (from Translations)']);
            const bookings = await getBookingsByAirtableRecordIds(linkedTranslationIds);
            const hasJobLinkConflict = linkedTranslationIds.length === 0 || bookings.length === 0;
            const firstBooking = bookings[0]?.data() || {};
            const rawInvoiceReference = pick(fields, [
                'Invoice Number',
                'Invoice Reference',
                'Invoice Ref',
                'Reference',
                'Name',
                'TR NUMBER (from Translations)'
            ]);
            const hasInvoiceReference = Boolean(rawInvoiceReference) && !/^rec[a-z0-9]+$/i.test(rawInvoiceReference);
            const invoiceRefText = hasInvoiceReference ? rawInvoiceReference : `AIRTABLE-TR-PAY-${record.id}`;
            const translatorEmail = cleanEmail(pick(fields, ['EMAIL', 'EMAIL (from Assign to TR)']));
            const translatorName = pick(fields, ['Assign to', 'TRANSLATOR']) || firstBooking.interpreterName || 'Translator';
            const translatorPhone = pick(fields, [
                'PHONE (from Assign to TR)',
                'PHONE (from assign to)',
                'Translator Phone',
                'TR PHONE'
            ]);
            const resolvedTranslator = firstBooking.interpreterId
                ? {
                    id: firstBooking.interpreterId,
                    name: firstBooking.interpreterName || translatorName,
                    email: firstBooking.interpreterEmail || translatorEmail,
                    photoUrl: firstBooking.interpreterPhotoUrl || ''
                }
                : await resolveInterpreterCached(translatorEmail, translatorName, '', translatorPhone);
            const hasPersonConflict = !resolvedTranslator?.id;
            const interpreterId = resolvedTranslator?.id || `airtable_interpreter_${slugify(translatorEmail || translatorName || record.id)}`;
            const invoiceId = `airtable_translator_invoice_${record.id}`;
            const totalSelection = selectMoneyField(fields, [
                'RTR INV FEES',
                'TR owed fees',
                'Invoice Total',
                'Total Amount',
                'Translator Total',
                'Payable',
                'Amount',
                'Fees'
            ], ['invoicefees', 'totalamount', 'translatortotal', 'payable', 'owedfees']);
            const totalAmount = totalSelection.value;
            const amountSourceField = totalSelection.fieldName;
            const wordCount = safeNumber(pickRaw(fields, ['RTR INV WORDS', 'TR owed words']));
            const docs = safeNumber(pickRaw(fields, ['RTR INV DOCS', 'TR owed docs']));
            const status = mapInterpreterInvoiceStatus(fields);
            const issueDate = dateOnly(pickRaw(fields, [
                'Invoice Date',
                'Issue Date',
                'Submitted Date',
                'Last Modified'
            ]) || record.createdTime);
            const paidDateRaw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
            const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
            const lineCount = Math.max(bookings.length, 1);
            const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
                ? 'AMOUNT_MISSING'
                : hasJobLinkConflict || hasPersonConflict
                    ? 'LINK_MISSING'
                    : 'VERIFIED';
            const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
            const snapshotHash = stableHash({
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceRefText,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                interpreterId,
                linkedTranslationIds,
                paidDate,
                wordCount,
                docs
            });
            const sourceTracking = buildSourceTracking(record, TRANSLATOR_INVOICES_TABLE, invoiceRefText, {
                financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                invoiceRefText,
                status,
                totalAmount,
                amountSourceField,
                financialIntegrityStatus,
                lineCount,
                interpreterId,
                linkedTranslationIds,
                paidDate,
                wordCount,
                docs
            }, runId);
            const existingData = existing.data();
            const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
            const action = existing.exists
                ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            stats[action] += 1;
            if (hasJobLinkConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATOR_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: linkedTranslationIds.length === 0 ? 'MEDIUM' : 'HIGH',
                    reason: linkedTranslationIds.length === 0 ? 'TRANSLATOR_PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATOR_PAYABLE_JOB_LINK_NOT_RESOLVED',
                    currentValue: { matchedBookings: bookings.length },
                    incomingValue: { linkedTranslationIds },
                    recommendedAction: 'Review the Airtable translator invoice link fields and connect this payable to the correct mirrored translation job before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (hasPersonConflict) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATOR_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'HIGH',
                    reason: 'TRANSLATOR_PAYABLE_PERSON_NOT_RESOLVED',
                    currentValue: { interpreterId },
                    incomingValue: { translatorEmail, translatorName, translatorPhone },
                    recommendedAction: 'Link this Airtable translator payable to an existing translator/interpreter profile or passive imported profile before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (financialIntegrityStatus === 'AMOUNT_MISSING') {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATOR_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'HIGH',
                    reason: 'TRANSLATOR_PAYABLE_AMOUNT_MISSING',
                    currentValue: { totalAmount: existingData?.totalAmount || 0 },
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map the translator payable total field or enter a verified amount before approval or payment.',
                    dryRun: mode.dryRun
                });
            }
            if (!hasInvoiceReference) {
                stats.conflict += 1;
                await writeSyncConflict({
                    runId,
                    entityType: 'interpreterInvoice',
                    entityId: invoiceId,
                    sourceTable: TRANSLATOR_INVOICES_TABLE,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    legacyRef: invoiceRefText,
                    severity: 'MEDIUM',
                    reason: 'TRANSLATOR_PAYABLE_REFERENCE_MISSING',
                    incomingValue: { availableFields: Object.keys(fields).sort() },
                    recommendedAction: 'Map or enter the translator invoice reference before payment sign-off.',
                    dryRun: mode.dryRun
                });
            }
            if (!mode.dryRun && action !== 'skipped') {
                if (batchOps > 350)
                    await commitIfNeeded(true);
                const lineBookings = bookings.length ? bookings : [null];
                const expectedLineIds = new Set(lineBookings.map((booking, index) => (`${invoiceId}_${booking?.id || record.id}_${index}`)));
                const staleLineRefs = await getStaleImportedInvoiceLineRefs('interpreterInvoiceLines', invoiceId, record.id, expectedLineIds);
                staleLineRefs.forEach(lineRef => {
                    batch.delete(lineRef);
                    batchOps += 1;
                });
                batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
                    id: invoiceId,
                    organizationId: 'lingland-main',
                    interpreterId,
                    interpreterName: resolvedTranslator?.name || translatorName,
                    interpreterEmail: resolvedTranslator?.email || translatorEmail,
                    model: 'UPLOAD',
                    status,
                    externalInvoiceReference: hasInvoiceReference ? invoiceRefText : 'Reference missing',
                    totalAmount,
                    issueDate,
                    items: [],
                    currency: 'GBP',
                    serviceCategory: 'TRANSLATION',
                    lineCount,
                    financialIntegrityStatus,
                    amountSourceField: amountSourceField || undefined,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
                    financeProjectionVersion: FINANCE_PROJECTION_VERSION,
                    ...sourceTracking,
                    linkedTranslationRecordIds: linkedTranslationIds,
                    airtableStatus: pick(fields, ['TR Invoice Status', 'Invoice Status', 'INV Status', 'Status', 'Payment Status']),
                    paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                batchOps += 1;
                lineBookings.forEach((booking, index) => {
                    const amountPerLine = (0, statusMapping_1.allocateInvoiceLineAmount)(totalAmount, index, lineBookings.length);
                    const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
                    const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
                    batch.set(db.collection('interpreterInvoiceLines').doc(lineId), cleanData({
                        id: lineId,
                        invoiceId,
                        interpreterInvoiceId: invoiceId,
                        interpreterId,
                        bookingId: booking?.id || '',
                        timesheetId,
                        description: `Airtable translator payment ${booking?.data()?.jobNumber || invoiceRefText}`,
                        units: wordCount || docs || 1,
                        wordCount,
                        docs,
                        rate: amountPerLine,
                        lineAmount: amountPerLine,
                        total: amountPerLine,
                        serviceCategory: 'TRANSLATION',
                        sourceSystem: 'AIRTABLE',
                        sourceRecordId: record.id,
                        sourceTable: TRANSLATOR_INVOICES_TABLE,
                        sourceBaseId: DEFAULT_BASE_ID,
                        snapshotHash,
                        lastSyncRunId: runId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }), { merge: true });
                    batchOps += 1;
                    if (booking?.exists) {
                        const bookingData = booking.data() || {};
                        const projectedPayable = amountPerLine
                            || safeNumber(bookingData.interpreterInvoiceTotal)
                            || safeNumber(bookingData.interpreterAmountCalculated)
                            || safeNumber(bookingData.professionalCost);
                        const nextStatus = (0, statusMapping_1.preserveStatusIfLocalAhead)(bookingData.status, statusMapping_1.STATUS_RANK[bookingData.status] >= statusMapping_1.STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED', sourceOfTruth);
                        batch.update(booking.ref, cleanData({
                            interpreterInvoiceId: invoiceId,
                            interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceReference: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceStatus: status,
                            interpreterPaymentStatus: status,
                            interpreterInvoiceTotal: projectedPayable,
                            interpreterAmountCalculated: projectedPayable,
                            professionalCost: projectedPayable,
                            interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
                            status: nextStatus,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }));
                        batchOps += 1;
                        mirrorTimesheetArtifact(batch, booking.id, {
                            ...bookingData,
                            interpreterInvoiceId: invoiceId,
                            interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
                            interpreterInvoiceStatus: status,
                            interpreterPaymentStatus: status,
                            interpreterInvoiceTotal: projectedPayable,
                            interpreterAmountCalculated: projectedPayable,
                            totalToPay: projectedPayable,
                            interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
                            status: nextStatus
                        });
                        batchOps += 2;
                    }
                });
            }
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action,
                    sourceRecordId: record.id,
                    sourceBaseId: DEFAULT_BASE_ID,
                    sourceTable: TRANSLATOR_INVOICES_TABLE,
                    snapshotHash,
                    syncRunId: !mode.dryRun ? runId : undefined,
                    invoiceNumber: invoiceRefText,
                    interpreterName: resolvedTranslator?.name || translatorName,
                    interpreterId,
                    linkedJobs: linkedTranslationIds.length,
                    matchedBookings: bookings.length,
                    conflict: [
                        hasJobLinkConflict ? (linkedTranslationIds.length === 0 ? 'TRANSLATOR_PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATOR_PAYABLE_JOB_LINK_NOT_RESOLVED') : '',
                        hasPersonConflict ? 'TRANSLATOR_PAYABLE_PERSON_NOT_RESOLVED' : ''
                    ].filter(Boolean).join(', ') || undefined,
                    status,
                    totalAmount,
                    amountSourceField: amountSourceField || undefined,
                    financialIntegrityStatus,
                    referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
                });
            }
            await commitIfNeeded();
            markConflictScopeProcessed(conflictContext, TRANSLATOR_INVOICES_TABLE, record.id);
        }
        catch (error) {
            stats.error += 1;
            if (details.length < MODULE_DETAIL_LIMIT) {
                details.push({
                    action: 'error',
                    sourceRecordId: record.id,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }
    await commitIfNeeded(true);
    return { stats, details };
};
const syncRecords = async (mode, includeFinance = true) => {
    interpreterCache.clear();
    interpreterDirectoryPromise = null;
    clientCache.clear();
    bookingByAirtableRecordCache.clear();
    const conflictContext = createConflictReconciliationContext();
    const platformMode = await getPlatformMode();
    const importMode = platformMode.airtableImportMode || 'ON';
    const lastSyncIso = await getLastSyncIso();
    const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
    const redbookFormula = buildAirtableFormula(mode.syncStrategy, redbookTableName, lastSyncIso);
    const redbookBatch = mode.sourceRecordIds?.length
        ? await fetchAirtableRecordsByIds(mode.sourceRecordIds, DEFAULT_TABLE_NAME)
        : await fetchAirtableRecordBatch(mode.limitRecords, DEFAULT_TABLE_NAME, mode.tableOffsets?.[DEFAULT_TABLE_NAME] || '', { filterByFormula: redbookFormula, strategy: mode.syncStrategy, stabilize: true });
    const redbookExistingBySourceId = await getExistingRedbookBySourceId();
    const allRedbookRecords = redbookBatch.records;
    const selectiveRedbookProcessing = shouldUseSelectiveRedbookProcessing(mode.syncStrategy) && !mode.sourceRecordIds?.length;
    const records = selectiveRedbookProcessing
        ? allRedbookRecords.filter(record => shouldProcessRedbookRecord(record, redbookExistingBySourceId))
        : allRedbookRecords;
    const workflowSourceRecordIds = includeFinance ? await getWorkflowSourceRecordIds(mode.syncStrategy) : new Set();
    const [rawClientInvoiceRecords, rawInterpreterInvoiceRecords] = includeFinance
        ? await Promise.all([
            fetchAirtableRecordBatch(mode.limitRecords, CLIENT_INVOICES_TABLE, mode.tableOffsets?.[CLIENT_INVOICES_TABLE] || '', { filterByFormula: buildAirtableFormula(mode.syncStrategy, CLIENT_INVOICES_TABLE, lastSyncIso), strategy: mode.syncStrategy }).then(batch => batch.records),
            fetchAirtableRecordBatch(mode.limitRecords, INTERPRETER_INVOICES_TABLE, mode.tableOffsets?.[INTERPRETER_INVOICES_TABLE] || '', { filterByFormula: buildAirtableFormula(mode.syncStrategy, INTERPRETER_INVOICES_TABLE, lastSyncIso), strategy: mode.syncStrategy }).then(batch => batch.records)
        ])
        : [[], []];
    const clientFinanceSelection = filterFinanceRecordsForWorkflow(rawClientInvoiceRecords, CLIENT_INVOICES_TABLE, workflowSourceRecordIds, mode.syncStrategy);
    const interpreterFinanceSelection = filterFinanceRecordsForWorkflow(rawInterpreterInvoiceRecords, INTERPRETER_INVOICES_TABLE, workflowSourceRecordIds, mode.syncStrategy);
    const clientInvoiceRecords = clientFinanceSelection.records;
    const interpreterInvoiceRecords = interpreterFinanceSelection.records;
    const nextOffsets = {
        [DEFAULT_TABLE_NAME]: redbookBatch.nextOffset || ''
    };
    const runRef = db.collection('syncRuns').doc();
    const startedAt = new Date().toISOString();
    const stats = {
        created: 0,
        updated: 0,
        skipped: selectiveRedbookProcessing ? allRedbookRecords.length - records.length : 0,
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
            details,
            nextOffsets
        };
    }
    await processWithConcurrency(records, REDBOOK_PROCESS_CONCURRENCY, async (record) => {
        try {
            const mapped = await mapRecordToBooking(record);
            if (!mode.dryRun && importMode !== 'READ_ONLY')
                mapped.booking.lastSyncRunId = runRef.id;
            const clientResolution = await resolveClientCached({
                clientName: mapped.sourceSnapshot.clientName,
                uniqueClientKey: mapped.sourceSnapshot.uniqueClientKey,
                contactName: mapped.sourceSnapshot.contactName,
                contactEmail: mapped.sourceSnapshot.contactEmail,
                contactPhone: mapped.sourceSnapshot.contactPhone,
                location: mapped.sourceSnapshot.location,
                normalizedCompanyName: normalizeForMatch(mapped.sourceSnapshot.clientName)
            }, mode.dryRun || importMode === 'READ_ONLY');
            mapped.booking.clientId = clientResolution.id;
            let existingRef = null;
            let existingSnap = null;
            let existing = null;
            const preloadedExistingSnap = redbookExistingBySourceId.get(record.id);
            if (mode.dryRun) {
                existingSnap = preloadedExistingSnap || null;
                existing = existingSnap?.exists ? existingSnap.data() || null : null;
            }
            else {
                if (preloadedExistingSnap) {
                    existingRef = preloadedExistingSnap.ref;
                    existingSnap = preloadedExistingSnap;
                }
                else {
                    existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
                    existingSnap = await existingRef.get();
                }
                existing = existingSnap.exists ? existingSnap.data() || null : null;
            }
            mapped.booking.status = (0, statusMapping_1.preserveStatusIfLocalAhead)(existing?.status, mapped.booking.status, platformMode.sourceOfTruth);
            const conflictReasons = [];
            const hasInterpreterSignal = Boolean(mapped.sourceSnapshot.interpreterName
                || mapped.sourceSnapshot.interpreterEmail
                || mapped.sourceSnapshot.interpreterPhone
                || mapped.sourceSnapshot.interpreterAirtableRecordId);
            const unresolvedInterpreter = hasInterpreterSignal && !mapped.booking.interpreterId;
            if (unresolvedInterpreter) {
                mapped.booking.syncStatus = 'CONFLICT';
                stats.conflict += 1;
                conflictReasons.push(mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length
                    ? 'PROFESSIONAL_MATCH_AMBIGUOUS'
                    : 'PROFESSIONAL_NOT_RESOLVED');
                await writeSyncConflict({
                    runId: runRef.id,
                    entityType: 'booking',
                    entityId: existingSnap?.id,
                    sourceTable: mapped.booking.sourceTable || DEFAULT_TABLE_NAME,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.booking.sourceBaseId,
                    legacyRef: mapped.booking.legacyAirtableRef,
                    severity: mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length ? 'HIGH' : 'MEDIUM',
                    reason: mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length ? 'PROFESSIONAL_MATCH_AMBIGUOUS' : 'PROFESSIONAL_NOT_RESOLVED',
                    currentValue: mapped.sourceSnapshot.interpreterAmbiguousCandidates || [],
                    incomingValue: {
                        name: mapped.sourceSnapshot.interpreterName,
                        email: mapped.sourceSnapshot.interpreterEmail,
                        phone: mapped.sourceSnapshot.interpreterPhone,
                        airtableRecordId: mapped.sourceSnapshot.interpreterAirtableRecordId
                    },
                    recommendedAction: 'Review interpreter identity, link the Airtable professional to an interpreter profile, then rerun sync.',
                    dryRun: mode.dryRun || importMode === 'READ_ONLY'
                });
            }
            if (existing?.status && existing.status !== mapped.booking.status && platformMode.sourceOfTruth !== 'AIRTABLE') {
                mapped.booking.syncStatus = 'CONFLICT';
                stats.conflict += 1;
                conflictReasons.push('STATUS_SOURCE_OF_TRUTH_MISMATCH');
                await writeSyncConflict({
                    runId: runRef.id,
                    entityType: 'booking',
                    entityId: existingSnap?.id,
                    sourceTable: mapped.booking.sourceTable || DEFAULT_TABLE_NAME,
                    sourceRecordId: record.id,
                    sourceBaseId: mapped.booking.sourceBaseId,
                    legacyRef: mapped.booking.legacyAirtableRef,
                    severity: 'MEDIUM',
                    reason: 'STATUS_SOURCE_OF_TRUTH_MISMATCH',
                    currentValue: existing.status,
                    incomingValue: mapped.sourceSnapshot.statusRaw,
                    recommendedAction: 'Review whether Airtable or Lingland should own this job status before applying automated status changes.',
                    dryRun: mode.dryRun || importMode === 'READ_ONLY'
                });
            }
            const previousHash = existing?.airtableSnapshotHash;
            const sourceBackfillNeeded = existingSnap?.exists && needsSourceTrackingBackfill(existing, mapped.booking);
            const action = existingSnap?.exists
                ? (previousHash === mapped.booking.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
                : 'created';
            if (mode.dryRun || importMode === 'READ_ONLY') {
                stats[action] += 1;
            }
            else if (action === 'skipped') {
                stats.skipped += 1;
            }
            else {
                if (!existingRef || !existingSnap)
                    throw new Error('Missing booking reference for REDBOOK sync write.');
                await existingRef.set(cleanFirestoreData({
                    ...mapped.booking,
                    createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
                }), { merge: true });
                await db.collection('jobEvents').add({
                    jobId: existingRef.id,
                    organizationId: 'lingland-main',
                    type: existingSnap.exists ? 'SYNC_UPDATED_FROM_AIRTABLE' : 'SYNC_CREATED_FROM_AIRTABLE',
                    source: 'airtable',
                    description: existingSnap.exists ? 'REDBOOK record updated from Airtable sync.' : 'REDBOOK record created from Airtable sync.',
                    metadata: {
                        sourceRecordId: record.id,
                        sourceTable: mapped.booking.sourceTable,
                        sourceBaseId: mapped.booking.sourceBaseId,
                        snapshotHash: mapped.booking.snapshotHash,
                        syncRunId: runRef.id,
                        legacyAirtableRef: mapped.booking.legacyAirtableRef,
                        dryRun: false
                    },
                    createdAt: new Date().toISOString()
                });
                stats[action] += 1;
            }
            let workflowArtifacts = predictWorkflowArtifacts(mapped.booking);
            if (!mode.dryRun && importMode !== 'READ_ONLY' && existingRef) {
                workflowArtifacts = await mirrorWorkflowArtifacts(existingRef, {
                    ...existing,
                    ...mapped.booking
                });
            }
            pushPrioritizedDetail(details, {
                action,
                sourceRecordId: record.id,
                sourceBaseId: mapped.booking.sourceBaseId,
                sourceTable: mapped.booking.sourceTable,
                snapshotHash: mapped.booking.snapshotHash,
                syncRunId: !mode.dryRun && importMode !== 'READ_ONLY' ? runRef.id : undefined,
                jobNumber: mapped.booking.jobNumber,
                displayRef: mapped.booking.displayRef,
                clientName: mapped.booking.clientName,
                patientName: mapped.booking.patientName,
                clientId: mapped.booking.clientId,
                clientAction: clientResolution.action,
                interpreterName: mapped.booking.interpreterName,
                interpreterId: mapped.booking.interpreterId,
                interpreterResolved: Boolean(mapped.booking.interpreterId),
                interpreterMatchMethod: mapped.sourceSnapshot.interpreterMatchMethod,
                interpreterMatchConfidence: mapped.sourceSnapshot.interpreterMatchConfidence,
                ambiguousCandidates: mapped.sourceSnapshot.interpreterAmbiguousCandidates,
                conflictReasons,
                status: mapped.booking.status,
                skipReason: action === 'skipped' && isTerminalStableStatus(mapped.booking.status)
                    ? 'TERMINAL_STABLE_ALREADY_MIRRORED'
                    : undefined,
                workflowArtifacts
            }, MAX_DETAILS);
            markConflictScopeProcessed(conflictContext, mapped.booking.sourceTable || DEFAULT_TABLE_NAME, record.id);
        }
        catch (error) {
            stats.error += 1;
            pushErrorDetail(details, {
                action: 'error',
                sourceRecordId: record.id,
                sourceTable: DEFAULT_TABLE_NAME,
                message: error instanceof Error ? error.message : 'Unknown error'
            }, MAX_DETAILS);
        }
    });
    const [clientInvoiceSync, interpreterInvoiceSync] = includeFinance
        ? await Promise.all([
            syncClientInvoices(clientInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id, conflictContext),
            syncInterpreterInvoices(interpreterInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id, conflictContext)
        ])
        : [
            { stats: emptyActionStats(), details: [] },
            { stats: emptyActionStats(), details: [] }
        ];
    const financeErrorCount = clientInvoiceSync.stats.error + interpreterInvoiceSync.stats.error;
    const autoResolvedConflicts = await resolveStaleSyncConflicts(runRef.id, conflictContext, mode.dryRun || importMode === 'READ_ONLY');
    const finishedAt = new Date().toISOString();
    const result = {
        success: stats.error === 0 && (!includeFinance || financeErrorCount === 0),
        syncRunId: runRef.id,
        mappingVersion: 'redbook-status-finance-v3',
        syncStrategy: mode.syncStrategy,
        serverFilterApplied: redbookBatch.filterByFormula || '',
        dryRun: mode.dryRun || importMode === 'READ_ONLY',
        importMode,
        triggeredBy: mode.triggeredBy,
        userId: mode.userId || '',
        totalRecords: allRedbookRecords.length,
        processedRecords: records.length,
        nextOffsets,
        financeRecords: {
            clientInvoices: clientInvoiceRecords.length,
            interpreterInvoices: interpreterInvoiceRecords.length
        },
        financePullThrough: {
            workflowSourceRecordIds: workflowSourceRecordIds.size,
            clientInvoicesDropped: clientFinanceSelection.dropped,
            interpreterInvoicesDropped: interpreterFinanceSelection.dropped,
            filterActive: clientFinanceSelection.filterActive || interpreterFinanceSelection.filterActive
        },
        autoResolvedConflicts,
        startedAt,
        finishedAt,
        stats,
        financeStats: {
            clientInvoices: clientInvoiceSync.stats,
            interpreterInvoices: interpreterInvoiceSync.stats
        },
        details
    };
    const report = cleanReportData(result);
    await runRef.set({
        ...report,
        kind: 'AIRTABLE_REDBOOK',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (!mode.dryRun && importMode !== 'READ_ONLY') {
        await db.collection('system').doc('airtableRedbookSync').set({
            lastRunId: runRef.id,
            lastRunAt: finishedAt,
            lastStats: stats,
            lastTotalRecords: allRedbookRecords.length,
            lastProcessedRecords: records.length,
            lastSyncStrategy: mode.syncStrategy,
            tableOffsets: nextOffsets,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    return result;
};
const addStats = (target, incoming) => {
    ['created', 'updated', 'skipped', 'conflict', 'error'].forEach(action => {
        target[action] += incoming[action] || 0;
    });
};
const normalizeModules = (input) => {
    if (input === 'full')
        return FULL_SYNC_MODULES;
    const raw = Array.isArray(input) ? input : [input || 'redbook'];
    const allowed = new Set(FULL_SYNC_MODULES);
    const modules = raw.filter((item) => typeof item === 'string' && allowed.has(item));
    return modules.length ? Array.from(new Set(modules)) : ['redbook'];
};
const normalizeScheduledModules = (input) => {
    const modules = normalizeModules(input || FULL_SYNC_MODULES);
    return modules.length ? modules : FULL_SYNC_MODULES;
};
const syncAirtableOperations = async (mode, modules) => {
    interpreterCache.clear();
    interpreterDirectoryPromise = null;
    clientCache.clear();
    bookingByAirtableRecordCache.clear();
    const conflictContext = createConflictReconciliationContext();
    const platformMode = await getPlatformMode();
    const importMode = platformMode.airtableImportMode || 'ON';
    const effectiveMode = { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' };
    const startedAt = new Date().toISOString();
    const runRef = db.collection('syncRuns').doc();
    const overallStats = emptyActionStats();
    const moduleResults = [];
    let nestedAutoResolvedConflicts = 0;
    const nextOffsets = {};
    const lastSyncIso = await getLastSyncIso();
    const workflowSourceRecordIds = await getWorkflowSourceRecordIds(mode.syncStrategy);
    const fetchModuleRecords = async (tableName) => {
        const formula = buildAirtableFormula(mode.syncStrategy, tableName, lastSyncIso);
        const batch = await fetchAirtableRecordBatch(mode.limitRecords, tableName, mode.tableOffsets?.[tableName] || '', { filterByFormula: formula, strategy: mode.syncStrategy });
        nextOffsets[tableName] = batch.nextOffset || '';
        const selection = filterFinanceRecordsForWorkflow(batch.records, tableName, workflowSourceRecordIds, mode.syncStrategy);
        return {
            records: selection.records,
            rawRecords: batch.records.length,
            dropped: selection.dropped,
            filterActive: selection.filterActive
        };
    };
    if (importMode === 'OFF') {
        return {
            success: false,
            dryRun: mode.dryRun,
            importMode,
            modules,
            message: 'Airtable import mode is OFF.',
            startedAt,
            finishedAt: new Date().toISOString(),
            stats: overallStats,
            moduleResults,
            nextOffsets
        };
    }
    const pushModule = (module, label, tableNames, records, result) => {
        addStats(overallStats, result.stats);
        moduleResults.push({
            module,
            label,
            tableNames,
            records,
            stats: result.stats,
            details: result.details,
            syncStrategy: mode.syncStrategy
        });
    };
    if (modules.includes('clients')) {
        const [clientsBatch, clientsBookBatch] = await Promise.all([
            fetchModuleRecords(CLIENTS_TABLE),
            fetchModuleRecords(CLIENTS_BOOK_TABLE)
        ]);
        const clients = clientsBatch.records;
        const clientsBook = clientsBookBatch.records;
        const clientsResult = await syncClients(clients, CLIENTS_TABLE, effectiveMode, runRef.id);
        const clientsBookResult = await syncClients(clientsBook, CLIENTS_BOOK_TABLE, effectiveMode, runRef.id);
        const combined = {
            stats: emptyActionStats(),
            details: [...clientsResult.details, ...clientsBookResult.details].slice(0, MAX_DETAILS)
        };
        addStats(combined.stats, clientsResult.stats);
        addStats(combined.stats, clientsBookResult.stats);
        pushModule('clients', 'Clients', [CLIENTS_TABLE, CLIENTS_BOOK_TABLE], clients.length + clientsBook.length, combined);
    }
    if (modules.includes('redbook')) {
        const redbookResult = await syncRecords(effectiveMode, false);
        nestedAutoResolvedConflicts += Number(redbookResult.autoResolvedConflicts || 0);
        Object.assign(nextOffsets, redbookResult.nextOffsets || {});
        addStats(overallStats, redbookResult.stats);
        moduleResults.push({
            module: 'redbook',
            label: 'REDBOOK interpretation jobs',
            tableNames: [DEFAULT_TABLE_NAME],
            records: redbookResult.totalRecords || 0,
            stats: redbookResult.stats,
            details: redbookResult.details
        });
    }
    if (modules.includes('translations')) {
        const [translationsBatch, webTranslationsBatch] = await Promise.all([
            fetchModuleRecords(TRANSLATIONS_TABLE),
            fetchModuleRecords(WEB_TRANSLATIONS_TABLE)
        ]);
        const translations = translationsBatch.records;
        const webTranslations = webTranslationsBatch.records;
        const translationResult = await syncTranslationBookings(translations, TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        const webTranslationResult = await syncTranslationBookings(webTranslations, WEB_TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        const combined = {
            stats: emptyActionStats(),
            details: [...translationResult.details, ...webTranslationResult.details].slice(0, MAX_DETAILS)
        };
        addStats(combined.stats, translationResult.stats);
        addStats(combined.stats, webTranslationResult.stats);
        pushModule('translations', 'Translation jobs', [TRANSLATIONS_TABLE, WEB_TRANSLATIONS_TABLE], translations.length + webTranslations.length, combined);
    }
    if (modules.includes('clientInvoices')) {
        const selection = await fetchModuleRecords(CLIENT_INVOICES_TABLE);
        const records = selection.records;
        const result = await syncClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        pushModule('clientInvoices', 'Client invoices', [CLIENT_INVOICES_TABLE], records.length, result);
    }
    if (modules.includes('interpreterInvoices')) {
        const selection = await fetchModuleRecords(INTERPRETER_INVOICES_TABLE);
        const records = selection.records;
        const result = await syncInterpreterInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        pushModule('interpreterInvoices', 'Interpreter invoices', [INTERPRETER_INVOICES_TABLE], records.length, result);
    }
    if (modules.includes('translationClientInvoices')) {
        const selection = await fetchModuleRecords(TRANSLATION_CLIENT_INVOICES_TABLE);
        const records = selection.records;
        const result = await syncTranslationClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        pushModule('translationClientInvoices', 'Translation client invoices', [TRANSLATION_CLIENT_INVOICES_TABLE], records.length, result);
    }
    if (modules.includes('translatorInvoices')) {
        const selection = await fetchModuleRecords(TRANSLATOR_INVOICES_TABLE);
        const records = selection.records;
        const result = await syncTranslatorInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
        pushModule('translatorInvoices', 'Translator invoices', [TRANSLATOR_INVOICES_TABLE], records.length, result);
    }
    const autoResolvedConflicts = nestedAutoResolvedConflicts + await resolveStaleSyncConflicts(runRef.id, conflictContext, effectiveMode.dryRun);
    const finishedAt = new Date().toISOString();
    const result = {
        success: overallStats.error === 0,
        syncRunId: runRef.id,
        mappingVersion: 'airtable-sync-center-v1',
        syncStrategy: mode.syncStrategy,
        dryRun: effectiveMode.dryRun,
        importMode,
        triggeredBy: mode.triggeredBy,
        userId: mode.userId || '',
        modules,
        startedAt,
        finishedAt,
        stats: overallStats,
        nextOffsets,
        financePullThrough: {
            workflowSourceRecordIds: workflowSourceRecordIds.size,
            filterActive: mode.syncStrategy !== 'FULL_AUDIT' && mode.syncStrategy !== 'CUSTOM_LIMIT' && workflowSourceRecordIds.size > 0
        },
        autoResolvedConflicts,
        moduleResults
    };
    const report = cleanReportData(result);
    await runRef.set({
        ...report,
        kind: 'AIRTABLE_SYNC_CENTER',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (!effectiveMode.dryRun) {
        const syncCenterRef = db.collection('system').doc('airtableSyncCenter');
        const syncCenterSnap = await syncCenterRef.get();
        const mergedTableOffsets = {
            ...(syncCenterSnap.data()?.tableOffsets || {}),
            ...nextOffsets
        };
        const moduleCheckpoints = Object.fromEntries(moduleResults.map(result => [
            result.module,
            {
                lastRunId: runRef.id,
                lastWriteAt: finishedAt,
                recordsRead: result.records || 0,
                stats: result.stats,
                success: result.stats.error === 0
            }
        ]));
        await syncCenterRef.set({
            lastRunId: runRef.id,
            lastRunAt: finishedAt,
            lastStats: overallStats,
            lastModules: modules,
            lastSyncStrategy: mode.syncStrategy,
            tableOffsets: mergedTableOffsets,
            moduleCheckpoints,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    return result;
};
const canonicalStatusLabel = (value) => {
    const raw = normalize(value);
    if (!raw)
        return 'UNKNOWN';
    return (0, statusMapping_1.canonicalAirtableStatus)(raw).replace(/\s+/g, '_').toUpperCase();
};
const countByStatus = (values) => values.reduce((acc, value) => {
    const label = canonicalStatusLabel(value);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
}, {});
const getMirrorAuditSample = (records, platformBySourceId) => records
    .filter(record => !platformBySourceId.has(record.id))
    .slice(0, 50)
    .map(record => ({
    sourceRecordId: record.id,
    jobNumber: normalize(record.fields['Job Number']) || normalize(record.fields['TR NUMBER']) || record.id,
    status: normalize(record.fields.Status),
    bookedFor: normalize(record.fields['Booking Date & Time']) || normalize(record.fields['Booking Date'])
}));
const getMirrorStatusDivergences = (records, platformBySourceId) => records.flatMap(record => {
    const platformDoc = platformBySourceId.get(record.id);
    if (!platformDoc)
        return [];
    const booking = platformDoc.data();
    const airtableStatus = canonicalStatusLabel(normalize(record.fields.Status));
    const platformSourceStatus = canonicalStatusLabel(normalize(booking.sourceStatusRaw) || normalize(booking.airtableOperationalStatus));
    if (airtableStatus === platformSourceStatus)
        return [];
    return [{
            sourceRecordId: record.id,
            bookingId: platformDoc.id,
            jobNumber: normalize(record.fields['Job Number'])
                || normalize(booking.jobNumber)
                || normalize(booking.displayRef)
                || record.id,
            airtableStatus,
            platformSourceStatus
        }];
});
exports.getAirtableMirrorAudit = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB'
}).https.onCall(async (data, context) => {
    await assertAdmin(context);
    const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
    const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 5000));
    const lastSyncIso = await getLastSyncIso();
    const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
    const redbookFormula = buildAirtableFormula(syncStrategy, redbookTableName, lastSyncIso);
    const redbookBatch = await fetchAirtableRecordBatch(limitRecords, DEFAULT_TABLE_NAME, '', { filterByFormula: redbookFormula, strategy: syncStrategy, stabilize: true });
    const platformSnap = await db.collection('bookings')
        .where('sourceTable', '==', DEFAULT_TABLE_NAME)
        .get();
    const platformDocs = platformSnap.docs.filter(doc => normalize(doc.data().sourceRecordId));
    const platformBySourceId = new Map(platformDocs.map(doc => [normalize(doc.data().sourceRecordId), doc]));
    const airtableIds = new Set(redbookBatch.records.map(record => record.id));
    const matched = redbookBatch.records.filter(record => platformBySourceId.has(record.id));
    const platformOnlyDocs = platformDocs.filter(doc => !airtableIds.has(normalize(doc.data().sourceRecordId)));
    const statusDivergences = getMirrorStatusDivergences(redbookBatch.records, platformBySourceId);
    return {
        success: true,
        syncStrategy,
        limitRecords,
        sourceTable: redbookBatch.tableName,
        filterByFormula: redbookBatch.filterByFormula || '',
        generatedAt: new Date().toISOString(),
        airtableRecords: redbookBatch.records.length,
        platformRecords: platformDocs.length,
        matchedRecords: matched.length,
        missingInPlatformCount: redbookBatch.records.length - matched.length,
        platformOnlyCount: platformOnlyDocs.length,
        statusDivergenceCount: statusDivergences.length,
        nextOffset: redbookBatch.nextOffset || '',
        airtableStatusCounts: countByStatus(redbookBatch.records.map(record => normalize(record.fields.Status))),
        platformStatusCounts: countByStatus(platformDocs.map(doc => normalize(doc.data().sourceStatusRaw) || normalize(doc.data().status))),
        missingInPlatform: getMirrorAuditSample(redbookBatch.records, platformBySourceId),
        statusDivergences: statusDivergences.slice(0, 50),
        platformOnly: platformOnlyDocs.slice(0, 50).map(doc => {
            const booking = doc.data();
            return {
                bookingId: doc.id,
                sourceRecordId: normalize(booking.sourceRecordId),
                jobNumber: normalize(booking.jobNumber) || normalize(booking.displayRef) || doc.id,
                status: normalize(booking.sourceStatusRaw) || normalize(booking.status),
                lastSyncedAt: normalize(booking.lastSyncedAt)
            };
        })
    };
});
exports.getAirtableSyncAuditTrail = functions.runWith({
    timeoutSeconds: 60,
    memory: '256MB'
}).https.onCall(async (data, context) => {
    await assertAdmin(context);
    const runLimit = Math.min(Math.max(Number(data?.runLimit || 5), 1), 25);
    const conflictLimit = Math.min(Math.max(Number(data?.conflictLimit || 50), 1), 100);
    const [runsSnap, conflictsSnap] = await Promise.all([
        db.collection('syncRuns')
            .orderBy('finishedAt', 'desc')
            .limit(runLimit)
            .get(),
        db.collection('syncConflicts')
            .where('resolutionStatus', '==', 'OPEN')
            .limit(conflictLimit)
            .get()
    ]);
    return {
        runs: runsSnap.docs.map(doc => ({
            id: doc.id,
            ...cleanReportData(doc.data())
        })),
        conflicts: conflictsSnap.docs.map(doc => ({
            id: doc.id,
            ...cleanReportData(doc.data())
        }))
    };
});
const indexInvoiceLines = (docs, invoiceIdFields) => docs.reduce((index, line) => {
    const data = line.data();
    const invoiceId = invoiceIdFields.map(field => normalize(data[field])).find(Boolean);
    if (!invoiceId)
        return index;
    const current = index.get(invoiceId) || [];
    current.push(line);
    index.set(invoiceId, current);
    return index;
}, new Map());
const auditFinancialInvoice = (invoice, invoiceType, lines) => {
    const data = invoice.data();
    const sourceSystem = normalize(data.sourceSystem).toUpperCase();
    const reference = normalize(invoiceType === 'CLIENT'
        ? data.invoiceNumber || data.reference
        : data.externalInvoiceReference || data.reference);
    const partyName = normalize(invoiceType === 'CLIENT' ? data.clientName : data.interpreterName);
    const totalAmount = safeNumber(data.totalAmount);
    const lineTotal = Number(lines.reduce((sum, line) => {
        const value = line.data();
        return sum + safeNumber(value.total ?? value.lineAmount ?? value.amount);
    }, 0).toFixed(2));
    const rawStatus = normalize(data.airtableStatus);
    const platformStatus = normalize(data.status).toUpperCase();
    const expectedStatus = rawStatus
        ? (invoiceType === 'CLIENT'
            ? (0, statusMapping_1.mapClientInvoiceStatusValue)(rawStatus)
            : (0, statusMapping_1.mapInterpreterInvoiceStatusValue)(rawStatus))
        : '';
    const declaredLineCount = Number.isFinite(Number(data.lineCount)) ? Number(data.lineCount) : undefined;
    const hasLinkedJob = lines.some(line => Boolean(normalize(line.data().bookingId)));
    const issues = [];
    const pushIssue = (reason, severity, recommendedAction) => issues.push(cleanData({
        id: `${invoiceType.toLowerCase()}_${invoice.id}_${reason.toLowerCase()}`,
        invoiceType,
        invoiceId: invoice.id,
        reference: reference && !/^rec[a-z0-9]+$/i.test(reference) ? reference : 'Reference missing',
        partyName: partyName || 'Unknown party',
        sourceTable: normalize(data.sourceTable),
        sourceRecordId: normalize(data.sourceRecordId),
        serviceCategory: normalize(data.serviceCategory) || 'INTERPRETING',
        reason,
        severity,
        recommendedAction,
        totalAmount,
        lineTotal,
        lineCount: lines.length,
        declaredLineCount,
        platformStatus,
        expectedStatus: expectedStatus || undefined
    }));
    if (Math.abs(totalAmount) < 0.005) {
        pushIssue('AMOUNT_MISSING', 'HIGH', 'Map or enter a verified invoice amount before financial progression.');
    }
    if (!lines.length) {
        pushIssue('LINES_MISSING', 'HIGH', 'Rebuild the invoice lines from linked jobs or timesheets.');
    }
    if (sourceSystem === 'AIRTABLE' && lines.length > 0 && !hasLinkedJob) {
        pushIssue('JOB_LINK_MISSING', 'HIGH', 'Resolve the Airtable source job link and rerun the relevant finance sync.');
    }
    if (lines.length > 0 && Math.abs(totalAmount) >= 0.005 && Math.abs(totalAmount - lineTotal) > 0.01) {
        pushIssue('LINE_TOTAL_DIVERGENCE', 'HIGH', 'Rebuild invoice line allocation so line totals equal the document total.');
    }
    if (declaredLineCount !== undefined && declaredLineCount !== lines.length) {
        pushIssue('LINE_COUNT_DIVERGENCE', 'MEDIUM', 'Rerun the finance sync to replace stale imported lines and refresh the indexed count.');
    }
    if (!reference || reference === 'Reference missing' || /^rec[a-z0-9]+$/i.test(reference)) {
        pushIssue('REFERENCE_MISSING', 'MEDIUM', 'Map or enter the external invoice reference before sign-off.');
    }
    if (sourceSystem === 'AIRTABLE' && expectedStatus && platformStatus && expectedStatus !== platformStatus) {
        pushIssue('STATUS_DIVERGENCE', 'HIGH', 'Rerun the source finance sync and review the Airtable payment status mapping.');
    }
    return issues;
};
exports.getFinancialReconciliationAudit = functions.runWith({
    timeoutSeconds: 120,
    memory: '512MB'
}).https.onCall(async (_data, context) => {
    await assertAdmin(context);
    const [clientInvoices, interpreterInvoices, clientLines, interpreterLines] = await Promise.all([
        db.collection('clientInvoices').get(),
        db.collection('interpreterInvoices').get(),
        db.collection('clientInvoiceLines').get(),
        db.collection('interpreterInvoiceLines').get()
    ]);
    const clientLinesByInvoice = indexInvoiceLines(clientLines.docs, ['invoiceId', 'clientInvoiceId']);
    const interpreterLinesByInvoice = indexInvoiceLines(interpreterLines.docs, ['interpreterInvoiceId', 'invoiceId']);
    const issues = [
        ...clientInvoices.docs.flatMap(invoice => auditFinancialInvoice(invoice, 'CLIENT', clientLinesByInvoice.get(invoice.id) || [])),
        ...interpreterInvoices.docs.flatMap(invoice => auditFinancialInvoice(invoice, 'INTERPRETER', interpreterLinesByInvoice.get(invoice.id) || []))
    ];
    const byReason = issues.reduce((summary, issue) => {
        summary[issue.reason] = (summary[issue.reason] || 0) + 1;
        return summary;
    }, {});
    const bySeverity = issues.reduce((summary, issue) => {
        summary[issue.severity] = (summary[issue.severity] || 0) + 1;
        return summary;
    }, {});
    const affectedInvoiceIds = new Set(issues.map(issue => `${issue.invoiceType}:${issue.invoiceId}`));
    const totalInvoices = clientInvoices.size + interpreterInvoices.size;
    return {
        success: true,
        generatedAt: new Date().toISOString(),
        totalInvoices,
        clientInvoices: clientInvoices.size,
        interpreterInvoices: interpreterInvoices.size,
        healthyInvoices: totalInvoices - affectedInvoiceIds.size,
        affectedInvoices: affectedInvoiceIds.size,
        issueCount: issues.length,
        byReason,
        bySeverity,
        issues: issues.slice(0, 250),
        issuesTruncated: issues.length > 250
    };
});
exports.repairMissingRedbookRecords = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 300,
    memory: '1GB'
}).https.onCall(async (data, context) => {
    await assertAdmin(context);
    const dryRun = Boolean(data?.dryRun);
    const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
    // A booking repair also resolves clients, assignments, workflow artifacts and
    // audit events. Keep each callable deliberately small so repair is resumable.
    const limitRecords = Math.min(Math.max(Number(data?.limitRecords || 20), 1), 25);
    const lastSyncIso = await getLastSyncIso();
    const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
    const redbookFormula = buildAirtableFormula(syncStrategy, redbookTableName, lastSyncIso);
    const redbookBatch = await fetchAirtableRecordBatch(effectiveLimitForStrategy(syncStrategy, Number(data?.auditLimit || 5000)), DEFAULT_TABLE_NAME, '', { filterByFormula: redbookFormula, strategy: syncStrategy, stabilize: true });
    const existingBySourceId = await getExistingRedbookBySourceId();
    const allMissingIds = redbookBatch.records
        .filter(record => !existingBySourceId.has(record.id))
        .map(record => record.id);
    const missingIds = allMissingIds.slice(0, limitRecords);
    const remainingBeforeRepair = Math.max(allMissingIds.length - missingIds.length, 0);
    if (!missingIds.length) {
        return {
            success: true,
            dryRun,
            importMode: (await getPlatformMode()).airtableImportMode || 'ON',
            syncStrategy,
            totalRecords: redbookBatch.records.length,
            processedRecords: 0,
            missingRecords: 0,
            remainingMissingRecords: 0,
            hasMoreMissingRecords: false,
            stats: emptyActionStats(),
            details: [],
            message: 'No missing REDBOOK records found for the selected strategy.'
        };
    }
    const result = await syncRecords({
        dryRun,
        limitRecords: missingIds.length,
        syncStrategy,
        triggeredBy: 'manual',
        userId: context.auth?.uid,
        sourceRecordIds: missingIds
    }, false);
    return {
        ...result,
        repairMode: 'MISSING_REDBOOK',
        missingRecords: missingIds.length,
        remainingMissingRecords: remainingBeforeRepair,
        hasMoreMissingRecords: remainingBeforeRepair > 0,
        sourceRecordIds: missingIds
    };
});
exports.syncRedbookJobs = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB'
}).https.onCall(async (data, context) => {
    await assertAdmin(context);
    const dryRun = Boolean(data?.dryRun);
    const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
    const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 500));
    return syncRecords({
        dryRun,
        limitRecords,
        syncStrategy,
        triggeredBy: 'manual',
        userId: context.auth?.uid,
        tableOffsets: data?.tableOffsets || data?.offsets || {}
    });
});
exports.syncAirtableData = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB'
}).https.onCall(async (data, context) => {
    await assertAdmin(context);
    const dryRun = Boolean(data?.dryRun);
    const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
    const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 500));
    const modules = normalizeModules(data?.modules);
    return syncAirtableOperations({
        dryRun,
        limitRecords,
        syncStrategy,
        triggeredBy: 'manual',
        userId: context.auth?.uid,
        tableOffsets: data?.tableOffsets || data?.offsets || {}
    }, modules);
});
exports.syncAirtableMaintenance = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB'
}).https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const providedToken = String(req.get('X-Lingland-Maintenance-Token') || '').trim();
    const tokenHash = (0, crypto_1.createHash)('sha256').update(providedToken).digest('hex');
    const syncConfig = await db.collection('system').doc('airtableSyncCenter').get();
    const expectedHash = String(syncConfig.data()?.maintenanceTokenHash || '').trim();
    if (!providedToken || !expectedHash || tokenHash !== expectedHash) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    try {
        const dryRun = Boolean(req.body?.dryRun);
        const syncStrategy = normalizeSyncStrategy(req.body?.syncStrategy);
        const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(req.body?.limitRecords || 100));
        const modules = normalizeModules(req.body?.modules);
        const tableOffsets = req.body?.tableOffsets || req.body?.offsets || {};
        const result = await syncAirtableOperations({
            dryRun,
            limitRecords,
            syncStrategy,
            triggeredBy: 'manual',
            userId: 'maintenance',
            tableOffsets
        }, modules);
        res.status(200).json({ result });
    }
    catch (error) {
        console.error('[syncAirtableMaintenance] Failed', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown maintenance sync error'
        });
    }
});
exports.scheduledRedbookSync = functions.runWith({
    secrets: ['AIRTABLE_API_KEY'],
    timeoutSeconds: 540,
    memory: '1GB'
}).pubsub.schedule('every 10 minutes').timeZone('Europe/London').onRun(async () => {
    const platformMode = await getPlatformMode();
    const legacySyncConfig = await db.collection('system').doc('airtableRedbookSync').get();
    const syncCenterRef = db.collection('system').doc('airtableSyncCenter');
    const syncCenter = await syncCenterRef.get();
    const scheduleEnabled = syncCenter.data()?.scheduleEnabled === true || legacySyncConfig.data()?.scheduleEnabled === true;
    if (!scheduleEnabled) {
        console.log('[Airtable Sync] Scheduled sync is disabled. Manual Dry Run/Sync remains available.');
        return null;
    }
    if ((platformMode.airtableImportMode || 'ON') !== 'ON') {
        console.log('[Airtable Sync] Skipped because import mode is not ON.');
        return null;
    }
    const syncData = syncCenter.data() || {};
    const legacyData = legacySyncConfig.data() || {};
    const scheduledModules = normalizeScheduledModules(syncData.scheduledModules || legacyData.scheduledModules || FULL_SYNC_MODULES);
    const lastModuleIndex = Number(syncData.lastScheduledModuleIndex || 0);
    const moduleIndex = scheduledModules.length ? lastModuleIndex % scheduledModules.length : 0;
    const module = scheduledModules[moduleIndex] || 'redbook';
    const syncStrategy = normalizeSyncStrategy(syncData.syncStrategy || legacyData.syncStrategy || DEFAULT_SYNC_STRATEGY);
    const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(syncData.limitRecords || legacyData.limitRecords || 250));
    console.log(`[Airtable Sync] Scheduled module ${module} with ${syncStrategy} strategy and limit ${limitRecords}.`);
    await syncAirtableOperations({
        dryRun: false,
        limitRecords,
        syncStrategy,
        triggeredBy: 'schedule',
        tableOffsets: syncData.tableOffsets || legacyData.tableOffsets || {}
    }, [module]);
    await syncCenterRef.set({
        scheduleEnabled: true,
        scheduledModules,
        syncStrategy,
        lastScheduledModule: module,
        lastScheduledModuleIndex: moduleIndex + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return null;
});
//# sourceMappingURL=redbookSync.js.map