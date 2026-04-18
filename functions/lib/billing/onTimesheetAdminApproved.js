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
exports.onTimesheetAdminApproved = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.onTimesheetAdminApproved = functions.firestore
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
        if (interpreter.rates) {
            const rates = interpreter.rates;
            const mode = newData.sessionMode || 'F2F';
            const isOOH = booking.isOOH || false;
            if (isOOH) {
                if (mode === 'F2F')
                    sessionRate = rates.oohF2F || sessionRate;
                if (mode === 'VIDEO')
                    sessionRate = rates.oohVideo || sessionRate;
                if (mode === 'PHONE')
                    sessionRate = rates.oohPhone || sessionRate;
            }
            else {
                if (mode === 'F2F')
                    sessionRate = rates.f2fRate || sessionRate;
                if (mode === 'VIDEO')
                    sessionRate = rates.stVideo || sessionRate;
                if (mode === 'PHONE')
                    sessionRate = rates.stPhone || sessionRate;
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
        if (durationHours < 0)
            durationHours = 0;
        // Apply minimums
        const unitsClient = Math.max(durationHours, clientRate.minimumUnits || 1);
        const unitsInterp = Math.max(durationHours, 1);
        // 6. Calculate Totals for Interpreter
        const sessionEarnings = unitsInterp * sessionRate;
        const travelEarnings = ((newData.travelTimeMinutes || 0) / 60) * travelRate;
        const mileageEarnings = (newData.mileage || 0) * mileageRate;
        const extras = (newData.parking || 0) + (newData.transport || 0);
        const interpAmount = sessionEarnings + travelEarnings + mileageEarnings + extras;
        const clientAmount = unitsClient * clientRate.amountPerUnit; // Oversimplified for now
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
//# sourceMappingURL=onTimesheetAdminApproved.js.map