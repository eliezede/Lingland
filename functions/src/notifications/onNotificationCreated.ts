import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { canDeliverCommunication, normalizeCommunicationMode } from '../communications/deliveryPolicy';

const db = admin.firestore();

const getCommunicationMode = async () => {
  const settings = await db.collection('system').doc('settings').get();
  return normalizeCommunicationMode(settings.data()?.platformMode?.communicationMode);
};

export const onNotificationCreated = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snapshot: functions.firestore.QueryDocumentSnapshot) => {
    const data = snapshot.data();
    if (!data?.userId) return null;

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
      const pushAllowed = canDeliverCommunication(mode, user.role);
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
    } catch (error: any) {
      console.error('[Push] Failed to process notification', error);
      await snapshot.ref.set({
        pushStatus: 'FAILED',
        pushReason: String(error?.message || 'Unknown push error'),
      }, { merge: true }).catch(() => undefined);
      return null;
    }
  });
