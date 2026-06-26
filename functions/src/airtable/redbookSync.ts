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
  triggeredBy: 'manual' | 'schedule';
  userId?: string;
  tableOffsets?: Record<string, string>;
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

const mapStatus = (fields: Record<string, unknown>, hasInterpreter: boolean) => {
  const rawStatus = pick(fields, ['Status', 'Job Status', 'Booking Status']);
  const normalized = rawStatus.toLowerCase();
  const invoiceStatus = pick(fields, ['Status (from invoices table)', 'Invocing Status']);
  const invoiceNumber = pick(fields, ['Invoice Nbr (from 💷 Invoices)', 'INV ID (from 💷 Invoices)', 'Invoice Nbr', 'INV ID']);
  const hasClientInvoice = Boolean(invoiceNumber || pick(fields, ['Invoiced on']) || safeNumber(pickRaw(fields, ['job invoice', 'Total invoiced', 'Invoiced + VAT'])));
  const hasInterpreterInvoice = Boolean(pick(fields, ['INV interp', 'interpreter invoice form', 'Google timesheet']));
  const timesheetReceived = truthyField(fields, ['timesheet']) || Boolean(pick(fields, ['timesheet link', 'Google timesheet']));
  const verified = truthyField(fields, ['Verified', 'Verified (from Job Number from redbook)', 'Verified (from Job Number from redbook) 2'])
    || Boolean(pick(fields, ['verification date']));
  const paid = truthyField(fields, ['Paid']) || invoiceStatus.toLowerCase().includes('paid') || normalized.includes('paid');

  let status = 'INCOMING';
  if (normalized.includes('cancel')) status = 'CANCELLED';
  else if (paid) status = 'PAID';
  else if (hasClientInvoice || invoiceStatus.toLowerCase().includes('invoice')) status = 'INVOICED';
  else if (verified) status = 'READY_FOR_INVOICE';
  else if (timesheetReceived || hasInterpreterInvoice || normalized.includes('timesheet')) status = 'TIMESHEET_SUBMITTED';
  else if (normalized.includes('complete') || normalized.includes('done')) status = 'SESSION_COMPLETED';
  else if (normalized.includes('pending')) status = 'ASSIGNMENT_PENDING';
  else if (normalized.includes('open')) status = hasInterpreter ? 'OPENED' : 'INCOMING';
  else if (normalized.includes('assign')) status = hasInterpreter ? 'OPENED' : 'NEEDS_ASSIGNMENT';
  else if (normalized.includes('book') || hasInterpreter) status = 'BOOKED';

  return {
    status,
    rawStatus,
    signals: {
      invoiceStatus,
      invoiceNumber,
      hasClientInvoice,
      hasInterpreterInvoice,
      timesheetReceived,
      verified,
      paid
    }
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

const resolveInterpreter = async (email: string, name: string) => {
  const normalizedEmail = cleanEmail(email);
  if (normalizedEmail) {
    const userByEmail = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!userByEmail.empty) {
      const user = userByEmail.docs[0].data();
      if (user.profileId) {
        const profile = await db.collection('interpreters').doc(user.profileId).get();
        return {
          id: user.profileId,
          name: profile.data()?.name || user.displayName || name,
          email: user.email || normalizedEmail,
          photoUrl: profile.data()?.photoUrl || ''
        };
      }
    }

    const interpreterByEmail = await db.collection('interpreters')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!interpreterByEmail.empty) {
      const profile = interpreterByEmail.docs[0].data();
      return {
        id: interpreterByEmail.docs[0].id,
        name: profile.name || name,
        email: profile.email || normalizedEmail,
        photoUrl: profile.photoUrl || ''
      };
    }
  }

  const normalizedName = name.trim();
  if (normalizedName) {
    const interpreterByName = await db.collection('interpreters')
      .where('name', '==', normalizedName)
      .limit(1)
      .get();
    if (!interpreterByName.empty) {
      const profile = interpreterByName.docs[0].data();
      return {
        id: interpreterByName.docs[0].id,
        name: profile.name || normalizedName,
        email: profile.email || normalizedEmail,
        photoUrl: profile.photoUrl || ''
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
} | null>>();

const resolveInterpreterCached = async (email: string, name: string) => {
  const key = `${cleanEmail(email)}|${name.trim().toLowerCase()}`;
  if (!interpreterCache.has(key)) {
    interpreterCache.set(key, resolveInterpreter(email, name));
  }
  return interpreterCache.get(key)!;
};

const slugify = (value: string): string => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'unknown';
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
  const bookingAgent = pick(fields, ['Booking Agent', 'Requester', 'Requested By', 'TR Requested By']);
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

  return {
    companyName,
    bookingAgent,
    email,
    phone,
    billingAddress,
    uniqueClientKey,
    sageAccountRef: pick(fields, ['Sage Account Ref', 'Sage ref']),
    invoiceContact: pick(fields, ['Invoice contact', 'Invoicing contact']),
    invoiceEmail: cleanEmail(pick(fields, ['invoice email', 'Invoicing email'])),
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
  },
  dryRun: boolean
) => {
  const key = `${dryRun ? 'dry' : 'write'}|${slugify(source.uniqueClientKey || source.clientName)}|${source.contactEmail}`;
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
    const key = identity.uniqueClientKey || identity.sageAccountRef;
    const byKey = await db.collection('clients')
      .where('airtableClientKey', '==', key)
      .limit(1)
      .get();
    if (!byKey.empty) return byKey.docs[0].ref;
  }

  if (identity.email) {
    const byEmail = await db.collection('clients')
      .where('email', '==', identity.email)
      .limit(1)
      .get();
    if (!byEmail.empty) return byEmail.docs[0].ref;
  }

  return db.collection('clients').doc(`airtable_client_${slugify(identity.uniqueClientKey || identity.email || identity.companyName || record.id)}`);
};

const mapClientRecord = (record: AirtableRecord, tableName: string) => {
  const fields = record.fields;
  const identity = pickClientIdentity(fields);
  const snapshotHash = stableHash({ tableName, identity });

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
      sourceSystem: 'AIRTABLE',
      sourceTable: tableName,
      sourceRecordId: record.id,
      sourceKey: slugify(identity.uniqueClientKey || identity.email || identity.companyName),
      airtableClientKey: identity.uniqueClientKey || identity.sageAccountRef || identity.companyName,
      sageAccountRef: identity.sageAccountRef,
      invoiceContact: identity.invoiceContact,
      invoiceEmail: identity.invoiceEmail,
      clientTrade: identity.clientTrade,
      airtableCreatedTime: record.createdTime || '',
      airtableSnapshotHash: snapshotHash,
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

const fetchAirtableRecordBatch = async (limitRecords: number, tableName = DEFAULT_TABLE_NAME, startOffset = '') => {
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

  do {
    const params: Record<string, string | number> = {
      pageSize: Math.min(100, Math.max(limitRecords - records.length, 1))
    };
    if (offset) params.offset = offset;

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
    tableName: resolvedTableName
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
  const resolvedInterpreter = await resolveInterpreterCached(interpreterEmail, interpreterName);
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
    interpreterName,
    interpreterEmail,
    interpreterPhone,
    interpreterAirtableRecordId,
    interpreterResolved: Boolean(resolvedInterpreter?.id)
  };

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
      sourceSystem: 'AIRTABLE',
      sourceTable: DEFAULT_TABLE_NAME,
      sourceRecordId: record.id,
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date().toISOString(),
      airtableCreatedTime: record.createdTime || '',
      airtableSnapshotHash: stableHash(sourceSnapshot),
      airtableOperationalStatus: statusMapping.rawStatus,
      airtableFinancialStatus: statusMapping.signals.invoiceStatus,
      airtableStatusSignals: statusMapping.signals,
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
  const completed = truthyField(fields, ['COMPLETED', 'TR Verified']) || normalized.includes('complete') || normalized.includes('verified');
  const invoiceNumber = pick(fields, ['Invoice No', 'INVOICE NO/DATE', 'TR Invoice Nbr']);
  const paid = truthyField(fields, ['Invoice Paid', 'TR barbara paid']) || normalized.includes('paid');
  const quoteRequested = truthyField(fields, ['Needs quote?']) || normalized.includes('quote');

  let status = 'INCOMING';
  if (normalized.includes('cancel')) status = 'CANCELLED';
  else if (paid) status = 'PAID';
  else if (invoiceNumber || normalized.includes('invoice')) status = 'INVOICED';
  else if (completed) status = 'READY_FOR_INVOICE';
  else if (quoteRequested) status = 'QUOTE_PENDING';
  else if (hasTranslator) status = 'BOOKED';

  return {
    status,
    rawStatus,
    signals: {
      completed,
      invoiceNumber,
      paid,
      quoteRequested
    }
  };
};

const mapTranslationRecordToBooking = async (record: AirtableRecord, tableName: string) => {
  const fields = record.fields;
  const legacyRef = pick(fields, ['TR NUMBER', 'Web Number', 'TR ID', 'Name', 'Reference']) || `TR-${record.id}`;
  const jobNumber = legacyRef || `TR-${record.id}`;
  const language = pick(fields, ['LANGUAGE', 'web language', 'Language', 'Target Language']) || 'Unknown';
  const clientIdentity = pickClientIdentity(fields);
  const translatorName = pick(fields, ['TRANSLATOR', 'Assign to TR', 'Assign to', 'Interpreters']);
  const translatorEmail = cleanEmail(pick(fields, ['EMAIL (from Assign to TR)', 'EMAIL (from assign to)', 'EMAIL', 'Translator Email']));
  const resolvedTranslator = await resolveInterpreterCached(translatorEmail, translatorName);
  const statusMapping = mapTranslationStatus(fields, Boolean(resolvedTranslator?.id || translatorName || translatorEmail));
  const createdOrCompleted = pickRaw(fields, ['COMPLETED', 'TR CREATED', 'Created', 'Last Modified']) || record.createdTime;
  const parsedDate = dateOnly(createdOrCompleted);
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
    language,
    clientIdentity,
    translatorName,
    translatorEmail,
    translatorResolved: Boolean(resolvedTranslator?.id),
    wordCount,
    numberOfDocs,
    finalQuote,
    format,
    notes,
    sourceFiles,
    status: statusMapping.status
  };

  return {
    booking: {
      clientId: '',
      clientName: clientIdentity.companyName,
      requestedByUserId: '',
      organizationId: 'lingland-main',
      serviceCategory: 'TRANSLATION',
      serviceType: 'Translation',
      languageFrom: 'English',
      languageTo: language,
      date: parsedDate.split('T')[0],
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
      bookingRef: jobNumber,
      jobNumber,
      displayRef: legacyRef,
      legacyAirtableRef: legacyRef,
      sourceSystem: 'AIRTABLE',
      sourceTable: tableName,
      sourceRecordId: record.id,
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date().toISOString(),
      airtableCreatedTime: record.createdTime || '',
      airtableSnapshotHash: stableHash(sourceSnapshot),
      airtableOperationalStatus: statusMapping.rawStatus,
      airtableFinancialStatus: pick(fields, ['Invoice Paid', 'Status']),
      airtableStatusSignals: statusMapping.signals,
      translationFormat: format,
      translationFormatOther: pick(fields, ['Other formats']),
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
  mode: SyncMode
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];

  for (const record of records) {
    try {
      const mapped = mapClientRecord(record, tableName);
      const clientRef = await findExistingClientRef(record, tableName, mapped.identity);
      const existing = await clientRef.get();
      const action: SyncAction = existing.exists
        ? (existing.data()?.airtableSnapshotHash === mapped.client.airtableSnapshotHash ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (!mode.dryRun && action !== 'skipped') {
        await clientRef.set({
          ...mapped.client,
          id: clientRef.id,
          createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceTable: tableName,
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
  sourceOfTruth: string | undefined
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];

  for (const record of records) {
    try {
      const mapped = await mapTranslationRecordToBooking(record, tableName);
      const clientResolution = await resolveClientCached({
        clientName: mapped.sourceSnapshot.clientIdentity.companyName,
        uniqueClientKey: mapped.sourceSnapshot.clientIdentity.uniqueClientKey || mapped.sourceSnapshot.clientIdentity.sageAccountRef,
        contactName: mapped.sourceSnapshot.clientIdentity.bookingAgent || mapped.sourceSnapshot.clientIdentity.invoiceContact,
        contactEmail: mapped.sourceSnapshot.clientIdentity.email || mapped.sourceSnapshot.clientIdentity.invoiceEmail,
        contactPhone: mapped.sourceSnapshot.clientIdentity.phone,
        location: mapped.sourceSnapshot.clientIdentity.billingAddress
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
      if (existing?.status && existing.status !== mapped.booking.status && sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
      }

      const action: SyncAction = existingSnap?.exists
        ? (existing?.airtableSnapshotHash === mapped.booking.airtableSnapshotHash ? 'skipped' : 'updated')
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
          sourceTable: tableName,
          jobNumber: mapped.booking.jobNumber,
          displayRef: mapped.booking.displayRef,
          clientName: mapped.booking.clientName,
          clientId: mapped.booking.clientId,
          clientAction: clientResolution.action,
          interpreterName: mapped.booking.interpreterName,
          interpreterId: mapped.booking.interpreterId,
          interpreterResolved: Boolean(mapped.booking.interpreterId),
          status: mapped.booking.status,
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
  sourceOfTruth: string | undefined
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
      const action: SyncAction = existing.exists
        ? (existing.data()?.airtableSnapshotHash === snapshotHash ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

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
          sourceSystem: 'AIRTABLE',
          sourceRecordId: record.id,
          sourceTable: CLIENT_INVOICES_TABLE,
          linkedRedbookRecordIds: linkedRedbookIds,
          airtableSnapshotHash: snapshotHash,
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
          invoiceNumber,
          clientName,
          linkedJobs: linkedRedbookIds.length,
          matchedBookings: bookings.length,
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
  sourceOfTruth: string | undefined
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
      const action: SyncAction = existing.exists
        ? (existing.data()?.airtableSnapshotHash === snapshotHash ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

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
          sourceSystem: 'AIRTABLE',
          sourceRecordId: record.id,
          sourceTable: INTERPRETER_INVOICES_TABLE,
          linkedRedbookRecordIds: linkedRedbookIds,
          airtableSnapshotHash: snapshotHash,
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
          invoiceNumber: invoiceRefText,
          interpreterName: resolvedInterpreter?.name || interpreterName,
          interpreterId,
          linkedJobs: linkedRedbookIds.length,
          matchedBookings: bookings.length,
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
  sourceOfTruth: string | undefined
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
      const firstBooking = bookings[0]?.data() || {};
      const totalAmount = safeNumber(pickRaw(fields, ['FINAL QUOTE', 'FQ+VAT', 'TR owed fees']));
      const status = mapClientInvoiceStatus(fields);
      const clientName = pick(fields, ['TR Agency', 'TR Requested By', 'TR client email']) || firstBooking.clientName || 'Translation Client';
      const clientId = firstBooking.clientId || `airtable_client_${slugify(clientName)}`;
      const issueDate = dateOnly(pickRaw(fields, ['COMPLETED', 'paid date', 'Last Modified']) || record.createdTime);
      const existing = await db.collection('clientInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({ invoiceNumber, status, totalAmount, clientId, clientName, linkedTranslationIds });
      const action: SyncAction = existing.exists
        ? (existing.data()?.airtableSnapshotHash === snapshotHash ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

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
          sourceSystem: 'AIRTABLE',
          sourceRecordId: record.id,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          linkedTranslationRecordIds: linkedTranslationIds,
          airtableSnapshotHash: snapshotHash,
          airtableStatus: pick(fields, ['TR Status', 'Status']),
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
          invoiceNumber,
          clientName,
          linkedJobs: linkedTranslationIds.length,
          matchedBookings: bookings.length,
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
  sourceOfTruth: string | undefined
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
      const interpreterId = resolvedTranslator?.id || `airtable_interpreter_${slugify(translatorEmail || translatorName || record.id)}`;
      const invoiceId = `airtable_translator_invoice_${record.id}`;
      const totalAmount = safeNumber(pickRaw(fields, ['RTR INV FEES', 'TR owed fees']));
      const wordCount = safeNumber(pickRaw(fields, ['RTR INV WORDS', 'TR owed words']));
      const docs = safeNumber(pickRaw(fields, ['RTR INV DOCS', 'TR owed docs']));
      const status = mapInterpreterInvoiceStatus(fields);
      const issueDate = dateOnly(record.createdTime || pickRaw(fields, ['Last Modified']));
      const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
      const snapshotHash = stableHash({ invoiceRefText, status, totalAmount, interpreterId, linkedTranslationIds, wordCount, docs });
      const action: SyncAction = existing.exists
        ? (existing.data()?.airtableSnapshotHash === snapshotHash ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

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
          sourceSystem: 'AIRTABLE',
          sourceRecordId: record.id,
          sourceTable: TRANSLATOR_INVOICES_TABLE,
          linkedTranslationRecordIds: linkedTranslationIds,
          airtableSnapshotHash: snapshotHash,
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
          invoiceNumber: invoiceRefText,
          interpreterName: resolvedTranslator?.name || translatorName,
          interpreterId,
          linkedJobs: linkedTranslationIds.length,
          matchedBookings: bookings.length,
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
  const redbookBatch = await fetchAirtableRecordBatch(
    mode.limitRecords,
    DEFAULT_TABLE_NAME,
    mode.tableOffsets?.[DEFAULT_TABLE_NAME] || ''
  );
  const records = redbookBatch.records;
  const [clientInvoiceRecords, interpreterInvoiceRecords] = includeFinance
    ? await Promise.all([
      fetchAirtableRecordBatch(
        mode.limitRecords,
        CLIENT_INVOICES_TABLE,
        mode.tableOffsets?.[CLIENT_INVOICES_TABLE] || ''
      ).then(batch => batch.records),
      fetchAirtableRecordBatch(
        mode.limitRecords,
        INTERPRETER_INVOICES_TABLE,
        mode.tableOffsets?.[INTERPRETER_INVOICES_TABLE] || ''
      ).then(batch => batch.records)
    ])
    : [[], []];
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
      const mapped = await mapRecordToBooking(record);
      const clientResolution = await resolveClientCached({
        clientName: mapped.sourceSnapshot.clientName,
        uniqueClientKey: mapped.sourceSnapshot.uniqueClientKey,
        contactName: mapped.sourceSnapshot.contactName,
        contactEmail: mapped.sourceSnapshot.contactEmail,
        contactPhone: mapped.sourceSnapshot.contactPhone,
        location: mapped.sourceSnapshot.location
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
      if (existing?.status && existing.status !== mapped.booking.status && platformMode.sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
      }
      const previousHash = existing?.airtableSnapshotHash;
      const action: SyncAction = existingSnap?.exists ? (previousHash === mapped.booking.airtableSnapshotHash ? 'skipped' : 'updated') : 'created';

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
          jobNumber: mapped.booking.jobNumber,
          displayRef: mapped.booking.displayRef,
          clientName: mapped.booking.clientName,
          patientName: mapped.booking.patientName,
          clientId: mapped.booking.clientId,
          clientAction: clientResolution.action,
          interpreterName: mapped.booking.interpreterName,
          interpreterId: mapped.booking.interpreterId,
          interpreterResolved: Boolean(mapped.booking.interpreterId),
          status: mapped.booking.status,
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
      syncClientInvoices(clientInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth),
      syncInterpreterInvoices(interpreterInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth)
    ])
    : [
      { stats: emptyActionStats(), details: [] },
      { stats: emptyActionStats(), details: [] }
    ];
  const financeErrorCount = clientInvoiceSync.stats.error + interpreterInvoiceSync.stats.error;

  const finishedAt = new Date().toISOString();
  const result = {
    success: stats.error === 0 && (!includeFinance || financeErrorCount === 0),
    mappingVersion: 'redbook-status-finance-v3',
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
    startedAt,
    finishedAt,
    stats,
    financeStats: {
      clientInvoices: clientInvoiceSync.stats,
      interpreterInvoices: interpreterInvoiceSync.stats
    },
    details
  };

  if (!mode.dryRun) {
    const report = cleanReportData(result);
    await runRef.set({
      ...report,
      kind: 'AIRTABLE_REDBOOK',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('system').doc('airtableRedbookSync').set({
      lastRunId: runRef.id,
      lastRunAt: finishedAt,
      lastStats: stats,
      lastTotalRecords: records.length,
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

  const fetchModuleRecords = async (tableName: string) => {
    const batch = await fetchAirtableRecordBatch(
      mode.limitRecords,
      tableName,
      mode.tableOffsets?.[tableName] || ''
    );
    nextOffsets[tableName] = batch.nextOffset || '';
    return batch.records;
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
      details: result.details
    });
  };

  if (modules.includes('clients')) {
    const [clients, clientsBook] = await Promise.all([
      fetchModuleRecords(CLIENTS_TABLE),
      fetchModuleRecords(CLIENTS_BOOK_TABLE)
    ]);
    const clientsResult = await syncClients(clients, CLIENTS_TABLE, effectiveMode);
    const clientsBookResult = await syncClients(clientsBook, CLIENTS_BOOK_TABLE, effectiveMode);
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
    const [translations, webTranslations] = await Promise.all([
      fetchModuleRecords(TRANSLATIONS_TABLE),
      fetchModuleRecords(WEB_TRANSLATIONS_TABLE)
    ]);
    const translationResult = await syncTranslationBookings(translations, TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth);
    const webTranslationResult = await syncTranslationBookings(webTranslations, WEB_TRANSLATIONS_TABLE, effectiveMode, platformMode.sourceOfTruth);
    const combined = {
      stats: emptyActionStats(),
      details: [...translationResult.details, ...webTranslationResult.details].slice(0, MAX_DETAILS)
    };
    addStats(combined.stats, translationResult.stats);
    addStats(combined.stats, webTranslationResult.stats);
    pushModule('translations', 'Translation jobs', [TRANSLATIONS_TABLE, WEB_TRANSLATIONS_TABLE], translations.length + webTranslations.length, combined);
  }

  if (modules.includes('clientInvoices')) {
    const records = await fetchModuleRecords(CLIENT_INVOICES_TABLE);
    const result = await syncClientInvoices(records, effectiveMode, platformMode.sourceOfTruth);
    pushModule('clientInvoices', 'Client invoices', [CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('interpreterInvoices')) {
    const records = await fetchModuleRecords(INTERPRETER_INVOICES_TABLE);
    const result = await syncInterpreterInvoices(records, effectiveMode, platformMode.sourceOfTruth);
    pushModule('interpreterInvoices', 'Interpreter invoices', [INTERPRETER_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translationClientInvoices')) {
    const records = await fetchModuleRecords(TRANSLATION_CLIENT_INVOICES_TABLE);
    const result = await syncTranslationClientInvoices(records, effectiveMode, platformMode.sourceOfTruth);
    pushModule('translationClientInvoices', 'Translation client invoices', [TRANSLATION_CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translatorInvoices')) {
    const records = await fetchModuleRecords(TRANSLATOR_INVOICES_TABLE);
    const result = await syncTranslatorInvoices(records, effectiveMode, platformMode.sourceOfTruth);
    pushModule('translatorInvoices', 'Translator invoices', [TRANSLATOR_INVOICES_TABLE], records.length, result);
  }

  const finishedAt = new Date().toISOString();
  const result = {
    success: overallStats.error === 0,
    mappingVersion: 'airtable-sync-center-v1',
    dryRun: effectiveMode.dryRun,
    importMode,
    triggeredBy: mode.triggeredBy,
    userId: mode.userId || '',
    modules,
    startedAt,
    finishedAt,
    stats: overallStats,
    nextOffsets,
    moduleResults
  };

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
    const report = cleanReportData(result);

    await runRef.set({
      ...report,
      kind: 'AIRTABLE_SYNC_CENTER',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await syncCenterRef.set({
      lastRunId: runRef.id,
      lastRunAt: finishedAt,
      lastStats: overallStats,
      lastModules: modules,
      tableOffsets: mergedTableOffsets,
      moduleCheckpoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return result;
};

export const syncRedbookJobs = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const dryRun = Boolean(data?.dryRun);
  const limitRecords = Math.min(Number(data?.limitRecords || 500), 5000);

  return syncRecords({
    dryRun,
    limitRecords,
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
  const limitRecords = Math.min(Number(data?.limitRecords || 500), 5000);
  const modules = normalizeModules(data?.modules);

  return syncAirtableOperations({
    dryRun,
    limitRecords,
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
    const limitRecords = Math.min(Number(req.body?.limitRecords || 100), 1000);
    const modules = normalizeModules(req.body?.modules);
    const tableOffsets = req.body?.tableOffsets || req.body?.offsets || {};
    const result = await syncAirtableOperations({
      dryRun,
      limitRecords,
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
  const limitRecords = Math.min(Number(syncData.limitRecords || legacyData.limitRecords || 250), 1000);

  console.log(`[Airtable Sync] Scheduled module ${module} with limit ${limitRecords}.`);
  await syncAirtableOperations({
    dryRun: false,
    limitRecords,
    triggeredBy: 'schedule',
    tableOffsets: syncData.tableOffsets || legacyData.tableOffsets || {}
  }, [module]);

  await syncCenterRef.set({
    scheduleEnabled: true,
    scheduledModules,
    lastScheduledModule: module,
    lastScheduledModuleIndex: moduleIndex + 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return null;
});
