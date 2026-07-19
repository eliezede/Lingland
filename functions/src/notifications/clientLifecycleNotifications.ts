import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  ClientNotificationPurpose,
  selectClientNotificationUserIds,
} from './clientNotificationPolicy';

const db = admin.firestore();
const text = (value: unknown) => String(value ?? '').trim();
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const resolveCanonicalClientId = async (requestedId: string) => {
  let clientId = requestedId;
  for (let depth = 0; clientId && depth < 5; depth += 1) {
    const client = await db.collection('clients').doc(clientId).get();
    if (!client.exists) return clientId;
    const redirect = text(client.data()?.mergedIntoClientId);
    if (!redirect || redirect === clientId) return clientId;
    clientId = redirect;
  }
  return clientId;
};

const loadActiveClientRecipients = async (input: {
  clientId: string;
  departmentIds: string[];
  agentIds: string[];
  directUserIds: string[];
  purpose: ClientNotificationPurpose;
}) => {
  if (!input.clientId) return [];
  const memberships = await db.collection('clientMemberships').where('clientId', '==', input.clientId).get();
  const membershipData = memberships.docs.map(document => document.data());
  const agentDocuments = input.agentIds.length > 0
    ? await db.getAll(...input.agentIds.map(agentId => db.collection('clientAgents').doc(agentId)))
    : [];
  const directUserIds = Array.from(new Set([
    ...input.directUserIds,
    ...agentDocuments.map(agent => text(agent.data()?.userId)).filter(Boolean),
  ]));
  const candidates = selectClientNotificationUserIds(membershipData, {
    departmentIds: input.departmentIds,
    agentIds: input.agentIds,
    directUserIds,
  }, input.purpose);
  if (candidates.length === 0) return [];
  const users = await db.getAll(...candidates.map(userId => db.collection('users').doc(userId)));
  const accepted = await Promise.all(users.map(async user => {
    const data = user.data() || {};
    const activeClientUser = user.exists
      && text(data.status).toUpperCase() === 'ACTIVE'
      && text(data.role).toUpperCase() === 'CLIENT';
    if (!activeClientUser) return '';
    const userClientId = text(data.clientId || data.profileId);
    if (!userClientId) return '';
    return await resolveCanonicalClientId(userClientId) === input.clientId ? user.id : '';
  }));
  return accepted.filter(Boolean);
};

const writeNotifications = async (input: {
  eventKey: string;
  userIds: string[];
  title: string;
  message: string;
  type: string;
  link: string;
  metadata: Record<string, unknown>;
}) => {
  if (input.userIds.length === 0) return;
  const batch = db.batch();
  const createdAt = new Date().toISOString();
  input.userIds.forEach(userId => {
    batch.set(db.collection('notifications').doc(`${input.eventKey}_${userId}`), {
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      read: false,
      link: input.link,
      deliveryChannel: 'IN_APP',
      ...input.metadata,
      createdAt,
    }, { merge: false });
  });
  await batch.commit();
};

const BOOKING_EVENTS: Record<string, { title: string; message: string; purpose: ClientNotificationPurpose; type: string }> = {
  BOOKED: { title: 'Interpreter confirmed', message: 'An interpreter has confirmed your language-service request.', purpose: 'BOOKING', type: 'SUCCESS' },
  CANCELLED: { title: 'Request cancelled', message: 'This language-service request has been cancelled.', purpose: 'BOOKING', type: 'WARNING' },
  TIMESHEET_SUBMITTED: { title: 'Timesheet received', message: 'The timesheet for this job has been submitted for review.', purpose: 'BOOKING', type: 'INFO' },
  READY_FOR_INVOICE: { title: 'Job ready for billing', message: 'The verified job has moved to the client billing queue.', purpose: 'FINANCE', type: 'PAYMENT' },
};

export const onClientBookingLifecycleNotification = functions.firestore
  .document('bookings/{bookingId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const previousStatus = text(before.status).toUpperCase();
    const nextStatus = text(after.status).toUpperCase();
    if (!nextStatus || previousStatus === nextStatus || !BOOKING_EVENTS[nextStatus]) return null;
    const event = BOOKING_EVENTS[nextStatus];
    const clientId = text(after.clientId);
    const departmentIds = [text(after.clientDepartmentId)].filter(Boolean);
    const agentIds = [text(after.requestedByAgentId)].filter(Boolean);
    const directUserIds = [text(after.requestedByUserId)].filter(Boolean);
    const userIds = await loadActiveClientRecipients({ clientId, departmentIds, agentIds, directUserIds, purpose: event.purpose });
    const reference = text(after.displayRef || after.jobNumber || context.params.bookingId);
    await writeNotifications({
      eventKey: `client_job_${context.params.bookingId}_${nextStatus.toLowerCase()}`,
      userIds,
      title: event.title,
      message: `${event.message} ${reference}`,
      type: event.type,
      link: `/client/bookings/${context.params.bookingId}`,
      metadata: {
        bookingId: context.params.bookingId,
        clientId,
        clientDepartmentIds: departmentIds,
        requestedByAgentIds: agentIds,
        lifecycleStatus: nextStatus,
      },
    });
    return null;
  });

const INVOICE_EVENTS: Record<string, { title: string; message: string; type: string }> = {
  SENT: { title: 'Invoice available', message: 'A new client invoice is available in the billing area.', type: 'PAYMENT' },
  APPROVED: { title: 'Invoice approved', message: 'A client invoice has been approved.', type: 'SUCCESS' },
  PAID: { title: 'Payment recorded', message: 'Payment has been recorded for a client invoice.', type: 'SUCCESS' },
};

export const onClientInvoiceLifecycleNotification = functions.firestore
  .document('clientInvoices/{invoiceId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.data() || {};
    const previousStatus = text(before.status).toUpperCase();
    const nextStatus = text(after.status).toUpperCase();
    if (!nextStatus || previousStatus === nextStatus || !INVOICE_EVENTS[nextStatus]) return null;
    const event = INVOICE_EVENTS[nextStatus];
    const clientId = text(after.clientId);
    const departmentIds = Array.from(new Set([
      ...list(after.clientDepartmentIds),
      text(after.clientDepartmentId),
    ].filter(Boolean)));
    const agentIds = Array.from(new Set([
      ...list(after.requestedByAgentIds),
      text(after.requestedByAgentId),
    ].filter(Boolean)));
    const userIds = await loadActiveClientRecipients({ clientId, departmentIds, agentIds, directUserIds: [], purpose: 'FINANCE' });
    const reference = text(after.invoiceNumber || after.reference || context.params.invoiceId);
    await writeNotifications({
      eventKey: `client_invoice_${context.params.invoiceId}_${nextStatus.toLowerCase()}`,
      userIds,
      title: event.title,
      message: `${event.message} ${reference}`,
      type: event.type,
      link: `/client/invoices/${context.params.invoiceId}`,
      metadata: {
        invoiceId: context.params.invoiceId,
        clientId,
        clientDepartmentIds: departmentIds,
        requestedByAgentIds: agentIds,
        lifecycleStatus: nextStatus,
      },
    });
    return null;
  });
