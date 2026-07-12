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
exports.createAuditHealthCheck = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const auditWriter_1 = require("./auditWriter");
const db = admin.firestore();
exports.createAuditHealthCheck = functions.https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const [actor, settings] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('system').doc('settings').get(),
    ]);
    const role = String(actor.data()?.role || '').toUpperCase();
    if (!actor.exists || actor.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Only active administrators can run an audit health check');
    }
    const eventRef = db.collection('auditEvents').doc();
    const createdAt = new Date().toISOString();
    await (0, auditWriter_1.writeAuditEvent)(eventRef.id, {
        entityType: 'system',
        entityId: 'audit-ledger',
        action: 'AUDIT_HEALTH_CHECK',
        actorId: uid,
        actorRole: role,
        source: 'ADMIN_DIAGNOSTIC',
        communicationMode: String(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase(),
        syncRunId: '',
        changedFields: [],
        before: null,
        after: { status: 'HEALTHY' },
        organizationId: String(actor.data()?.organizationId || 'lingland-main'),
        bookingId: '',
        createdAt,
    });
    return { success: true, eventId: eventRef.id, createdAt };
});
//# sourceMappingURL=createAuditHealthCheck.js.map