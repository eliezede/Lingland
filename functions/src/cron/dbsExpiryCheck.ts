import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Creates a PubSub schedule running every weekday at 09:00 AM Europe/London time
export const dbsExpiryCheck = functions.pubsub
  .schedule('0 9 * * 1-5')
  .timeZone('Europe/London')
  .onRun(async (context) => {
    console.log('Running daily DBS expiry check for interpreters...');

    const now = new Date();
    // 30 days from now
    const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const snapshot = await db.collection('interpreters')
      .where('status', 'in', ['ACTIVE', 'ONBOARDING']) // Only check active or onboarding
      .get();

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const renewDateStr = data.dbs?.renewDate;

      if (!renewDateStr) return;

      const renewDate = new Date(renewDateStr);
      const isExpired = renewDate <= now;
      const paysToWarn = renewDate > now && renewDate <= warningDate;

      if (isExpired || paysToWarn) {
        const title = isExpired ? 'CRITICAL: DBS Expired' : 'Action Required: DBS Expiring Soon';
        const body = isExpired
          ? 'Your DBS Certificate has expired. You may be blocked from receiving new jobs. Please upload a new certificate immediately.'
          : `Your DBS Certificate will expire on ${renewDate.toLocaleDateString('en-GB')}. Please upload a new certificate within 30 days.`;

        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId: doc.id,
          title,
          body,
          topic: 'DBS_ALERTS',
          read: false,
          data: {
             type: 'DBS_EXPIRY',
             isExpired: isExpired
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Sent DBS expiry notifications to ${count} interpreters.`);
    } else {
      console.log('No interpreters require DBS expiry warnings today.');
    }

    return null;
  });
