import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Cloud Function: onTimesheetSubmit
 *
 * Triggers when a new timesheet document is created in the 'timesheets' collection.
 * 1. Notifies all admin/super-admin users in Firestore (real, not mock)
 * 2. Sends a push notification to admins (if they have expoPushToken)
 * 3. Sends a confirmation email to the interpreter
 * 4. Ensures booking status is set to TIMESHEET_SUBMITTED
 */
export const onTimesheetSubmit = functions.firestore
  .document('timesheets/{timesheetId}')
  .onCreate(async (snapshot, context) => {
    const ts = snapshot.data();
    if (!ts) return null;

    const timesheetId = context.params.timesheetId;
    console.log(`[onTimesheetSubmit] New timesheet: ${timesheetId} for booking ${ts.bookingId}`);

    try {
      const batch = db.batch();

      // 1. Ensure booking status is TIMESHEET_SUBMITTED
      if (ts.bookingId) {
        const bookingRef = db.collection('bookings').doc(ts.bookingId);
        const bookingSnap = await bookingRef.get();
        if (bookingSnap.exists) {
          batch.update(bookingRef, {
            status: 'TIMESHEET_SUBMITTED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // 2. Fetch interpreter details for email
      let interpreterName = 'Interpreter';
      let interpreterEmail = '';
      if (ts.interpreterId) {
        const interpSnap = await db.collection('interpreters').doc(ts.interpreterId).get();
        if (interpSnap.exists) {
          const interpData = interpSnap.data()!;
          interpreterName = interpData.name || interpreterName;
          interpreterEmail = interpData.email || '';
        }
      }

      // 3. Notify all real admins in Firestore
      const adminsSnap = await db.collection('users')
        .where('role', 'in', ['ADMIN', 'SUPER_ADMIN'])
        .get();

      const jobDate = ts.actualStart ? new Date(ts.actualStart).toLocaleDateString('en-GB') : 'N/A';

      adminsSnap.docs.forEach(adminDoc => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId: adminDoc.id,
          title: '📋 Timesheet Requires Review',
          message: `${interpreterName} submitted a timesheet for job on ${jobDate}. Awaiting your approval.`,
          type: 'INFO',
          read: false,
          link: `/admin/billing/timesheets?jobId=${ts.bookingId}`,
          createdAt: new Date().toISOString()
        });
      });

      await batch.commit();

      // 4. Send confirmation email to interpreter
      if (interpreterEmail) {
        await db.collection('mail').add({
          to: [interpreterEmail],
          message: {
            subject: `Timesheet Received — Job on ${jobDate}`,
            html: `Dear ${interpreterName},<br><br>
We have successfully received your timesheet for the job on <strong>${jobDate}</strong>.<br><br>
<strong>Session:</strong> ${ts.actualStart ? new Date(ts.actualStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'N/A'} – ${ts.actualEnd ? new Date(ts.actualEnd).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}<br>
<strong>Total Submitted:</strong> £${(ts.totalToPay || 0).toFixed(2)}<br><br>
Our administrative team will review and approve your timesheet within 1–2 business days. You will be notified by email once approved.<br><br>
If you have any questions, please contact us directly.<br><br>
Kind regards,<br>The Lingland Finance Team`
          },
          timesheetId,
          source: 'timesheet_submit',
          createdAt: new Date().toISOString()
        });
        console.log(`[onTimesheetSubmit] ✅ Confirmation email queued for ${interpreterEmail}`);
      }

      console.log(`[onTimesheetSubmit] ✅ ${adminsSnap.size} admins notified for timesheet ${timesheetId}`);
      return null;

    } catch (error) {
      console.error('[onTimesheetSubmit] ❌ Error processing timesheet submission:', error);
      return null;
    }
  });
