import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

/**
 * Cloud Function: onNotificationCreated
 * 
 * Triggers when a new document is created in the 'notifications' collection.
 * Looks up the target user's interpreter profile to find their Expo Push Token,
 * then sends a native push notification via the Expo Push API.
 * 
 * This enables real-time push notifications when the app is in background/closed.
 */
export const onNotificationCreated = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snapshot: functions.firestore.QueryDocumentSnapshot) => {
    const data = snapshot.data();
    if (!data) return;

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
        sound: 'default' as const,
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
      } else {
        console.log(`[Push] Sent to ${userId}: "${title}"`);
      }

    } catch (error) {
      console.error('[Push] Failed to send push notification:', error);
    }
  });
