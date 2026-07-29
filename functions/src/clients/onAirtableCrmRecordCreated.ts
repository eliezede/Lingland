import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  buildIncomingCrmPatch,
  shouldTagAirtableCrmIntake,
} from './clientCrmCohort';

const OPTIONS = {
  region: 'europe-west1',
  memory: '256MiB' as const,
  timeoutSeconds: 60,
};

const tagAirtableRecordAsIncoming = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot | undefined,
) => {
  if (!snapshot || !shouldTagAirtableCrmIntake(snapshot.data())) return;
  await snapshot.ref.set(buildIncomingCrmPatch(), { merge: true });
};

export const onAirtableClientCreated = onDocumentCreated(
  { ...OPTIONS, document: 'clients/{clientId}' },
  event => tagAirtableRecordAsIncoming(event.data),
);

export const onAirtableBookingCreated = onDocumentCreated(
  { ...OPTIONS, document: 'bookings/{bookingId}' },
  event => tagAirtableRecordAsIncoming(event.data),
);

export const onAirtableClientInvoiceCreated = onDocumentCreated(
  { ...OPTIONS, document: 'clientInvoices/{invoiceId}' },
  event => tagAirtableRecordAsIncoming(event.data),
);
