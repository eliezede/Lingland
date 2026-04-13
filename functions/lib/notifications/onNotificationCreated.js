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
 * Looks up the target user's interpreter profile to find their Expo Push Token,
 * then sends a native push notification via the Expo Push API.
 *
 * This enables real-time push notifications when the app is in background/closed.
 */
exports.onNotificationCreated = functions.firestore
    .document('notifications/{notificationId}')
    .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (!data)
        return;
    const { userId, title, message, type } = data;
    try {
        // 1. Look up the interpreter's push token
        const interpreterDoc = await admin.firestore()
            .collection('interpreters')
            .doc(userId)
            .get();
        if (!interpreterDoc.exists) {
            console.log(`[Push] No interpreter found for userId: ${userId}`);
            return;
        }
        const interpreterData = interpreterDoc.data();
        const expoPushToken = interpreterData?.expoPushToken;
        if (!expoPushToken) {
            console.log(`[Push] No push token for interpreter: ${userId}`);
            return;
        }
        // Validate Expo Push Token format
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            console.log(`[Push] Invalid token format: ${expoPushToken}`);
            return;
        }
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
            badge: 1,
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
            // If token is invalid, clear it from the interpreter's profile
            if (result.data.details?.error === 'DeviceNotRegistered') {
                await admin.firestore().collection('interpreters').doc(userId).update({
                    expoPushToken: admin.firestore.FieldValue.delete()
                });
                console.log(`[Push] Removed invalid token for: ${userId}`);
            }
        }
        else {
            console.log(`[Push] Sent to ${userId}: "${title}"`);
        }
    }
    catch (error) {
        console.error('[Push] Failed to send push notification:', error);
    }
});
//# sourceMappingURL=onNotificationCreated.js.map