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
exports.onMessageCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.onMessageCreated = functions.firestore
    .document('messages/{messageId}')
    .onCreate(async (snapshot) => {
    const message = snapshot.data();
    const threadId = String(message.threadId || '');
    const senderId = String(message.senderId || '');
    if (!threadId || !senderId)
        return null;
    const thread = await db.collection('chatThreads').doc(threadId).get();
    if (!thread.exists)
        return null;
    const threadData = thread.data() || {};
    const participants = Array.isArray(threadData.participants) ? threadData.participants.map(String) : [];
    if (!participants.includes(senderId))
        return null;
    const preview = message.fileUrl
        ? (message.fileType === 'IMAGE' ? 'Image attachment' : 'Document attachment')
        : String(message.text || '').slice(0, 80);
    const link = threadData.type === 'BOOKING' && threadData.bookingId
        ? `/admin/bookings/${threadData.bookingId}`
        : '/messages';
    const batch = db.batch();
    const createdAt = new Date().toISOString();
    participants.filter((participantId) => participantId !== senderId).forEach((userId) => {
        batch.set(db.collection('notifications').doc(), {
            userId,
            title: `New message from ${String(message.senderName || 'Lingland')}`,
            message: preview || 'New message',
            type: 'CHAT',
            read: false,
            link,
            threadId,
            createdAt,
        });
    });
    await batch.commit();
    return null;
});
//# sourceMappingURL=onMessageCreated.js.map