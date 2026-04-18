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
exports.onNotificationCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Cloud Function: onNotificationCreated
 *
 * Triggers when a new document is created in the 'notifications' collection.
 * 1. Looks up push token — checks interpreter profile first, then admin user doc
 * 2. Calculates dynamic badge count from unread notifications
 * 3. Sends native push notification via the Expo Push API
 */
exports.onNotificationCreated = functions.firestore
    .document('notifications/{notificationId}')
    .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (!data)
        return;
    const { userId, title, message, type } = data;
    try {
        // 1. Resolve push token — check interpreter first, then admin user doc
        let expoPushToken = null;
        const interpreterDoc = await admin.firestore()
            .collection('interpreters')
            .doc(userId)
            .get();
        if (interpreterDoc.exists) {
            expoPushToken = interpreterDoc.data()?.expoPushToken || null;
        }
        // NT-01: If not an interpreter, check the users collection (for admins)
        if (!expoPushToken) {
            const userDoc = await admin.firestore()
                .collection('users')
                .doc(userId)
                .get();
            if (userDoc.exists) {
                expoPushToken = userDoc.data()?.expoPushToken || null;
            }
        }
        if (!expoPushToken) {
            console.log(`[Push] No push token for user: ${userId}`);
            return;
        }
        // Validate Expo Push Token format
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            console.log(`[Push] Invalid token format: ${expoPushToken}`);
            return;
        }
        // NT-02: Dynamic badge count — count unread notifications for this user
        const unreadSnap = await admin.firestore()
            .collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .get();
        const badgeCount = unreadSnap.size;
        // 2. Send via Expo Push API
        const pushMessage = {
            to: expoPushToken,
            sound: 'default',
            title: title || 'Lingland',
            body: message || '',
            data: {
                type: type || 'INFO',
                notificationId: snapshot.id
            },
            badge: badgeCount,
            channelId: 'default',
        };
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessage),
        });
        const result = await response.json();
        if (result.data?.status === 'error') {
            console.error(`[Push] Expo API error:`, result.data.message);
            // If token is invalid, clear it from the profile
            if (result.data.details?.error === 'DeviceNotRegistered') {
                // Clear from interpreters collection
                await admin.firestore().collection('interpreters').doc(userId).update({
                    expoPushToken: admin.firestore.FieldValue.delete()
                }).catch(() => { }); // ignore if doc doesn't exist
                // Clear from users collection
                await admin.firestore().collection('users').doc(userId).update({
                    expoPushToken: admin.firestore.FieldValue.delete()
                }).catch(() => { });
                console.log(`[Push] Removed invalid token for: ${userId}`);
            }
        }
        else {
            console.log(`[Push] Sent to ${userId}: "${title}" (badge: ${badgeCount})`);
        }
    }
    catch (error) {
        console.error('[Push] Failed to send push notification:', error);
    }
});
//# sourceMappingURL=onNotificationCreated.js.map