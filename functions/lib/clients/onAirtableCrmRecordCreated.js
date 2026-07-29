"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAirtableClientInvoiceCreated = exports.onAirtableBookingCreated = exports.onAirtableClientCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const clientCrmCohort_1 = require("./clientCrmCohort");
const OPTIONS = {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
};
const tagAirtableRecordAsIncoming = async (snapshot) => {
    if (!snapshot || !(0, clientCrmCohort_1.shouldTagAirtableCrmIntake)(snapshot.data()))
        return;
    await snapshot.ref.set((0, clientCrmCohort_1.buildIncomingCrmPatch)(), { merge: true });
};
exports.onAirtableClientCreated = (0, firestore_1.onDocumentCreated)({ ...OPTIONS, document: 'clients/{clientId}' }, event => tagAirtableRecordAsIncoming(event.data));
exports.onAirtableBookingCreated = (0, firestore_1.onDocumentCreated)({ ...OPTIONS, document: 'bookings/{bookingId}' }, event => tagAirtableRecordAsIncoming(event.data));
exports.onAirtableClientInvoiceCreated = (0, firestore_1.onDocumentCreated)({ ...OPTIONS, document: 'clientInvoices/{invoiceId}' }, event => tagAirtableRecordAsIncoming(event.data));
//# sourceMappingURL=onAirtableCrmRecordCreated.js.map