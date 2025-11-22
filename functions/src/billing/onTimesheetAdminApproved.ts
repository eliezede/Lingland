
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onTimesheetAdminApproved = functions.firestore
  .document('timesheets/{timesheetId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const previousData = change.before.data();

    // Only run if adminApproved changed from false to true
    if (newData.adminApproved === true && previousData.adminApproved === false) {
      console.log(`Processing approval for timesheet ${context.params.timesheetId}`);

      // 1. Get necessary data
      const bookingDoc = await db.collection('bookings').doc(newData.bookingId).get();
      const booking = bookingDoc.data();

      if (!booking) {
        console.error("Booking not found");
        return null;
      }

      // 2. Fetch Rates (Simplified Logic)
      // In production, query the 'rates' collection based on serviceType, client, etc.
      const clientRateSnapshot = await db.collection('rates')
        .where('rateType', '==', 'CLIENT')
        .where('serviceType', '==', booking.serviceType)
        .limit(1)
        .get();

      const interpreterRateSnapshot = await db.collection('rates')
        .where('rateType', '==', 'INTERPRETER')
        .where('serviceType', '==', booking.serviceType)
        .limit(1)
        .get();

      const clientRate = !clientRateSnapshot.empty ? clientRateSnapshot.docs[0].data() : { amountPerUnit: 40, minimumUnits: 1 };
      const interpRate = !interpreterRateSnapshot.empty ? interpreterRateSnapshot.docs[0].data() : { amountPerUnit: 25, minimumUnits: 1 };

      // 3. Calculate Units (Assuming Hourly for simplicity)
      const start = new Date(newData.actualStart);
      const end = new Date(newData.actualEnd);
      let durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      // Deduct break
      if (newData.breakDurationMinutes) {
        durationHours -= (newData.breakDurationMinutes / 60);
      }
      
      if (durationHours < 0) durationHours = 0;

      // Apply minimums
      const unitsClient = Math.max(durationHours, clientRate.minimumUnits || 1);
      const unitsInterp = Math.max(durationHours, interpRate.minimumUnits || 1);

      // 4. Calculate Totals
      const clientAmount = unitsClient * clientRate.amountPerUnit;
      const interpAmount = unitsInterp * interpRate.amountPerUnit;

      // 5. Update Timesheet
      return change.after.ref.update({
        unitsBillableToClient: Number(unitsClient.toFixed(2)),
        unitsPayableToInterpreter: Number(unitsInterp.toFixed(2)),
        clientAmountCalculated: Number(clientAmount.toFixed(2)),
        interpreterAmountCalculated: Number(interpAmount.toFixed(2)),
        readyForClientInvoice: true,
        readyForInterpreterInvoice: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return null;
  });
