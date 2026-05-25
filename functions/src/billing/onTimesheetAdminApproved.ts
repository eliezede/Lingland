
import * as functions from 'firebase-functions/v1';
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

      // 2. Fetch Client and Interpreter data
      const clientDoc = await db.collection('clients').doc(newData.clientId).get();
      const client = clientDoc.data() || {};
      
      const interpDoc = await db.collection('interpreters').doc(newData.interpreterId).get();
      const interpreter = interpDoc.data() || {};

      // 3. Extract Rates for Interpreter
      let sessionRate = 25; // Base fallback
      let travelRate = 12; // Base fallback
      let mileageRate = 0.45;

      const normalizeMode = (mode: string) => {
        if (['F2F', 'Face-to-Face'].includes(mode)) return 'F2F';
        if (['VIDEO', 'Videocall', 'Video', 'ONLINE'].includes(mode)) return 'VIDEO';
        if (['PHONE', 'Over the Phone', 'Phone'].includes(mode)) return 'PHONE';
        if (['CANCELLATION', 'cancellation fees'].includes(mode)) return 'CANCELLATION';
        return 'F2F';
      };

      const mode = normalizeMode(newData.sessionMode || 'F2F');
      const isTranslation = booking.serviceCategory === 'TRANSLATION' || booking.serviceType === 'TRANSLATION';
      const isCancellation = mode === 'CANCELLATION' || !!newData.nonExecutionReason;

      if (interpreter.rates && !isCancellation && !isTranslation) {
        const rates = interpreter.rates;
        const isOOH = booking.isOOH || false;

        if (isOOH) {
          if (mode === 'F2F') sessionRate = rates.oohF2F || sessionRate;
          if (mode === 'VIDEO') sessionRate = rates.oohVideo || sessionRate;
          if (mode === 'PHONE') sessionRate = rates.oohPhone || sessionRate;
        } else {
          if (mode === 'F2F') sessionRate = rates.f2fRate || sessionRate;
          if (mode === 'VIDEO') sessionRate = rates.stVideo || sessionRate;
          if (mode === 'PHONE') sessionRate = rates.stPhone || sessionRate;
        }
        travelRate = rates.travelTimeST || travelRate;
        mileageRate = rates.mileageST || mileageRate;
      }

      // 4. Client Rate (Fallback)
      const clientRate = { amountPerUnit: 40, minimumUnits: 1 }; // Default client rate, to evolve in future

      // 5. Calculate Durations & Units
      const start = new Date(newData.actualStart);
      const end = new Date(newData.actualEnd);
      let durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      // Deduct break
      if (newData.breakDurationMinutes) {
        durationHours -= (newData.breakDurationMinutes / 60);
      }
      if (durationHours < 0) durationHours = 0;

      let unitsClient = Math.max(durationHours, clientRate.minimumUnits || 1);
      let unitsInterp = Math.max(durationHours, 1);

      // 6. Calculate Totals for Interpreter
      let travelEarnings = ((newData.travelTimeMinutes || 0) / 60) * travelRate;
      let mileageEarnings = (newData.mileage || 0) * mileageRate;
      let extras = (newData.parking || 0) + (newData.transport || 0);
      let interpAmount = unitsInterp * sessionRate + travelEarnings + mileageEarnings + extras;
      let clientAmount = unitsClient * clientRate.amountPerUnit; // Oversimplified for now

      if (isTranslation) {
        const quantity = Number(newData.wordCount || newData.unitsBillableToClient || newData.unitsPayableToInterpreter || 0);
        const unitPrice = Number(newData.unitPrice || 0);
        unitsClient = quantity;
        unitsInterp = quantity;
        travelEarnings = 0;
        mileageEarnings = 0;
        extras = 0;
        interpAmount = Number((newData.interpreterAmountCalculated || (quantity * unitPrice)).toFixed(2));
        clientAmount = Number((newData.clientAmountCalculated || (quantity * unitPrice)).toFixed(2));
      }

      if (isCancellation) {
        unitsClient = Number(newData.unitsBillableToClient || 0);
        unitsInterp = Number(newData.unitsPayableToInterpreter || 0);
        interpAmount = Number(newData.interpreterAmountCalculated || newData.totalToPay || 0);
        clientAmount = Number(newData.clientAmountCalculated || 0);
      }

      // 5. Update Timesheet
      return change.after.ref.update({
        unitsBillableToClient: Number(unitsClient.toFixed(2)),
        unitsPayableToInterpreter: Number(unitsInterp.toFixed(2)),
        clientAmountCalculated: Number(clientAmount.toFixed(2)),
        interpreterAmountCalculated: Number(interpAmount.toFixed(2)),
        readyForClientInvoice: true,
        readyForInterpreterInvoice: Boolean(newData.interpreterId && newData.interpreterId !== 'unassigned' && interpAmount > 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return null;
  });
