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
const deliveryPolicy_1 = require("../communications/deliveryPolicy");
const db = admin.firestore();
const getCommunicationMode = async () => {
    const settings = await db.collection('system').doc('settings').get();
    return (0, deliveryPolicy_1.normalizeCommunicationMode)(settings.data()?.platformMode?.communicationMode);
};
exports.onNotificationCreated = functions.firestore
    .document('notifications/{notificationId}')
    .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (!data?.userId)
        return null;
    const userId = String(data.userId);
    try {
        const [mode, userDoc] = await Promise.all([
            getCommunicationMode(),
            db.collection('users').doc(userId).get(),
        ]);
        if (!userDoc.exists) {
            await snapshot.ref.set({ pushStatus: 'SKIPPED', pushReason: 'USER_NOT_FOUND' }, { merge: true });
            return null;
        }
        const user = userDoc.data() || {};
        const pushAllowed = (0, deliveryPolicy_1.canDeliverCommunication)(mode, user.role);
        if (!pushAllowed) {
            await snapshot.ref.set({
                pushStatus: 'SUPPRESSED',
                pushReason: `Communication mode ${mode}`,
                communicationMode: mode,
            }, { merge: true });
            return null;
        }
        let expoPushToken = String(user.expoPushToken || '');
        const profileId = String(user.profileId || '');
        if (!expoPushToken && profileId && user.role === 'INTERPRETER') {
            const interpreter = await db.collection('interpreters').doc(profileId).get();
            expoPushToken = String(interpreter.data()?.expoPushToken || '');
        }
        if (!expoPushToken) {
            await snapshot.ref.set({ pushStatus: 'SKIPPED', pushReason: 'NO_PUSH_TOKEN', communicationMode: mode }, { merge: true });
            return null;
        }
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            await snapshot.ref.set({ pushStatus: 'FAILED', pushReason: 'INVALID_PUSH_TOKEN', communicationMode: mode }, { merge: true });
            return null;
        }
        const unread = await db.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .get();
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: expoPushToken,
                sound: 'default',
                title: data.title || 'Lingland',
                body: data.message || '',
                data: { type: data.type || 'INFO', notificationId: snapshot.id, link: data.link || '' },
                badge: unread.size,
                channelId: 'default',
            }),
        });
        const result = await response.json();
        if (!response.ok || result.data?.status === 'error') {
            const reason = String(result.data?.message || `Expo HTTP ${response.status}`);
            await snapshot.ref.set({ pushStatus: 'FAILED', pushReason: reason, communicationMode: mode }, { merge: true });
            if (result.data?.details?.error === 'DeviceNotRegistered') {
                await userDoc.ref.set({ expoPushToken: admin.firestore.FieldValue.delete() }, { merge: true });
                if (profileId && user.role === 'INTERPRETER') {
                    await db.collection('interpreters').doc(profileId).set({ expoPushToken: admin.firestore.FieldValue.delete() }, { merge: true });
                }
            }
            return null;
        }
        await snapshot.ref.set({
            pushStatus: 'SENT',
            communicationMode: mode,
            pushSentAt: new Date().toISOString(),
        }, { merge: true });
        return null;
    }
    catch (error) {
        console.error('[Push] Failed to process notification', error);
        await snapshot.ref.set({
            pushStatus: 'FAILED',
            pushReason: String(error?.message || 'Unknown push error'),
        }, { merge: true }).catch(() => undefined);
        return null;
    }
});
//# sourceMappingURL=onNotificationCreated.js.map