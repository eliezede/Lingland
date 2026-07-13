export type AuditDocument = Record<string, any> | undefined;

const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const changed = (before: unknown, after: unknown) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

const statusValue = (value: AuditDocument) => upper(
  value?.status
  || value?.paymentStatus
  || value?.resolutionStatus
  || value?.pushStatus
  || value?.delivery?.state
);

export const deriveAuditAction = (
  collectionName: string,
  before: AuditDocument,
  after: AuditDocument
) => {
  const created = !before && Boolean(after);
  const deleted = Boolean(before) && !after;
  const beforeStatus = statusValue(before);
  const afterStatus = statusValue(after);

  if (collectionName === 'jobEvents' && after?.type) return upper(after.type);
  if (deleted) return `${upper(collectionName)}_DELETED`;

  if (collectionName === 'bookings') {
    if (created) return 'JOB_CREATED';
    if (beforeStatus !== afterStatus) return 'STATUS_CHANGED';
    return 'JOB_UPDATED';
  }

  if (collectionName === 'assignments') {
    if (created) return afterStatus === 'OFFERED' ? 'ASSIGNMENT_OFFERED' : `ASSIGNMENT_${afterStatus || 'CREATED'}`;
    if (beforeStatus !== afterStatus) return `ASSIGNMENT_${afterStatus || 'UPDATED'}`;
    return 'ASSIGNMENT_UPDATED';
  }

  if (collectionName === 'timesheets') {
    if (created) return upper(after?.source).includes('AIRTABLE') ? 'TIMESHEET_MIRRORED' : 'TIMESHEET_SUBMITTED';
    if (!before?.adminApproved && after?.adminApproved) return 'TIMESHEET_APPROVED';
    if (beforeStatus !== afterStatus) return `TIMESHEET_${afterStatus || 'UPDATED'}`;
    return 'TIMESHEET_UPDATED';
  }

  if (collectionName === 'clientInvoices') {
    if (created) return upper(after?.sourceSystem).includes('AIRTABLE') ? 'CLIENT_INVOICE_MIRRORED' : 'CLIENT_INVOICE_CREATED';
    if (beforeStatus !== afterStatus && afterStatus === 'PAID') return 'CLIENT_PAYMENT_RECEIVED';
    if (beforeStatus !== afterStatus) return 'CLIENT_INVOICE_STATUS_CHANGED';
    return 'CLIENT_INVOICE_UPDATED';
  }

  if (collectionName === 'interpreterInvoices') {
    if (created) return upper(after?.sourceSystem).includes('AIRTABLE') ? 'INTERPRETER_INVOICE_MIRRORED' : 'INTERPRETER_INVOICE_CREATED';
    if (beforeStatus !== afterStatus && afterStatus === 'PAID') return 'INTERPRETER_PAYMENT_SENT';
    if (beforeStatus !== afterStatus) return 'INTERPRETER_INVOICE_STATUS_CHANGED';
    return 'INTERPRETER_INVOICE_UPDATED';
  }

  if (collectionName === 'mail' || collectionName === 'emailAudit') {
    if (created && afterStatus) return `EMAIL_${afterStatus}`;
    if (created) return 'EMAIL_QUEUED';
    if (beforeStatus !== afterStatus) return `EMAIL_${afterStatus || 'UPDATED'}`;
    return 'EMAIL_UPDATED';
  }

  if (collectionName === 'notifications') {
    if (created) return 'NOTIFICATION_CREATED';
    if (beforeStatus !== afterStatus) return `NOTIFICATION_${afterStatus || 'UPDATED'}`;
    return 'NOTIFICATION_UPDATED';
  }

  if (collectionName === 'syncRuns') {
    if (created) return after?.success === false ? 'SYNC_RUN_FAILED' : 'SYNC_RUN_COMPLETED';
    return 'SYNC_RUN_UPDATED';
  }

  if (collectionName === 'syncConflicts') {
    if (created) return 'SYNC_CONFLICT_CREATED';
    if (beforeStatus !== afterStatus && ['RESOLVED', 'IGNORED'].includes(afterStatus)) return 'SYNC_CONFLICT_RESOLVED';
    return 'SYNC_CONFLICT_UPDATED';
  }

  if (collectionName === 'system' && changed(before?.platformMode, after?.platformMode)) {
    return 'PLATFORM_MODE_CHANGED';
  }

  if (collectionName === 'goLiveControl') {
    if (changed(before?.lastRollbackAt, after?.lastRollbackAt) && after?.lastRollbackAt) return 'SAFE_MIRROR_RESTORED';
    if (changed(before?.lastReadinessAudit, after?.lastReadinessAudit) && after?.lastReadinessAudit) return 'GO_LIVE_READINESS_RECORDED';
    if (changed(before?.checklist, after?.checklist)) return 'GO_LIVE_CHECKLIST_UPDATED';
    return created ? 'GO_LIVE_CONTROL_CREATED' : 'GO_LIVE_CONTROL_UPDATED';
  }

  if (created) return 'CREATED';
  return 'UPDATED';
};

export const deriveAuditSource = (before: AuditDocument, after: AuditDocument) => upper(
  after?.source
  || after?.sourceSystem
  || before?.source
  || before?.sourceSystem
  || 'PLATFORM'
);

export const deriveSyncRunId = (before: AuditDocument, after: AuditDocument) => String(
  after?.syncRunId
  || after?.lastSyncRunId
  || after?.runId
  || after?.metadata?.syncRunId
  || before?.syncRunId
  || before?.lastSyncRunId
  || before?.runId
  || before?.metadata?.syncRunId
  || ''
);

export const deriveActorId = (
  collectionName: string,
  before: AuditDocument,
  after: AuditDocument
) => {
  if (['mail', 'emailAudit', 'notifications'].includes(collectionName) && before && after) {
    return 'SYSTEM_COMMUNICATION_WORKER';
  }
  return String(
    after?.actorUserId
    || after?.actorId
    || after?.updatedBy
    || after?.createdBy
    || after?.adminApprovedBy
    || after?.triggeredByUserId
    || before?.actorUserId
    || before?.actorId
    || before?.updatedBy
    || before?.createdBy
    || 'SYSTEM'
  );
};

export const deriveEmbeddedActorRole = (before: AuditDocument, after: AuditDocument) => upper(
  after?.actorRole
  || after?.updatedByRole
  || after?.createdByRole
  || before?.actorRole
  || before?.updatedByRole
  || before?.createdByRole
);

export const deriveEmbeddedCommunicationMode = (before: AuditDocument, after: AuditDocument) => upper(
  after?.communicationMode
  || after?.delivery?.communicationMode
  || before?.communicationMode
  || before?.delivery?.communicationMode
);
