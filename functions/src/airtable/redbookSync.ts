import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { createHash } from 'crypto';

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type SyncAction = 'created' | 'updated' | 'skipped' | 'conflict' | 'error';

type SyncMode = {
  dryRun: boolean;
  limitRecords: number;
  syncStrategy: AirtableSyncStrategy;
  triggeredBy: 'manual' | 'schedule';
  userId?: string;
  tableOffsets?: Record<string, string>;
};

type AirtableSyncStrategy =
  | 'OPEN_WORKFLOW'
  | 'UPDATED_SINCE_LAST_SYNC'
  | 'RECENT_OPEN'
  | 'FULL_AUDIT'
  | 'CUSTOM_LIMIT';

type AirtableFetchOptions = {
  filterByFormula?: string;
  strategy?: AirtableSyncStrategy;
};

const db = admin.firestore();
const DEFAULT_BASE_ID = 'appnglRJzSscwJJph'; // Lingland MASTER 24 NEW
const DEFAULT_TABLE_NAME = 'REDBOOK';
const CLIENTS_TABLE = 'Clients';
const CLIENTS_BOOK_TABLE = 'Clients Book';
const TRANSLATIONS_TABLE = 'Translations';
const WEB_TRANSLATIONS_TABLE = 'Web translations';
const CLIENT_INVOICES_TABLE = 'Invoices';
const INTERPRETER_INVOICES_TABLE = 'INV interp';
const TRANSLATION_CLIENT_INVOICES_TABLE = 'TR invoices';
const TRANSLATOR_INVOICES_TABLE = 'INV TR';
const MAX_DETAILS = 50;
const MODULE_DETAIL_LIMIT = 30;
const ASSIGNMENTS_COLLECTION = 'bookingAssignments';
const DEFAULT_SYNC_STRATEGY: AirtableSyncStrategy = 'OPEN_WORKFLOW';

type AirtableSyncModule =
  | 'clients'
  | 'redbook'
  | 'translations'
  | 'clientInvoices'
  | 'interpreterInvoices'
  | 'translationClientInvoices'
  | 'translatorInvoices';

const FULL_SYNC_MODULES: AirtableSyncModule[] = [
  'clients',
  'redbook',
  'translations',
  'clientInvoices',
  'interpreterInvoices',
  'translationClientInvoices',
  'translatorInvoices'
];

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  INCOMING: 1,
  NEEDS_ASSIGNMENT: 2,
  ASSIGNMENT_PENDING: 3,
  OPENED: 3,
  QUOTE_PENDING: 3,
  BOOKED: 4,
  SESSION_COMPLETED: 5,
  TIMESHEET_SUBMITTED: 6,
  TIMESHEET_VERIFIED: 7,
  READY_FOR_INVOICE: 8,
  INVOICING: 8,
  INVOICED: 9,
  PAID: 10,
  CANCELLED: 99,
  ADMIN: 50,
  ADMIN_HOLD: 50
};

const normalize = (value: unknown): string => {
  if (Array.isArray(value)) return normalize(value[0]);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const normalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const pick = (fields: Record<string, unknown>, names: string[]): string => {
  for (const name of names) {
    const direct = normalize(fields[name]);
    if (direct) return direct;
  }

  const normalizedMap = new Map<string, string>();
  Object.entries(fields).forEach(([key, value]) => {
    normalizedMap.set(normalizeKey(key), normalize(value));
  });

  for (const name of names) {
    const val = normalizedMap.get(normalizeKey(name));
    if (val) return val;
  }

  return '';
};

const pickRaw = (fields: Record<string, unknown>, names: string[]): unknown => {
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null) return fields[name];
  }

  const normalizedMap = new Map<string, unknown>();
  Object.entries(fields).forEach(([key, value]) => {
    normalizedMap.set(normalizeKey(key), value);
  });

  for (const name of names) {
    const val = normalizedMap.get(normalizeKey(name));
    if (val !== undefined && val !== null) return val;
  }

  return undefined;
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const collectRawValues = (fields: Record<string, unknown>, names: string[]): unknown[] => {
  const requested = new Set(names.map(normalizeKey));
  const values: unknown[] = [];

  Object.entries(fields).forEach(([key, value]) => {
    const keyName = normalizeKey(key);
    const matches = Array.from(requested).some(name => keyName === name || keyName.endsWith(name));
    if (matches && value !== undefined && value !== null) {
      values.push(...asArray(value));
    }
  });

  return values;
};

const mapAirtableAttachment = (file: unknown): string | { name?: string; url?: string; type?: string; size?: number } | null => {
  const normalized = normalize(file);
  if (normalized) return normalized;
  if (!file || typeof file !== 'object' || Array.isArray(file)) return null;
  const data = file as Record<string, unknown>;
  const url = normalize(data.url);
  const name = normalize(data.filename) || normalize(data.name);
  const type = normalize(data.type);
  const size = safeNumber(data.size);
  if (!url && !name) return null;
  return cleanData({ name, url, type, size: size || undefined }) as { name?: string; url?: string; type?: string; size?: number };
};

const pickLinkedIds = (fields: Record<string, unknown>, names: string[]): string[] => {
  return collectRawValues(fields, names)
    .map(value => normalize(value))
    .filter(Boolean);
};

const safeNumber = (value: unknown): number => {
  if (Array.isArray(value)) return safeNumber(value[0]);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const truthyField = (fields: Record<string, unknown>, names: string[]): boolean => {
  const raw = pickRaw(fields, names);
  if (Array.isArray(raw)) return raw.some(value => truthyField({ value }, ['value']));
  if (typeof raw === 'boolean') return raw;
  const value = normalize(raw).toLowerCase();
  return ['true', 'yes', 'y', '1', 'paid', 'verified', 'sent'].includes(value);
};

const parseJobNumber = (value: string): string => {
  const match = value.match(/LING\d{2}\.\d+/i);
  return match ? match[0].toUpperCase() : value;
};

const parseLanguageTo = (fields: Record<string, unknown>, reference: string): string => {
  const explicit = pick(fields, ['Language Requested', 'Language', 'LANGUAGE', 'Language To', 'Target Language']);
  if (explicit) {
    const toMatch = explicit.match(/\bto\s+(.+)$/i);
    return toMatch ? toMatch[1].trim() : explicit;
  }

  const refMatch = reference.match(/LING\d{2}\.\d+\s+(.+)$/i);
  return refMatch ? refMatch[1].trim() : 'Unknown';
};

const parseDateTime = (fields: Record<string, unknown>) => {
  const rawDateTime = pick(fields, ['Booking Date & Time', 'Booked For', 'Date & Time', 'Start Date Time', 'Appointment']);
  const rawDate = pick(fields, ['Booking Date', 'Date', 'Session Date', 'Booked Date']);
  const rawTime = pick(fields, ['Start Time', 'Time', 'Booking Time', 'Session Time']);
  const raw = rawDateTime || [rawDate, rawTime].filter(Boolean).join(' ');
  const parsed = raw ? new Date(raw) : null;

  if (parsed && !Number.isNaN(parsed.getTime())) {
    return {
      date: parsed.toISOString().split('T')[0],
      startTime: parsed.toTimeString().slice(0, 5)
    };
  }

  return {
    date: rawDate || new Date().toISOString().split('T')[0],
    startTime: rawTime || '09:00'
  };
};

const parseDuration = (value: string): number => {
  const minutes = Number(value.match(/\d+/)?.[0] || 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
};

const canonicalAirtableStatus = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const REDBOOK_STATUS_MAP: Record<string, string> = {
  'incoming': 'INCOMING',
  'incoming 23': 'INCOMING',
  'quote': 'QUOTE_PENDING',
  'opened': 'OPENED',
  'opened tr': 'OPENED',
  'assigned tr': 'OPENED',
  'admin': 'ADMIN',
  'admin tr': 'ADMIN',
  'booked': 'BOOKED',
  'cancelled': 'CANCELLED',
  'early cancellation': 'CANCELLED',
  'unfilled/missed': 'CANCELLED',
  'unclaimed': 'NEEDS_ASSIGNMENT',
  'invoicing': 'INVOICING',
  'sent and invoicing tr': 'INVOICING',
  'invoice sage': 'INVOICING',
  'invoiced': 'INVOICED',
  'invoiced and completed': 'INVOICED',
  'paid': 'PAID',
  'russian': 'INCOMING'
};

const TRANSLATION_STATUS_MAP: Record<string, string> = {
  ...REDBOOK_STATUS_MAP,
  'completed': 'READY_FOR_INVOICE',
  'verified': 'READY_FOR_INVOICE'
};

const describeMappedStatus = (
  status: string,
  signals: Record<string, unknown>,
  hasInterpreter: boolean
) => {
  const rank = STATUS_RANK[status] || 0;
  return {
    operationalStatus: status,
    assignmentState: status === 'CANCELLED'
      ? 'CANCELLED'
      : hasInterpreter
      ? (rank >= STATUS_RANK.BOOKED ? 'ACCEPTED' : 'ASSIGNED_PENDING_ACCEPTANCE')
      : 'UNASSIGNED',
    timesheetState: status === 'CANCELLED'
      ? 'NOT_REQUIRED'
      : (rank >= STATUS_RANK.READY_FOR_INVOICE || signals.verified)
      ? 'VERIFIED'
      : (rank >= STATUS_RANK.TIMESHEET_SUBMITTED || signals.timesheetReceived || signals.hasInterpreterInvoice)
      ? 'SUBMITTED'
      : 'NOT_RECEIVED',
    billingState: status === 'PAID'
      ? 'PAID'
      : (rank >= STATUS_RANK.INVOICED || signals.hasClientInvoice || signals.invoiceNumber)
      ? 'INVOICED'
      : (rank >= STATUS_RANK.READY_FOR_INVOICE)
      ? 'READY_FOR_INVOICE'
      : 'NOT_READY',
    cancellationState: status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE'
  };
};

const mapStatus = (fields: Record<string, unknown>, hasInterpreter: boolean) => {
  const rawStatus = pick(fields, ['Status', 'Job Status', 'Booking Status']);
  const normalized = rawStatus.toLowerCase();
  const explicitStatus = REDBOOK_STATUS_MAP[canonicalAirtableStatus(rawStatus)];
  const invoiceStatus = pick(fields, ['Status (from invoices table)', 'Invocing Status']);
  const invoiceNumber = pick(fields, ['Invoice Nbr (from 💷 Invoices)', 'INV ID (from 💷 Invoices)', 'Invoice Nbr', 'INV ID']);

  const schedule = parseDateTime(fields);
  const bookingStart = new Date(`${schedule.date}T${schedule.startTime}`);
  const isFuture = !Number.isNaN(bookingStart.getTime()) && bookingStart.getTime() > Date.now();

  const hasClientInvoice = !isFuture && Boolean(invoiceNumber || pick(fields, ['Invoiced on']) || safeNumber(pickRaw(fields, ['job invoice', 'Total invoiced', 'Invoiced + VAT'])));
  const hasInterpreterInvoice = !isFuture && Boolean(pick(fields, ['INV interp', 'interpreter invoice form', 'Google timesheet']));
  const timesheetReceived = !isFuture && (truthyField(fields, ['timesheet']) || Boolean(pick(fields, ['timesheet link', 'Google timesheet'])));
  const verified = !isFuture && (truthyField(fields, ['Verified', 'Verified (from Job Number from redbook)', 'Verified (from Job Number from redbook) 2'])
    || Boolean(pick(fields, ['verification date'])));
  const paid = !isFuture && (truthyField(fields, ['Paid']) || invoiceStatus.toLowerCase().includes('paid') || normalized.includes('paid'));

  let status = explicitStatus || 'INCOMING';
  if (explicitStatus) status = explicitStatus;
  else if (normalized.includes('cancel')) status = 'CANCELLED';
  else if (paid) status = 'PAID';
  else if (hasClientInvoice || invoiceStatus.toLowerCase().includes('invoice')) status = 'INVOICED';
  else if (verified) status = 'READY_FOR_INVOICE';
  else if (timesheetReceived || hasInterpreterInvoice || (!isFuture && normalized.includes('timesheet'))) status = 'TIMESHEET_SUBMITTED';
  else if (!isFuture && (normalized.includes('complete') || normalized.includes('done'))) status = 'SESSION_COMPLETED';
  else if (normalized.includes('pending')) status = 'ASSIGNMENT_PENDING';
  else if (normalized.includes('open')) status = hasInterpreter ? 'OPENED' : 'INCOMING';
  else if (normalized.includes('assign')) status = hasInterpreter ? 'OPENED' : 'NEEDS_ASSIGNMENT';
  else if (normalized.includes('book') || hasInterpreter) status = 'BOOKED';

  const signals = {
    invoiceStatus,
    invoiceNumber,
    hasClientInvoice,
    hasInterpreterInvoice,
    timesheetReceived,
    verified,
    paid,
    explicitStatusMatched: Boolean(explicitStatus)
  };

  return {
    status,
    rawStatus,
    statusMappedAt: new Date().toISOString(),
    state: describeMappedStatus(status, signals, hasInterpreter),
    signals
  };
};

const mapLocationType = (sessionType: string, location: string): 'ONSITE' | 'ONLINE' => {
  const value = `${sessionType} ${location}`.toLowerCase();
  return value.includes('online') || value.includes('virtual') || value.includes('video') || value.includes('phone')
    ? 'ONLINE'
    : 'ONSITE';
};

const stableHash = (value: unknown): string => {
  const json = JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i += 1) {
    hash = ((hash << 5) - hash) + json.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
};

const buildSourceTracking = (
  record: AirtableRecord,
  tableName: string,
  legacyRef: string,
  snapshot: unknown,
  runId?: string
) => {
  const snapshotHash = stableHash(snapshot);
  return cleanData({
    sourceSystem: 'AIRTABLE',
    sourceBaseId: DEFAULT_BASE_ID,
    sourceTable: tableName,
    sourceRecordId: record.id,
    legacyRef,
    snapshotHash,
    airtableSnapshotHash: snapshotHash,
    lastSyncedAt: new Date().toISOString(),
    lastSyncRunId: runId,
    syncStatus: 'SYNCED'
  });
};

const needsSourceTrackingBackfill = (
  existing: admin.firestore.DocumentData | undefined | null,
  expected: Record<string, unknown>
): boolean => {
  if (!existing) return false;
  const requiredFields = ['sourceSystem', 'sourceBaseId', 'sourceTable', 'sourceRecordId', 'snapshotHash'];
  return requiredFields.some(field => !existing[field] && expected[field]);
};

const writeSyncConflict = async (input: {
  runId?: string;
  entityType: 'booking' | 'client' | 'clientInvoice' | 'interpreterInvoice';
  entityId?: string;
  sourceTable: string;
  sourceRecordId: string;
  sourceBaseId?: string;
  legacyRef?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  currentValue?: unknown;
  incomingValue?: unknown;
  recommendedAction: string;
  dryRun: boolean;
}) => {
  if (!input.runId) return;
  const conflictId = slugify([
    input.entityType,
    input.sourceTable,
    input.sourceRecordId,
    input.reason
  ].join('_'));
  const conflictRef = db.collection('syncConflicts').doc(conflictId);
  const existing = await conflictRef.get();
  await conflictRef.set(cleanData({
    id: conflictId,
    runId: input.runId,
    entityType: input.entityType,
    entityId: input.entityId || '',
    sourceSystem: 'AIRTABLE',
    sourceBaseId: input.sourceBaseId || DEFAULT_BASE_ID,
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    legacyRef: input.legacyRef || '',
    severity: input.severity,
    reason: input.reason,
    currentValue: input.currentValue,
    incomingValue: input.incomingValue,
    recommendedAction: input.recommendedAction,
    dryRun: input.dryRun,
    resolutionStatus: existing.exists ? existing.data()?.resolutionStatus || 'OPEN' : 'OPEN',
    firstSeenAt: existing.exists ? existing.data()?.firstSeenAt : admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }), { merge: true });
};

const titleCase = (value: string): string => {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.length <= 3 && part === part.toUpperCase()
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const cleanEmail = (value: string): string => value.trim().toLowerCase();

type InterpreterResolution = {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  matchMethod: 'sourceRecordId' | 'airtableRecordIds' | 'userEmail' | 'profileEmail' | 'exactName' | 'normalizedName';
  matchConfidence: number;
  ambiguousCandidates?: string[];
};

const toInterpreterResolution = (
  id: string,
  profile: admin.firestore.DocumentData | undefined,
  fallback: { name: string; email: string },
  matchMethod: InterpreterResolution['matchMethod'],
  matchConfidence: number
): InterpreterResolution => ({
  id,
  name: profile?.name || fallback.name,
  email: profile?.email || fallback.email,
  photoUrl: profile?.photoUrl || '',
  matchMethod,
  matchConfidence
});

const resolveInterpreter = async (email: string, name: string, airtableRecordId = '') => {
  const normalizedEmail = cleanEmail(email);
  const normalizedName = name.trim();
  const normalizedNameKey = normalizeForMatch(normalizedName);

  if (airtableRecordId) {
    const bySource = await db.collection('interpreters')
      .where('sourceRecordId', '==', airtableRecordId)
      .limit(1)
      .get();
    if (!bySource.empty) {
      const profile = bySource.docs[0].data();
      return toInterpreterResolution(bySource.docs[0].id, profile, { name: normalizedName, email: normalizedEmail }, 'sourceRecordId', 100);
    }

    const byLinkedRecord = await db.collection('interpreters')
      .where('airtableRecordIds', 'array-contains', airtableRecordId)
      .limit(1)
      .get();
    if (!byLinkedRecord.empty) {
      const profile = byLinkedRecord.docs[0].data();
      return toInterpreterResolution(byLinkedRecord.docs[0].id, profile, { name: normalizedName, email: normalizedEmail }, 'airtableRecordIds', 98);
    }
  }

  if (normalizedEmail) {
    const userByEmail = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!userByEmail.empty) {
      const user = userByEmail.docs[0].data();
      if (user.profileId) {
        const profile = await db.collection('interpreters').doc(user.profileId).get();
        return toInterpreterResolution(user.profileId, profile.data(), { name: user.displayName || name, email: user.email || normalizedEmail }, 'userEmail', 96);
      }
    }

    const interpreterByEmail = await db.collection('interpreters')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!interpreterByEmail.empty) {
      const profile = interpreterByEmail.docs[0].data();
      return toInterpreterResolution(interpreterByEmail.docs[0].id, profile, { name, email: normalizedEmail }, 'profileEmail', 94);
    }
  }

  if (normalizedName) {
    const interpreterByName = await db.collection('interpreters')
      .where('name', '==', normalizedName)
      .limit(2)
      .get();
    if (interpreterByName.size === 1) {
      const profile = interpreterByName.docs[0].data();
      return toInterpreterResolution(interpreterByName.docs[0].id, profile, { name: normalizedName, email: normalizedEmail }, 'exactName', 82);
    }
    if (interpreterByName.size > 1) {
      return {
        id: '',
        name: normalizedName,
        email: normalizedEmail,
        photoUrl: '',
        matchMethod: 'exactName',
        matchConfidence: 0,
        ambiguousCandidates: interpreterByName.docs.map(doc => doc.id)
      };
    }

    const interpreterByNormalizedName = await db.collection('interpreters')
      .where('normalizedName', '==', normalizedNameKey)
      .limit(2)
      .get();
    if (interpreterByNormalizedName.size === 1) {
      const profile = interpreterByNormalizedName.docs[0].data();
      return toInterpreterResolution(interpreterByNormalizedName.docs[0].id, profile, { name: normalizedName, email: normalizedEmail }, 'normalizedName', 74);
    }
    if (interpreterByNormalizedName.size > 1) {
      return {
        id: '',
        name: normalizedName,
        email: normalizedEmail,
        photoUrl: '',
        matchMethod: 'normalizedName',
        matchConfidence: 0,
        ambiguousCandidates: interpreterByNormalizedName.docs.map(doc => doc.id)
      };
    }
  }

  return null;
};

const interpreterCache = new Map<string, Promise<{
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  matchMethod?: string;
  matchConfidence?: number;
  ambiguousCandidates?: string[];
} | null>>();

const resolveInterpreterCached = async (email: string, name: string, airtableRecordId = '') => {
  const key = `${airtableRecordId}|${cleanEmail(email)}|${name.trim().toLowerCase()}`;
  if (!interpreterCache.has(key)) {
    interpreterCache.set(key, resolveInterpreter(email, name, airtableRecordId));
  }
  return interpreterCache.get(key)!;
};

const slugify = (value: string): string => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'unknown';
};

const normalizeForMatch = (value: string): string => {
  return normalize(value)
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|plc|nhs|trust|cic|llp|department|dept|service|services)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

const uniqueValues = (...values: Array<string | undefined | null>): string[] => {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
};

const pickClientIdentity = (fields: Record<string, unknown>) => {
  const companyName = pick(fields, [
    'Name',
    'Agency, institution or company',
    'Agency, institution or company  ',
    'Web Client',
    'Client',
    'Organisation',
    'Organization'
  ]) || 'Airtable Client';
  const bookingAgent = pick(fields, ['Booking Agent', 'Requester', 'Requested By', 'TR Requested By', 'Contact Name']);
  const email = cleanEmail(pick(fields, [
    'BA email',
    'Booking Email',
    'invoice email',
    'Invoicing email',
    'TR client email',
    'Web Clients email',
    'Email'
  ]));
  const phone = pick(fields, [
    'BA telephone',
    'Booking phone contact number',
    'invoice phone',
    'Web Clients phone',
    'Phone'
  ]);
  const billingAddress = pick(fields, [
    'BA Address',
    'Invoice address',
    'Invoicing address',
    'BA PCode',
    'Address'
  ]);
  const uniqueClientKey = pick(fields, ['Unique Client Key', 'Sage Account Ref', 'Sage ref', 'Client Key']);
  const sageAccountRef = pick(fields, ['Sage Account Ref', 'Sage ref', 'Sage Code', 'SAGE Account']);
  const invoiceContact = pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact']);
  const invoiceEmail = cleanEmail(pick(fields, ['invoice email', 'Invoicing email', 'Accounts email', 'Finance email']));
  const invoicePhone = pick(fields, ['invoice phone', 'Invoicing phone', 'Accounts phone', 'Finance phone']);
  const departmentName = pick(fields, ['Department', 'Dept', 'Ward', 'Service', 'Client Department']);
  const locationName = pick(fields, ['Location', 'Site', 'Hospital', 'Venue']);
  const normalizedCompanyName = normalizeForMatch(companyName);

  return {
    companyName,
    normalizedCompanyName,
    bookingAgent,
    email,
    phone,
    billingAddress,
    uniqueClientKey,
    sageAccountRef,
    invoiceContact,
    invoiceEmail,
    invoicePhone,
    departmentName,
    locationName,
    clientStatus: pick(fields, ['Client Status', 'Client Category', 'Status']),
    clientTrade: pick(fields, ['Client trade', 'Client Category'])
  };
};

const resolveClient = async (
  source: {
    clientName: string;
    uniqueClientKey: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    location: string;
    sageAccountRef?: string;
    invoiceEmail?: string;
    invoiceContact?: string;
    normalizedCompanyName?: string;
  },
  dryRun: boolean
) => {
  const sourceKey = slugify(source.uniqueClientKey || source.clientName);
  const clientId = `airtable_client_${sourceKey}`;
  const existingById = await db.collection('clients').doc(clientId).get();
  if (existingById.exists) {
    return { id: existingById.id, action: 'matched', created: false };
  }

  if (source.contactEmail) {
    const byEmail = await db.collection('clients')
      .where('email', '==', source.contactEmail)
      .limit(1)
      .get();
    if (!byEmail.empty) {
      if (!dryRun) {
        await byEmail.docs[0].ref.set({
          sourceSystem: 'AIRTABLE',
          sourceKey,
          airtableClientKey: source.uniqueClientKey || source.clientName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      return { id: byEmail.docs[0].id, action: 'matched-email', created: false };
    }
  }

  if (source.invoiceEmail && source.invoiceEmail !== source.contactEmail) {
    const byInvoiceEmail = await db.collection('clients')
      .where('invoiceEmail', '==', source.invoiceEmail)
      .limit(1)
      .get();
    if (!byInvoiceEmail.empty) {
      if (!dryRun) {
        await byInvoiceEmail.docs[0].ref.set({
          sourceSystem: 'AIRTABLE',
          sourceKey,
          airtableClientKey: source.uniqueClientKey || source.clientName,
          sageAccountRef: source.sageAccountRef || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      return { id: byInvoiceEmail.docs[0].id, action: 'matched-invoice-email', created: false };
    }
  }

  if (source.sageAccountRef) {
    const bySage = await db.collection('clients')
      .where('sageAccountRef', '==', source.sageAccountRef)
      .limit(1)
      .get();
    if (!bySage.empty) return { id: bySage.docs[0].id, action: 'matched-sage', created: false };
  }

  const clientData = {
    id: clientId,
    organizationId: 'lingland-main',
    companyName: source.clientName,
    contactPerson: source.contactName || source.clientName,
    email: source.contactEmail || '',
    phone: source.contactPhone || '',
    status: 'ACTIVE',
    billingAddress: source.location || 'Address Pending Update',
    paymentTermsDays: 30,
    defaultCostCodeType: 'PO',
    normalizedCompanyName: source.normalizedCompanyName || normalizeForMatch(source.clientName),
    sageAccountRef: source.sageAccountRef || '',
    invoiceContact: source.invoiceContact || '',
    invoiceEmail: source.invoiceEmail || '',
    sourceSystem: 'AIRTABLE',
    sourceKey,
    airtableClientKey: source.uniqueClientKey || source.clientName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (!dryRun) {
    await db.collection('clients').doc(clientId).set(clientData, { merge: true });
  }

  return { id: clientId, action: dryRun ? 'would-create' : 'created', created: true };
};

const clientCache = new Map<string, Promise<{ id: string; action: string; created: boolean }>>();
const bookingByAirtableRecordCache = new Map<string, Promise<admin.firestore.DocumentSnapshot | null>>();

const resolveClientCached = async (
  source: {
    clientName: string;
    uniqueClientKey: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    location: string;
    sageAccountRef?: string;
    invoiceEmail?: string;
    invoiceContact?: string;
    normalizedCompanyName?: string;
  },
  dryRun: boolean
) => {
  const key = `${dryRun ? 'dry' : 'write'}|${slugify(source.uniqueClientKey || source.sageAccountRef || source.clientName)}|${source.contactEmail}|${source.invoiceEmail || ''}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, resolveClient(source, dryRun));
  }
  return clientCache.get(key)!;
};

const findExistingClientRef = async (
  record: AirtableRecord,
  tableName: string,
  identity: ReturnType<typeof pickClientIdentity>
) => {
  const bySource = await db.collection('clients')
    .where('sourceRecordId', '==', record.id)
    .limit(1)
    .get();
  if (!bySource.empty && bySource.docs[0].data().sourceTable === tableName) return bySource.docs[0].ref;

  if (identity.uniqueClientKey || identity.sageAccountRef) {
    for (const key of uniqueValues(identity.uniqueClientKey, identity.sageAccountRef)) {
      const byKey = await db.collection('clients')
        .where('airtableClientKey', '==', key)
        .limit(1)
        .get();
      if (!byKey.empty) return byKey.docs[0].ref;

      const bySage = await db.collection('clients')
        .where('sageAccountRef', '==', key)
        .limit(1)
        .get();
      if (!bySage.empty) return bySage.docs[0].ref;
    }
  }

  for (const email of uniqueValues(identity.email, identity.invoiceEmail)) {
    const byEmail = await db.collection('clients')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (!byEmail.empty) return byEmail.docs[0].ref;

    const byInvoiceEmail = await db.collection('clients')
      .where('invoiceEmail', '==', email)
      .limit(1)
      .get();
    if (!byInvoiceEmail.empty) return byInvoiceEmail.docs[0].ref;
  }

  if (identity.normalizedCompanyName) {
    const byName = await db.collection('clients')
      .where('normalizedCompanyName', '==', identity.normalizedCompanyName)
      .limit(2)
      .get();
    if (byName.size === 1) return byName.docs[0].ref;
  }

  return db.collection('clients').doc(`airtable_client_${slugify(identity.uniqueClientKey || identity.email || identity.companyName || record.id)}`);
};

const mapClientRecord = (record: AirtableRecord, tableName: string) => {
  const fields = record.fields;
  const identity = pickClientIdentity(fields);
  const sourceTracking = buildSourceTracking(
    record,
    tableName,
    identity.uniqueClientKey || identity.sageAccountRef || identity.companyName,
    { tableName, identity }
  );

  return {
    identity,
    client: cleanData({
      organizationId: 'lingland-main',
      companyName: identity.companyName,
      contactPerson: identity.bookingAgent || identity.invoiceContact || identity.companyName,
      email: identity.email || identity.invoiceEmail || '',
      phone: identity.phone,
      status: identity.clientStatus?.toLowerCase().includes('inactive') ? 'SUSPENDED' : 'ACTIVE',
      billingAddress: identity.billingAddress || 'Address Pending Update',
      paymentTermsDays: 30,
      defaultCostCodeType: identity.sageAccountRef ? 'PO' : 'Client Name',
      normalizedCompanyName: identity.normalizedCompanyName,
      ...sourceTracking,
      sourceKey: slugify(identity.uniqueClientKey || identity.email || identity.companyName),
      airtableClientKey: identity.uniqueClientKey || identity.sageAccountRef || identity.companyName,
      sageAccountRef: identity.sageAccountRef,
      bookingContactName: identity.bookingAgent,
      bookingEmail: identity.email,
      bookingPhone: identity.phone,
      invoiceContact: identity.invoiceContact,
      invoiceEmail: identity.invoiceEmail,
      invoicePhone: identity.invoicePhone,
      departmentName: identity.departmentName,
      locationName: identity.locationName,
      accountAliases: uniqueValues(identity.uniqueClientKey, identity.sageAccountRef, identity.companyName, identity.normalizedCompanyName),
      clientTrade: identity.clientTrade,
      airtableCreatedTime: record.createdTime || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
  };
};

const buildBookingLookupCandidates = (value: string): string[] => {
  const normalized = normalize(value);
  if (!normalized) return [];
  return Array.from(new Set([
    normalized,
    parseJobNumber(normalized)
  ].filter(Boolean)));
};

const queryBookingByField = async (field: string, value: string) => {
  const snap = await db.collection('bookings').where(field, '==', value).limit(1).get();
  return snap.empty ? null : snap.docs[0];
};

const getBookingByAirtableRecordId = async (sourceRecordId: string) => {
  const candidates = buildBookingLookupCandidates(sourceRecordId);
  if (!candidates.length) return null;
  const cacheKey = candidates.join('|').toLowerCase();

  if (!bookingByAirtableRecordCache.has(cacheKey)) {
    bookingByAirtableRecordCache.set(cacheKey, (async () => {
      const fields = ['sourceRecordId', 'jobNumber', 'legacyAirtableRef', 'displayRef', 'bookingRef'];
      for (const candidate of candidates) {
        for (const field of fields) {
          const snap = await queryBookingByField(field, candidate);
          if (snap?.exists) return snap;
        }
      }
      return null;
    })());
  }

  return bookingByAirtableRecordCache.get(cacheKey)!;
};

const getBookingsByAirtableRecordIds = async (sourceRecordIds: string[]) => {
  const uniqueIds = Array.from(new Set(sourceRecordIds.flatMap(buildBookingLookupCandidates)));
  const snaps = await Promise.all(uniqueIds.map(id => getBookingByAirtableRecordId(id)));
  const seen = new Set<string>();
  return snaps.filter((snap): snap is admin.firestore.DocumentSnapshot => {
    if (!snap?.exists || seen.has(snap.id)) return false;
    seen.add(snap.id);
    return true;
  });
};

const preserveStatusIfLocalAhead = (
  existingStatus: string | undefined,
  incomingStatus: string,
  sourceOfTruth: string | undefined
) => {
  if (!existingStatus || sourceOfTruth === 'AIRTABLE') return incomingStatus;
  if (incomingStatus === 'CANCELLED' || incomingStatus === 'PAID') return incomingStatus;
  return (STATUS_RANK[existingStatus] || 0) > (STATUS_RANK[incomingStatus] || 0)
    ? existingStatus
    : incomingStatus;
};

const mapClientInvoiceStatus = (fields: Record<string, unknown>): string => {
  const raw = pick(fields, ['Invocing Status', 'Status', 'Payment Status']);
  const rawLower = raw.toLowerCase();
  if (truthyField(fields, ['Paid']) || rawLower.includes('paid')) return 'PAID';
  if (truthyField(fields, ['Email']) || rawLower.includes('sent') || rawLower.includes('email')) return 'SENT';
  if (rawLower.includes('cancel')) return 'CANCELLED';
  return 'DRAFT';
};

const mapInterpreterInvoiceStatus = (fields: Record<string, unknown>): string => {
  const raw = pick(fields, ['Status', 'Payment Status']).toLowerCase();
  if (raw.includes('paid')) return 'PAID';
  if (raw.includes('reject')) return 'REJECTED';
  if (raw.includes('approv')) return 'APPROVED';
  return 'SUBMITTED';
};

const dateOnly = (value: unknown): string => {
  const normalizedValue = normalize(value);
  const parsed = normalizedValue ? new Date(normalizedValue) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
};

const summarizeInvoiceLine = (
  booking: admin.firestore.DocumentSnapshot | null,
  fallbackJob: string,
  amount: number
) => {
  const bookingData = booking?.data() || {};
  const units = Math.max(Number(bookingData.durationMinutes || 60) / 60, 1);
  return {
    bookingId: booking?.id || '',
    timesheetId: '',
    description: `Airtable REDBOOK job ${bookingData.jobNumber || bookingData.displayRef || fallbackJob || booking?.id || 'unknown'}`,
    units,
    rate: units > 0 ? Number((amount / units).toFixed(2)) : amount,
    lineAmount: amount,
    total: amount,
    sourceSystem: 'AIRTABLE',
    source: 'redbook_finance_sync'
  };
};

const getMirroredTimesheetId = (bookingId: string) => `airtable_timesheet_${bookingId}`;

const getBookingDateTime = (booking: Record<string, unknown>) => {
  const date = normalize(booking.date) || new Date().toISOString().split('T')[0];
  const startTime = normalize(booking.startTime) || '09:00';
  const durationMinutes = safeNumber(booking.durationMinutes) || 60;
  const actualStart = `${date}T${startTime.length === 5 ? `${startTime}:00` : startTime}`;
  const parsedStart = new Date(actualStart);
  const startIso = Number.isNaN(parsedStart.getTime()) ? new Date().toISOString() : parsedStart.toISOString();
  const actualEnd = new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString();
  return { actualStart: startIso, actualEnd, durationMinutes };
};

const shouldMirrorTimesheet = (booking: Record<string, unknown>) => {
  const status = normalize(booking.status);
  const signals = booking.airtableStatusSignals as Record<string, unknown> | undefined;
  return (STATUS_RANK[status] || 0) >= STATUS_RANK.TIMESHEET_SUBMITTED
    || Boolean(signals?.timesheetReceived)
    || Boolean(signals?.verified)
    || Boolean(signals?.completed)
    || Boolean(signals?.hasClientInvoice)
    || Boolean(signals?.hasInterpreterInvoice)
    || Boolean(signals?.invoiceNumber)
    || Boolean(signals?.paid);
};

const mirroredTimesheetStatus = (booking: Record<string, unknown>) => {
  const status = normalize(booking.status);
  if ((STATUS_RANK[status] || 0) >= STATUS_RANK.INVOICED) return 'INVOICED';
  if ((STATUS_RANK[status] || 0) >= STATUS_RANK.READY_FOR_INVOICE) return 'APPROVED';
  return 'SUBMITTED';
};

const mirroredAssignmentStatus = (booking: Record<string, unknown>) => {
  const status = normalize(booking.status);
  if (status === 'CANCELLED') return 'REMOVED';
  if ((STATUS_RANK[status] || 0) >= STATUS_RANK.BOOKED) return 'ACCEPTED';
  return 'OFFERED';
};

const predictWorkflowArtifacts = (booking: Record<string, unknown>) => {
  const hasAssignment = Boolean(normalize(booking.interpreterId));
  const hasTimesheet = shouldMirrorTimesheet(booking) && Boolean(normalize(booking.interpreterId)) && Boolean(normalize(booking.clientId));
  return {
    assignment: hasAssignment ? mirroredAssignmentStatus(booking) : '',
    timesheet: hasTimesheet ? mirroredTimesheetStatus(booking) : '',
    events: [
      hasAssignment ? 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE' : '',
      hasTimesheet ? 'TIMESHEET_MIRRORED_FROM_AIRTABLE' : ''
    ].filter(Boolean)
  };
};

const setMirroredJobEvent = (
  batch: admin.firestore.WriteBatch,
  bookingId: string,
  booking: Record<string, unknown>,
  type: string,
  description: string,
  metadata: Record<string, unknown> = {}
) => {
  const eventId = `airtable_${bookingId}_${type.toLowerCase()}`;
  batch.set(db.collection('jobEvents').doc(eventId), cleanData({
    jobId: bookingId,
    organizationId: normalize(booking.organizationId) || 'lingland-main',
    type,
    source: 'airtable',
    description,
    metadata: cleanData({
      ...metadata,
      sourceRecordId: booking.sourceRecordId,
      sourceTable: booking.sourceTable,
      mirroredFromAirtable: true
    }),
    createdAt: normalize(booking.lastSyncedAt) || new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }), { merge: true });
};

const mirrorAssignmentArtifact = (
  batch: admin.firestore.WriteBatch,
  bookingId: string,
  booking: Record<string, unknown>
) => {
  const interpreterId = normalize(booking.interpreterId);
  if (!interpreterId) return '';
  const status = mirroredAssignmentStatus(booking);
  const now = new Date().toISOString();
  const assignmentId = `airtable_assignment_${bookingId}_${interpreterId}`;
  batch.set(db.collection(ASSIGNMENTS_COLLECTION).doc(assignmentId), cleanData({
    id: assignmentId,
    bookingId,
    interpreterId,
    status,
    offeredAt: normalize(booking.lastSyncedAt) || now,
    respondedAt: status === 'ACCEPTED' || status === 'REMOVED' ? (normalize(booking.lastSyncedAt) || now) : undefined,
    assignmentType: 'AIRTABLE_MIRROR',
    recordedByStaff: true,
    sourceSystem: 'AIRTABLE',
    sourceRecordId: booking.sourceRecordId,
    bookingSnapshot: {
      id: bookingId,
      jobNumber: booking.jobNumber,
      displayRef: booking.displayRef,
      clientName: booking.clientName,
      date: booking.date,
      startTime: booking.startTime,
      languageFrom: booking.languageFrom,
      languageTo: booking.languageTo,
      locationType: booking.locationType,
      status: booking.status
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }), { merge: true });

  setMirroredJobEvent(
    batch,
    bookingId,
    booking,
    status === 'ACCEPTED' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE',
    status === 'ACCEPTED'
      ? 'Interpreter acceptance was mirrored from Airtable.'
      : 'Interpreter assignment was mirrored from Airtable.',
    { interpreterId, assignmentId, assignmentStatus: status }
  );
  return status;
};

const mirrorTimesheetArtifact = (
  batch: admin.firestore.WriteBatch,
  bookingId: string,
  booking: Record<string, unknown>
) => {
  const interpreterId = normalize(booking.interpreterId);
  const clientId = normalize(booking.clientId);
  if (!shouldMirrorTimesheet(booking) || !interpreterId || !clientId) return '';

  const timesheetId = getMirroredTimesheetId(bookingId);
  const { actualStart, actualEnd, durationMinutes } = getBookingDateTime(booking);
  const durationHours = Math.max(durationMinutes / 60, 1);
  const serviceCategory = normalize(booking.serviceCategory);
  const wordCount = safeNumber(booking.wordCount);
  const units = serviceCategory === 'TRANSLATION' ? (wordCount || safeNumber(booking.numberOfDocs) || 1) : durationHours;
  const status = mirroredTimesheetStatus(booking);
  const approved = status === 'APPROVED' || status === 'INVOICED';

  batch.set(db.collection('timesheets').doc(timesheetId), cleanData({
    id: timesheetId,
    bookingId,
    jobId: bookingId,
    interpreterId,
    interpreterName: booking.interpreterName,
    clientId,
    clientName: booking.clientName,
    organizationId: normalize(booking.organizationId) || 'lingland-main',
    status,
    submittedAt: normalize(booking.lastSyncedAt) || new Date().toISOString(),
    actualStart,
    actualEnd,
    sessionDurationMinutes: durationMinutes,
    breakDurationMinutes: 0,
    units: serviceCategory === 'TRANSLATION' ? 'words' : 'hours',
    wordCount,
    numberOfDocs: safeNumber(booking.numberOfDocs),
    adminApproved: approved,
    adminApprovedAt: approved ? (normalize(booking.lastSyncedAt) || new Date().toISOString()) : undefined,
    readyForClientInvoice: approved,
    readyForInterpreterInvoice: approved,
    unitsBillableToClient: units,
    unitsPayableToInterpreter: units,
    clientAmountCalculated: safeNumber(booking.totalAmount) || safeNumber(booking.finalQuote),
    interpreterAmountCalculated: safeNumber(booking.interpreterInvoiceTotal),
    totalToPay: safeNumber(booking.interpreterInvoiceTotal),
    clientInvoiceId: booking.clientInvoiceId || null,
    interpreterInvoiceId: booking.interpreterInvoiceId || null,
    sourceSystem: 'AIRTABLE',
    sourceRecordId: booking.sourceRecordId,
    sourceTable: booking.sourceTable,
    importedFromAirtable: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }), { merge: true });

  setMirroredJobEvent(
    batch,
    bookingId,
    booking,
    status === 'APPROVED' || status === 'INVOICED' ? 'TIMESHEET_VERIFIED' : 'TIMESHEET_SUBMITTED',
    status === 'APPROVED' || status === 'INVOICED'
      ? 'Timesheet verification was mirrored from Airtable.'
      : 'Timesheet receipt was mirrored from Airtable.',
    { timesheetId, timesheetStatus: status }
  );
  return status;
};

const mirrorWorkflowArtifacts = async (
  bookingRef: admin.firestore.DocumentReference,
  booking: Record<string, unknown>
) => {
  const batch = db.batch();
  const assignment = mirrorAssignmentArtifact(batch, bookingRef.id, booking);
  const timesheet = mirrorTimesheetArtifact(batch, bookingRef.id, booking);
  const events = [
    assignment ? 'ASSIGNMENT_MIRRORED_FROM_AIRTABLE' : '',
    timesheet ? 'TIMESHEET_MIRRORED_FROM_AIRTABLE' : ''
  ].filter(Boolean);
  if (!assignment && !timesheet) return { assignment, timesheet, events };
  await batch.commit();
  return { assignment, timesheet, events };
};

const getPlatformMode = async () => {
  const settings = await db.collection('system').doc('settings').get();
  return settings.data()?.platformMode || {};
};

const assertAdmin = async (context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
  }

  const user = await db.collection('users').doc(context.auth.uid).get();
  const role = user.data()?.role;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can sync REDBOOK.');
  }
};

const normalizeSyncStrategy = (value: unknown): AirtableSyncStrategy => {
  const normalized = normalize(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if ([
    'OPEN_WORKFLOW',
    'UPDATED_SINCE_LAST_SYNC',
    'RECENT_OPEN',
    'FULL_AUDIT',
    'CUSTOM_LIMIT'
  ].includes(normalized)) {
    return normalized as AirtableSyncStrategy;
  }
  return DEFAULT_SYNC_STRATEGY;
};

const effectiveLimitForStrategy = (strategy: AirtableSyncStrategy, requestedLimit: number) => {
  if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT') return Math.min(Math.max(requestedLimit || 500, 1), 5000);
  if (strategy === 'UPDATED_SINCE_LAST_SYNC') return Math.min(Math.max(requestedLimit || 1000, 1), 3000);
  if (strategy === 'RECENT_OPEN') return Math.min(Math.max(requestedLimit || 1500, 1), 3000);
  return Math.min(Math.max(requestedLimit || 5000, 1), 5000);
};

const getLastSyncIso = async () => {
  const syncCenter = await db.collection('system').doc('airtableSyncCenter').get();
  const legacy = await db.collection('system').doc('airtableRedbookSync').get();
  return normalize(syncCenter.data()?.lastRunAt) || normalize(legacy.data()?.lastRunAt) || '';
};

const airtableDateLiteral = (iso: string) => iso.replace(/"/g, '');

const buildAirtableFormula = (strategy: AirtableSyncStrategy, tableName: string, lastSyncIso = '') => {
  if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT') return undefined;

  const statusOpenFormula = `NOT(REGEX_MATCH(LOWER({Status} & ''), 'paid|cancelled|canceled'))`;
  const updatedFormula = lastSyncIso
    ? `IS_AFTER(LAST_MODIFIED_TIME(), DATETIME_PARSE("${airtableDateLiteral(lastSyncIso)}"))`
    : '';
  const recentFormula = `IS_AFTER(CREATED_TIME(), DATEADD(TODAY(), -60, 'days'))`;

  if (strategy === 'UPDATED_SINCE_LAST_SYNC') {
    return updatedFormula || recentFormula;
  }

  const isWorkflowTable = [
    DEFAULT_TABLE_NAME,
    process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME,
    TRANSLATIONS_TABLE,
    WEB_TRANSLATIONS_TABLE
  ].includes(tableName);

  if (strategy === 'RECENT_OPEN') {
    return isWorkflowTable
      ? `OR(${statusOpenFormula}, ${updatedFormula || recentFormula}, ${recentFormula})`
      : `OR(${updatedFormula || recentFormula}, ${recentFormula})`;
  }

  return isWorkflowTable
    ? `OR(${statusOpenFormula}, ${updatedFormula || recentFormula})`
    : (updatedFormula || undefined);
};

const FINANCIALLY_OPEN_STATUSES = [
  'INCOMING',
  'NEEDS_ASSIGNMENT',
  'ASSIGNMENT_PENDING',
  'OPENED',
  'QUOTE_PENDING',
  'BOOKED',
  'SESSION_COMPLETED',
  'TIMESHEET_SUBMITTED',
  'TIMESHEET_VERIFIED',
  'READY_FOR_INVOICE',
  'INVOICING',
  'INVOICED',
  'ADMIN',
  'ADMIN_HOLD'
];

const isTerminalStableStatus = (status: unknown) => ['PAID', 'CANCELLED'].includes(normalize(status).toUpperCase());

const getWorkflowSourceRecordIds = async (strategy: AirtableSyncStrategy) => {
  if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT') return new Set<string>();

  const ids = new Set<string>();
  await Promise.all(FINANCIALLY_OPEN_STATUSES.map(async status => {
    const snap = await db.collection('bookings')
      .where('sourceSystem', '==', 'AIRTABLE')
      .where('status', '==', status)
      .limit(750)
      .get();
    snap.docs.forEach(doc => {
      const sourceRecordId = normalize(doc.data().sourceRecordId);
      if (sourceRecordId) ids.add(sourceRecordId);
    });
  }));

  return ids;
};

const getFinanceLinkedSourceIds = (record: AirtableRecord, tableName: string) => {
  const fields = record.fields;
  if (tableName === CLIENT_INVOICES_TABLE) {
    return pickLinkedIds(fields, ['Job Number from redbook', 'ðŸ–¥ï¸ REDBOOK', 'Redbook ID (from Job Number from redbook)']);
  }
  if (tableName === INTERPRETER_INVOICES_TABLE) {
    return pickLinkedIds(fields, ['ðŸ–¥ï¸ REDBOOK', 'Redbook ID (from ðŸ–¥ï¸ REDBOOK)']);
  }
  if (tableName === TRANSLATION_CLIENT_INVOICES_TABLE || tableName === TRANSLATOR_INVOICES_TABLE) {
    return pickLinkedIds(fields, ['Translations', 'TR NUMBER (from Translations)', 'TR ID']);
  }
  return [];
};

const filterFinanceRecordsForWorkflow = (
  records: AirtableRecord[],
  tableName: string,
  workflowSourceRecordIds: Set<string>,
  strategy: AirtableSyncStrategy
) => {
  if (strategy === 'FULL_AUDIT' || strategy === 'CUSTOM_LIMIT' || workflowSourceRecordIds.size === 0) {
    return { records, dropped: 0, filterActive: false };
  }

  const filtered = records.filter(record => {
    const linkedIds = getFinanceLinkedSourceIds(record, tableName);
    return linkedIds.length === 0 || linkedIds.some(id => workflowSourceRecordIds.has(id));
  });

  return {
    records: filtered,
    dropped: records.length - filtered.length,
    filterActive: true
  };
};

const fetchAirtableRecordBatch = async (
  limitRecords: number,
  tableName = DEFAULT_TABLE_NAME,
  startOffset = '',
  options: AirtableFetchOptions = {}
) => {
  const apiKey = (process.env.AIRTABLE_API_KEY || '').trim();
  const baseId = process.env.AIRTABLE_REDBOOK_BASE_ID || DEFAULT_BASE_ID;
  const resolvedTableName = tableName === DEFAULT_TABLE_NAME
    ? (process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME)
    : tableName;

  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AIRTABLE_API_KEY secret is not configured.');
  }

  const records: AirtableRecord[] = [];
  let offset = startOffset;
  let appliedFormula = options.filterByFormula || '';

  do {
    const params: Record<string, string | number> = {
      pageSize: Math.min(100, Math.max(limitRecords - records.length, 1))
    };
    if (offset) params.offset = offset;
    if (appliedFormula) params.filterByFormula = appliedFormula;

    let response: { data: { records: AirtableRecord[]; offset?: string } } | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await axios.get<{ records: AirtableRecord[]; offset?: string }>(
          `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(resolvedTableName)}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            params,
            timeout: 30000
          }
        );
        break;
      } catch (error) {
        const isFinalAttempt = attempt === 3;
        console.warn(`[REDBOOK Sync] Airtable fetch failed for ${resolvedTableName} attempt ${attempt}.`);
        if (appliedFormula && attempt === 1) {
          console.warn(`[REDBOOK Sync] Formula filter rejected or unavailable for ${resolvedTableName}; retrying without server-side filter.`);
          delete params.filterByFormula;
          appliedFormula = '';
        }
        if (isFinalAttempt) {
          throw new functions.https.HttpsError(
            'deadline-exceeded',
            `Airtable did not respond in time while fetching ${resolvedTableName}. Please retry the sync.`
          );
        }
        await new Promise(resolve => setTimeout(resolve, attempt * 750));
      }
    }

    if (!response) {
      throw new functions.https.HttpsError('internal', `Airtable fetch failed for ${resolvedTableName}.`);
    }

    records.push(...response.data.records);
    offset = response.data.offset || '';
  } while (offset && records.length < limitRecords);

  return {
    records: records.slice(0, limitRecords),
    nextOffset: offset,
    tableName: resolvedTableName,
    filterByFormula: appliedFormula,
    strategy: options.strategy || DEFAULT_SYNC_STRATEGY
  };
};

const fetchAirtableRecords = async (limitRecords: number, tableName = DEFAULT_TABLE_NAME) => {
  const batch = await fetchAirtableRecordBatch(limitRecords, tableName);
  return batch.records;
};

const findExistingBooking = async (record: AirtableRecord, jobNumber: string, legacyRef: string) => {
  const bySource = await db.collection('bookings')
    .where('sourceRecordId', '==', record.id)
    .limit(1)
    .get();
  if (!bySource.empty && bySource.docs[0].data().sourceSystem === 'AIRTABLE') return bySource.docs[0].ref;

  if (legacyRef) {
    const byLegacy = await db.collection('bookings').where('legacyAirtableRef', '==', legacyRef).limit(1).get();
    if (!byLegacy.empty) return byLegacy.docs[0].ref;
  }

  if (jobNumber) {
    const byJob = await db.collection('bookings').where('jobNumber', '==', jobNumber).limit(1).get();
    if (!byJob.empty) return byJob.docs[0].ref;
  }

  return db.collection('bookings').doc(`airtable_${record.id}`);
};

const mapRecordToBooking = async (record: AirtableRecord) => {
  const fields = record.fields;
  const legacyRef = pick(fields, ['Job Number', 'Job Number / Language', 'Job ID', 'Reference', 'Booking Ref', 'REDBOOK ID']);
  const jobNumber = parseJobNumber(legacyRef) || `AIRTABLE-${record.id}`;
  const languageTo = parseLanguageTo(fields, legacyRef);
  const schedule = parseDateTime(fields);
  const sessionType = pick(fields, ['Session Type', 'Type', 'Method', 'Service Mode']);
  const location = pick(fields, ['Session Location', 'Location', 'Address', 'Venue']);
  const patientName = pick(fields, ['Name of your client', 'Patient Name', 'Client Name', 'Service User']);
  const uniqueClientKey = pick(fields, ['Unique Client Key']);
  const agency = pick(fields, ['Agency, institution or company  ', 'Agency, institution or company', 'Organisation / Department', 'Organisation', 'Organization', 'Department']);
  const clientName = agency || (uniqueClientKey ? titleCase(uniqueClientKey) : '') || patientName || 'Airtable Client';
  const bookingAgent = pick(fields, ['Booking Agent', 'Booking By', 'Requester', 'Requested By']);
  const caseworker = pick(fields, ['Name of Caseworker', 'Caseworker', 'Professional', 'Contact Name']);
  const contactName = bookingAgent || caseworker || patientName || clientName;
  const contactEmail = cleanEmail(pick(fields, ['Booking Email', 'Contact Email', 'Email', 'Requester Email']));
  const contactPhone = pick(fields, ['Booking phone contact number', 'Contact Phone', 'Phone']);
  const interpreterName = pick(fields, ['full name', 'NAME MASTER (from assign to)', 'Interpreter', 'Interpreter Name', 'Assigned Interpreter']);
  const interpreterEmail = cleanEmail(pick(fields, ['INT EMAIL', 'EMAIL (from assign to)', 'Interpreter Email']));
  const interpreterPhone = pick(fields, ['PHONE (from assign to)', 'Interpreter Phone']);
  const interpreterAirtableRecordId = pick(fields, ['assign to']);
  const resolvedInterpreter = await resolveInterpreterCached(interpreterEmail, interpreterName, interpreterAirtableRecordId);
  const statusMapping = mapStatus(fields, Boolean(resolvedInterpreter?.id || interpreterName || interpreterEmail || interpreterAirtableRecordId));

  const sourceSnapshot = {
    legacyRef,
    jobNumber,
      clientName,
      patientName,
      uniqueClientKey,
      contactName,
      bookingAgent,
      caseworker,
    professionalName: contactName,
    contactEmail,
    contactPhone,
    languageFrom: pick(fields, ['Language From', 'Source Language']) || 'English',
    languageTo,
    date: schedule.date,
    startTime: schedule.startTime,
    durationMinutes: parseDuration(pick(fields, ['Duration', 'Duration Minutes', 'Length'])),
    sessionType,
    location,
    postcode: pick(fields, ['Postcode', 'Post Code', 'ZIP']),
    onlineLink: pick(fields, ['Online Link', 'Video Link', 'Meeting Link']),
    costCode: pick(fields, ['Cost Code', 'Cost Code...', 'PO', 'Purchase Order']),
    notes: pick(fields, ['Notes', 'Special Instructions', 'Comments']),
    status: statusMapping.status,
    statusRaw: statusMapping.rawStatus,
    interpreterName,
    interpreterEmail,
    interpreterPhone,
    interpreterAirtableRecordId,
    interpreterResolved: Boolean(resolvedInterpreter?.id),
    interpreterMatchMethod: resolvedInterpreter?.matchMethod || '',
    interpreterMatchConfidence: resolvedInterpreter?.matchConfidence || 0,
    interpreterAmbiguousCandidates: resolvedInterpreter?.ambiguousCandidates || []
  };

  const sourceTracking = buildSourceTracking(record, DEFAULT_TABLE_NAME, legacyRef || sourceSnapshot.jobNumber, sourceSnapshot);

  return {
    booking: {
      clientId: '',
      clientName: sourceSnapshot.clientName,
      requestedByUserId: '',
      organizationId: 'lingland-main',
      serviceCategory: 'INTERPRETATION',
      serviceType: 'Interpreting',
      languageFrom: sourceSnapshot.languageFrom,
      languageTo: sourceSnapshot.languageTo,
      date: sourceSnapshot.date,
      startTime: sourceSnapshot.startTime,
      durationMinutes: sourceSnapshot.durationMinutes,
      locationType: mapLocationType(sourceSnapshot.sessionType, sourceSnapshot.location),
      location: sourceSnapshot.location,
      address: sourceSnapshot.location,
      postcode: sourceSnapshot.postcode,
      onlineLink: sourceSnapshot.onlineLink,
      status: sourceSnapshot.status,
      costCode: sourceSnapshot.costCode,
      notes: sourceSnapshot.notes,
      professionalName: sourceSnapshot.professionalName,
      patientName: sourceSnapshot.patientName,
      interpreterId: resolvedInterpreter?.id || '',
      interpreterName: resolvedInterpreter?.name || sourceSnapshot.interpreterName,
      interpreterPhotoUrl: resolvedInterpreter?.photoUrl || '',
      interpreterEmail: resolvedInterpreter?.email || sourceSnapshot.interpreterEmail,
      interpreterAirtableRecordId: sourceSnapshot.interpreterAirtableRecordId,
      bookingRef: sourceSnapshot.jobNumber,
      jobNumber: sourceSnapshot.jobNumber,
      displayRef: legacyRef || sourceSnapshot.jobNumber,
      legacyAirtableRef: legacyRef || sourceSnapshot.jobNumber,
      ...sourceTracking,
      airtableCreatedTime: record.createdTime || '',
      airtableOperationalStatus: statusMapping.rawStatus,
      airtableFinancialStatus: statusMapping.signals.invoiceStatus,
      airtableStatusSignals: statusMapping.signals,
      sourceStatusRaw: statusMapping.rawStatus,
      statusMappedAt: statusMapping.statusMappedAt,
      statusMappingState: statusMapping.state,
      assignmentState: statusMapping.state.assignmentState,
      timesheetState: statusMapping.state.timesheetState,
      billingState: statusMapping.state.billingState,
      cancellationState: statusMapping.state.cancellationState,
      guestContact: sourceSnapshot.contactEmail ? {
        name: sourceSnapshot.contactName,
        organisation: sourceSnapshot.clientName,
        email: sourceSnapshot.contactEmail,
        phone: sourceSnapshot.contactPhone
      } : undefined,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    sourceSnapshot
  };
};

const mapTranslationStatus = (fields: Record<string, unknown>, hasTranslator: boolean) => {
  const rawStatus = pick(fields, ['TR Status', 'Status', 'Translation Status']);
  const normalized = rawStatus.toLowerCase();
  const explicitStatus = TRANSLATION_STATUS_MAP[canonicalAirtableStatus(rawStatus)];
  const completed = truthyField(fields, ['COMPLETED', 'TR Verified']) || normalized.includes('complete') || normalized.includes('verified');
  const delivered = truthyField(fields, ['Delivered', 'Delivery sent', 'Sent to client']) || normalized.includes('delivered') || normalized.includes('sent');
  const invoiceNumber = pick(fields, ['Invoice No', 'INVOICE NO/DATE', 'TR Invoice Nbr']);
  const paid = truthyField(fields, ['Invoice Paid', 'TR barbara paid']) || normalized.includes('paid');
  const quoteRequested = truthyField(fields, ['Needs quote?']) || normalized.includes('quote');

  let status = explicitStatus || 'INCOMING';
  if (explicitStatus) status = explicitStatus;
  else if (normalized.includes('cancel')) status = 'CANCELLED';
  else if (paid) status = 'PAID';
  else if (invoiceNumber || normalized.includes('invoice')) status = 'INVOICED';
  else if (completed || delivered) status = 'READY_FOR_INVOICE';
  else if (quoteRequested) status = 'QUOTE_PENDING';
  else if (hasTranslator) status = 'BOOKED';

  const billingState =
    status === 'PAID' ? 'PAID'
      : status === 'INVOICED' ? 'INVOICED'
        : status === 'READY_FOR_INVOICE' ? 'READY_FOR_INVOICE'
          : 'NOT_READY';
  const deliveryState =
    status === 'CANCELLED' ? 'CANCELLED'
      : delivered ? 'DELIVERED'
        : completed ? 'COMPLETED'
          : quoteRequested ? 'QUOTE_PENDING'
            : hasTranslator ? 'IN_PROGRESS'
              : 'NOT_STARTED';
  const state = {
    operationalStatus: status,
    assignmentState: status === 'CANCELLED' ? 'CANCELLED' : hasTranslator ? 'ACCEPTED' : 'UNASSIGNED',
    timesheetState: 'NOT_REQUIRED',
    billingState,
    cancellationState: status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
    deliveryState
  };

  return {
    status,
    rawStatus,
    statusMappedAt: new Date().toISOString(),
    state,
    signals: {
      completed,
      delivered,
      invoiceNumber,
      paid,
      quoteRequested,
      explicitStatusMatched: Boolean(explicitStatus)
    }
  };
};

const parseTranslationLanguages = (rawTargetLanguage: string, rawSourceLanguage: string) => {
  const combined = rawTargetLanguage.match(/^\s*(.+?)\s+(?:to|->|→)\s+(.+?)\s*$/i);
  if (combined) {
    return {
      sourceLanguage: titleCase(combined[1].trim()),
      targetLanguage: titleCase(combined[2].trim())
    };
  }
  return {
    sourceLanguage: rawSourceLanguage || 'English',
    targetLanguage: rawTargetLanguage || 'Unknown'
  };
};

const mapTranslationRecordToBooking = async (record: AirtableRecord, tableName: string) => {
  const fields = record.fields;
  const legacyRef = pick(fields, ['TR NUMBER', 'Web Number', 'TR ID', 'Name', 'Reference']) || `TR-${record.id}`;
  const jobNumber = legacyRef || `TR-${record.id}`;
  const language = pick(fields, ['LANGUAGE', 'web language', 'Language', 'Target Language']) || 'Unknown';
  const sourceLanguageRaw = pick(fields, ['Source Language', 'Language From', 'FROM LANGUAGE']) || 'English';
  const { sourceLanguage, targetLanguage } = parseTranslationLanguages(language, sourceLanguageRaw);
  const clientIdentity = pickClientIdentity(fields);
  const translatorName = pick(fields, ['TRANSLATOR', 'Assign to TR', 'Assign to', 'Interpreters']);
  const translatorEmail = cleanEmail(pick(fields, ['EMAIL (from Assign to TR)', 'EMAIL (from assign to)', 'EMAIL', 'Translator Email']));
  const translatorAirtableRecordId = pick(fields, ['Assign to TR', 'Assign to', 'Interpreters']);
  const resolvedTranslator = await resolveInterpreterCached(translatorEmail, translatorName, translatorAirtableRecordId);
  const statusMapping = mapTranslationStatus(fields, Boolean(resolvedTranslator?.id || translatorName || translatorEmail));
  const createdOrCompleted = pickRaw(fields, ['COMPLETED', 'TR CREATED', 'Created', 'Last Modified']) || record.createdTime;
  const parsedDate = dateOnly(createdOrCompleted);
  const deadline = dateOnly(pickRaw(fields, ['Deadline', 'Delivery Date', 'Due Date', 'TR Deadline', 'Return by', 'Required by']));
  const completedAt = dateOnly(pickRaw(fields, ['COMPLETED', 'TR Verified', 'Completed']));
  const deliveredAt = dateOnly(pickRaw(fields, ['Delivered', 'Delivery sent', 'Sent to client']));
  const wordCount = safeNumber(pickRaw(fields, ['WORD COUNT', 'RTR INV WORDS']));
  const numberOfDocs = safeNumber(pickRaw(fields, ['Number of docs', 'RTR INV DOCS']));
  const finalQuote = safeNumber(pickRaw(fields, ['FINAL QUOTE', 'FQ+VAT', 'OUR FEE']));
  const format = pick(fields, ['Format for client', 'Web Format', 'Other formats']);
  const notes = pick(fields, ['TR Notes', 'Notes', 'RTR INV COMMENTS']);
  const sourceFiles = asArray(pickRaw(fields, ['Document to Translate', 'Documents']))
    .map(mapAirtableAttachment)
    .filter(Boolean);

  const sourceSnapshot = {
    tableName,
    legacyRef,
    jobNumber,
    language: targetLanguage,
    clientIdentity,
    translatorName,
    translatorEmail,
    translatorAirtableRecordId,
    translatorResolved: Boolean(resolvedTranslator?.id),
    translatorMatchMethod: resolvedTranslator?.matchMethod || '',
    translatorMatchConfidence: resolvedTranslator?.matchConfidence || 0,
    translatorAmbiguousCandidates: resolvedTranslator?.ambiguousCandidates || [],
    wordCount,
    numberOfDocs,
    finalQuote,
    format,
    deadline,
    completedAt,
    deliveredAt,
    sourceLanguage,
    notes,
    sourceFiles,
    status: statusMapping.status,
    statusRaw: statusMapping.rawStatus,
    statusMappingState: statusMapping.state
  };
  const sourceTracking = buildSourceTracking(record, tableName, legacyRef, sourceSnapshot);

  return {
    booking: {
      clientId: '',
      clientName: clientIdentity.companyName,
      requestedByUserId: '',
      organizationId: 'lingland-main',
      serviceCategory: 'TRANSLATION',
      serviceType: 'Translation',
      languageFrom: sourceLanguage,
      languageTo: targetLanguage,
      date: (deadline || parsedDate).split('T')[0],
      startTime: '09:00',
      durationMinutes: 0,
      locationType: 'ONLINE',
      location: 'Document delivery',
      status: statusMapping.status,
      costCode: pick(fields, ['TR COST CODE', 'Cost Code']),
      notes,
      professionalName: clientIdentity.bookingAgent || clientIdentity.companyName,
      patientName: pick(fields, ['TR Requested By', 'Web Client']) || clientIdentity.companyName,
      interpreterId: resolvedTranslator?.id || '',
      interpreterName: resolvedTranslator?.name || translatorName,
      interpreterPhotoUrl: resolvedTranslator?.photoUrl || '',
      interpreterEmail: resolvedTranslator?.email || translatorEmail,
      interpreterAirtableRecordId: translatorAirtableRecordId,
      bookingRef: jobNumber,
      jobNumber,
      displayRef: legacyRef,
      legacyAirtableRef: legacyRef,
      ...sourceTracking,
      airtableCreatedTime: record.createdTime || '',
      airtableOperationalStatus: statusMapping.rawStatus,
      airtableFinancialStatus: pick(fields, ['Invoice Paid', 'Status']),
      airtableStatusSignals: statusMapping.signals,
      sourceStatusRaw: statusMapping.rawStatus,
      statusMappedAt: statusMapping.statusMappedAt,
      statusMappingState: statusMapping.state,
      assignmentState: statusMapping.state.assignmentState,
      timesheetState: statusMapping.state.timesheetState,
      billingState: statusMapping.state.billingState,
      cancellationState: statusMapping.state.cancellationState,
      translationFormat: format,
      translationFormatOther: pick(fields, ['Other formats']),
      translationDeadline: deadline,
      translationCompletedAt: completedAt,
      translationDeliveredAt: deliveredAt,
      quoteRequested: statusMapping.signals.quoteRequested,
      sourceFiles,
      deliveryEmail: clientIdentity.email || clientIdentity.invoiceEmail,
      wordCount,
      numberOfDocs,
      finalQuote,
      guestContact: {
        name: clientIdentity.bookingAgent || clientIdentity.companyName,
        organisation: clientIdentity.companyName,
        email: clientIdentity.email || clientIdentity.invoiceEmail || '',
        phone: clientIdentity.phone
      },
      totalAmount: finalQuote,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    sourceSnapshot
  };
};

const cleanData = (data: Record<string, unknown>) => {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
};

const cleanReportData = <T>(data: T): T => JSON.parse(JSON.stringify(data));

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const cleanFirestoreValue = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(cleanFirestoreValue)
      .filter(item => item !== undefined);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, cleanFirestoreValue(child)] as const)
        .filter(([, child]) => child !== undefined)
    );
  }
  return value;
};

const cleanFirestoreData = (data: Record<string, unknown>) => cleanFirestoreValue(data) as Record<string, unknown>;

const pushErrorDetail = (
  details: Array<Record<string, unknown>>,
  detail: Record<string, unknown>,
  limit = MODULE_DETAIL_LIMIT
) => {
  const cleanDetail = cleanReportData(detail);
  if (details.length < limit) {
    details.push(cleanDetail);
    return;
  }
  const firstNonErrorIndex = details.findIndex(item => item.action !== 'error');
  if (firstNonErrorIndex >= 0) {
    details[firstNonErrorIndex] = cleanDetail;
  }
};

const emptyActionStats = () => ({
  created: 0,
  updated: 0,
  skipped: 0,
  conflict: 0,
  error: 0
});

const syncClients = async (
  records: AirtableRecord[],
  tableName: string,
  mode: SyncMode,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];

  for (const record of records) {
    try {
      const mapped = mapClientRecord(record, tableName);
      const clientRef = await findExistingClientRef(record, tableName, mapped.identity);
      const existing = await clientRef.get();
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, mapped.client);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === mapped.client.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (!mode.dryRun && action !== 'skipped') {
        await clientRef.set({
          ...mapped.client,
          id: clientRef.id,
          lastSyncRunId: runId,
          createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: mapped.client.sourceBaseId,
          sourceTable: tableName,
          snapshotHash: mapped.client.snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          clientName: mapped.identity.companyName,
          email: mapped.identity.email || mapped.identity.invoiceEmail,
          clientId: clientRef.id,
          message: action === 'created' && mode.dryRun ? 'Would create client' : undefined
        });
      }
    } catch (error) {
      stats.error += 1;
      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          sourceTable: tableName,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  return { stats, details };
};

const syncTranslationBookings = async (
  records: AirtableRecord[],
  tableName: string,
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];

  for (const record of records) {
    try {
      const mapped = await mapTranslationRecordToBooking(record, tableName) as any;
      if (!mode.dryRun && runId) mapped.booking.lastSyncRunId = runId;
      const clientResolution = await resolveClientCached({
        clientName: mapped.sourceSnapshot.clientIdentity.companyName,
        uniqueClientKey: mapped.sourceSnapshot.clientIdentity.uniqueClientKey || mapped.sourceSnapshot.clientIdentity.sageAccountRef,
        contactName: mapped.sourceSnapshot.clientIdentity.bookingAgent || mapped.sourceSnapshot.clientIdentity.invoiceContact,
        contactEmail: mapped.sourceSnapshot.clientIdentity.email || mapped.sourceSnapshot.clientIdentity.invoiceEmail,
        contactPhone: mapped.sourceSnapshot.clientIdentity.phone,
        location: mapped.sourceSnapshot.clientIdentity.billingAddress,
        sageAccountRef: mapped.sourceSnapshot.clientIdentity.sageAccountRef,
        invoiceEmail: mapped.sourceSnapshot.clientIdentity.invoiceEmail,
        invoiceContact: mapped.sourceSnapshot.clientIdentity.invoiceContact,
        normalizedCompanyName: mapped.sourceSnapshot.clientIdentity.normalizedCompanyName
      }, mode.dryRun);
      mapped.booking.clientId = clientResolution.id;

      let existingRef: admin.firestore.DocumentReference | null = null;
      let existingSnap: admin.firestore.DocumentSnapshot | null = null;
      let existing: admin.firestore.DocumentData | null = null;

      if (mode.dryRun) {
        const bySource = await db.collection('bookings')
          .where('sourceRecordId', '==', record.id)
          .limit(1)
          .get();
        existingSnap = bySource.empty ? null : bySource.docs[0];
        existing = existingSnap?.exists ? existingSnap.data() || null : null;
      } else {
        existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
        existingSnap = await existingRef.get();
        existing = existingSnap.exists ? existingSnap.data() || null : null;
      }

      mapped.booking.status = preserveStatusIfLocalAhead(existing?.status, mapped.booking.status, sourceOfTruth);
      const hasTranslatorSignal = Boolean(
        mapped.sourceSnapshot.translatorName
        || mapped.sourceSnapshot.translatorEmail
        || mapped.sourceSnapshot.translatorAirtableRecordId
      );
      const unresolvedTranslator = hasTranslatorSignal && !mapped.booking.interpreterId;
      if (unresolvedTranslator) {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'booking',
          entityId: existingSnap?.id,
          sourceTable: tableName,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          legacyRef: mapped.booking.legacyAirtableRef,
          severity: mapped.sourceSnapshot.translatorAmbiguousCandidates?.length ? 'HIGH' : 'MEDIUM',
          reason: mapped.sourceSnapshot.translatorAmbiguousCandidates?.length ? 'PROFESSIONAL_MATCH_AMBIGUOUS' : 'PROFESSIONAL_NOT_RESOLVED',
          currentValue: mapped.sourceSnapshot.translatorAmbiguousCandidates || [],
          incomingValue: {
            name: mapped.sourceSnapshot.translatorName,
            email: mapped.sourceSnapshot.translatorEmail,
            airtableRecordId: mapped.sourceSnapshot.translatorAirtableRecordId
          },
          recommendedAction: 'Review translator identity, link the Airtable professional to an interpreter profile, then rerun sync.',
          dryRun: mode.dryRun
        });
      }
      if (existing?.status && existing.status !== mapped.booking.status && sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'booking',
          entityId: existingSnap?.id,
          sourceTable: tableName,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          legacyRef: mapped.booking.legacyAirtableRef,
          severity: 'MEDIUM',
          reason: 'STATUS_SOURCE_OF_TRUTH_MISMATCH',
          currentValue: existing.status,
          incomingValue: mapped.sourceSnapshot.statusRaw,
          recommendedAction: 'Review whether Airtable or Lingland should own this job status before applying automated status changes.',
          dryRun: mode.dryRun
        });
      }

      const sourceBackfillNeeded = existingSnap?.exists && needsSourceTrackingBackfill(existing, mapped.booking);
      const action: SyncAction = existingSnap?.exists
        ? (existing?.airtableSnapshotHash === mapped.booking.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;
      let workflowArtifacts = predictWorkflowArtifacts(mapped.booking);

      if (!mode.dryRun && action !== 'skipped') {
        if (!existingRef || !existingSnap) throw new Error('Missing booking reference for translation sync write.');
        await existingRef.set(cleanFirestoreData({
          ...mapped.booking,
          createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });

        await db.collection('jobEvents').add({
          jobId: existingRef.id,
          organizationId: 'lingland-main',
          type: existingSnap.exists ? 'SYNC_UPDATED_FROM_AIRTABLE' : 'SYNC_CREATED_FROM_AIRTABLE',
          source: 'airtable',
          description: existingSnap.exists ? 'Translation record updated from Airtable sync.' : 'Translation record created from Airtable sync.',
          metadata: {
            sourceRecordId: record.id,
            sourceTable: tableName,
            sourceBaseId: mapped.booking.sourceBaseId,
            snapshotHash: mapped.booking.snapshotHash,
            legacyAirtableRef: mapped.booking.legacyAirtableRef,
            dryRun: false
          },
          createdAt: new Date().toISOString()
        });
      }

      if (!mode.dryRun && existingRef) {
        workflowArtifacts = await mirrorWorkflowArtifacts(existingRef, {
          ...existing,
          ...mapped.booking
        });
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          sourceTable: tableName,
          snapshotHash: mapped.booking.snapshotHash,
          jobNumber: mapped.booking.jobNumber,
          displayRef: mapped.booking.displayRef,
          clientName: mapped.booking.clientName,
          clientId: mapped.booking.clientId,
          clientAction: clientResolution.action,
          interpreterName: mapped.booking.interpreterName,
          interpreterId: mapped.booking.interpreterId,
          interpreterResolved: Boolean(mapped.booking.interpreterId),
          interpreterMatchMethod: mapped.sourceSnapshot.translatorMatchMethod,
          interpreterMatchConfidence: mapped.sourceSnapshot.translatorMatchConfidence,
          ambiguousCandidates: mapped.sourceSnapshot.translatorAmbiguousCandidates,
          status: mapped.booking.status,
          skipReason: action === 'skipped' && isTerminalStableStatus(mapped.booking.status)
            ? 'TERMINAL_STABLE_ALREADY_MIRRORED'
            : undefined,
          wordCount: mapped.booking.wordCount,
          totalAmount: mapped.booking.totalAmount,
          workflowArtifacts
        });
      }
    } catch (error) {
      stats.error += 1;
      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          sourceTable: tableName,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  return { stats, details };
};

const syncClientInvoices = async (
  records: AirtableRecord[],
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const record of records) {
    try {
      const fields = record.fields;
      const invoiceNumber = pick(fields, ['Invoice Nbr', 'INV ID', 'Name']) || `AIRTABLE-INV-${record.id}`;
      const invoiceId = `airtable_client_invoice_${slugify(invoiceNumber || record.id)}`;
      const linkedRedbookIds = pickLinkedIds(fields, ['Job Number from redbook', '🖥️ REDBOOK', 'Redbook ID (from Job Number from redbook)']);
      const bookings = await getBookingsByAirtableRecordIds(linkedRedbookIds);
      const hasJobLinkConflict = linkedRedbookIds.length === 0 || bookings.length === 0;
      const firstBooking = bookings[0]?.data() || {};
      const invoiceTotal = safeNumber(pickRaw(fields, ['SAGE Invoice + VAT', 'SAGE Invoice total', 'Total invoiced']));
      const subtotal = safeNumber(pickRaw(fields, ['SAGE Invoice total'])) || invoiceTotal;
      const status = mapClientInvoiceStatus(fields);
      const clientName = pick(fields, ['Agency, institution or company  (from feed from redbook)', 'Account (from invoice to)', 'invoice to'])
        || firstBooking.clientName
        || 'Airtable Client';
      const clientId = firstBooking.clientId || `airtable_client_${slugify(clientName)}`;
      const issueDate = dateOnly(pickRaw(fields, ['Last Modified']));
      const existing = await db.collection('clientInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({
        invoiceNumber,
        status,
        invoiceTotal,
        subtotal,
        clientId,
        clientName,
        linkedRedbookIds
      });
      const sourceTracking = buildSourceTracking(record, CLIENT_INVOICES_TABLE, invoiceNumber, {
        invoiceNumber,
        status,
        invoiceTotal,
        subtotal,
        clientId,
        clientName,
        linkedRedbookIds
      }, runId);
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (hasJobLinkConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: linkedRedbookIds.length === 0 ? 'MEDIUM' : 'HIGH',
          reason: linkedRedbookIds.length === 0 ? 'INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'INVOICE_JOB_LINK_NOT_RESOLVED',
          currentValue: { matchedBookings: bookings.length },
          incomingValue: { linkedRedbookIds },
          recommendedAction: 'Review the Airtable invoice link fields and connect this invoice to the correct mirrored job before financial sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        const invoiceRef = db.collection('clientInvoices').doc(invoiceId);
        batch.set(invoiceRef, cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          clientId,
          clientName,
          reference: invoiceNumber,
          invoiceNumber,
          status,
          issueDate,
          dueDate: issueDate,
          periodStart: issueDate,
          periodEnd: issueDate,
          subtotal,
          vatRate: invoiceTotal && subtotal ? Number(((invoiceTotal - subtotal) / subtotal).toFixed(4)) : 0,
          vatAmount: invoiceTotal && subtotal ? Number((invoiceTotal - subtotal).toFixed(2)) : 0,
          totalAmount: invoiceTotal || subtotal,
          currency: 'GBP',
          items: [],
          ...sourceTracking,
          linkedRedbookRecordIds: linkedRedbookIds,
          airtableStatus: pick(fields, ['Invocing Status']),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        const lineBookings = bookings.length ? bookings : [null];
        const amountPerLine = lineBookings.length > 1
          ? Number(((invoiceTotal || subtotal) / lineBookings.length).toFixed(2))
          : (invoiceTotal || subtotal);

        lineBookings.forEach((booking, index) => {
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
          const line = summarizeInvoiceLine(booking, invoiceNumber, amountPerLine);
          batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
            ...line,
            timesheetId,
            id: lineId,
            invoiceId,
            clientInvoiceId: invoiceId,
            clientId,
            sourceRecordId: record.id,
            sourceTable: CLIENT_INVOICES_TABLE,
            sourceBaseId: DEFAULT_BASE_ID,
            snapshotHash,
            lastSyncRunId: runId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }), { merge: true });
          batchOps += 1;

          if (booking?.exists) {
            const bookingData = booking.data() || {};
            const nextStatus = preserveStatusIfLocalAhead(bookingData.status, status === 'PAID' ? 'PAID' : 'INVOICED', sourceOfTruth);
            batch.update(booking.ref, cleanData({
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: invoiceNumber,
              totalAmount: invoiceTotal || bookingData.totalAmount || subtotal,
              status: nextStatus,
              invoicedAt: issueDate,
              paidAt: status === 'PAID' ? issueDate : bookingData.paidAt,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              clientInvoiceId: invoiceId,
              totalAmount: invoiceTotal || bookingData.totalAmount || subtotal,
              status: nextStatus,
              paidAt: status === 'PAID' ? issueDate : bookingData.paidAt
            });
            batchOps += 2;
          }
        });
      }

      if (details.length < MAX_DETAILS) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: CLIENT_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber,
          clientName,
          linkedJobs: linkedRedbookIds.length,
          matchedBookings: bookings.length,
          conflict: hasJobLinkConflict ? (linkedRedbookIds.length === 0 ? 'INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
          status,
          totalAmount: invoiceTotal || subtotal
        });
      }

      await commitIfNeeded();
    } catch (error) {
      stats.error += 1;
      if (details.length < MAX_DETAILS) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  await commitIfNeeded(true);
  return { stats, details };
};

const syncInterpreterInvoices = async (
  records: AirtableRecord[],
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const record of records) {
    try {
      const fields = record.fields;
      const linkedRedbookIds = pickLinkedIds(fields, ['🖥️ REDBOOK', 'Redbook ID (from 🖥️ REDBOOK)']);
      const bookings = await getBookingsByAirtableRecordIds(linkedRedbookIds);
      const hasJobLinkConflict = linkedRedbookIds.length === 0 || bookings.length === 0;
      const firstBooking = bookings[0]?.data() || {};
      const invoiceRefText = pick(fields, ['Name', 'INV name']) || `AIRTABLE-INT-${record.id}`;
      const interpreterEmail = cleanEmail(pick(fields, ['INT EMAIL (from 🖥️ REDBOOK)']));
      const interpreterName = pick(fields, ['INV name', 'assign to (from 🖥️ REDBOOK)']) || firstBooking.interpreterName || 'Interpreter';
      const resolvedInterpreter = firstBooking.interpreterId
        ? {
          id: firstBooking.interpreterId,
          name: firstBooking.interpreterName || interpreterName,
          email: firstBooking.interpreterEmail || interpreterEmail,
          photoUrl: firstBooking.interpreterPhotoUrl || ''
        }
        : await resolveInterpreterCached(interpreterEmail, interpreterName);
      const hasPersonConflict = !resolvedInterpreter?.id;
      const interpreterId = resolvedInterpreter?.id || `airtable_interpreter_${slugify(interpreterEmail || interpreterName || record.id)}`;
      const invoiceId = `airtable_interpreter_invoice_${record.id}`;
      const totalAmount = safeNumber(pickRaw(fields, ['INV Total', 'INV Session fees']));
      const status = mapInterpreterInvoiceStatus(fields);
      const issueDate = dateOnly(record.createdTime || pickRaw(fields, ['Last Modified']));
      const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({
        invoiceRefText,
        status,
        totalAmount,
        interpreterId,
        linkedRedbookIds
      });
      const sourceTracking = buildSourceTracking(record, INTERPRETER_INVOICES_TABLE, invoiceRefText, {
        invoiceRefText,
        status,
        totalAmount,
        interpreterId,
        linkedRedbookIds
      }, runId);
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (hasJobLinkConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: INTERPRETER_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: linkedRedbookIds.length === 0 ? 'MEDIUM' : 'HIGH',
          reason: linkedRedbookIds.length === 0 ? 'PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'PAYABLE_JOB_LINK_NOT_RESOLVED',
          currentValue: { matchedBookings: bookings.length },
          incomingValue: { linkedRedbookIds },
          recommendedAction: 'Review the Airtable payable link fields and connect this payable to the correct mirrored interpreting job before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (hasPersonConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: INTERPRETER_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: 'HIGH',
          reason: 'PAYABLE_PERSON_NOT_RESOLVED',
          currentValue: { interpreterId },
          incomingValue: { interpreterEmail, interpreterName },
          recommendedAction: 'Link this Airtable payable to an existing interpreter profile or passive imported interpreter before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          interpreterId,
          interpreterName: resolvedInterpreter?.name || interpreterName,
          interpreterEmail: resolvedInterpreter?.email || interpreterEmail,
          model: 'UPLOAD',
          status,
          externalInvoiceReference: invoiceRefText,
          totalAmount,
          issueDate,
          items: [],
          currency: 'GBP',
          ...sourceTracking,
          linkedRedbookRecordIds: linkedRedbookIds,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        const lineBookings = bookings.length ? bookings : [null];
        const amountPerLine = lineBookings.length > 1
          ? Number((totalAmount / lineBookings.length).toFixed(2))
          : totalAmount;
        lineBookings.forEach((booking, index) => {
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
          const line = summarizeInvoiceLine(booking, invoiceRefText, amountPerLine);
          batch.set(db.collection('interpreterInvoiceLines').doc(lineId), cleanData({
            ...line,
            timesheetId,
            id: lineId,
            invoiceId,
            interpreterInvoiceId: invoiceId,
            interpreterId,
            sourceRecordId: record.id,
            sourceTable: INTERPRETER_INVOICES_TABLE,
            sourceBaseId: DEFAULT_BASE_ID,
            snapshotHash,
            lastSyncRunId: runId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }), { merge: true });
          batchOps += 1;

          if (booking?.exists) {
            const bookingData = booking.data() || {};
            const nextStatus = preserveStatusIfLocalAhead(
              bookingData.status,
              STATUS_RANK[bookingData.status] >= STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED',
              sourceOfTruth
            );
            batch.update(booking.ref, cleanData({
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: invoiceRefText,
              interpreterInvoiceTotal: totalAmount || bookingData.interpreterInvoiceTotal,
              status: nextStatus,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceTotal: totalAmount || bookingData.interpreterInvoiceTotal,
              status: nextStatus
            });
            batchOps += 2;
          }
        });
      }

      if (details.length < MAX_DETAILS) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: INTERPRETER_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber: invoiceRefText,
          interpreterName: resolvedInterpreter?.name || interpreterName,
          interpreterId,
          linkedJobs: linkedRedbookIds.length,
          matchedBookings: bookings.length,
          conflict: [
            hasJobLinkConflict ? (linkedRedbookIds.length === 0 ? 'PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'PAYABLE_JOB_LINK_NOT_RESOLVED') : '',
            hasPersonConflict ? 'PAYABLE_PERSON_NOT_RESOLVED' : ''
          ].filter(Boolean).join(', ') || undefined,
          status,
          totalAmount
        });
      }

      await commitIfNeeded();
    } catch (error) {
      stats.error += 1;
      if (details.length < MAX_DETAILS) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  await commitIfNeeded(true);
  return { stats, details };
};

const syncTranslationClientInvoices = async (
  records: AirtableRecord[],
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const record of records) {
    try {
      const fields = record.fields;
      const invoiceNumber = pick(fields, ['TR Invoice Nbr', 'Invoice No', 'Name']) || `AIRTABLE-TR-INV-${record.id}`;
      const invoiceId = `airtable_translation_client_invoice_${slugify(invoiceNumber || record.id)}`;
      const linkedTranslationIds = pickLinkedIds(fields, ['Translations', 'TR NUMBER (from Translations)', 'TR ID']);
      const bookings = await getBookingsByAirtableRecordIds(linkedTranslationIds);
      const hasJobLinkConflict = linkedTranslationIds.length === 0 || bookings.length === 0;
      const firstBooking = bookings[0]?.data() || {};
      const totalAmount = safeNumber(pickRaw(fields, ['FINAL QUOTE', 'FQ+VAT', 'TR owed fees']));
      const status = mapClientInvoiceStatus(fields);
      const clientName = pick(fields, ['TR Agency', 'TR Requested By', 'TR client email']) || firstBooking.clientName || 'Translation Client';
      const clientId = firstBooking.clientId || `airtable_client_${slugify(clientName)}`;
      const issueDate = dateOnly(pickRaw(fields, ['COMPLETED', 'paid date', 'Last Modified']) || record.createdTime);
      const existing = await db.collection('clientInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({ invoiceNumber, status, totalAmount, clientId, clientName, linkedTranslationIds });
      const sourceTracking = buildSourceTracking(record, TRANSLATION_CLIENT_INVOICES_TABLE, invoiceNumber, {
        invoiceNumber,
        status,
        totalAmount,
        clientId,
        clientName,
        linkedTranslationIds
      }, runId);
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (hasJobLinkConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: linkedTranslationIds.length === 0 ? 'MEDIUM' : 'HIGH',
          reason: linkedTranslationIds.length === 0 ? 'TRANSLATION_INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATION_INVOICE_JOB_LINK_NOT_RESOLVED',
          currentValue: { matchedBookings: bookings.length },
          incomingValue: { linkedTranslationIds },
          recommendedAction: 'Review the Airtable translation invoice link fields and connect this invoice to the correct mirrored translation job before financial sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        batch.set(db.collection('clientInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          clientId,
          clientName,
          reference: invoiceNumber,
          invoiceNumber,
          status,
          issueDate,
          dueDate: issueDate,
          periodStart: issueDate,
          periodEnd: issueDate,
          subtotal: totalAmount,
          vatRate: 0,
          vatAmount: 0,
          totalAmount,
          currency: 'GBP',
          items: [],
          serviceCategory: 'TRANSLATION',
          ...sourceTracking,
          linkedTranslationRecordIds: linkedTranslationIds,
          airtableStatus: pick(fields, ['TR Status', 'Status']),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        const lineBookings = bookings.length ? bookings : [null];
        const amountPerLine = lineBookings.length > 1
          ? Number((totalAmount / lineBookings.length).toFixed(2))
          : totalAmount;

        lineBookings.forEach((booking, index) => {
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
          batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
            id: lineId,
            invoiceId,
            clientInvoiceId: invoiceId,
            clientId,
            bookingId: booking?.id || '',
            timesheetId,
            description: `Airtable translation ${booking?.data()?.jobNumber || invoiceNumber}`,
            units: safeNumber(pickRaw(fields, ['WORD COUNT', 'TR owed words'])) || 1,
            rate: amountPerLine,
            lineAmount: amountPerLine,
            total: amountPerLine,
            serviceCategory: 'TRANSLATION',
            sourceSystem: 'AIRTABLE',
            sourceRecordId: record.id,
            sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
            sourceBaseId: DEFAULT_BASE_ID,
            snapshotHash,
            lastSyncRunId: runId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }), { merge: true });
          batchOps += 1;

          if (booking?.exists) {
            const bookingData = booking.data() || {};
            const nextStatus = preserveStatusIfLocalAhead(bookingData.status, status === 'PAID' ? 'PAID' : 'INVOICED', sourceOfTruth);
            batch.update(booking.ref, cleanData({
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: invoiceNumber,
              totalAmount: totalAmount || bookingData.totalAmount,
              status: nextStatus,
              invoicedAt: issueDate,
              paidAt: status === 'PAID' ? issueDate : bookingData.paidAt,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              clientInvoiceId: invoiceId,
              totalAmount: totalAmount || bookingData.totalAmount,
              status: nextStatus,
              paidAt: status === 'PAID' ? issueDate : bookingData.paidAt
            });
            batchOps += 2;
          }
        });
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber,
          clientName,
          linkedJobs: linkedTranslationIds.length,
          matchedBookings: bookings.length,
          conflict: hasJobLinkConflict ? (linkedTranslationIds.length === 0 ? 'TRANSLATION_INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATION_INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
          status,
          totalAmount
        });
      }

      await commitIfNeeded();
    } catch (error) {
      stats.error += 1;
      pushErrorDetail(details, {
        action: 'error',
        sourceRecordId: record.id,
        sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  await commitIfNeeded(true);
  return { stats, details };
};

const syncTranslatorInvoices = async (
  records: AirtableRecord[],
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const record of records) {
    try {
      const fields = record.fields;
      const linkedTranslationIds = pickLinkedIds(fields, ['Translations', 'TR ID', 'TR NUMBER (from Translations)']);
      const bookings = await getBookingsByAirtableRecordIds(linkedTranslationIds);
      const hasJobLinkConflict = linkedTranslationIds.length === 0 || bookings.length === 0;
      const firstBooking = bookings[0]?.data() || {};
      const invoiceRefText = pick(fields, ['Name', 'TR NUMBER (from Translations)']) || `AIRTABLE-TR-PAY-${record.id}`;
      const translatorEmail = cleanEmail(pick(fields, ['EMAIL', 'EMAIL (from Assign to TR)']));
      const translatorName = pick(fields, ['Assign to', 'TRANSLATOR']) || firstBooking.interpreterName || 'Translator';
      const resolvedTranslator = firstBooking.interpreterId
        ? {
          id: firstBooking.interpreterId,
          name: firstBooking.interpreterName || translatorName,
          email: firstBooking.interpreterEmail || translatorEmail,
          photoUrl: firstBooking.interpreterPhotoUrl || ''
        }
        : await resolveInterpreterCached(translatorEmail, translatorName);
      const hasPersonConflict = !resolvedTranslator?.id;
      const interpreterId = resolvedTranslator?.id || `airtable_interpreter_${slugify(translatorEmail || translatorName || record.id)}`;
      const invoiceId = `airtable_translator_invoice_${record.id}`;
      const totalAmount = safeNumber(pickRaw(fields, ['RTR INV FEES', 'TR owed fees']));
      const wordCount = safeNumber(pickRaw(fields, ['RTR INV WORDS', 'TR owed words']));
      const docs = safeNumber(pickRaw(fields, ['RTR INV DOCS', 'TR owed docs']));
      const status = mapInterpreterInvoiceStatus(fields);
      const issueDate = dateOnly(record.createdTime || pickRaw(fields, ['Last Modified']));
      const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({ invoiceRefText, status, totalAmount, interpreterId, linkedTranslationIds, wordCount, docs });
      const sourceTracking = buildSourceTracking(record, TRANSLATOR_INVOICES_TABLE, invoiceRefText, {
        invoiceRefText,
        status,
        totalAmount,
        interpreterId,
        linkedTranslationIds,
        wordCount,
        docs
      }, runId);
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (hasJobLinkConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATOR_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: linkedTranslationIds.length === 0 ? 'MEDIUM' : 'HIGH',
          reason: linkedTranslationIds.length === 0 ? 'TRANSLATOR_PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATOR_PAYABLE_JOB_LINK_NOT_RESOLVED',
          currentValue: { matchedBookings: bookings.length },
          incomingValue: { linkedTranslationIds },
          recommendedAction: 'Review the Airtable translator invoice link fields and connect this payable to the correct mirrored translation job before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (hasPersonConflict) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATOR_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: 'HIGH',
          reason: 'TRANSLATOR_PAYABLE_PERSON_NOT_RESOLVED',
          currentValue: { interpreterId },
          incomingValue: { translatorEmail, translatorName },
          recommendedAction: 'Link this Airtable translator payable to an existing translator/interpreter profile or passive imported profile before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          interpreterId,
          interpreterName: resolvedTranslator?.name || translatorName,
          interpreterEmail: resolvedTranslator?.email || translatorEmail,
          model: 'UPLOAD',
          status,
          externalInvoiceReference: invoiceRefText,
          totalAmount,
          issueDate,
          items: [],
          currency: 'GBP',
          serviceCategory: 'TRANSLATION',
          ...sourceTracking,
          linkedTranslationRecordIds: linkedTranslationIds,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        const lineBookings = bookings.length ? bookings : [null];
        const amountPerLine = lineBookings.length > 1
          ? Number((totalAmount / lineBookings.length).toFixed(2))
          : totalAmount;

        lineBookings.forEach((booking, index) => {
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || record.id}_${index}`;
          batch.set(db.collection('interpreterInvoiceLines').doc(lineId), cleanData({
            id: lineId,
            invoiceId,
            interpreterInvoiceId: invoiceId,
            interpreterId,
            bookingId: booking?.id || '',
            timesheetId,
            description: `Airtable translator payment ${booking?.data()?.jobNumber || invoiceRefText}`,
            units: wordCount || docs || 1,
            wordCount,
            docs,
            rate: amountPerLine,
            lineAmount: amountPerLine,
            total: amountPerLine,
            serviceCategory: 'TRANSLATION',
            sourceSystem: 'AIRTABLE',
            sourceRecordId: record.id,
            sourceTable: TRANSLATOR_INVOICES_TABLE,
            sourceBaseId: DEFAULT_BASE_ID,
            snapshotHash,
            lastSyncRunId: runId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }), { merge: true });
          batchOps += 1;

          if (booking?.exists) {
            const bookingData = booking.data() || {};
            batch.update(booking.ref, cleanData({
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: invoiceRefText,
              interpreterInvoiceTotal: totalAmount || bookingData.interpreterInvoiceTotal,
              status: preserveStatusIfLocalAhead(
                bookingData.status,
                STATUS_RANK[bookingData.status] >= STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED',
                sourceOfTruth
              ),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            const nextStatus = preserveStatusIfLocalAhead(
              bookingData.status,
              STATUS_RANK[bookingData.status] >= STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED',
              sourceOfTruth
            );
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceTotal: totalAmount || bookingData.interpreterInvoiceTotal,
              status: nextStatus
            });
            batchOps += 2;
          }
        });
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: TRANSLATOR_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber: invoiceRefText,
          interpreterName: resolvedTranslator?.name || translatorName,
          interpreterId,
          linkedJobs: linkedTranslationIds.length,
          matchedBookings: bookings.length,
          conflict: [
            hasJobLinkConflict ? (linkedTranslationIds.length === 0 ? 'TRANSLATOR_PAYABLE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATOR_PAYABLE_JOB_LINK_NOT_RESOLVED') : '',
            hasPersonConflict ? 'TRANSLATOR_PAYABLE_PERSON_NOT_RESOLVED' : ''
          ].filter(Boolean).join(', ') || undefined,
          status,
          totalAmount
        });
      }

      await commitIfNeeded();
    } catch (error) {
      stats.error += 1;
      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action: 'error',
          sourceRecordId: record.id,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  await commitIfNeeded(true);
  return { stats, details };
};

const syncRecords = async (mode: SyncMode, includeFinance = true) => {
  interpreterCache.clear();
  clientCache.clear();
  bookingByAirtableRecordCache.clear();
  const platformMode = await getPlatformMode();
  const importMode = platformMode.airtableImportMode || 'ON';
  const lastSyncIso = await getLastSyncIso();
  const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
  const redbookFormula = buildAirtableFormula(mode.syncStrategy, redbookTableName, lastSyncIso);
  const redbookBatch = await fetchAirtableRecordBatch(
    mode.limitRecords,
    DEFAULT_TABLE_NAME,
    mode.tableOffsets?.[DEFAULT_TABLE_NAME] || '',
    { filterByFormula: redbookFormula, strategy: mode.syncStrategy }
  );
  const records = redbookBatch.records;
  const workflowSourceRecordIds = includeFinance ? await getWorkflowSourceRecordIds(mode.syncStrategy) : new Set<string>();
  const [rawClientInvoiceRecords, rawInterpreterInvoiceRecords] = includeFinance
    ? await Promise.all([
      fetchAirtableRecordBatch(
        mode.limitRecords,
        CLIENT_INVOICES_TABLE,
        mode.tableOffsets?.[CLIENT_INVOICES_TABLE] || '',
        { filterByFormula: buildAirtableFormula(mode.syncStrategy, CLIENT_INVOICES_TABLE, lastSyncIso), strategy: mode.syncStrategy }
      ).then(batch => batch.records),
      fetchAirtableRecordBatch(
        mode.limitRecords,
        INTERPRETER_INVOICES_TABLE,
        mode.tableOffsets?.[INTERPRETER_INVOICES_TABLE] || '',
        { filterByFormula: buildAirtableFormula(mode.syncStrategy, INTERPRETER_INVOICES_TABLE, lastSyncIso), strategy: mode.syncStrategy }
      ).then(batch => batch.records)
    ])
    : [[], []];
  const clientFinanceSelection = filterFinanceRecordsForWorkflow(
    rawClientInvoiceRecords,
    CLIENT_INVOICES_TABLE,
    workflowSourceRecordIds,
    mode.syncStrategy
  );
  const interpreterFinanceSelection = filterFinanceRecordsForWorkflow(
    rawInterpreterInvoiceRecords,
    INTERPRETER_INVOICES_TABLE,
    workflowSourceRecordIds,
    mode.syncStrategy
  );
  const clientInvoiceRecords = clientFinanceSelection.records;
  const interpreterInvoiceRecords = interpreterFinanceSelection.records;
  const nextOffsets: Record<string, string> = {
    [DEFAULT_TABLE_NAME]: redbookBatch.nextOffset || ''
  };
  const runRef = db.collection('syncRuns').doc();
  const startedAt = new Date().toISOString();

  const stats: Record<SyncAction, number> = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflict: 0,
    error: 0
  };
  const details: Array<Record<string, unknown>> = [];

  if (importMode === 'OFF') {
    return {
      success: false,
      dryRun: mode.dryRun,
      importMode,
      message: 'Airtable import mode is OFF.',
      stats,
      details,
      nextOffsets
    };
  }

  for (const record of records) {
    try {
      const mapped = await mapRecordToBooking(record) as any;
      if (!mode.dryRun && importMode !== 'READ_ONLY') mapped.booking.lastSyncRunId = runRef.id;
      const clientResolution = await resolveClientCached({
        clientName: mapped.sourceSnapshot.clientName,
        uniqueClientKey: mapped.sourceSnapshot.uniqueClientKey,
        contactName: mapped.sourceSnapshot.contactName,
        contactEmail: mapped.sourceSnapshot.contactEmail,
        contactPhone: mapped.sourceSnapshot.contactPhone,
        location: mapped.sourceSnapshot.location,
        normalizedCompanyName: normalizeForMatch(mapped.sourceSnapshot.clientName)
      }, mode.dryRun || importMode === 'READ_ONLY');
      mapped.booking.clientId = clientResolution.id;
      let existingRef: admin.firestore.DocumentReference | null = null;
      let existingSnap: admin.firestore.DocumentSnapshot | null = null;
      let existing: admin.firestore.DocumentData | null = null;
      if (mode.dryRun) {
        const bySource = await db.collection('bookings')
          .where('sourceRecordId', '==', record.id)
          .limit(1)
          .get();
        existingSnap = bySource.empty ? null : bySource.docs[0];
        existing = existingSnap?.exists ? existingSnap.data() || null : null;
      } else {
        existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
        existingSnap = await existingRef.get();
        existing = existingSnap.exists ? existingSnap.data() || null : null;
      }
      mapped.booking.status = preserveStatusIfLocalAhead(existing?.status, mapped.booking.status, platformMode.sourceOfTruth);
      const hasInterpreterSignal = Boolean(
        mapped.sourceSnapshot.interpreterName
        || mapped.sourceSnapshot.interpreterEmail
        || mapped.sourceSnapshot.interpreterAirtableRecordId
      );
      const unresolvedInterpreter = hasInterpreterSignal && !mapped.booking.interpreterId;
      if (unresolvedInterpreter) {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        await writeSyncConflict({
          runId: runRef.id,
          entityType: 'booking',
          entityId: existingSnap?.id,
          sourceTable: mapped.booking.sourceTable || DEFAULT_TABLE_NAME,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          legacyRef: mapped.booking.legacyAirtableRef,
          severity: mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length ? 'HIGH' : 'MEDIUM',
          reason: mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length ? 'PROFESSIONAL_MATCH_AMBIGUOUS' : 'PROFESSIONAL_NOT_RESOLVED',
          currentValue: mapped.sourceSnapshot.interpreterAmbiguousCandidates || [],
          incomingValue: {
            name: mapped.sourceSnapshot.interpreterName,
            email: mapped.sourceSnapshot.interpreterEmail,
            airtableRecordId: mapped.sourceSnapshot.interpreterAirtableRecordId
          },
          recommendedAction: 'Review interpreter identity, link the Airtable professional to an interpreter profile, then rerun sync.',
          dryRun: mode.dryRun || importMode === 'READ_ONLY'
        });
      }
      if (existing?.status && existing.status !== mapped.booking.status && platformMode.sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        await writeSyncConflict({
          runId: runRef.id,
          entityType: 'booking',
          entityId: existingSnap?.id,
          sourceTable: mapped.booking.sourceTable || DEFAULT_TABLE_NAME,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          legacyRef: mapped.booking.legacyAirtableRef,
          severity: 'MEDIUM',
          reason: 'STATUS_SOURCE_OF_TRUTH_MISMATCH',
          currentValue: existing.status,
          incomingValue: mapped.sourceSnapshot.statusRaw,
          recommendedAction: 'Review whether Airtable or Lingland should own this job status before applying automated status changes.',
          dryRun: mode.dryRun || importMode === 'READ_ONLY'
        });
      }
      const previousHash = existing?.airtableSnapshotHash;
      const sourceBackfillNeeded = existingSnap?.exists && needsSourceTrackingBackfill(existing, mapped.booking);
      const action: SyncAction = existingSnap?.exists
        ? (previousHash === mapped.booking.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      if (mode.dryRun || importMode === 'READ_ONLY') {
        stats[action] += 1;
      } else if (action === 'skipped') {
        stats.skipped += 1;
      } else {
        if (!existingRef || !existingSnap) throw new Error('Missing booking reference for REDBOOK sync write.');
        await existingRef.set(cleanFirestoreData({
          ...mapped.booking,
          createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });

        await db.collection('jobEvents').add({
          jobId: existingRef.id,
          organizationId: 'lingland-main',
          type: existingSnap.exists ? 'SYNC_UPDATED_FROM_AIRTABLE' : 'SYNC_CREATED_FROM_AIRTABLE',
          source: 'airtable',
          description: existingSnap.exists ? 'REDBOOK record updated from Airtable sync.' : 'REDBOOK record created from Airtable sync.',
          metadata: {
            sourceRecordId: record.id,
            sourceTable: mapped.booking.sourceTable,
            sourceBaseId: mapped.booking.sourceBaseId,
            snapshotHash: mapped.booking.snapshotHash,
            syncRunId: runRef.id,
            legacyAirtableRef: mapped.booking.legacyAirtableRef,
            dryRun: false
          },
          createdAt: new Date().toISOString()
        });

        stats[action] += 1;
      }

      let workflowArtifacts = predictWorkflowArtifacts(mapped.booking);
      if (!mode.dryRun && importMode !== 'READ_ONLY' && existingRef) {
        workflowArtifacts = await mirrorWorkflowArtifacts(existingRef, {
          ...existing,
          ...mapped.booking
        });
      }

      if (details.length < MAX_DETAILS) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          sourceTable: mapped.booking.sourceTable,
          snapshotHash: mapped.booking.snapshotHash,
          syncRunId: !mode.dryRun && importMode !== 'READ_ONLY' ? runRef.id : undefined,
          jobNumber: mapped.booking.jobNumber,
          displayRef: mapped.booking.displayRef,
          clientName: mapped.booking.clientName,
          patientName: mapped.booking.patientName,
          clientId: mapped.booking.clientId,
          clientAction: clientResolution.action,
          interpreterName: mapped.booking.interpreterName,
          interpreterId: mapped.booking.interpreterId,
          interpreterResolved: Boolean(mapped.booking.interpreterId),
          interpreterMatchMethod: mapped.sourceSnapshot.interpreterMatchMethod,
          interpreterMatchConfidence: mapped.sourceSnapshot.interpreterMatchConfidence,
          ambiguousCandidates: mapped.sourceSnapshot.interpreterAmbiguousCandidates,
          status: mapped.booking.status,
          skipReason: action === 'skipped' && isTerminalStableStatus(mapped.booking.status)
            ? 'TERMINAL_STABLE_ALREADY_MIRRORED'
            : undefined,
          workflowArtifacts
        });
      }
    } catch (error) {
      stats.error += 1;
      pushErrorDetail(details, {
        action: 'error',
        sourceRecordId: record.id,
        sourceTable: DEFAULT_TABLE_NAME,
        message: error instanceof Error ? error.message : 'Unknown error'
      }, MAX_DETAILS);
    }
  }

  const [clientInvoiceSync, interpreterInvoiceSync] = includeFinance
    ? await Promise.all([
      syncClientInvoices(clientInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id),
      syncInterpreterInvoices(interpreterInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id)
    ])
    : [
      { stats: emptyActionStats(), details: [] },
      { stats: emptyActionStats(), details: [] }
    ];
  const financeErrorCount = clientInvoiceSync.stats.error + interpreterInvoiceSync.stats.error;

  const finishedAt = new Date().toISOString();
  const result = {
    success: stats.error === 0 && (!includeFinance || financeErrorCount === 0),
    syncRunId: runRef.id,
    mappingVersion: 'redbook-status-finance-v3',
    syncStrategy: mode.syncStrategy,
    serverFilterApplied: redbookBatch.filterByFormula || '',
    dryRun: mode.dryRun || importMode === 'READ_ONLY',
    importMode,
    triggeredBy: mode.triggeredBy,
    userId: mode.userId || '',
    totalRecords: records.length,
    nextOffsets,
    financeRecords: {
      clientInvoices: clientInvoiceRecords.length,
      interpreterInvoices: interpreterInvoiceRecords.length
    },
    financePullThrough: {
      workflowSourceRecordIds: workflowSourceRecordIds.size,
      clientInvoicesDropped: clientFinanceSelection.dropped,
      interpreterInvoicesDropped: interpreterFinanceSelection.dropped,
      filterActive: clientFinanceSelection.filterActive || interpreterFinanceSelection.filterActive
    },
    startedAt,
    finishedAt,
    stats,
    financeStats: {
      clientInvoices: clientInvoiceSync.stats,
      interpreterInvoices: interpreterInvoiceSync.stats
    },
    details
  };

  const report = cleanReportData(result);
  await runRef.set({
    ...report,
    kind: 'AIRTABLE_REDBOOK',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  if (!mode.dryRun && importMode !== 'READ_ONLY') {
    await db.collection('system').doc('airtableRedbookSync').set({
      lastRunId: runRef.id,
      lastRunAt: finishedAt,
      lastStats: stats,
      lastTotalRecords: records.length,
      lastSyncStrategy: mode.syncStrategy,
      tableOffsets: nextOffsets,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return result;
};

const addStats = (
  target: Record<SyncAction, number>,
  incoming: Record<SyncAction, number>
) => {
  (['created', 'updated', 'skipped', 'conflict', 'error'] as SyncAction[]).forEach(action => {
    target[action] += incoming[action] || 0;
  });
};

const normalizeModules = (input: unknown): AirtableSyncModule[] => {
  if (input === 'full') return FULL_SYNC_MODULES;
  const raw = Array.isArray(input) ? input : [input || 'redbook'];
  const allowed = new Set(FULL_SYNC_MODULES);
  const modules = raw.filter((item): item is AirtableSyncModule => typeof item === 'string' && allowed.has(item as AirtableSyncModule));
  return modules.length ? Array.from(new Set(modules)) : ['redbook'];
};

const normalizeScheduledModules = (input: unknown): AirtableSyncModule[] => {
  const modules = normalizeModules(input || FULL_SYNC_MODULES);
  return modules.length ? modules : FULL_SYNC_MODULES;
};

const syncAirtableOperations = async (mode: SyncMode, modules: AirtableSyncModule[]) => {
  interpreterCache.clear();
  clientCache.clear();
  bookingByAirtableRecordCache.clear();

  const platformMode = await getPlatformMode();
  const importMode = platformMode.airtableImportMode || 'ON';
  const effectiveMode = { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' };
  const startedAt = new Date().toISOString();
  const runRef = db.collection('syncRuns').doc();
  const overallStats: Record<SyncAction, number> = emptyActionStats();
  const moduleResults: Array<Record<string, unknown>> = [];
  const nextOffsets: Record<string, string> = {};
  const lastSyncIso = await getLastSyncIso();
  const workflowSourceRecordIds = await getWorkflowSourceRecordIds(mode.syncStrategy);

  const fetchModuleRecords = async (tableName: string) => {
    const formula = buildAirtableFormula(mode.syncStrategy, tableName, lastSyncIso);
    const batch = await fetchAirtableRecordBatch(
      mode.limitRecords,
      tableName,
      mode.tableOffsets?.[tableName] || '',
      { filterByFormula: formula, strategy: mode.syncStrategy }
    );
    nextOffsets[tableName] = batch.nextOffset || '';
    const selection = filterFinanceRecordsForWorkflow(batch.records, tableName, workflowSourceRecordIds, mode.syncStrategy);
    return {
      records: selection.records,
      rawRecords: batch.records.length,
      dropped: selection.dropped,
      filterActive: selection.filterActive
    };
  };

  if (importMode === 'OFF') {
    return {
      success: false,
      dryRun: mode.dryRun,
      importMode,
      modules,
      message: 'Airtable import mode is OFF.',
      startedAt,
      finishedAt: new Date().toISOString(),
      stats: overallStats,
      moduleResults,
      nextOffsets
    };
  }

  const pushModule = (
    module: AirtableSyncModule,
    label: string,
    tableNames: string[],
    records: number,
    result: { stats: Record<SyncAction, number>; details: Array<Record<string, unknown>> }
  ) => {
    addStats(overallStats, result.stats);
    moduleResults.push({
      module,
      label,
      tableNames,
      records,
      stats: result.stats,
      details: result.details,
      syncStrategy: mode.syncStrategy
    });
  };

  if (modules.includes('clients')) {
    const [clientsBatch, clientsBookBatch] = await Promise.all([
      fetchModuleRecords(CLIENTS_TABLE),
      fetchModuleRecords(CLIENTS_BOOK_TABLE)
    ]);
    const clients = clientsBatch.records;
    const clientsBook = clientsBookBatch.records;
    const clientsResult = await syncClients(clients, CLIENTS_TABLE, effectiveMode, runRef.id);
    const clientsBookResult = await syncClients(clientsBook, CLIENTS_BOOK_TABLE, effectiveMode, runRef.id);
    const combined = {
      stats: emptyActionStats(),
      details: [...clientsResult.details, ...clientsBookResult.details].slice(0, MAX_DETAILS)
    };
    addStats(combined.stats, clientsResult.stats);
    addStats(combined.stats, clientsBookResult.stats);
    pushModule('clients', 'Clients', [CLIENTS_TABLE, CLIENTS_BOOK_TABLE], clients.length + clientsBook.length, combined);
  }

  if (modules.includes('redbook')) {
    const redbookResult = await syncRecords(effectiveMode, false) as any;
    Object.assign(nextOffsets, redbookResult.nextOffsets || {});
    addStats(overallStats, redbookResult.stats);
    moduleResults.push({
      module: 'redbook',
      label: 'REDBOOK interpretation jobs',
      tableNames: [DEFAULT_TABLE_NAME],
      records: redbookResult.totalRecords || 0,
      stats: redbookResult.stats,
      details: redbookResult.details
    });
  }

  if (modules.includes('translations')) {
    const [translationsBatch, webTranslationsBatch] = await Promise.all([
      fetchModuleRecords(TRANSLATIONS_TABLE),
      fetchModuleRecords(WEB_TRANSLATIONS_TABLE)
    ]);
    const translations = translationsBatch.records;
    const webTranslations = webTranslationsBatch.records;
    const translationResult = await syncTranslationBookings(translations, TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    const webTranslationResult = await syncTranslationBookings(webTranslations, WEB_TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    const combined = {
      stats: emptyActionStats(),
      details: [...translationResult.details, ...webTranslationResult.details].slice(0, MAX_DETAILS)
    };
    addStats(combined.stats, translationResult.stats);
    addStats(combined.stats, webTranslationResult.stats);
    pushModule('translations', 'Translation jobs', [TRANSLATIONS_TABLE, WEB_TRANSLATIONS_TABLE], translations.length + webTranslations.length, combined);
  }

  if (modules.includes('clientInvoices')) {
    const selection = await fetchModuleRecords(CLIENT_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    pushModule('clientInvoices', 'Client invoices', [CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('interpreterInvoices')) {
    const selection = await fetchModuleRecords(INTERPRETER_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncInterpreterInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    pushModule('interpreterInvoices', 'Interpreter invoices', [INTERPRETER_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translationClientInvoices')) {
    const selection = await fetchModuleRecords(TRANSLATION_CLIENT_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncTranslationClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    pushModule('translationClientInvoices', 'Translation client invoices', [TRANSLATION_CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translatorInvoices')) {
    const selection = await fetchModuleRecords(TRANSLATOR_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncTranslatorInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id);
    pushModule('translatorInvoices', 'Translator invoices', [TRANSLATOR_INVOICES_TABLE], records.length, result);
  }

  const finishedAt = new Date().toISOString();
  const result = {
    success: overallStats.error === 0,
    syncRunId: runRef.id,
    mappingVersion: 'airtable-sync-center-v1',
    syncStrategy: mode.syncStrategy,
    dryRun: effectiveMode.dryRun,
    importMode,
    triggeredBy: mode.triggeredBy,
    userId: mode.userId || '',
    modules,
    startedAt,
    finishedAt,
    stats: overallStats,
    nextOffsets,
    financePullThrough: {
      workflowSourceRecordIds: workflowSourceRecordIds.size,
      filterActive: mode.syncStrategy !== 'FULL_AUDIT' && mode.syncStrategy !== 'CUSTOM_LIMIT' && workflowSourceRecordIds.size > 0
    },
    moduleResults
  };

  const report = cleanReportData(result);
  await runRef.set({
    ...report,
    kind: 'AIRTABLE_SYNC_CENTER',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  if (!effectiveMode.dryRun) {
    const syncCenterRef = db.collection('system').doc('airtableSyncCenter');
    const syncCenterSnap = await syncCenterRef.get();
    const mergedTableOffsets = {
      ...(syncCenterSnap.data()?.tableOffsets || {}),
      ...nextOffsets
    };
    const moduleCheckpoints = Object.fromEntries(moduleResults.map(result => [
      result.module,
      {
        lastRunId: runRef.id,
        lastWriteAt: finishedAt,
        recordsRead: result.records || 0,
        stats: result.stats,
        success: (result.stats as Record<SyncAction, number>).error === 0
      }
    ]));

    await syncCenterRef.set({
      lastRunId: runRef.id,
      lastRunAt: finishedAt,
      lastStats: overallStats,
      lastModules: modules,
      lastSyncStrategy: mode.syncStrategy,
      tableOffsets: mergedTableOffsets,
      moduleCheckpoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return result;
};

const countByStatus = (values: Array<string | undefined>) => values.reduce<Record<string, number>>((acc, value) => {
  const label = normalize(value) || 'Unknown';
  acc[label] = (acc[label] || 0) + 1;
  return acc;
}, {});

const getMirrorAuditSample = (
  records: AirtableRecord[],
  platformBySourceId: Map<string, admin.firestore.QueryDocumentSnapshot>
) => records
  .filter(record => !platformBySourceId.has(record.id))
  .slice(0, 50)
  .map(record => ({
    sourceRecordId: record.id,
    jobNumber: normalize(record.fields['Job Number']) || normalize(record.fields['TR NUMBER']) || record.id,
    status: normalize(record.fields.Status),
    bookedFor: normalize(record.fields['Booking Date & Time']) || normalize(record.fields['Booking Date'])
  }));

export const getAirtableMirrorAudit = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
  const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 5000));
  const lastSyncIso = await getLastSyncIso();
  const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
  const redbookFormula = buildAirtableFormula(syncStrategy, redbookTableName, lastSyncIso);
  const redbookBatch = await fetchAirtableRecordBatch(
    limitRecords,
    DEFAULT_TABLE_NAME,
    '',
    { filterByFormula: redbookFormula, strategy: syncStrategy }
  );

  const platformSnap = await db.collection('bookings')
    .where('sourceTable', '==', DEFAULT_TABLE_NAME)
    .get();
  const platformDocs = platformSnap.docs.filter(doc => normalize(doc.data().sourceRecordId));
  const platformBySourceId = new Map(platformDocs.map(doc => [normalize(doc.data().sourceRecordId), doc]));
  const airtableIds = new Set(redbookBatch.records.map(record => record.id));
  const matched = redbookBatch.records.filter(record => platformBySourceId.has(record.id));
  const platformOnlyDocs = platformDocs.filter(doc => !airtableIds.has(normalize(doc.data().sourceRecordId)));

  return {
    success: true,
    syncStrategy,
    limitRecords,
    sourceTable: redbookBatch.tableName,
    filterByFormula: redbookBatch.filterByFormula || '',
    generatedAt: new Date().toISOString(),
    airtableRecords: redbookBatch.records.length,
    platformRecords: platformDocs.length,
    matchedRecords: matched.length,
    missingInPlatformCount: redbookBatch.records.length - matched.length,
    platformOnlyCount: platformOnlyDocs.length,
    nextOffset: redbookBatch.nextOffset || '',
    airtableStatusCounts: countByStatus(redbookBatch.records.map(record => normalize(record.fields.Status))),
    platformStatusCounts: countByStatus(platformDocs.map(doc => normalize(doc.data().sourceStatusRaw) || normalize(doc.data().status))),
    missingInPlatform: getMirrorAuditSample(redbookBatch.records, platformBySourceId),
    platformOnly: platformOnlyDocs.slice(0, 50).map(doc => {
      const booking = doc.data();
      return {
        bookingId: doc.id,
        sourceRecordId: normalize(booking.sourceRecordId),
        jobNumber: normalize(booking.jobNumber) || normalize(booking.displayRef) || doc.id,
        status: normalize(booking.sourceStatusRaw) || normalize(booking.status),
        lastSyncedAt: normalize(booking.lastSyncedAt)
      };
    })
  };
});

export const syncRedbookJobs = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const dryRun = Boolean(data?.dryRun);
  const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
  const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 500));

  return syncRecords({
    dryRun,
    limitRecords,
    syncStrategy,
    triggeredBy: 'manual',
    userId: context.auth?.uid,
    tableOffsets: data?.tableOffsets || data?.offsets || {}
  });
});

export const syncAirtableData = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const dryRun = Boolean(data?.dryRun);
  const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
  const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(data?.limitRecords || 500));
  const modules = normalizeModules(data?.modules);

  return syncAirtableOperations({
    dryRun,
    limitRecords,
    syncStrategy,
    triggeredBy: 'manual',
    userId: context.auth?.uid,
    tableOffsets: data?.tableOffsets || data?.offsets || {}
  }, modules);
});

export const syncAirtableMaintenance = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const providedToken = String(req.get('X-Lingland-Maintenance-Token') || '').trim();
  const tokenHash = createHash('sha256').update(providedToken).digest('hex');
  const syncConfig = await db.collection('system').doc('airtableSyncCenter').get();
  const expectedHash = String(syncConfig.data()?.maintenanceTokenHash || '').trim();

  if (!providedToken || !expectedHash || tokenHash !== expectedHash) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const dryRun = Boolean(req.body?.dryRun);
    const syncStrategy = normalizeSyncStrategy(req.body?.syncStrategy);
    const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(req.body?.limitRecords || 100));
    const modules = normalizeModules(req.body?.modules);
    const tableOffsets = req.body?.tableOffsets || req.body?.offsets || {};
    const result = await syncAirtableOperations({
      dryRun,
      limitRecords,
      syncStrategy,
      triggeredBy: 'manual',
      userId: 'maintenance',
      tableOffsets
    }, modules);

    res.status(200).json({ result });
  } catch (error) {
    console.error('[syncAirtableMaintenance] Failed', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown maintenance sync error'
    });
  }
});

export const scheduledRedbookSync = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).pubsub.schedule('every 10 minutes').timeZone('Europe/London').onRun(async () => {
  const platformMode = await getPlatformMode();
  const legacySyncConfig = await db.collection('system').doc('airtableRedbookSync').get();
  const syncCenterRef = db.collection('system').doc('airtableSyncCenter');
  const syncCenter = await syncCenterRef.get();
  const scheduleEnabled = syncCenter.data()?.scheduleEnabled === true || legacySyncConfig.data()?.scheduleEnabled === true;
  if (!scheduleEnabled) {
    console.log('[Airtable Sync] Scheduled sync is disabled. Manual Dry Run/Sync remains available.');
    return null;
  }

  if ((platformMode.airtableImportMode || 'ON') !== 'ON') {
    console.log('[Airtable Sync] Skipped because import mode is not ON.');
    return null;
  }

  const syncData = syncCenter.data() || {};
  const legacyData = legacySyncConfig.data() || {};
  const scheduledModules = normalizeScheduledModules(syncData.scheduledModules || legacyData.scheduledModules || FULL_SYNC_MODULES);
  const lastModuleIndex = Number(syncData.lastScheduledModuleIndex || 0);
  const moduleIndex = scheduledModules.length ? lastModuleIndex % scheduledModules.length : 0;
  const module = scheduledModules[moduleIndex] || 'redbook';
  const syncStrategy = normalizeSyncStrategy(syncData.syncStrategy || legacyData.syncStrategy || DEFAULT_SYNC_STRATEGY);
  const limitRecords = effectiveLimitForStrategy(syncStrategy, Number(syncData.limitRecords || legacyData.limitRecords || 250));

  console.log(`[Airtable Sync] Scheduled module ${module} with ${syncStrategy} strategy and limit ${limitRecords}.`);
  await syncAirtableOperations({
    dryRun: false,
    limitRecords,
    syncStrategy,
    triggeredBy: 'schedule',
    tableOffsets: syncData.tableOffsets || legacyData.tableOffsets || {}
  }, [module]);

  await syncCenterRef.set({
    scheduleEnabled: true,
    scheduledModules,
    syncStrategy,
    lastScheduledModule: module,
    lastScheduledModuleIndex: moduleIndex + 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return null;
});
