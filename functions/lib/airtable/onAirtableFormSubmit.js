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
exports.onAirtableFormSubmit = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const crypto_1 = require("crypto");
const db = admin.firestore();
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const validToken = (provided, expected) => {
    const providedBuffer = Buffer.from(text(provided, 2048));
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length && (0, crypto_1.timingSafeEqual)(providedBuffer, expectedBuffer);
};
/**
 * Compatibility endpoint for the retired Airtable automation bridge.
 * REDBOOK sync is the only writer for Airtable jobs; this endpoint records a
 * receipt so old automations can be observed without creating duplicates.
 */
exports.onAirtableFormSubmit = functions.runWith({
    secrets: ['AIRTABLE_SECRET_TOKEN'],
    timeoutSeconds: 30,
    memory: '256MB',
}).https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.set('Allow', 'POST').status(405).json({ success: false, error: 'Method Not Allowed' });
        return;
    }
    const expectedToken = process.env.AIRTABLE_SECRET_TOKEN || '';
    const providedToken = req.get('X-Airtable-Token') || req.query.token;
    if (!expectedToken || !validToken(providedToken, expectedToken)) {
        console.warn('[Airtable bridge] Rejected unauthorised compatibility request.');
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
    }
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const sourceRecordId = text(payload.recordId
        || payload.id
        || payload.airtableRecordId
        || payload['Record ID'], 160);
    const payloadHash = (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
    const receivedAt = new Date().toISOString();
    await db.collection('airtableWebhookReceipts').add({
        source: 'LEGACY_AIRTABLE_AUTOMATION',
        sourceRecordId,
        payloadHash,
        action: 'DEFERRED_TO_REDBOOK_SYNC',
        jobCreated: false,
        clientCreated: false,
        communicationSent: false,
        receivedAt,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
    res.status(202).json({
        success: true,
        accepted: true,
        sourceRecordId,
        processing: 'REDBOOK_SYNC',
        jobCreated: false,
        communicationSent: false,
    });
});
//# sourceMappingURL=onAirtableFormSubmit.js.map