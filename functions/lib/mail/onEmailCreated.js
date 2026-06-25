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
exports.onEmailCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const brevoService_1 = require("../services/brevoService");
const getCommunicationMode = async () => {
    const settings = await admin.firestore().collection('system').doc('settings').get();
    return settings.data()?.platformMode?.communicationMode || 'SUPPRESSED';
};
exports.onEmailCreated = functions.runWith({
    secrets: ['BREVO_API_KEY'],
    timeoutSeconds: 60,
    memory: '256MB'
}).firestore
    .document('mail/{mailId}')
    .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data)
        return null;
    const { to, message } = data;
    if (!to || !message) {
        console.warn(`[onEmailCreated] Missing to or message for ${context.params.mailId}. Data:`, data);
        return null;
    }
    const { subject, html } = message;
    try {
        const communicationMode = await getCommunicationMode();
        if (communicationMode !== 'LIVE') {
            console.log(`[onEmailCreated] Suppressed email ${context.params.mailId} because communication mode is ${communicationMode}.`);
            await admin.firestore().collection('emailAudit').add({
                ...data,
                mailId: context.params.mailId,
                status: 'SUPPRESSED',
                communicationMode,
                suppressedReason: `Communication mode ${communicationMode} suppressed outbound delivery`,
                createdAt: new Date().toISOString()
            });
            return snap.ref.update({
                delivery: {
                    state: 'SUPPRESSED',
                    communicationMode,
                    suppressedAt: new Date().toISOString()
                }
            });
        }
        console.log(`[onEmailCreated] Sending email via Brevo for: ${context.params.mailId}`);
        await brevoService_1.brevoService.sendEmail(Array.isArray(to) ? to : [to], subject, html);
        // Update the status in the Firestore document
        return snap.ref.update({
            delivery: {
                state: 'SUCCESS',
                sentAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error(`[onEmailCreated] ❌ Error sending email:`, error);
        return snap.ref.update({
            delivery: {
                state: 'ERROR',
                error: error.message,
                errorTime: new Date().toISOString()
            }
        });
    }
});
//# sourceMappingURL=onEmailCreated.js.map