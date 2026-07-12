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
exports.createNotification = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const MAX_TITLE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 500;
const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
exports.createNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const caller = await db.collection('users').doc(context.auth.uid).get();
    if (!caller.exists)
        throw new functions.https.HttpsError('permission-denied', 'Platform user not found');
    const role = String(caller.data()?.role || '');
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
    if (caller.data()?.status !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'The caller account is not active');
    }
    const audience = String(data?.audience || 'USER').toUpperCase();
    const title = cleanText(data?.title, MAX_TITLE_LENGTH);
    const message = cleanText(data?.message, MAX_MESSAGE_LENGTH);
    const type = cleanText(data?.type || 'INFO', 40);
    const link = cleanText(data?.link, 300);
    if (!title || !message)
        throw new functions.https.HttpsError('invalid-argument', 'title and message are required');
    const rateRef = db.collection('notificationRateLimits').doc(context.auth.uid);
    await db.runTransaction(async (transaction) => {
        const rate = await transaction.get(rateRef);
        const lastAt = Number(rate.data()?.lastAt || 0);
        if (!isAdmin && Date.now() - lastAt < 1500) {
            throw new functions.https.HttpsError('resource-exhausted', 'Please wait before sending another notification');
        }
        transaction.set(rateRef, { lastAt: Date.now(), updatedAt: new Date().toISOString() }, { merge: true });
    });
    let recipientIds = [];
    if (audience === 'ADMINS') {
        const admins = await db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN']).get();
        recipientIds = admins.docs.map(item => item.id);
    }
    else {
        const userId = cleanText(data?.userId, 128);
        if (!userId)
            throw new functions.https.HttpsError('invalid-argument', 'userId is required');
        if (!isAdmin && userId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'Only administrators can notify another user directly');
        }
        recipientIds = [userId];
    }
    const batch = db.batch();
    const createdAt = new Date().toISOString();
    recipientIds.forEach(userId => {
        batch.set(db.collection('notifications').doc(), {
            userId,
            title,
            message,
            type,
            read: false,
            ...(link ? { link } : {}),
            createdBy: context.auth.uid,
            createdAt,
        });
    });
    await batch.commit();
    return { success: true, recipients: recipientIds.length };
});
//# sourceMappingURL=createNotification.js.map