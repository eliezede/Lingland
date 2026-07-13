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
exports.auditGoLiveControl = exports.auditSystemSettings = exports.auditSyncConflicts = exports.auditSyncRuns = exports.auditNotifications = exports.auditEmailDelivery = exports.auditMail = exports.auditJobEvents = exports.auditInterpreters = exports.auditClients = exports.auditUsers = exports.auditInterpreterInvoices = exports.auditClientInvoices = exports.auditTimesheets = exports.auditAssignments = exports.auditBookings = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const auditPolicy_1 = require("./auditPolicy");
const auditWriter_1 = require("./auditWriter");
const AUDIT_FIELDS = [
    'id', 'type', 'status', 'paymentStatus', 'resolutionStatus', 'pushStatus', 'delivery',
    'clientId', 'interpreterId', 'bookingId', 'jobId', 'organizationId', 'jobNumber', 'bookingRef',
    'displayRef', 'invoiceNumber', 'reference', 'totalAmount', 'subtotal', 'vatAmount', 'clientInvoiceId',
    'interpreterInvoiceId', 'adminApproved', 'readyForClientInvoice', 'readyForInterpreterInvoice',
    'role', 'profileId', 'source', 'sourceSystem', 'sourceRecordId', 'sourceTable', 'updatedBy', 'createdBy',
    'actorUserId', 'actorRole', 'adminApprovedBy', 'communicationMode', 'syncRunId', 'lastSyncRunId',
    'runId', 'kind', 'success', 'dryRun', 'stats', 'metadata', 'platformMode', 'checklist',
    'lastReadinessAudit', 'lastRollbackAt', 'lastRollbackBy', 'createdAt', 'updatedAt', 'finishedAt',
];
const snapshot = (value) => {
    if (!value)
        return null;
    return AUDIT_FIELDS.reduce((result, field) => {
        if (value[field] !== undefined)
            result[field] = value[field];
        return result;
    }, {});
};
const changedFields = (before, after) => {
    const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return Array.from(fields).filter(field => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])).slice(0, 100);
};
let cachedCommunicationMode = 'SUPPRESSED';
let communicationModeExpiresAt = 0;
const getCommunicationMode = async () => {
    if (Date.now() < communicationModeExpiresAt)
        return cachedCommunicationMode;
    try {
        const settings = await admin.firestore().collection('system').doc('settings').get();
        cachedCommunicationMode = String(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase();
        communicationModeExpiresAt = Date.now() + 60000;
    }
    catch {
        cachedCommunicationMode = 'SUPPRESSED';
    }
    return cachedCommunicationMode;
};
const actorRoleCache = new Map();
const getActorRole = async (actorId, embeddedRole, source) => {
    if (embeddedRole)
        return embeddedRole;
    if (actorId.startsWith('SYSTEM') || source.includes('AIRTABLE'))
        return 'SYSTEM';
    if (actorRoleCache.has(actorId))
        return actorRoleCache.get(actorId);
    try {
        const actor = await admin.firestore().collection('users').doc(actorId).get();
        const role = String(actor.data()?.role || 'UNKNOWN').toUpperCase();
        actorRoleCache.set(actorId, role);
        return role;
    }
    catch {
        return 'UNKNOWN';
    }
};
const writeAudit = async (collectionName, change, context) => {
    const before = change.before.exists ? change.before.data() : undefined;
    const after = change.after.exists ? change.after.data() : undefined;
    const source = (0, auditPolicy_1.deriveAuditSource)(before, after);
    const actorId = (0, auditPolicy_1.deriveActorId)(collectionName, before, after);
    const actorRole = await getActorRole(actorId, (0, auditPolicy_1.deriveEmbeddedActorRole)(before, after), source);
    const communicationMode = (0, auditPolicy_1.deriveEmbeddedCommunicationMode)(before, after) || await getCommunicationMode();
    const createdAt = new Date().toISOString();
    await (0, auditWriter_1.writeAuditEvent)(context.eventId, {
        entityType: collectionName,
        entityId: String(context.params.documentId || ''),
        action: (0, auditPolicy_1.deriveAuditAction)(collectionName, before, after),
        actorId,
        actorRole,
        source,
        communicationMode,
        syncRunId: (0, auditPolicy_1.deriveSyncRunId)(before, after),
        changedFields: changedFields(before, after),
        before: snapshot(before),
        after: snapshot(after),
        organizationId: String(after?.organizationId || before?.organizationId || ''),
        bookingId: String(after?.bookingId || after?.jobId || before?.bookingId || before?.jobId || ''),
        createdAt,
    });
};
const auditCollection = (collectionName) => functions.firestore
    .document(`${collectionName}/{documentId}`)
    .onWrite((change, context) => writeAudit(collectionName, change, context));
exports.auditBookings = auditCollection('bookings');
exports.auditAssignments = auditCollection('assignments');
exports.auditTimesheets = auditCollection('timesheets');
exports.auditClientInvoices = auditCollection('clientInvoices');
exports.auditInterpreterInvoices = auditCollection('interpreterInvoices');
exports.auditUsers = auditCollection('users');
exports.auditClients = auditCollection('clients');
exports.auditInterpreters = auditCollection('interpreters');
exports.auditJobEvents = auditCollection('jobEvents');
exports.auditMail = auditCollection('mail');
exports.auditEmailDelivery = auditCollection('emailAudit');
exports.auditNotifications = auditCollection('notifications');
exports.auditSyncRuns = auditCollection('syncRuns');
exports.auditSyncConflicts = auditCollection('syncConflicts');
exports.auditSystemSettings = auditCollection('system');
exports.auditGoLiveControl = auditCollection('goLiveControl');
//# sourceMappingURL=onCriticalChange.js.map