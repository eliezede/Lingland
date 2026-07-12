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
exports.auditInterpreters = exports.auditClients = exports.auditUsers = exports.auditInterpreterInvoices = exports.auditClientInvoices = exports.auditTimesheets = exports.auditAssignments = exports.auditBookings = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const AUDIT_FIELDS = [
    'id', 'status', 'paymentStatus', 'clientId', 'interpreterId', 'bookingId', 'jobNumber', 'bookingRef',
    'displayRef', 'invoiceNumber', 'reference', 'totalAmount', 'subtotal', 'vatAmount', 'clientInvoiceId',
    'interpreterInvoiceId', 'adminApproved', 'readyForClientInvoice', 'readyForInterpreterInvoice',
    'role', 'profileId', 'sourceSystem', 'sourceRecordId', 'updatedBy', 'createdBy', 'adminApprovedBy',
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
const writeAudit = async (collectionName, change, context) => {
    const before = change.before.exists ? change.before.data() : undefined;
    const after = change.after.exists ? change.after.data() : undefined;
    const action = !change.before.exists ? 'CREATED' : !change.after.exists ? 'DELETED' : 'UPDATED';
    const actorId = String(after?.updatedBy || after?.createdBy || after?.adminApprovedBy || before?.updatedBy || 'SYSTEM_OR_LEGACY_CLIENT');
    await db.collection('auditEvents').doc(context.eventId).set({
        id: context.eventId,
        entityType: collectionName,
        entityId: String(context.params.documentId || ''),
        action,
        actorId,
        source: String(after?.source || after?.sourceSystem || before?.source || before?.sourceSystem || 'PLATFORM'),
        changedFields: changedFields(before, after),
        before: snapshot(before),
        after: snapshot(after),
        createdAt: new Date().toISOString(),
    }, { merge: false });
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
//# sourceMappingURL=onCriticalChange.js.map