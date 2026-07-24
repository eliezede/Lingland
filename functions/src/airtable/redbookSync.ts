import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  STATUS_RANK,
  allocateInvoiceLineAmount,
  canonicalAirtableStatus,
  mapClientInvoiceStatusToBookingStatus,
  mapClientInvoiceStatusToPaymentStatus,
  mapClientInvoiceStatusValue,
  mapExplicitRedbookStatus,
  mapExplicitTranslationStatus,
  mapInterpreterInvoiceStatusValue,
  preserveStatusIfLocalAhead,
} from './statusMapping';
import axios from 'axios';
import { normalizeIdentityName, normalizeIdentityPhone } from './identityMatching';
import { createHash } from 'crypto';
import {
  fingerprintAirtableSnapshot,
  hashAirtableRecordFields,
  hashStableValue,
  mergeAirtableSnapshots,
} from './recordStability';
import {
  projectClientFinanceHierarchy,
  projectClientInvoiceLineHierarchy,
} from '../clients/clientFinanceScope';
import {
  buildTranslationClientEvidence,
  enrichTranslationClientIdentity,
  TranslationClientEvidence,
} from './translationClientEvidence';
import {
  AIRTABLE_SYNC_MAPPING_VERSION,
  validateSyncWriteApproval,
} from './syncWriteApproval';
import { validateProfessionalIdentityLinkRequest } from './professionalIdentityLinkPolicy';
import {
  buildClientBookProjection,
  CLIENT_BOOK_PROJECTION_VERSION,
  ClientBookCanonicalResolution,
  ClientBookSourceRecord,
} from './clientBookProjection';
import { normalizeOrganizationName } from '../clients/clientIdentityAuditCore';
import {
  ClientIdentityRecommendation,
  ClientIdentityRecommendationProfile,
  recommendCanonicalClient,
} from './clientIdentityRecommendations';
import {
  validateClientIdentityDeferralRequest,
  validateClientIdentityDeferralReviewRun,
  validateClientIdentityMappingBatch,
  validateClientIdentityManualMappingBatch,
  validateClientIdentityManualReviewRun,
  validateClientIdentityPendingCanonicalApproval,
  validateClientIdentityPendingCanonicalTarget,
  validateClientIdentityRecommendationRun,
} from './clientIdentityMappingPolicy';
import { writeAuditEvent } from '../audit/auditWriter';
import {
  auditBookingInvoiceLinks,
  getExpectedFinancialInvoiceStatus,
} from './financialLinkIntegrity';
import {
  aggregateClientInvoiceRows,
  requiresIssuedInvoiceIntegrity,
  shouldReportInvoiceLinkConflict,
} from './clientInvoiceAggregation';
import { pickExactLinkedRecordIds } from './linkedRecordExtraction';

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
  sourceRecordIds?: string[];
  approvedByDryRunId?: string;
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
  strictFormula?: boolean;
  stabilize?: boolean;
};

const db = admin.firestore();
const DEFAULT_BASE_ID = 'appnglRJzSscwJJph'; // Lingland MASTER 24 NEW
const DEFAULT_TABLE_NAME = 'REDBOOK';
const INTERPRETERS_TABLE = 'Interpreters';
const CLIENTS_TABLE = 'Clients';
const CLIENTS_BOOK_TABLE = 'Clients Book';
const DEPARTMENTS_TABLE = 'Departments';
const TRANSLATIONS_TABLE = 'Translations';
const WEB_TRANSLATIONS_TABLE = 'Web translations';
const CLIENT_INVOICES_TABLE = 'Invoices';
const INTERPRETER_INVOICES_TABLE = 'INV interp';
const TRANSLATION_CLIENT_INVOICES_TABLE = 'TR invoices';
const TRANSLATOR_INVOICES_TABLE = 'INV TR';
const MAX_DETAILS = 50;
const MODULE_DETAIL_LIMIT = 30;
const REDBOOK_PROCESS_CONCURRENCY = 8;
const CLIENT_PROCESS_CONCURRENCY = 8;
const ASSIGNMENTS_COLLECTION = 'assignments';
const DEFAULT_SYNC_STRATEGY: AirtableSyncStrategy = 'OPEN_WORKFLOW';
const FINANCE_PROJECTION_VERSION = 3;

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
  return pickExactLinkedRecordIds(fields, names);
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

type MoneyFieldSelection = {
  value: number;
  fieldName: string;
  found: boolean;
};

const parseMoneyValue = (value: unknown): number | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseMoneyValue(entry);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/\d/.test(value)) return null;
  const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const selectMoneyField = (
  fields: Record<string, unknown>,
  preferredNames: string[],
  fallbackHints: string[] = []
): MoneyFieldSelection => {
  const entries = Object.entries(fields);
  const byNormalizedName = new Map(entries.map(([key, value]) => [normalizeKey(key), { key, value }]));
  const preferredMatches = preferredNames
    .map(name => byNormalizedName.get(normalizeKey(name)))
    .filter((entry): entry is { key: string; value: unknown } => Boolean(entry))
    .map(entry => ({ ...entry, parsed: parseMoneyValue(entry.value) }))
    .filter(entry => entry.parsed !== null);

  const preferred = preferredMatches.find(entry => Math.abs(entry.parsed || 0) > 0) || preferredMatches[0];
  if (preferred) {
    return { value: preferred.parsed || 0, fieldName: preferred.key, found: true };
  }

  const normalizedHints = fallbackHints.map(normalizeKey).filter(Boolean);
  const excludedKeyParts = [
    'date', 'status', 'number', 'nbr', 'reference', 'recordid', 'email', 'phone',
    'wordcount', 'words', 'documents', 'docs', 'quantity', 'rate', 'percentage', 'vatnumber'
  ];
  const discovered = entries
    .map(([key, value]) => ({ key, normalizedKey: normalizeKey(key), parsed: parseMoneyValue(value) }))
    .filter(entry => entry.parsed !== null)
    .filter(entry => normalizedHints.some(hint => entry.normalizedKey.includes(hint)))
    .filter(entry => !excludedKeyParts.some(excluded => entry.normalizedKey.includes(excluded)));
  const fallback = discovered.find(entry => Math.abs(entry.parsed || 0) > 0) || discovered[0];
  return fallback
    ? { value: fallback.parsed || 0, fieldName: fallback.key, found: true }
    : { value: 0, fieldName: '', found: false };
};

const collectFinancialFieldEvidence = (fields: Record<string, unknown>) => {
  const hints = ['invoice', 'sage', 'amount', 'total', 'vat', 'fee', 'paid', 'status'];
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => hints.some(hint => normalizeKey(key).includes(hint)))
      .slice(0, 40)
  );
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
  const explicitStatus = mapExplicitRedbookStatus(rawStatus);
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

const stableHash = hashStableValue;

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
  if (!input.runId || input.dryRun) return;
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
    resolutionStatus: 'OPEN',
    resolvedAt: null,
    resolvedBy: '',
    resolutionMethod: '',
    resolutionRunId: '',
    firstSeenAt: existing.exists ? existing.data()?.firstSeenAt : admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }), { merge: true });
};

type ConflictReconciliationContext = {
  processedScopes: Set<string>;
};

const createConflictReconciliationContext = (): ConflictReconciliationContext => ({
  processedScopes: new Set<string>()
});

const conflictScopeKey = (sourceTable: string, sourceRecordId: string) => (
  `${normalizeKey(sourceTable)}|${sourceRecordId.trim()}`
);

const markConflictScopeProcessed = (
  context: ConflictReconciliationContext | undefined,
  sourceTable: string,
  sourceRecordId: string
) => {
  if (!context || !sourceRecordId) return;
  context.processedScopes.add(conflictScopeKey(sourceTable, sourceRecordId));
};

const resolveStaleSyncConflicts = async (
  runId: string,
  context: ConflictReconciliationContext,
  dryRun: boolean
) => {
  if (dryRun || context.processedScopes.size === 0) return 0;

  const openConflicts = await db.collection('syncConflicts')
    .where('resolutionStatus', '==', 'OPEN')
    .get();
  const staleConflicts = openConflicts.docs.filter(item => {
    const data = item.data();
    const scope = conflictScopeKey(normalize(data.sourceTable), normalize(data.sourceRecordId));
    return context.processedScopes.has(scope) && normalize(data.runId) !== runId;
  });

  for (let start = 0; start < staleConflicts.length; start += 400) {
    const batch = db.batch();
    staleConflicts.slice(start, start + 400).forEach(item => {
      batch.set(item.ref, {
        resolutionStatus: 'RESOLVED',
        resolutionMethod: 'AUTOMATIC_SYNC_RECONCILIATION',
        resolutionReason: 'Source record reprocessed successfully without reproducing this conflict.',
        resolutionRunId: runId,
        resolvedBy: 'SYSTEM',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }

  return staleConflicts.length;
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
  matchMethod: 'sourceRecordId' | 'airtableRecordIds' | 'userEmail' | 'profileEmail' | 'exactName' | 'normalizedName' | 'profilePhone';
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

type InterpreterDirectoryItem = { id: string; data: admin.firestore.DocumentData };

let interpreterDirectoryPromise: Promise<InterpreterDirectoryItem[]> | null = null;

const getInterpreterDirectory = () => {
  if (!interpreterDirectoryPromise) {
    interpreterDirectoryPromise = db.collection('interpreters').get().then(snapshot => (
      snapshot.docs.map(item => ({ id: item.id, data: item.data() }))
    ));
  }
  return interpreterDirectoryPromise;
};

const matchInterpreterDirectory = (
  directory: InterpreterDirectoryItem[],
  predicate: (item: InterpreterDirectoryItem) => boolean,
  fallback: { name: string; email: string },
  matchMethod: InterpreterResolution['matchMethod'],
  matchConfidence: number
): InterpreterResolution | null => {
  const matches = directory.filter(predicate);
  if (matches.length === 1) {
    return toInterpreterResolution(matches[0].id, matches[0].data, fallback, matchMethod, matchConfidence);
  }
  if (matches.length > 1) {
    return {
      id: '',
      name: fallback.name,
      email: fallback.email,
      photoUrl: '',
      matchMethod,
      matchConfidence: 0,
      ambiguousCandidates: matches.map(item => item.id)
    };
  }
  return null;
};

const resolveInterpreter = async (email: string, name: string, airtableRecordId = '', phone = '') => {
  const normalizedEmail = cleanEmail(email);
  const normalizedName = name.trim();
  const normalizedNameKey = normalizeIdentityName(normalizedName);
  const normalizedPhoneKey = normalizeIdentityPhone(phone);
  const fallback = { name: normalizedName, email: normalizedEmail };
  const directory = await getInterpreterDirectory();

  if (airtableRecordId) {
    const bySource = matchInterpreterDirectory(
      directory,
      item => String(item.data.sourceRecordId || '') === airtableRecordId,
      fallback,
      'sourceRecordId',
      100
    );
    if (bySource) return bySource;

    const byLinkedRecord = matchInterpreterDirectory(
      directory,
      item => Array.isArray(item.data.airtableRecordIds) && item.data.airtableRecordIds.map(String).includes(airtableRecordId),
      fallback,
      'airtableRecordIds',
      98
    );
    if (byLinkedRecord) return byLinkedRecord;
  }

  if (normalizedEmail) {
    const interpreterByEmail = matchInterpreterDirectory(
      directory,
      item => cleanEmail(String(item.data.email || '')) === normalizedEmail,
      fallback,
      'profileEmail',
      94
    );
    if (interpreterByEmail) return interpreterByEmail;

    const userByEmail = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!userByEmail.empty) {
      const user = userByEmail.docs[0].data();
      if (user.profileId) {
        const directoryProfile = directory.find(item => item.id === user.profileId);
        const profile = directoryProfile?.data || (await db.collection('interpreters').doc(user.profileId).get()).data();
        return toInterpreterResolution(user.profileId, profile, { name: user.displayName || name, email: user.email || normalizedEmail }, 'userEmail', 96);
      }
    }
  }

  if (normalizedPhoneKey) {
    const byPhone = matchInterpreterDirectory(
      directory,
      item => normalizeIdentityPhone(String(item.data.normalizedPhone || item.data.phone || '')) === normalizedPhoneKey,
      fallback,
      'profilePhone',
      90
    );
    if (byPhone) return byPhone;
  }

  if (normalizedName) {
    const byExactName = matchInterpreterDirectory(
      directory,
      item => String(item.data.name || '').trim() === normalizedName,
      fallback,
      'exactName',
      82
    );
    if (byExactName) return byExactName;

    const byNormalizedName = matchInterpreterDirectory(
      directory,
      item => normalizeIdentityName(String(item.data.normalizedName || item.data.name || '')) === normalizedNameKey,
      fallback,
      'normalizedName',
      74
    );
    if (byNormalizedName) return byNormalizedName;
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

const resolveInterpreterCached = async (email: string, name: string, airtableRecordId = '', phone = '') => {
  const key = `${airtableRecordId}|${cleanEmail(email)}|${normalizeIdentityName(name)}|${normalizeIdentityPhone(phone)}`;
  if (!interpreterCache.has(key)) {
    interpreterCache.set(key, resolveInterpreter(email, name, airtableRecordId, phone));
  }
  return interpreterCache.get(key)!;
};

const slugify = (value: string): string => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'unknown';
};

const normalizeForMatch = (value: string): string => {
  return normalize(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|plc|nhs|trust|cic|llp|department|dept|service|services)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

const GENERIC_CLIENT_NAMES = new Set([
  '',
  'airtable client',
  'translation client',
  'unknown client',
  'client',
  'home',
  'me',
  'n a',
  'na',
]);

const GENERIC_CLIENT_IDS = new Set([
  'airtable_client_airtable-client',
  'airtable_client_translation-client',
  'airtable_client_unknown-client',
  'airtable_client_client',
  'airtable_client_home',
  'airtable_client_me',
]);

const uniqueValues = (...values: Array<string | undefined | null>): string[] => {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
};

const pickClientIdentity = (fields: Record<string, unknown>) => {
  const companyName = pick(fields, [
    'Name',
    'TR Agency',
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

const canonicalClientRef = (snapshot: admin.firestore.DocumentSnapshot) => {
  const snapshotData = snapshot.data() || {};
  const mergedIntoClientId = normalize(snapshotData.mergedIntoClientId);
  return normalize(snapshotData.recordState).toUpperCase() === 'MERGED' && mergedIntoClientId
    ? db.collection('clients').doc(mergedIntoClientId)
    : snapshot.ref;
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
  dryRun: boolean,
  allowCreate = true,
  allowNormalizedNameMatch = true,
) => {
  const sourceKey = slugify(source.uniqueClientKey || source.clientName);
  const clientId = `airtable_client_${sourceKey}`;
  const existingById = await db.collection('clients').doc(clientId).get();
  if (existingById.exists) {
    const clientRef = canonicalClientRef(existingById);
    return { id: clientRef.id, action: clientRef.id === existingById.id ? 'matched' : 'matched-merged-alias', created: false };
  }

  const accountKeys = uniqueValues(source.uniqueClientKey, source.sageAccountRef);
  const accountCandidateIds = new Set<string>();
  for (const accountKey of accountKeys) {
    const sourceKey = slugify(accountKey);
    const lookups = await Promise.all([
      db.collection('clients').where('airtableClientKey', '==', accountKey).limit(10).get(),
      db.collection('clients').where('sageAccountRef', '==', accountKey).limit(10).get(),
      db.collection('clients').where('sourceKey', '==', sourceKey).limit(10).get(),
      db.collection('clients').where('accountAliases', 'array-contains', accountKey).limit(10).get(),
    ]);
    lookups.forEach(snapshot => snapshot.docs.forEach(document => {
      accountCandidateIds.add(canonicalClientRef(document).id);
    }));
  }
  if (accountCandidateIds.size === 1) {
    return { id: Array.from(accountCandidateIds)[0], action: 'matched-account-key', created: false };
  }

  const normalizedCompanyName = source.normalizedCompanyName || normalizeForMatch(source.clientName);
  if (allowNormalizedNameMatch && normalizedCompanyName && !GENERIC_CLIENT_NAMES.has(normalizedCompanyName)) {
    const byName = await db.collection('clients')
      .where('normalizedCompanyName', '==', normalizedCompanyName)
      .limit(10)
      .get();
    const canonicalIds = Array.from(new Set(byName.docs.map(document => canonicalClientRef(document).id)));
    if (canonicalIds.length === 1) return { id: canonicalIds[0], action: 'matched-normalized-name', created: false };
  }

  if (accountCandidateIds.size > 1) {
    return { id: clientId, action: 'unresolved-account-key-ambiguous', created: false };
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

  if (!allowCreate) {
    return { id: clientId, action: 'unresolved-client', created: false };
  }

  if (!dryRun) {
    await db.collection('clients').doc(clientId).set(clientData, { merge: true });
  }

  return { id: clientId, action: dryRun ? 'would-create' : 'created', created: true };
};

const clientCache = new Map<string, Promise<{ id: string; action: string; created: boolean }>>();
const bookingByAirtableRecordCache = new Map<string, Promise<admin.firestore.DocumentSnapshot | null>>();
let platformClientDirectoryPromise: Promise<admin.firestore.QueryDocumentSnapshot[]> | null = null;

const getPlatformClientDirectory = async () => {
  if (!platformClientDirectoryPromise) {
    platformClientDirectoryPromise = db.collection('clients').get().then(snapshot => snapshot.docs);
  }
  return platformClientDirectoryPromise;
};

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
  dryRun: boolean,
  allowCreate = true,
  allowNormalizedNameMatch = true,
) => {
  const key = `${dryRun ? 'dry' : 'write'}|${allowCreate ? 'create' : 'match'}|${allowNormalizedNameMatch ? 'name' : 'strict'}|${slugify(source.uniqueClientKey || source.sageAccountRef || source.clientName)}|${source.contactEmail}|${source.invoiceEmail || ''}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, resolveClient(source, dryRun, allowCreate, allowNormalizedNameMatch));
  }
  return clientCache.get(key)!;
};

const resolveInvoiceClient = async (
  firstBookingClientId: string,
  clientName: string,
  fields: Record<string, unknown>,
  dryRun: boolean,
) => {
  if (firstBookingClientId) return { id: firstBookingClientId, action: 'matched-job', created: false };
  const uniqueClientKey = pick(fields, [
    'Unique Client Key', 'Client Key', 'Account Ref', 'Account Code', 'Account (from invoice to)', 'invoice to',
  ]);
  const sageAccountRef = pick(fields, ['Sage Account Ref', 'Sage ref', 'Sage Code', 'SAGE Account']);
  const contactEmail = cleanEmail(pick(fields, [
    'invoice email', 'Invoicing email', 'Accounts email', 'Finance email', 'TR client email', 'Email',
  ]));
  const normalizedCompanyName = normalizeForMatch(clientName);
  const placeholderName = GENERIC_CLIENT_NAMES.has(normalizedCompanyName);
  if (placeholderName && !uniqueClientKey && !sageAccountRef && !contactEmail) {
    return {
      id: `airtable_client_${slugify(clientName)}`,
      action: 'unresolved-placeholder',
      created: false,
    };
  }
  return resolveClientCached({
    clientName,
    uniqueClientKey: uniqueClientKey || sageAccountRef || clientName,
    contactName: pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact', 'TR Requested By']),
    contactEmail,
    contactPhone: pick(fields, ['invoice phone', 'Invoicing phone', 'Accounts phone', 'Finance phone']),
    location: pick(fields, ['Invoice address', 'Invoicing address', 'Address']),
    sageAccountRef,
    invoiceEmail: contactEmail,
    invoiceContact: pick(fields, ['Invoice contact', 'Invoicing contact', 'Accounts contact', 'Finance contact']),
    normalizedCompanyName,
  }, dryRun, false, false);
};

const findExistingClientRef = async (
  record: AirtableRecord,
  tableName: string,
  identity: ReturnType<typeof pickClientIdentity>,
  identityMappings: Map<string, ClientIdentityMapping>,
) => {
  const mappingGroupKey = normalizeOrganizationName(
    identity.sageAccountRef || identity.uniqueClientKey || identity.companyName,
  );
  const identityMapping = identityMappings.get(clientIdentityMappingScopeKey(tableName, mappingGroupKey));
  if (identityMapping?.action === 'MAP_TO_CLIENT') {
    const mapped = await db.collection('clients').doc(identityMapping.canonicalClientId).get();
    if (!mapped.exists) throw new Error(`Mapped canonical client ${identityMapping.canonicalClientId} was not found.`);
    const canonical = canonicalClientRef(mapped);
    return canonical;
  }
  if (identityMapping?.action === 'APPROVE_NEW_CLIENT') {
    return db.collection('clients').doc(identityMapping.canonicalClientId);
  }

  const bySource = await db.collection('clients')
    .where('sourceRecordId', '==', record.id)
    .limit(1)
    .get();
  if (!bySource.empty && bySource.docs[0].data().sourceTable === tableName) return canonicalClientRef(bySource.docs[0]);

  if (identity.uniqueClientKey || identity.sageAccountRef) {
    for (const key of uniqueValues(identity.uniqueClientKey, identity.sageAccountRef)) {
      const byKey = await db.collection('clients')
        .where('airtableClientKey', '==', key)
        .limit(1)
        .get();
      if (!byKey.empty) return canonicalClientRef(byKey.docs[0]);

      const bySage = await db.collection('clients')
        .where('sageAccountRef', '==', key)
        .limit(1)
        .get();
      if (!bySage.empty) return canonicalClientRef(bySage.docs[0]);
    }
  }

  if (identity.normalizedCompanyName) {
    const byName = await db.collection('clients')
      .where('normalizedCompanyName', '==', identity.normalizedCompanyName)
      .limit(10)
      .get();
    const canonicalRefs = new Map(
      byName.docs.map(document => {
        const ref = canonicalClientRef(document);
        return [ref.id, ref] as const;
      }),
    );
    if (canonicalRefs.size === 1) return Array.from(canonicalRefs.values())[0];
  }

  const normalizedIdentityKeys = new Set(uniqueValues(
    identity.companyName,
    identity.normalizedCompanyName,
    identity.uniqueClientKey,
  ).map(normalizeOrganizationName).filter(Boolean));
  if (normalizedIdentityKeys.size > 0) {
    const directory = await getPlatformClientDirectory();
    const canonicalRefs = new Map<string, admin.firestore.DocumentReference>();
    directory.forEach(document => {
      const data = document.data() || {};
      const state = normalize(data.recordState).toUpperCase();
      if (state === 'ARCHIVED') return;
      const candidateKeys = uniqueValues(
        normalize(data.companyName),
        normalize(data.normalizedCompanyName),
        ...(Array.isArray(data.accountAliases) ? data.accountAliases.map(normalize) : []),
      ).map(normalizeOrganizationName).filter(Boolean);
      if (!candidateKeys.some(key => normalizedIdentityKeys.has(key))) return;
      const ref = canonicalClientRef(document);
      canonicalRefs.set(ref.id, ref);
    });
    if (canonicalRefs.size === 1) return Array.from(canonicalRefs.values())[0];
  }

  return db.collection('clients').doc(`airtable_client_${slugify(identity.uniqueClientKey || identity.companyName || record.id)}`);
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
      sourceKey: slugify(identity.uniqueClientKey || identity.companyName || record.id),
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

type ClientBookResolutionMethod =
  | 'CANONICAL_ACCOUNT'
  | 'EXACT_PLATFORM_IDENTITY'
  | 'MANUAL_IDENTITY_MAPPING'
  | 'APPROVED_NEW_CANONICAL_ORGANISATION'
  | 'EXPLICIT_DEPARTMENT_LINK';

type ClientIdentityMappingAction = 'MAP_TO_CLIENT' | 'APPROVE_NEW_CLIENT' | 'DEFER_SOURCE';

type ClientIdentityMapping = {
  id: string;
  sourceTable: string;
  groupKey: string;
  action: ClientIdentityMappingAction;
  canonicalClientId: string;
  canonicalCompanyName: string;
  deferralCategory?: string;
  reason?: string;
};

type CanonicalAirtableClientAccount = {
  sourceRecordId: string;
  clientId: string;
  companyName: string;
  identityKeys: string[];
  names: string[];
  accountKeys: string[];
  emails: string[];
  phones: string[];
  addresses: string[];
};

type ClientBookResolutionConflict = {
  sourceTable: string;
  groupKey: string;
  sourceRecordIds: string[];
  companyNames: string[];
  candidateClientIds: string[];
  recommendation?: ClientIdentityRecommendation;
  reason:
    | 'AMBIGUOUS_CANONICAL_CLIENT'
    | 'GENERIC_ORGANISATION_IDENTITY'
    | 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED'
    | 'MAPPED_CANONICAL_CLIENT_NOT_FOUND'
    | 'DEPARTMENT_CLIENT_NOT_RESOLVED'
    | 'DEPARTMENT_CLIENT_AMBIGUOUS';
};

type ClientIdentityDeferredSource = {
  sourceTable: string;
  groupKey: string;
  sourceRecordIds: string[];
  sourceNames: string[];
  category: string;
  reason: string;
};

const canonicalRecommendationProfiles = (
  accounts: CanonicalAirtableClientAccount[],
): ClientIdentityRecommendationProfile[] => accounts.map(account => ({
  id: account.clientId,
  label: account.companyName,
  names: account.names,
  accountKeys: account.accountKeys,
  emails: account.emails,
  phones: account.phones,
  addresses: account.addresses,
}));

const recommendClientBookCanonicalAccount = (
  sources: ClientBookSourceRecord[],
  accounts: CanonicalAirtableClientAccount[],
) => {
  const representative = sources[0];
  if (!representative) return null;
  return recommendCanonicalClient({
    id: `${representative.sourceTable || CLIENTS_BOOK_TABLE}:${clientBookGroupKey(representative)}`,
    label: representative.companyName || representative.departmentName || 'Airtable client identity',
    names: uniqueValues(
      ...sources.flatMap(source => [source.companyName, source.departmentName, source.locationName]),
    ),
    accountKeys: uniqueValues(...sources.map(source => source.stableKey)),
    emails: uniqueValues(...sources.flatMap(source => [source.bookingEmail, source.invoiceEmail])),
    phones: uniqueValues(...sources.map(source => source.bookingPhone)),
    addresses: uniqueValues(...sources.map(source => source.billingAddress || '')),
  }, canonicalRecommendationProfiles(accounts));
};

const mapClientBookSourceRecord = (record: AirtableRecord): ClientBookSourceRecord => {
  const identity = pickClientIdentity(record.fields);
  return {
    sourceRecordId: record.id,
    companyName: identity.companyName,
    stableKey: pick(record.fields, ['Unique Client Key']) || identity.companyName,
    bookingAgent: identity.bookingAgent,
    bookingEmail: identity.email,
    bookingPhone: identity.phone,
    invoiceEmail: cleanEmail(pick(record.fields, [
      'Invoicing address/email',
      'invoice email',
      'Invoicing email',
    ])),
    invoiceContact: identity.invoiceContact,
    departmentName: identity.departmentName,
    locationName: identity.locationName,
    billingAddress: identity.billingAddress,
  };
};

const mapDepartmentSourceRecord = (
  record: AirtableRecord,
  canonicalCompanyName: string,
): ClientBookSourceRecord => ({
  sourceRecordId: record.id,
  sourceTable: DEPARTMENTS_TABLE,
  companyName: canonicalCompanyName,
  stableKey: canonicalCompanyName,
  bookingAgent: pick(record.fields, ['Contact']),
  bookingEmail: cleanEmail(pick(record.fields, ['email', 'Email'])),
  bookingPhone: pick(record.fields, ['Phone']),
  invoiceEmail: '',
  departmentName: pick(record.fields, ['Name']),
  locationName: pick(record.fields, ['Name']),
  billingAddress: pick(record.fields, ['Ward/dep Address', 'Ward/Dep PC']),
});

const airtableSourceRecordId = (sourceId: string) => {
  const match = sourceId.match(/(rec[A-Za-z0-9]+)$/);
  return match?.[1] || sourceId;
};

const clientBookGroupKey = (source: ClientBookSourceRecord) => (
  normalizeOrganizationName(source.stableKey || source.companyName)
);

const canonicalClientDocument = async (snapshot: admin.firestore.DocumentSnapshot) => {
  const ref = canonicalClientRef(snapshot);
  return ref.id === snapshot.id ? snapshot : ref.get();
};

const buildCanonicalAccountIndex = (accounts: CanonicalAirtableClientAccount[]) => {
  const index = new Map<string, CanonicalAirtableClientAccount[]>();
  accounts.forEach(account => account.identityKeys.forEach(key => {
    const current = index.get(key) || [];
    if (!current.some(candidate => candidate.clientId === account.clientId)) {
      index.set(key, [...current, account]);
    }
  }));
  return index;
};

const clientIdentityMappingScopeKey = (sourceTable: string, groupKey: string) => (
  `${normalizeOrganizationName(sourceTable)}|${normalizeOrganizationName(groupKey)}`
);

const clientIdentityMappingId = (sourceTable: string, groupKey: string) => (
  `airtable_client_identity_${hashStableValue(clientIdentityMappingScopeKey(sourceTable, groupKey)).slice(0, 24)}`
);

const loadClientIdentityMappings = async () => {
  const snapshot = await db.collection('airtableClientIdentityMappings').get();
  return new Map(snapshot.docs.flatMap(document => {
    const data = document.data() || {};
    if (normalize(data.status).toUpperCase() !== 'ACTIVE') return [];
    const sourceTable = normalize(data.sourceTable);
    const groupKey = normalizeOrganizationName(data.groupKey);
    const action = normalize(data.action).toUpperCase() as ClientIdentityMappingAction;
    const canonicalClientId = normalize(data.canonicalClientId);
    const canonicalCompanyName = normalize(data.canonicalCompanyName);
    if (
      !sourceTable
      || !groupKey
      || !['MAP_TO_CLIENT', 'APPROVE_NEW_CLIENT', 'DEFER_SOURCE'].includes(action)
      || (action !== 'DEFER_SOURCE' && !canonicalClientId)
    ) return [];
    const mapping: ClientIdentityMapping = {
      id: document.id,
      sourceTable,
      groupKey,
      action,
      canonicalClientId,
      canonicalCompanyName,
      deferralCategory: normalize(data.deferralCategory).toUpperCase(),
      reason: normalize(data.reason),
    };
    return [[clientIdentityMappingScopeKey(sourceTable, groupKey), mapping] as const];
  }));
};

const resolveClientBookGroup = async (
  sources: ClientBookSourceRecord[],
  canonicalAccountIndex: Map<string, CanonicalAirtableClientAccount[]>,
  identityMappings: Map<string, ClientIdentityMapping>,
  approvedPendingCanonicalAccounts: Map<string, CanonicalAirtableClientAccount>,
) => {
  const representative = sources[0];
  const groupKey = clientBookGroupKey(representative);
  const normalizedName = normalizeOrganizationName(representative.companyName);
  const stableKey = normalize(representative.stableKey);
  const deterministicId = `airtable_client_${slugify(groupKey || stableKey || representative.companyName)}`;

  const identityMapping = identityMappings.get(clientIdentityMappingScopeKey(CLIENTS_BOOK_TABLE, groupKey));
  if (identityMapping?.action === 'DEFER_SOURCE') {
    return {
      deferred: {
        sourceTable: CLIENTS_BOOK_TABLE,
        groupKey,
        sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
        sourceNames: uniqueValues(...sources.map(source => source.companyName)),
        category: identityMapping.deferralCategory || 'INSUFFICIENT_SOURCE_EVIDENCE',
        reason: identityMapping.reason || 'Deferred by reviewed Client CRM policy.',
      },
    };
  }
  if (identityMapping?.action === 'APPROVE_NEW_CLIENT') {
    return {
      canonicalClientId: identityMapping.canonicalClientId,
      canonicalCompanyName: identityMapping.canonicalCompanyName || representative.companyName,
      method: 'APPROVED_NEW_CANONICAL_ORGANISATION' as const,
    };
  }
  if (identityMapping?.action === 'MAP_TO_CLIENT') {
    const pendingCanonical = approvedPendingCanonicalAccounts.get(identityMapping.canonicalClientId);
    if (pendingCanonical) {
      return {
        canonicalClientId: pendingCanonical.clientId,
        canonicalCompanyName: pendingCanonical.companyName
          || identityMapping.canonicalCompanyName
          || representative.companyName,
        method: 'MANUAL_IDENTITY_MAPPING' as const,
      };
    }
    const mappedSnapshot = await db.collection('clients').doc(identityMapping.canonicalClientId).get();
    if (mappedSnapshot.exists) {
      const canonical = await canonicalClientDocument(mappedSnapshot);
      const state = normalize(canonical.data()?.recordState).toUpperCase();
      if (canonical.exists && state !== 'ARCHIVED') return {
        canonicalClientId: canonical.id,
        canonicalCompanyName: normalize(canonical.data()?.companyName)
          || identityMapping.canonicalCompanyName
          || representative.companyName,
        method: 'MANUAL_IDENTITY_MAPPING' as const,
      };
    }
    return {
      conflict: {
        sourceTable: CLIENTS_BOOK_TABLE,
        groupKey,
        sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
        companyNames: uniqueValues(...sources.map(source => source.companyName)),
        candidateClientIds: [identityMapping.canonicalClientId],
        reason: 'MAPPED_CANONICAL_CLIENT_NOT_FOUND' as const,
      },
    };
  }

  if (!groupKey || GENERIC_CLIENT_NAMES.has(normalizeForMatch(groupKey))) {
    return {
      conflict: {
        sourceTable: CLIENTS_BOOK_TABLE,
        groupKey,
        sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
        companyNames: uniqueValues(...sources.map(source => source.companyName)),
        candidateClientIds: [],
        reason: 'GENERIC_ORGANISATION_IDENTITY' as const,
      },
    };
  }

  const canonicalAccountCandidates = new Map<string, CanonicalAirtableClientAccount>();
  uniqueValues(
    ...sources.flatMap(source => [source.stableKey, source.companyName]),
  ).map(normalizeOrganizationName).filter(Boolean).forEach(key => {
    (canonicalAccountIndex.get(key) || []).forEach(account => {
      canonicalAccountCandidates.set(account.clientId, account);
    });
  });
  if (canonicalAccountCandidates.size === 1) {
    const account = Array.from(canonicalAccountCandidates.values())[0];
    return {
      canonicalClientId: account.clientId,
      canonicalCompanyName: account.companyName,
      method: 'CANONICAL_ACCOUNT' as const,
    };
  }
  if (canonicalAccountCandidates.size > 1) {
    return {
      conflict: {
        sourceTable: CLIENTS_BOOK_TABLE,
        groupKey,
        sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
        companyNames: uniqueValues(...sources.map(source => source.companyName)),
        candidateClientIds: Array.from(canonicalAccountCandidates.keys()).sort(),
        reason: 'AMBIGUOUS_CANONICAL_CLIENT' as const,
      },
    };
  }

  const lookups: Array<Promise<admin.firestore.QuerySnapshot | admin.firestore.DocumentSnapshot>> = [
    db.collection('clients').doc(deterministicId).get(),
    db.collection('clients').where('airtableClientKey', '==', stableKey).limit(10).get(),
    db.collection('clients').where('sourceKey', '==', slugify(stableKey || groupKey)).limit(10).get(),
    db.collection('clients').where('normalizedCompanyName', '==', normalizedName).limit(10).get(),
    db.collection('clients').where('accountAliases', 'array-contains', stableKey).limit(10).get(),
    db.collection('clients').where('sourceRecordId', '==', representative.sourceRecordId).limit(10).get(),
  ];
  const lookupResults = await Promise.all(lookups);
  const rawCandidates: admin.firestore.DocumentSnapshot[] = [];
  lookupResults.forEach(result => {
    if ('docs' in result) rawCandidates.push(...result.docs);
    else if (result.exists) rawCandidates.push(result);
  });
  const canonicalCandidates = await Promise.all(rawCandidates.map(canonicalClientDocument));
  const candidatesById = new Map<string, admin.firestore.DocumentSnapshot>();
  canonicalCandidates.forEach(candidate => {
    const state = normalize(candidate.data()?.recordState).toUpperCase();
    if (candidate.exists && state !== 'ARCHIVED') candidatesById.set(candidate.id, candidate);
  });
  const candidates = Array.from(candidatesById.values());
  const accountCandidates = candidates.filter(candidate => {
    const data = candidate.data() || {};
    return normalize(data.sourceTable) === CLIENTS_TABLE || Boolean(normalize(data.sageAccountRef));
  });
  const selected = accountCandidates.length === 1
    ? accountCandidates[0]
    : candidates.length === 1
      ? candidates[0]
      : null;

  if (!selected && candidates.length > 1) {
    return {
      conflict: {
        sourceTable: CLIENTS_BOOK_TABLE,
        groupKey,
        sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
        companyNames: uniqueValues(...sources.map(source => source.companyName)),
        candidateClientIds: candidates.map(candidate => candidate.id).sort(),
        reason: 'AMBIGUOUS_CANONICAL_CLIENT' as const,
      },
    };
  }

  if (selected) {
    const selectedData = selected.data() || {};
    return {
      canonicalClientId: selected.id,
      canonicalCompanyName: normalize(selectedData.companyName) || representative.companyName,
      method: accountCandidates.length === 1
        ? 'CANONICAL_ACCOUNT' as const
        : 'EXACT_PLATFORM_IDENTITY' as const,
    };
  }

  return {
    conflict: {
      sourceTable: CLIENTS_BOOK_TABLE,
      groupKey,
      sourceRecordIds: sources.map(source => source.sourceRecordId).sort(),
      companyNames: uniqueValues(...sources.map(source => source.companyName)),
      candidateClientIds: [deterministicId],
      reason: 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED' as const,
    },
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

type ClientInvoiceSyncDirectory = {
  bookingsByLookupKey: Map<string, admin.firestore.QueryDocumentSnapshot[]>;
  clientsById: Map<string, admin.firestore.QueryDocumentSnapshot>;
  invoicesById: Map<string, admin.firestore.QueryDocumentSnapshot>;
  linesByInvoiceId: Map<string, admin.firestore.QueryDocumentSnapshot[]>;
};

const addDocumentLookupKey = (
  index: Map<string, admin.firestore.QueryDocumentSnapshot[]>,
  value: unknown,
  document: admin.firestore.QueryDocumentSnapshot,
) => {
  buildBookingLookupCandidates(normalize(value)).forEach(candidate => {
    const current = index.get(candidate) || [];
    if (!current.some(item => item.id === document.id)) current.push(document);
    index.set(candidate, current);
  });
};

const buildClientInvoiceSyncDirectory = async (includeLines: boolean): Promise<ClientInvoiceSyncDirectory> => {
  const [bookingSnapshot, clientSnapshot, invoiceSnapshot, lineSnapshot] = await Promise.all([
    db.collection('bookings').get(),
    db.collection('clients').get(),
    db.collection('clientInvoices').get(),
    includeLines ? db.collection('clientInvoiceLines').get() : Promise.resolve(null),
  ]);

  const bookingsByLookupKey = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  bookingSnapshot.docs.forEach(document => {
    const booking = document.data() || {};
    ['sourceRecordId', 'jobNumber', 'legacyAirtableRef', 'displayRef', 'bookingRef'].forEach(field => {
      addDocumentLookupKey(bookingsByLookupKey, booking[field], document);
    });
  });

  const linesByInvoiceId = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  lineSnapshot?.docs.forEach(document => {
    const line = document.data() || {};
    const invoiceId = normalize(line.invoiceId) || normalize(line.clientInvoiceId);
    if (!invoiceId) return;
    const current = linesByInvoiceId.get(invoiceId) || [];
    current.push(document);
    linesByInvoiceId.set(invoiceId, current);
  });

  return {
    bookingsByLookupKey,
    clientsById: new Map(clientSnapshot.docs.map(document => [document.id, document])),
    invoicesById: new Map(invoiceSnapshot.docs.map(document => [document.id, document])),
    linesByInvoiceId,
  };
};

const canonicalClientIdFromDirectory = (
  clientId: string,
  clientsById: Map<string, admin.firestore.QueryDocumentSnapshot>,
) => {
  const document = clientsById.get(clientId);
  if (!document) return '';
  const canonical = canonicalClientRef(document);
  const canonicalDocument = clientsById.get(canonical.id) || document;
  const data = canonicalDocument.data() || {};
  if (normalize(data.recordState).toUpperCase() === 'ARCHIVED') return '';
  if (
    GENERIC_CLIENT_IDS.has(canonical.id)
    || GENERIC_CLIENT_NAMES.has(normalizeForMatch(data.companyName || data.clientName || ''))
  ) return '';
  return canonical.id;
};

const preferredInvoiceClientId = (
  bookingClientIds: string[],
  existingInvoiceClientId: string,
  clientsById: Map<string, admin.firestore.QueryDocumentSnapshot>,
) => {
  const canonicalBookingIds = uniqueValues(
    ...bookingClientIds.map(clientId => canonicalClientIdFromDirectory(clientId, clientsById))
  );
  const canonicalExistingId = canonicalClientIdFromDirectory(existingInvoiceClientId, clientsById);
  if (canonicalBookingIds.length === 1) return canonicalBookingIds[0];
  if (canonicalExistingId && (canonicalBookingIds.length === 0 || canonicalBookingIds.includes(canonicalExistingId))) {
    return canonicalExistingId;
  }
  return '';
};

const getBookingsFromClientInvoiceDirectory = (
  sourceRecordIds: string[],
  directory: ClientInvoiceSyncDirectory,
) => {
  const seen = new Set<string>();
  const bookings: admin.firestore.QueryDocumentSnapshot[] = [];
  sourceRecordIds.flatMap(buildBookingLookupCandidates).forEach(candidate => {
    const matches = directory.bookingsByLookupKey.get(candidate) || [];
    matches.forEach(document => {
      if (seen.has(document.id)) return;
      seen.add(document.id);
      bookings.push(document);
    });
  });
  return bookings;
};

const getStaleImportedInvoiceLineRefsFromDirectory = (
  invoiceId: string,
  sourceRecordId: string,
  expectedLineIds: Set<string>,
  directory: ClientInvoiceSyncDirectory,
) => (directory.linesByInvoiceId.get(invoiceId) || [])
  .filter(line => {
    const data = line.data();
    return data.sourceSystem === 'AIRTABLE' || data.sourceRecordId === sourceRecordId;
  })
  .filter(line => !expectedLineIds.has(line.id))
  .map(line => line.ref);

const mapClientInvoiceStatus = (fields: Record<string, unknown>): string => {
  const raw = pick(fields, [
    'Invocing Status',
    'Invoicing Status',
    'Invoice Status',
    'TR Invoice Status',
    'TR Status',
    'Status',
    'Payment Status'
  ]);
  return mapClientInvoiceStatusValue(raw, {
    paid: truthyField(fields, ['Paid', 'Payment received', 'Settled']),
    sent: truthyField(fields, ['Email', 'Sent', 'Invoice sent', 'Emailed'])
  });
};

const mapInterpreterInvoiceStatus = (fields: Record<string, unknown>): string => {
  return mapInterpreterInvoiceStatusValue(pick(fields, [
    'Invoice Status',
    'INV Status',
    'TR Invoice Status',
    'Status',
    'Payment Status',
    'Approval Status'
  ]));
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

const getStaleImportedInvoiceLineRefs = async (
  collectionName: 'clientInvoiceLines' | 'interpreterInvoiceLines',
  invoiceId: string,
  sourceRecordId: string,
  expectedLineIds: Set<string>
) => {
  const existingLines = await db.collection(collectionName).where('invoiceId', '==', invoiceId).get();
  return existingLines.docs
    .filter(line => {
      const data = line.data();
      return data.sourceSystem === 'AIRTABLE' || data.sourceRecordId === sourceRecordId;
    })
    .filter(line => !expectedLineIds.has(line.id))
    .map(line => line.ref);
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
  const clientInvoiceId = normalize(booking.clientInvoiceId);
  const interpreterInvoiceId = normalize(booking.interpreterInvoiceId);
  const readyForClientInvoice = status === 'APPROVED' && !clientInvoiceId;
  const readyForInterpreterInvoice = approved && !interpreterInvoiceId;

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
    readyForClientInvoice,
    readyForInterpreterInvoice,
    unitsBillableToClient: units,
    unitsPayableToInterpreter: units,
    clientAmountCalculated: safeNumber(booking.totalAmount) || safeNumber(booking.finalQuote),
    interpreterAmountCalculated: safeNumber(booking.interpreterInvoiceTotal),
    totalToPay: safeNumber(booking.interpreterInvoiceTotal),
    clientInvoiceId: clientInvoiceId || null,
    interpreterInvoiceId: interpreterInvoiceId || null,
    source: 'AIRTABLE_MIRROR',
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
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role) || user.data()?.status !== 'ACTIVE') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can sync REDBOOK.');
  }
  return { uid: context.auth.uid, role: role as 'ADMIN' | 'SUPER_ADMIN' };
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
        if (appliedFormula && attempt === 1 && !options.strictFormula) {
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

  let stabilizedRecords = records.slice(0, limitRecords);
  let stabilizedNextOffset = offset;
  let stabilizedFormula = appliedFormula;

  if (options.stabilize && !startOffset && !offset && stabilizedRecords.length > 0 && stabilizedRecords.length < limitRecords) {
    const secondPass = await fetchAirtableRecordBatch(
      limitRecords,
      tableName,
      '',
      { ...options, filterByFormula: appliedFormula, stabilize: false }
    );
    const firstFingerprint = fingerprintAirtableSnapshot(stabilizedRecords);
    const secondFingerprint = fingerprintAirtableSnapshot(secondPass.records);
    const snapshots = [stabilizedRecords, secondPass.records];
    let latestPass = secondPass;

    if (firstFingerprint !== secondFingerprint && !secondPass.nextOffset) {
      const thirdPass = await fetchAirtableRecordBatch(
        limitRecords,
        tableName,
        '',
        { ...options, filterByFormula: secondPass.filterByFormula, stabilize: false }
      );
      snapshots.push(thirdPass.records);
      latestPass = thirdPass;
    }

    stabilizedRecords = mergeAirtableSnapshots(...snapshots).slice(0, limitRecords);
    stabilizedNextOffset = latestPass.nextOffset;
    stabilizedFormula = latestPass.filterByFormula;
  }

  return {
    records: stabilizedRecords,
    nextOffset: stabilizedNextOffset,
    tableName: resolvedTableName,
    filterByFormula: stabilizedFormula,
    strategy: options.strategy || DEFAULT_SYNC_STRATEGY
  };
};

const fetchAirtableRecords = async (limitRecords: number, tableName = DEFAULT_TABLE_NAME) => {
  const batch = await fetchAirtableRecordBatch(limitRecords, tableName);
  return batch.records;
};

const getExistingRedbookBySourceId = async () => {
  const snap = await db.collection('bookings')
    .where('sourceTable', '==', DEFAULT_TABLE_NAME)
    .get();
  return new Map(snap.docs
    .map(doc => [normalize(doc.data().sourceRecordId), doc] as const)
    .filter(([sourceRecordId]) => Boolean(sourceRecordId)));
};

const fetchAirtableRecordsByIds = async (
  sourceRecordIds: string[],
  tableName = DEFAULT_TABLE_NAME
) => {
  const uniqueIds = Array.from(new Set(sourceRecordIds.map(normalize).filter(Boolean))).slice(0, 100);
  if (!uniqueIds.length) {
    return {
      records: [] as AirtableRecord[],
      nextOffset: '',
      tableName,
      filterByFormula: '',
      strategy: DEFAULT_SYNC_STRATEGY
    };
  }

  const chunks: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 80) {
    chunks.push(uniqueIds.slice(index, index + 80));
  }

  const batches = await Promise.all(chunks.map(chunk => fetchAirtableRecordBatch(
    chunk.length,
    tableName,
    '',
    {
      filterByFormula: `OR(${chunk.map(id => `RECORD_ID()='${id.replace(/'/g, "\\'")}'`).join(',')})`,
      strategy: DEFAULT_SYNC_STRATEGY,
      strictFormula: true
    }
  )));

  return {
    records: batches.flatMap(batch => batch.records),
    nextOffset: '',
    tableName: batches[0]?.tableName || tableName,
    filterByFormula: 'RECORD_ID() IN selected missing ids',
    strategy: DEFAULT_SYNC_STRATEGY
  };
};

const shouldUseSelectiveRedbookProcessing = (strategy: AirtableSyncStrategy) => (
  strategy === 'OPEN_WORKFLOW' || strategy === 'RECENT_OPEN'
);

const shouldProcessRedbookRecord = (
  record: AirtableRecord,
  existingBySourceId: Map<string, admin.firestore.QueryDocumentSnapshot>
) => {
  const existingSnap = existingBySourceId.get(record.id);
  if (!existingSnap) return true;

  const existing = existingSnap.data();
  const rawStatus = normalize(record.fields.Status);
  const existingStatus = normalize(existing.sourceStatusRaw)
    || normalize(existing.airtableOperationalStatus)
    || normalize(existing.status);
  const sourceBackfillNeeded = needsSourceTrackingBackfill(existing, {
    sourceSystem: 'AIRTABLE',
    sourceBaseId: DEFAULT_BASE_ID,
    sourceTable: DEFAULT_TABLE_NAME,
    sourceRecordId: record.id,
    snapshotHash: 'pending'
  });

  if (sourceBackfillNeeded) return true;
  if (normalize(existing.airtableRawRecordHash) !== hashAirtableRecordFields(record.fields)) return true;
  if (rawStatus && rawStatus.toLowerCase() !== existingStatus.toLowerCase()) return true;

  return false;
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
  const resolvedInterpreter = await resolveInterpreterCached(interpreterEmail, interpreterName, interpreterAirtableRecordId, interpreterPhone);
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
      airtableRawRecordHash: hashAirtableRecordFields(fields),
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
  const explicitStatus = mapExplicitTranslationStatus(rawStatus);
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

const mapTranslationRecordToBooking = async (
  record: AirtableRecord,
  tableName: string,
  invoiceEvidence?: TranslationClientEvidence,
) => {
  const fields = record.fields;
  const legacyRef = pick(fields, ['TR NUMBER', 'Web Number', 'TR ID', 'Name', 'Reference']) || `TR-${record.id}`;
  const jobNumber = legacyRef || `TR-${record.id}`;
  const language = pick(fields, ['LANGUAGE', 'web language', 'Language', 'Target Language']) || 'Unknown';
  const sourceLanguageRaw = pick(fields, ['Source Language', 'Language From', 'FROM LANGUAGE']) || 'English';
  const { sourceLanguage, targetLanguage } = parseTranslationLanguages(language, sourceLanguageRaw);
  const clientIdentity = enrichTranslationClientIdentity(pickClientIdentity(fields), invoiceEvidence);
  const translatorName = pick(fields, ['TRANSLATOR', 'Assign to TR', 'Assign to', 'Interpreters']);
  const translatorEmail = cleanEmail(pick(fields, ['EMAIL (from Assign to TR)', 'EMAIL (from assign to)', 'EMAIL', 'Translator Email']));
  const translatorPhone = pick(fields, ['PHONE (from Assign to TR)', 'PHONE (from assign to)', 'Translator Phone']);
  const translatorAirtableRecordId = pick(fields, ['Assign to TR', 'Assign to', 'Interpreters']);
  const resolvedTranslator = await resolveInterpreterCached(translatorEmail, translatorName, translatorAirtableRecordId, translatorPhone);
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
    ...(invoiceEvidence ? {
      clientIdentityEvidence: {
        source: 'TRANSLATION_CLIENT_INVOICE',
        invoiceRecordIds: invoiceEvidence.invoiceRecordIds,
        invoiceNumbers: invoiceEvidence.invoiceNumbers,
        accountRefs: invoiceEvidence.accountRefs,
        candidateAccountRefs: invoiceEvidence.candidateAccountRefs,
        agencyNames: invoiceEvidence.agencyNames,
        requestedByNames: invoiceEvidence.requestedByNames,
        emails: invoiceEvidence.emails,
        accountRefAmbiguous: invoiceEvidence.accountRefAmbiguous,
        accountRefSource: invoiceEvidence.accountRefSource,
      },
    } : {}),
    translatorName,
    translatorEmail,
    translatorPhone,
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

const cleanReportData = <T>(data: T): T => JSON.parse(JSON.stringify(data, (_key, value) => {
  if (value && typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000)).toISOString();
  }
  return value;
}));

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

const detailPriority = (detail: Record<string, unknown>) => {
  if (detail.action === 'error') return 100;
  if (Array.isArray(detail.conflictReasons) && detail.conflictReasons.length > 0) return 90;
  if (detail.interpreterResolved === false) return 80;
  if (detail.action === 'created') return 60;
  if (detail.action === 'updated') return 40;
  return 10;
};

const pushPrioritizedDetail = (
  details: Array<Record<string, unknown>>,
  detail: Record<string, unknown>,
  limit = MODULE_DETAIL_LIMIT
) => {
  const cleanDetail = cleanReportData(detail);
  if (details.length < limit) {
    details.push(cleanDetail);
    return;
  }

  const incomingPriority = detailPriority(cleanDetail);
  let lowestPriority = Number.POSITIVE_INFINITY;
  let replaceIndex = -1;
  details.forEach((item, index) => {
    const priority = detailPriority(item);
    if (priority < lowestPriority) {
      lowestPriority = priority;
      replaceIndex = index;
    }
  });
  if (replaceIndex >= 0 && incomingPriority > lowestPriority) {
    details[replaceIndex] = cleanDetail;
  }
};

const processWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) => {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
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
  const identityMappings = await loadClientIdentityMappings();
  const clientIdBySourceRecordId = new Map<string, string>();
  const clientNameBySourceRecordId = new Map<string, string>();
  const wouldCreateCanonicalAccounts: Array<Record<string, unknown>> = [];
  const approvedPendingCanonicalAccounts: Array<{
    sourceTable: 'Clients';
    sourceRecordId: string;
    groupKey: string;
    clientId: string;
    companyName: string;
    sageAccountRef: string;
  }> = [];
  const canonicalAccounts: CanonicalAirtableClientAccount[] = [];
  const plannedCreatedClientIds = new Set<string>();

  await processWithConcurrency(records, CLIENT_PROCESS_CONCURRENCY, async record => {
    try {
      const mapped = mapClientRecord(record, tableName);
      const clientRef = await findExistingClientRef(record, tableName, mapped.identity, identityMappings);
      clientIdBySourceRecordId.set(record.id, clientRef.id);
      clientNameBySourceRecordId.set(record.id, mapped.identity.companyName);
      canonicalAccounts.push({
        sourceRecordId: record.id,
        clientId: clientRef.id,
        companyName: mapped.identity.companyName,
        identityKeys: uniqueValues(
          mapped.identity.companyName,
          mapped.identity.normalizedCompanyName,
          mapped.identity.uniqueClientKey,
          mapped.identity.sageAccountRef,
          mapped.identity.clientTrade,
        ).map(normalizeOrganizationName).filter(Boolean),
        names: uniqueValues(
          mapped.identity.companyName,
          mapped.identity.normalizedCompanyName,
          mapped.identity.clientTrade,
        ),
        accountKeys: uniqueValues(
          mapped.identity.uniqueClientKey,
          mapped.identity.sageAccountRef,
        ),
        emails: uniqueValues(mapped.identity.email, mapped.identity.invoiceEmail),
        phones: uniqueValues(mapped.identity.phone, mapped.identity.invoicePhone),
        addresses: uniqueValues(mapped.identity.billingAddress),
      });
      const existing = await clientRef.get();
      const existingData = existing.data();
      const sourceBackfillNeeded = existing.exists && needsSourceTrackingBackfill(existingData, mapped.client);
      const action: SyncAction = existing.exists
        ? (existingData?.airtableSnapshotHash === mapped.client.airtableSnapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;
      if (action === 'created') {
        plannedCreatedClientIds.add(clientRef.id);
        const groupKey = normalizeOrganizationName(
          mapped.identity.sageAccountRef || mapped.identity.uniqueClientKey || mapped.identity.companyName,
        );
        const mapping = identityMappings.get(clientIdentityMappingScopeKey(tableName, groupKey));
        if (mapping?.action !== 'APPROVE_NEW_CLIENT') {
          wouldCreateCanonicalAccounts.push({
            sourceRecordId: record.id,
            clientId: clientRef.id,
            companyName: mapped.identity.companyName,
            sageAccountRef: mapped.identity.sageAccountRef,
            groupKey,
          });
        } else if (tableName === CLIENTS_TABLE && mapping.canonicalClientId === clientRef.id) {
          approvedPendingCanonicalAccounts.push({
            sourceTable: CLIENTS_TABLE,
            sourceRecordId: record.id,
            groupKey,
            clientId: clientRef.id,
            companyName: mapping.canonicalCompanyName || mapped.identity.companyName,
            sageAccountRef: mapped.identity.sageAccountRef,
          });
        }
      }

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
  });

  const approvedPendingCanonicalAccountIds = new Set(
    approvedPendingCanonicalAccounts.map(account => account.clientId),
  );
  const approvedPendingCanonicalAccountsById = new Map(
    canonicalAccounts
      .filter(account => approvedPendingCanonicalAccountIds.has(account.clientId))
      .map(account => [account.clientId, account] as const),
  );

  return {
    stats,
    details,
    clientIdBySourceRecordId,
    clientNameBySourceRecordId,
    canonicalAccounts: canonicalAccounts
      .sort((left, right) => left.companyName.localeCompare(right.companyName)),
    plannedCreatedClientIds,
    approvedPendingCanonicalAccountsById,
    diagnostics: {
      sourceRecords: records.length,
      approvedPendingCanonicalAccounts: Array.from(new Map(
        approvedPendingCanonicalAccounts.map(account => [account.clientId, account] as const),
      ).values()).sort((left, right) => left.companyName.localeCompare(right.companyName)),
      wouldCreateCanonicalAccounts: wouldCreateCanonicalAccounts
        .sort((left, right) => String(left.companyName).localeCompare(String(right.companyName))),
      writeReadiness: {
        ready: wouldCreateCanonicalAccounts.length === 0,
        blockerCount: wouldCreateCanonicalAccounts.length,
        blockers: wouldCreateCanonicalAccounts.length
          ? [{ reason: 'CANONICAL_ACCOUNT_CREATE_REVIEW_REQUIRED', count: wouldCreateCanonicalAccounts.length }]
          : [],
      },
    },
  };
};

const syncClientBookHierarchy = async (
  records: AirtableRecord[],
  departmentRecords: AirtableRecord[],
  clientIdBySourceRecordId: Map<string, string>,
  clientNameBySourceRecordId: Map<string, string>,
  canonicalAccounts: CanonicalAirtableClientAccount[],
  plannedCreatedClientIds: Set<string>,
  approvedPendingCanonicalAccountsById: Map<string, CanonicalAirtableClientAccount>,
  mode: SyncMode,
  runId?: string,
  conflictContext?: ConflictReconciliationContext,
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  const identityMappings = await loadClientIdentityMappings();
  const platformClientDirectory = await getPlatformClientDirectory();
  const platformClientNames = new Map<string, string>();
  platformClientDirectory.forEach(document => {
    const state = normalize(document.data()?.recordState).toUpperCase();
    if (state === 'ARCHIVED') return;
    const canonicalRef = canonicalClientRef(document);
    const canonicalDocument = platformClientDirectory.find(candidate => candidate.id === canonicalRef.id);
    platformClientNames.set(
      canonicalRef.id,
      normalize(canonicalDocument?.data()?.companyName) || normalize(document.data()?.companyName),
    );
  });
  const reviewableCanonicalAccounts = canonicalAccounts.filter(account => (
    !plannedCreatedClientIds.has(account.clientId)
    && platformClientNames.has(account.clientId)
  ));
  const sources = records.map(mapClientBookSourceRecord);
  const canonicalAccountIndex = buildCanonicalAccountIndex(canonicalAccounts);
  const groupedSources = new Map<string, ClientBookSourceRecord[]>();
  sources.forEach(source => {
    const key = clientBookGroupKey(source) || `unresolved:${source.sourceRecordId}`;
    groupedSources.set(key, [...(groupedSources.get(key) || []), source]);
  });

  const resolutions: ClientBookCanonicalResolution[] = [];
  const conflicts: ClientBookResolutionConflict[] = [];
  const deferredIdentityGroups: ClientIdentityDeferredSource[] = [];
  const deferredSourceRecordIds = new Set<string>();
  const resolvedGroups: Array<Record<string, unknown>> = [];
  const resolutionMethods: Record<ClientBookResolutionMethod, number> = {
    CANONICAL_ACCOUNT: 0,
    EXACT_PLATFORM_IDENTITY: 0,
    MANUAL_IDENTITY_MAPPING: 0,
    APPROVED_NEW_CANONICAL_ORGANISATION: 0,
    EXPLICIT_DEPARTMENT_LINK: 0,
  };

  await processWithConcurrency(Array.from(groupedSources.values()), CLIENT_PROCESS_CONCURRENCY, async group => {
    const result = await resolveClientBookGroup(
      group,
      canonicalAccountIndex,
      identityMappings,
      approvedPendingCanonicalAccountsById,
    );
    if (result.conflict) {
      const conflict: ClientBookResolutionConflict = {
        ...result.conflict,
        recommendation: recommendClientBookCanonicalAccount(group, reviewableCanonicalAccounts) || undefined,
      };
      conflicts.push(conflict);
      return;
    }
    if (result.deferred) {
      deferredIdentityGroups.push(result.deferred);
      result.deferred.sourceRecordIds.forEach(sourceRecordId => {
        deferredSourceRecordIds.add(sourceRecordId);
        markConflictScopeProcessed(conflictContext, result.deferred!.sourceTable, sourceRecordId);
      });
      stats.skipped += result.deferred.sourceRecordIds.length;
      if (details.length < MODULE_DETAIL_LIMIT) details.push({
        action: 'skipped',
        sourceTable: result.deferred.sourceTable,
        sourceRecordIds: result.deferred.sourceRecordIds,
        clientName: result.deferred.sourceNames[0] || result.deferred.groupKey,
        reason: 'DEFERRED_SOURCE',
        deferralCategory: result.deferred.category,
      });
      return;
    }
    if (!result.canonicalClientId || !result.canonicalCompanyName || !result.method) return;
    resolutionMethods[result.method] += 1;
    resolvedGroups.push({
      method: result.method,
      canonicalClientId: result.canonicalClientId,
      canonicalCompanyName: result.canonicalCompanyName,
      sourceRecordCount: group.length,
      sourceRecordIds: group.map(source => source.sourceRecordId).sort(),
      sourceNames: uniqueValues(...group.map(source => source.companyName)),
    });
    group.forEach(source => resolutions.push({
      sourceRecordId: source.sourceRecordId,
      canonicalClientId: result.canonicalClientId!,
      canonicalCompanyName: result.canonicalCompanyName!,
    }));
  });

  departmentRecords.forEach(record => {
    const linkedClientSourceIds = pickLinkedIds(record.fields, ['Clients']);
    let candidateClientIds = Array.from(new Set(
      linkedClientSourceIds.map(sourceRecordId => clientIdBySourceRecordId.get(sourceRecordId)).filter(Boolean),
    )) as string[];
    const departmentName = pick(record.fields, ['Name']);
    const departmentGroupKey = normalizeOrganizationName(departmentName);
    const departmentMapping = identityMappings.get(
      clientIdentityMappingScopeKey(DEPARTMENTS_TABLE, departmentGroupKey),
    );
    if (departmentMapping?.action === 'DEFER_SOURCE' && departmentName) {
      const deferred = {
        sourceTable: DEPARTMENTS_TABLE,
        groupKey: departmentGroupKey,
        sourceRecordIds: [record.id],
        sourceNames: [departmentName],
        category: departmentMapping.deferralCategory || 'INSUFFICIENT_SOURCE_EVIDENCE',
        reason: departmentMapping.reason || 'Deferred by reviewed Client CRM policy.',
      };
      deferredIdentityGroups.push(deferred);
      deferredSourceRecordIds.add(record.id);
      markConflictScopeProcessed(conflictContext, DEPARTMENTS_TABLE, record.id);
      stats.skipped += 1;
      if (details.length < MODULE_DETAIL_LIMIT) details.push({
        action: 'skipped',
        sourceTable: DEPARTMENTS_TABLE,
        sourceRecordIds: [record.id],
        clientName: departmentName,
        reason: 'DEFERRED_SOURCE',
        deferralCategory: deferred.category,
      });
      return;
    }
    if (
      candidateClientIds.length !== 1
      && departmentMapping?.action === 'MAP_TO_CLIENT'
      && (
        platformClientNames.has(departmentMapping.canonicalClientId)
        || approvedPendingCanonicalAccountsById.has(departmentMapping.canonicalClientId)
      )
    ) {
      candidateClientIds = [departmentMapping.canonicalClientId];
    }
    if (candidateClientIds.length !== 1 || !departmentName) {
      const departmentSource = mapDepartmentSourceRecord(record, departmentName || 'Airtable department');
      conflicts.push({
        sourceTable: DEPARTMENTS_TABLE,
        groupKey: departmentGroupKey,
        sourceRecordIds: [record.id],
        companyNames: uniqueValues(
          departmentName,
          ...linkedClientSourceIds
            .map(sourceRecordId => clientNameBySourceRecordId.get(sourceRecordId) || '')
            .filter(Boolean),
        ),
        candidateClientIds,
        recommendation: recommendClientBookCanonicalAccount([departmentSource], reviewableCanonicalAccounts) || undefined,
        reason: departmentMapping
          && !platformClientNames.has(departmentMapping.canonicalClientId)
          && !approvedPendingCanonicalAccountsById.has(departmentMapping.canonicalClientId)
          ? 'MAPPED_CANONICAL_CLIENT_NOT_FOUND'
          : candidateClientIds.length > 1
          ? 'DEPARTMENT_CLIENT_AMBIGUOUS'
          : 'DEPARTMENT_CLIENT_NOT_RESOLVED',
      });
      return;
    }
    const canonicalClientId = candidateClientIds[0];
    const linkedSourceId = linkedClientSourceIds.find(sourceRecordId => (
      clientIdBySourceRecordId.get(sourceRecordId) === canonicalClientId
    ));
    const canonicalCompanyName = platformClientNames.get(canonicalClientId)
      || approvedPendingCanonicalAccountsById.get(canonicalClientId)?.companyName
      || (linkedSourceId && clientNameBySourceRecordId.get(linkedSourceId))
      || departmentMapping?.canonicalCompanyName
      || 'Client';
    const source = mapDepartmentSourceRecord(record, canonicalCompanyName);
    sources.push(source);
    resolutions.push({
      sourceRecordId: source.sourceRecordId,
      canonicalClientId,
      canonicalCompanyName,
    });
    const departmentResolutionMethod = linkedSourceId ? 'EXPLICIT_DEPARTMENT_LINK' : 'MANUAL_IDENTITY_MAPPING';
    resolutionMethods[departmentResolutionMethod] += 1;
    resolvedGroups.push({
      method: departmentResolutionMethod,
      canonicalClientId,
      canonicalCompanyName,
      sourceRecordCount: 1,
      sourceRecordIds: [record.id],
      sourceNames: [departmentName],
    });
  });

  conflicts.sort((left, right) => left.groupKey.localeCompare(right.groupKey));
  for (const conflict of conflicts) {
    stats.conflict += 1;
    conflict.sourceRecordIds.forEach(sourceRecordId => markConflictScopeProcessed(
      conflictContext,
      conflict.sourceTable,
      sourceRecordId,
    ));
    await writeSyncConflict({
      runId,
      entityType: 'client',
      sourceTable: conflict.sourceTable,
      sourceRecordId: conflict.sourceRecordIds[0] || conflict.groupKey,
      sourceBaseId: DEFAULT_BASE_ID,
      severity: 'HIGH',
      reason: conflict.reason,
      currentValue: conflict.candidateClientIds,
      incomingValue: {
        companyNames: conflict.companyNames,
        sourceRecordIds: conflict.sourceRecordIds,
        recommendation: conflict.recommendation,
      },
      recommendedAction: conflict.reason === 'AMBIGUOUS_CANONICAL_CLIENT'
        ? 'Select one canonical organisation in Client Identity Audit before rerunning Airtable sync.'
        : conflict.reason === 'MAPPED_CANONICAL_CLIENT_NOT_FOUND'
          ? 'Replace or revoke the stale identity mapping, then rerun Airtable sync.'
        : conflict.reason === 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED'
          ? 'Map this source group to an existing Client CRM organisation or explicitly approve a new canonical organisation.'
        : conflict.sourceTable === DEPARTMENTS_TABLE
          ? 'Link this Airtable department to exactly one Clients account before rerunning sync.'
          : 'Replace the generic organisation label or link this contact to a canonical Client CRM organisation.',
      dryRun: mode.dryRun,
    });
    if (details.length < MODULE_DETAIL_LIMIT) details.push({
      action: 'conflict',
      sourceTable: conflict.sourceTable,
      sourceRecordIds: conflict.sourceRecordIds,
      clientName: conflict.companyNames[0] || '',
      candidateClientIds: conflict.candidateClientIds,
      recommendation: conflict.recommendation,
      reason: conflict.reason,
    });
  }

  const projectionResult = buildClientBookProjection(
    sources.filter(source => !deferredSourceRecordIds.has(source.sourceRecordId)),
    resolutions,
  );
  const resolvedSourceIds = new Set(resolutions.map(resolution => resolution.sourceRecordId));
  projectionResult.unresolvedSourceRecordIds
    .filter(sourceRecordId => !conflicts.some(conflict => conflict.sourceRecordIds.includes(sourceRecordId)))
    .forEach(sourceRecordId => {
      if (!resolvedSourceIds.has(sourceRecordId)) stats.conflict += 1;
    });

  await processWithConcurrency(projectionResult.projections, Math.max(1, Math.floor(CLIENT_PROCESS_CONCURRENCY / 2)), async projection => {
    const sourceTableByRecordId = new Map(
      projection.sourceRecords.map(source => [source.sourceRecordId, source.sourceTable]),
    );
    const hierarchySourceMetadata = (sourceIds: string[]) => {
      const sourceRecordIds = Array.from(new Set(sourceIds
        .map(airtableSourceRecordId)
        .filter(sourceRecordId => sourceTableByRecordId.has(sourceRecordId))));
      const sourceTables = Array.from(new Set(sourceRecordIds
        .map(sourceRecordId => sourceTableByRecordId.get(sourceRecordId) || '')
        .filter(Boolean)));
      return {
        sourceRecordIds,
        sourceTable: sourceTables.length === 1 ? sourceTables[0] : 'Airtable Client CRM',
      };
    };
    const clientRef = db.collection('clients').doc(projection.canonicalClientId);
    const departmentRefs = projection.hierarchy.departments.map(department => (
      db.collection('clientDepartments').doc(department.id)
    ));
    const agentRefs = projection.hierarchy.agents.map(agent => db.collection('clientAgents').doc(agent.id));
    const membershipRefs = projection.hierarchy.memberships.map(membership => (
      db.collection('clientMemberships').doc(membership.id)
    ));
    const allRefs = [clientRef, ...departmentRefs, ...agentRefs, ...membershipRefs];
    const snapshots = await db.getAll(...allRefs);
    const snapshotByPath = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot]));
    const clientSnapshot = snapshotByPath.get(clientRef.path)!;
    const clientData = clientSnapshot.data() || {};
    const clientExistsAfterAccountPhase = clientSnapshot.exists
      || plannedCreatedClientIds.has(projection.canonicalClientId);
    const hierarchyComplete = allRefs.slice(1).every(ref => snapshotByPath.get(ref.path)?.exists);
    const projectionCurrent = clientData.airtableClientBookProjectionVersion === CLIENT_BOOK_PROJECTION_VERSION
      && normalize(clientData.airtableClientBookSnapshotHash) === projection.snapshotHash
      && hierarchyComplete;
    const action: SyncAction = clientExistsAfterAccountPhase
      ? (projectionCurrent ? 'skipped' : 'updated')
      : 'created';
    stats[action] += 1;

    projection.sourceRecords.forEach(source => markConflictScopeProcessed(
      conflictContext,
      source.sourceTable,
      source.sourceRecordId,
    ));

    if (!mode.dryRun && action !== 'skipped') {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const writes: Array<{
        ref: admin.firestore.DocumentReference;
        data: Record<string, unknown>;
      }> = [];
      const clientPatch = cleanData({
        id: projection.canonicalClientId,
        organizationId: normalize(clientData.organizationId) || 'lingland-main',
        companyName: clientSnapshot.exists ? undefined : projection.canonicalCompanyName,
        normalizedCompanyName: clientSnapshot.exists
          ? undefined
          : normalizeOrganizationName(projection.canonicalCompanyName),
        status: clientSnapshot.exists ? undefined : 'ACTIVE',
        recordState: clientSnapshot.exists ? undefined : 'ACTIVE',
        paymentTermsDays: clientSnapshot.exists ? undefined : 30,
        defaultCostCodeType: clientSnapshot.exists ? undefined : 'Client Name',
        billingAddress: clientSnapshot.exists ? undefined : 'Address Pending Update',
        sourceSystem: clientSnapshot.exists ? undefined : 'AIRTABLE',
        sourceBaseId: clientSnapshot.exists ? undefined : DEFAULT_BASE_ID,
        sourceTable: clientSnapshot.exists ? undefined : CLIENTS_BOOK_TABLE,
        sourceRecordId: clientSnapshot.exists ? undefined : projection.sourceRecordIds[0],
        sourceKey: clientSnapshot.exists
          ? undefined
          : slugify(projection.aliases[0] || projection.canonicalCompanyName),
        accountAliases: projection.aliases.length
          ? admin.firestore.FieldValue.arrayUnion(...projection.aliases)
          : undefined,
        airtableClientBookRecordIds: projection.sourceRecords.some(source => source.sourceTable === CLIENTS_BOOK_TABLE)
          ? admin.firestore.FieldValue.arrayUnion(...projection.sourceRecords
            .filter(source => source.sourceTable === CLIENTS_BOOK_TABLE)
            .map(source => source.sourceRecordId))
          : undefined,
        airtableDepartmentRecordIds: projection.sourceRecords.some(source => source.sourceTable === DEPARTMENTS_TABLE)
          ? admin.firestore.FieldValue.arrayUnion(...projection.sourceRecords
            .filter(source => source.sourceTable === DEPARTMENTS_TABLE)
            .map(source => source.sourceRecordId))
          : undefined,
        airtableClientBookProjectionVersion: CLIENT_BOOK_PROJECTION_VERSION,
        airtableClientBookSnapshotHash: projection.snapshotHash,
        lastSyncRunId: runId,
        syncStatus: 'SYNCED',
        updatedAt: now,
        createdAt: clientSnapshot.exists ? undefined : now,
      });
      writes.push({ ref: clientRef, data: clientPatch });

      projection.hierarchy.departments.forEach((department, index) => {
        const ref = departmentRefs[index];
        const current = snapshotByPath.get(ref.path);
        const sourceMetadata = hierarchySourceMetadata(department.sourceClientIds);
        writes.push({
          ref,
          data: cleanData({
            clientId: projection.canonicalClientId,
            name: current?.exists ? undefined : department.name,
            normalizedName: department.normalizedName,
            aliases: admin.firestore.FieldValue.arrayUnion(department.name),
            status: current?.exists ? undefined : 'ACTIVE',
            organizationId: normalize(current?.data()?.organizationId) || 'lingland-main',
            sourceSystem: normalize(current?.data()?.sourceSystem) || 'AIRTABLE',
            sourceBaseId: DEFAULT_BASE_ID,
            sourceTable: sourceMetadata.sourceTable,
            sourceAirtableRecordIds: sourceMetadata.sourceRecordIds.length
              ? admin.firestore.FieldValue.arrayUnion(...sourceMetadata.sourceRecordIds)
              : undefined,
            identityConfidence: department.confidence,
            identityEvidence: department.evidence.length
              ? admin.firestore.FieldValue.arrayUnion(...department.evidence)
              : undefined,
            lastSyncRunId: runId,
            syncStatus: 'SYNCED',
            updatedAt: now,
            createdAt: current?.exists ? undefined : now,
          }),
        });
      });

      projection.hierarchy.agents.forEach((agent, index) => {
        const ref = agentRefs[index];
        const current = snapshotByPath.get(ref.path);
        const sourceMetadata = hierarchySourceMetadata(agent.sourceClientIds);
        writes.push({
          ref,
          data: cleanData({
            displayName: current?.exists ? undefined : agent.displayName,
            names: agent.names.length ? admin.firestore.FieldValue.arrayUnion(...agent.names) : undefined,
            email: current?.exists ? undefined : agent.email,
            normalizedEmail: agent.normalizedEmail,
            phoneNumbers: agent.phoneNumbers.length
              ? admin.firestore.FieldValue.arrayUnion(...agent.phoneNumbers)
              : undefined,
            agentType: current?.exists ? undefined : agent.agentType,
            roles: agent.roles.length ? admin.firestore.FieldValue.arrayUnion(...agent.roles) : undefined,
            status: current?.exists ? undefined : 'ACTIVE',
            organizationId: normalize(current?.data()?.organizationId) || 'lingland-main',
            sourceSystem: normalize(current?.data()?.sourceSystem) || 'AIRTABLE',
            sourceBaseId: DEFAULT_BASE_ID,
            sourceTable: sourceMetadata.sourceTable,
            sourceAirtableRecordIds: sourceMetadata.sourceRecordIds.length
              ? admin.firestore.FieldValue.arrayUnion(...sourceMetadata.sourceRecordIds)
              : undefined,
            lastSyncRunId: runId,
            syncStatus: 'SYNCED',
            updatedAt: now,
            createdAt: current?.exists ? undefined : now,
          }),
        });
      });

      projection.hierarchy.memberships.forEach((membership, index) => {
        const ref = membershipRefs[index];
        const current = snapshotByPath.get(ref.path);
        const sourceMetadata = hierarchySourceMetadata(membership.sourceClientIds);
        writes.push({
          ref,
          data: cleanData({
            clientId: projection.canonicalClientId,
            agentId: membership.agentId,
            accessLevel: current?.exists ? undefined : membership.accessLevel,
            roles: membership.roles.length
              ? admin.firestore.FieldValue.arrayUnion(...membership.roles)
              : undefined,
            departmentIds: membership.departmentIds.length
              ? admin.firestore.FieldValue.arrayUnion(...membership.departmentIds)
              : undefined,
            status: current?.exists ? undefined : 'ACTIVE',
            organizationId: normalize(current?.data()?.organizationId) || 'lingland-main',
            sourceSystem: normalize(current?.data()?.sourceSystem) || 'AIRTABLE',
            sourceBaseId: DEFAULT_BASE_ID,
            sourceTable: sourceMetadata.sourceTable,
            sourceAirtableRecordIds: sourceMetadata.sourceRecordIds.length
              ? admin.firestore.FieldValue.arrayUnion(...sourceMetadata.sourceRecordIds)
              : undefined,
            lastSyncRunId: runId,
            syncStatus: 'SYNCED',
            updatedAt: now,
            createdAt: current?.exists ? undefined : now,
          }),
        });
      });

      for (let start = 0; start < writes.length; start += 200) {
        const batch = db.batch();
        writes.slice(start, start + 200).forEach(write => batch.set(write.ref, write.data, { merge: true }));
        await batch.commit();
      }
    }

    if (details.length < MODULE_DETAIL_LIMIT) details.push({
      action,
      sourceTable: CLIENTS_BOOK_TABLE,
      clientId: projection.canonicalClientId,
      clientName: projection.canonicalCompanyName,
      sourceRecords: projection.sourceRecordIds.length,
      departments: projection.hierarchy.departments.length,
      agents: projection.hierarchy.agents.length,
      memberships: projection.hierarchy.memberships.length,
      unresolvedContacts: projection.hierarchy.unresolvedContacts.length,
      message: action === 'created' && mode.dryRun
        ? 'Would create one canonical organisation and project its contacts into CRM hierarchy.'
        : undefined,
    });
  });

  const diagnostics = {
    clientsBookSourceRecords: records.length,
    departmentSourceRecords: departmentRecords.length,
    exactOrganisationGroups: groupedSources.size,
    canonicalOrganisations: projectionResult.projections.length,
    resolutionMethods,
    ambiguousGroups: conflicts.length,
    ambiguousSourceRecords: conflicts.reduce((total, conflict) => total + conflict.sourceRecordIds.length, 0),
    conflictReasons: conflicts.reduce<Record<string, number>>((counts, conflict) => {
      counts[conflict.reason] = (counts[conflict.reason] || 0) + 1;
      return counts;
    }, {}),
    conflictCandidates: conflicts.map(conflict => ({
      sourceTable: conflict.sourceTable,
      reason: conflict.reason,
      groupKey: conflict.groupKey,
      sourceRecordIds: conflict.sourceRecordIds,
      companyNames: conflict.companyNames,
      candidateClientIds: conflict.candidateClientIds,
      recommendation: conflict.recommendation,
    })),
    deferredIdentityGroups: deferredIdentityGroups
      .sort((left, right) => left.groupKey.localeCompare(right.groupKey)),
    deferredIdentityGroupCount: deferredIdentityGroups.length,
    deferredSourceRecordCount: deferredIdentityGroups.reduce((
      total,
      deferred,
    ) => total + deferred.sourceRecordIds.length, 0),
    newCanonicalOrganisationCandidates: conflicts
      .filter(conflict => conflict.reason === 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED')
      .map(conflict => ({
        groupKey: conflict.groupKey,
        canonicalCompanyName: conflict.companyNames[0] || 'Unnamed organisation',
        proposedClientId: conflict.candidateClientIds[0] || '',
        sourceRecordCount: conflict.sourceRecordIds.length,
        sourceNames: conflict.companyNames,
        recommendation: conflict.recommendation,
      }))
      .sort((left, right) => left.canonicalCompanyName.localeCompare(right.canonicalCompanyName)),
    projectedDepartments: projectionResult.projections.reduce((total, projection) => (
      total + projection.hierarchy.departments.length
    ), 0),
    projectedAgents: projectionResult.projections.reduce((total, projection) => (
      total + projection.hierarchy.agents.length
    ), 0),
    projectedMemberships: projectionResult.projections.reduce((total, projection) => (
      total + projection.hierarchy.memberships.length
    ), 0),
    unresolvedContacts: projectionResult.projections.reduce((total, projection) => (
      total + projection.hierarchy.unresolvedContacts.length
    ), 0),
    writeReadiness: {
      ready: conflicts.length === 0,
      blockerCount: conflicts.length,
      blockers: Object.entries(conflicts.reduce<Record<string, number>>((counts, conflict) => {
        counts[conflict.reason] = (counts[conflict.reason] || 0) + 1;
        return counts;
      }, {})).map(([reason, count]) => ({ reason, count })),
    },
  };

  return { stats, details, diagnostics };
};

const syncTranslationBookings = async (
  records: AirtableRecord[],
  tableName: string,
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string,
  conflictContext?: ConflictReconciliationContext,
  clientEvidenceByTranslationId: Map<string, TranslationClientEvidence> = new Map(),
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  const diagnostics = {
    conflictReasons: {} as Record<string, number>,
    clientResolutionActions: {} as Record<string, number>,
    wouldCreateBookings: [] as Array<Record<string, unknown>>,
    clientCandidates: [] as Array<Record<string, unknown>>,
    professionalCandidates: [] as Array<Record<string, unknown>>,
  };
  const clientCandidateMap = new Map<string, Record<string, unknown>>();
  const professionalCandidateMap = new Map<string, Record<string, unknown>>();
  const countDiagnostic = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] || 0) + 1;
  };

  for (const record of records) {
    try {
      const mapped = await mapTranslationRecordToBooking(
        record,
        tableName,
        clientEvidenceByTranslationId.get(record.id),
      ) as any;
      if (!mode.dryRun && runId) mapped.booking.lastSyncRunId = runId;
      const clientEvidenceAmbiguous = Boolean(mapped.sourceSnapshot.clientIdentityEvidence?.accountRefAmbiguous);
      const normalizedClientName = normalizeForMatch(mapped.sourceSnapshot.clientIdentity.companyName);
      const genericClientName = GENERIC_CLIENT_NAMES.has(normalizedClientName);
      const hasStableClientKey = Boolean(
        mapped.sourceSnapshot.clientIdentity.uniqueClientKey
        || mapped.sourceSnapshot.clientIdentity.sageAccountRef
      );
      const legacyWebContactOnly = tableName === WEB_TRANSLATIONS_TABLE && !hasStableClientKey;
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
      }, mode.dryRun, !clientEvidenceAmbiguous && !genericClientName && !legacyWebContactOnly);
      countDiagnostic(diagnostics.clientResolutionActions, clientResolution.action);
      if (clientResolution.action === 'would-create' || clientResolution.action.startsWith('unresolved')) {
        const candidateKey = clientResolution.id || [
          mapped.sourceSnapshot.clientIdentity.sageAccountRef,
          mapped.sourceSnapshot.clientIdentity.uniqueClientKey,
          mapped.sourceSnapshot.clientIdentity.normalizedCompanyName,
        ].filter(Boolean).join('|');
        const currentCandidate = clientCandidateMap.get(candidateKey);
        clientCandidateMap.set(candidateKey, {
          clientId: clientResolution.id,
          action: clientResolution.action,
          companyName: mapped.sourceSnapshot.clientIdentity.companyName,
          normalizedCompanyName: mapped.sourceSnapshot.clientIdentity.normalizedCompanyName,
          sageAccountRef: mapped.sourceSnapshot.clientIdentity.sageAccountRef,
          uniqueClientKey: mapped.sourceSnapshot.clientIdentity.uniqueClientKey,
          email: mapped.sourceSnapshot.clientIdentity.email || mapped.sourceSnapshot.clientIdentity.invoiceEmail,
          sourceRecordCount: Number(currentCandidate?.sourceRecordCount || 0) + 1,
          sourceRecordIds: [
            ...((currentCandidate?.sourceRecordIds as string[] | undefined) || []),
            record.id,
          ].slice(0, 20),
        });
      }
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
      const unresolvedClient = clientResolution.action.startsWith('unresolved');
      if (unresolvedClient) {
        const currentClientId = normalize(existing?.clientId);
        const currentClientName = normalizeForMatch(existing?.clientName || '');
        const currentClientIsUsable = Boolean(currentClientId)
          && !GENERIC_CLIENT_IDS.has(currentClientId)
          && !GENERIC_CLIENT_NAMES.has(currentClientName);
        mapped.booking.clientId = currentClientIsUsable ? currentClientId : undefined;
        if (currentClientIsUsable) mapped.booking.clientName = existing?.clientName || mapped.booking.clientName;
        mapped.booking.syncStatus = 'CONFLICT';
        if (!clientEvidenceAmbiguous) {
          stats.conflict += 1;
          countDiagnostic(diagnostics.conflictReasons, 'CLIENT_NOT_RESOLVED');
          await writeSyncConflict({
            runId,
            entityType: 'booking',
            entityId: existingSnap?.id,
            sourceTable: tableName,
            sourceRecordId: record.id,
            sourceBaseId: mapped.booking.sourceBaseId,
            legacyRef: mapped.booking.legacyAirtableRef,
            severity: 'HIGH',
            reason: 'CLIENT_NOT_RESOLVED',
            currentValue: { clientId: currentClientId, clientName: existing?.clientName || '' },
            incomingValue: mapped.sourceSnapshot.clientIdentity,
            recommendedAction: 'Link this translation to one canonical Client CRM organisation, then rerun sync.',
            dryRun: mode.dryRun,
          });
        }
      }
      const hasTranslatorSignal = Boolean(
        mapped.sourceSnapshot.translatorName
        || mapped.sourceSnapshot.translatorEmail
        || mapped.sourceSnapshot.translatorPhone
        || mapped.sourceSnapshot.translatorAirtableRecordId
      );
      const unresolvedTranslator = hasTranslatorSignal && !mapped.booking.interpreterId;
      if (unresolvedTranslator) {
        const professionalKey = mapped.sourceSnapshot.translatorAirtableRecordId
          || mapped.sourceSnapshot.translatorEmail
          || normalizeIdentityName(mapped.sourceSnapshot.translatorName)
          || record.id;
        const currentProfessional = professionalCandidateMap.get(professionalKey);
        professionalCandidateMap.set(professionalKey, {
          airtableRecordId: mapped.sourceSnapshot.translatorAirtableRecordId,
          name: mapped.sourceSnapshot.translatorName,
          email: mapped.sourceSnapshot.translatorEmail,
          phone: mapped.sourceSnapshot.translatorPhone,
          ambiguousCandidates: mapped.sourceSnapshot.translatorAmbiguousCandidates || [],
          sourceRecordCount: Number(currentProfessional?.sourceRecordCount || 0) + 1,
          sourceRecordIds: [
            ...((currentProfessional?.sourceRecordIds as string[] | undefined) || []),
            record.id,
          ].slice(0, 20),
        });
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        countDiagnostic(
          diagnostics.conflictReasons,
          mapped.sourceSnapshot.translatorAmbiguousCandidates?.length
            ? 'PROFESSIONAL_MATCH_AMBIGUOUS'
            : 'PROFESSIONAL_NOT_RESOLVED',
        );
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
            phone: mapped.sourceSnapshot.translatorPhone,
            airtableRecordId: mapped.sourceSnapshot.translatorAirtableRecordId
          },
          recommendedAction: 'Review translator identity, link the Airtable professional to an interpreter profile, then rerun sync.',
          dryRun: mode.dryRun
        });
      }
      if (clientEvidenceAmbiguous) {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        countDiagnostic(diagnostics.conflictReasons, 'CLIENT_ACCOUNT_REF_AMBIGUOUS');
        await writeSyncConflict({
          runId,
          entityType: 'booking',
          entityId: existingSnap?.id,
          sourceTable: tableName,
          sourceRecordId: record.id,
          sourceBaseId: mapped.booking.sourceBaseId,
          legacyRef: mapped.booking.legacyAirtableRef,
          severity: 'HIGH',
          reason: 'CLIENT_ACCOUNT_REF_AMBIGUOUS',
          currentValue: {
            clientId: existing?.clientId || '',
            clientName: existing?.clientName || '',
            invoiceNumbers: mapped.sourceSnapshot.clientIdentityEvidence.invoiceNumbers,
          },
          incomingValue: {
            candidateAccountRefs: mapped.sourceSnapshot.clientIdentityEvidence.candidateAccountRefs,
            invoiceRecordIds: mapped.sourceSnapshot.clientIdentityEvidence.invoiceRecordIds,
            agencyNames: mapped.sourceSnapshot.clientIdentityEvidence.agencyNames,
            requestedByNames: mapped.sourceSnapshot.clientIdentityEvidence.requestedByNames,
            emails: mapped.sourceSnapshot.clientIdentityEvidence.emails,
          },
          recommendedAction: 'Review the linked translation invoices and select one canonical client account before rerunning sync.',
          dryRun: mode.dryRun,
        });
      }
      if (existing?.status && existing.status !== mapped.booking.status && sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        countDiagnostic(diagnostics.conflictReasons, 'STATUS_SOURCE_OF_TRUTH_MISMATCH');
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
      if (action === 'created') {
        diagnostics.wouldCreateBookings.push({
          sourceRecordId: record.id,
          sourceTable: tableName,
          jobNumber: mapped.booking.jobNumber,
          clientName: mapped.booking.clientName,
          clientId: mapped.booking.clientId || '',
          clientAction: clientResolution.action,
          status: mapped.booking.status,
          interpreterName: mapped.booking.interpreterName,
          interpreterId: mapped.booking.interpreterId,
          syncStatus: mapped.booking.syncStatus,
        });
      }
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
      markConflictScopeProcessed(conflictContext, tableName, record.id);
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

  diagnostics.clientCandidates = Array.from(clientCandidateMap.values())
    .sort((left, right) => Number(right.sourceRecordCount || 0) - Number(left.sourceRecordCount || 0));
  diagnostics.professionalCandidates = Array.from(professionalCandidateMap.values())
    .sort((left, right) => Number(right.sourceRecordCount || 0) - Number(left.sourceRecordCount || 0));
  return { stats, details, diagnostics };
};

const syncClientInvoices = async (
  records: AirtableRecord[],
  mode: SyncMode,
  sourceOfTruth: string | undefined,
  runId?: string,
  conflictContext?: ConflictReconciliationContext
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  const directory = await buildClientInvoiceSyncDirectory(!mode.dryRun);
  const preparedRows = records.map(record => {
    const fields = record.fields;
    const rawInvoiceNumber = pick(fields, [
      'Invoice Nbr',
      'Invoice Number',
      'INV ID',
      'SAGE Invoice No',
      'Sage Invoice Number',
      'Invoice Reference',
      'Reference',
      'Name'
    ]);
    const hasInvoiceReference = Boolean(rawInvoiceNumber) && !/^rec[a-z0-9]+$/i.test(rawInvoiceNumber);
    const invoiceNumber = hasInvoiceReference ? rawInvoiceNumber : `AIRTABLE-INV-${record.id}`;
    const linkedSourceIds = pickLinkedIds(fields, [
      'Job Number from redbook',
      '🖥️ REDBOOK',
      'ðŸ–¥ï¸ REDBOOK',
      'Redbook ID (from Job Number from redbook)'
    ]);
    const grossSelection = selectMoneyField(fields, [
      'SAGE Invoice + VAT',
      'Invoice Total',
      'Invoice Amount',
      'Total Amount',
      'Total + VAT',
      'Total inc VAT',
      'Total Including VAT',
      'Total invoiced',
      'Invoiced + VAT',
      'Amount Due',
      'Amount',
      'Value'
    ], ['invoicetotal', 'invoiceamount', 'totalinvoiced', 'totalamount', 'amountdue', 'grossamount']);
    const subtotalSelection = selectMoneyField(fields, [
      'SAGE Invoice total',
      'Subtotal',
      'Net',
      'Net Total',
      'Total ex VAT',
      'Total excluding VAT'
    ]);
    const grossAmount = grossSelection.value || subtotalSelection.value;
    return {
      record,
      fields,
      rawInvoiceNumber,
      invoiceNumber,
      hasInvoiceReference,
      linkedSourceIds,
      bookings: getBookingsFromClientInvoiceDirectory(linkedSourceIds, directory),
      grossAmount,
      subtotalAmount: subtotalSelection.value || grossAmount,
      grossSourceField: grossSelection.fieldName,
      subtotalSourceField: subtotalSelection.fieldName,
      status: mapClientInvoiceStatus(fields),
      issueDate: dateOnly(pickRaw(fields, [
        'Invoice Date',
        'Issue Date',
        'Invoiced on',
        'Date Invoiced',
        'Last Modified'
      ]) || record.createdTime),
      dueDate: (() => {
        const raw = pickRaw(fields, ['Due Date', 'Payment Due Date', 'Payment Due', 'Due']);
        return raw ? dateOnly(raw) : '';
      })(),
      paidDate: (() => {
        const raw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
        return raw ? dateOnly(raw) : '';
      })(),
    };
  });
  const invoiceGroups = aggregateClientInvoiceRows(preparedRows.map(row => ({
    sourceRecordId: row.record.id,
    invoiceNumber: row.invoiceNumber,
    hasInvoiceReference: row.hasInvoiceReference,
    linkedSourceIds: row.linkedSourceIds,
    bookings: row.bookings,
    grossAmount: row.grossAmount,
    subtotalAmount: row.subtotalAmount,
    status: row.status,
  })), booking => booking.id);
  const preparedRowsBySourceId = new Map(preparedRows.map(row => [row.record.id, row]));
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const group of invoiceGroups) {
    const fallbackSourceRecordId = group.sourceRecordIds[0] || group.key;
    try {
      const sourceRows = group.sourceRecordIds
        .map(sourceRecordId => preparedRowsBySourceId.get(sourceRecordId))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      const representative = sourceRows[0];
      if (!representative) throw new Error(`Invoice group ${group.key} has no source rows.`);
      const record = representative.record;
      const fields = representative.fields;
      const hasInvoiceReference = group.hasInvoiceReference;
      const invoiceNumber = group.invoiceNumber;
      const displayReference = hasInvoiceReference ? invoiceNumber : 'Reference missing';
      const invoiceId = `airtable_client_invoice_${slugify(invoiceNumber || record.id)}`;
      const existing = directory.invoicesById.get(invoiceId);
      const existingData = existing?.data();
      const linkedRedbookIds = group.linkedSourceIds;
      const bookings = group.bookings;
      const hasJobLinkConflict = sourceRows.some(row => (
        row.linkedSourceIds.length === 0 || row.bookings.length === 0
      ));
      const firstBooking = bookings[0]?.data() || {};
      const invoiceTotal = group.grossAmount || group.subtotalAmount;
      const subtotal = group.subtotalAmount || invoiceTotal;
      const amountSourceField = Array.from(new Set(sourceRows.flatMap(row => [
        row.grossSourceField,
        row.subtotalSourceField,
      ]).filter(Boolean))).join(', ');
      const status = group.status;
      const reportJobLinkConflict = shouldReportInvoiceLinkConflict(status, hasJobLinkConflict);
      const clientName = sourceRows
        .map(row => pick(row.fields, [
          'Agency, institution or company  (from feed from redbook)',
          'Account (from invoice to)',
          'invoice to'
        ]))
        .find(Boolean)
        || firstBooking.clientName
        || 'Airtable Client';
      const bookingClientIds = Array.from(new Set(
        bookings.map(booking => normalize(booking.data()?.clientId)).filter(Boolean)
      ));
      const canonicalBookingClientIds = uniqueValues(
        ...bookingClientIds.map(clientId => canonicalClientIdFromDirectory(clientId, directory.clientsById))
      );
      const existingInvoiceClientId = normalize(existingData?.clientId);
      const resolvedKnownClientId = preferredInvoiceClientId(
        bookingClientIds,
        existingInvoiceClientId,
        directory.clientsById
      );
      const clientResolution = await resolveInvoiceClient(
        resolvedKnownClientId,
        clientName,
        fields,
        mode.dryRun
      );
      const clientId = clientResolution.id;
      const issueDate = sourceRows.map(row => row.issueDate).filter(Boolean).sort()[0]
        || dateOnly(record.createdTime);
      const dueDate = sourceRows.map(row => row.dueDate).find(Boolean) || '';
      const sortedPaidDates = sourceRows.map(row => row.paidDate).filter(Boolean).sort();
      const paidDate = sortedPaidDates[sortedPaidDates.length - 1] || '';
      const lineCount = group.lines.length;
      const financialIntegrityStatus = Math.abs(invoiceTotal) < 0.005
        ? 'AMOUNT_MISSING'
        : hasJobLinkConflict
          ? 'LINK_MISSING'
          : 'VERIFIED';
      const hierarchy = projectClientFinanceHierarchy(bookings.map(booking => ({
        id: booking.id,
        ...(booking.data() || {}),
      })));
      const lineProjection = group.lines.map(line => ({
        key: line.key,
        sourceRecordIds: line.sourceRecordIds,
        grossAmount: line.grossAmount,
        subtotalAmount: line.subtotalAmount,
      }));
      const existingExists = Boolean(existing);
      const invoiceSnapshot = {
        financeProjectionVersion: FINANCE_PROJECTION_VERSION,
        invoiceNumber,
        status,
        invoiceTotal,
        subtotal,
        amountSourceField,
        financialIntegrityStatus,
        lineCount,
        dueDate,
        paidDate,
        clientId,
        clientName,
        clientResolutionAction: clientResolution.action,
        linkedRedbookIds,
        sourceRecordIds: group.sourceRecordIds,
        sourceStatuses: group.sourceStatuses,
        lineProjection,
        hierarchy
      };
      const sourceTracking = buildSourceTracking(
        record,
        CLIENT_INVOICES_TABLE,
        invoiceNumber,
        invoiceSnapshot,
        runId
      );
      const snapshotHash = normalize(sourceTracking.airtableSnapshotHash);
      const sourceBackfillNeeded = existingExists && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existingExists
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (reportJobLinkConflict) {
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
          incomingValue: { linkedRedbookIds, sourceRecordIds: group.sourceRecordIds },
          recommendedAction: 'Review the Airtable invoice link fields and connect this invoice to the correct mirrored job before financial sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (group.statusMismatch) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'INVOICE_GROUP_STATUS_MISMATCH',
          currentValue: { status: existingData?.status || '' },
          incomingValue: {
            aggregateStatus: status,
            sourceStatuses: group.sourceStatuses,
            sourceRecordIds: group.sourceRecordIds,
          },
          recommendedAction: 'Align every Airtable row sharing this invoice number to one financial status, then rerun the invoice sync.',
          dryRun: mode.dryRun,
        });
      }

      if (clientResolution.action.startsWith('unresolved')) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'INVOICE_CLIENT_NOT_RESOLVED',
          currentValue: {
            clientId: existingInvoiceClientId,
            canonicalClientId: canonicalClientIdFromDirectory(existingInvoiceClientId, directory.clientsById),
          },
          incomingValue: {
            proposedClientId: clientId,
            clientName,
            clientResolutionAction: clientResolution.action,
            bookingClientIds,
            canonicalBookingClientIds,
          },
          recommendedAction: 'Link the invoice to a canonical Client CRM organisation. Invoice imports must not create client records.',
          dryRun: mode.dryRun,
        });
      }

      if (financialIntegrityStatus === 'AMOUNT_MISSING' && requiresIssuedInvoiceIntegrity(status)) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'INVOICE_AMOUNT_MISSING',
          currentValue: { totalAmount: existingData?.totalAmount || 0 },
          incomingValue: {
            status,
            amountSourceField,
            financialFields: collectFinancialFieldEvidence(fields),
          },
          recommendedAction: 'Map the Airtable invoice total field or enter a verified amount before sending, paying or reporting this invoice.',
          dryRun: mode.dryRun
        });
      }

      if (!hasInvoiceReference && requiresIssuedInvoiceIntegrity(status)) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'MEDIUM',
          reason: 'INVOICE_REFERENCE_MISSING',
          currentValue: {
            invoiceNumber: existingData?.invoiceNumber || existingData?.reference || '',
          },
          incomingValue: {
            status,
            financialFields: collectFinancialFieldEvidence(fields),
          },
          recommendedAction: 'Map or enter the external invoice reference before financial sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        if (batchOps > 350) await commitIfNeeded(true);
        const expectedLineIds = new Set(group.lines.map(line => (
          `${invoiceId}_${line.booking?.id || `unmatched_${line.sourceRecordIds[0]}`}`
        )));
        const staleLineRefs = getStaleImportedInvoiceLineRefsFromDirectory(
          invoiceId,
          record.id,
          expectedLineIds,
          directory,
        );
        staleLineRefs.forEach(lineRef => {
          batch.delete(lineRef);
          batchOps += 1;
        });
        const invoiceRef = db.collection('clientInvoices').doc(invoiceId);
        batch.set(invoiceRef, cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          clientId,
          clientName,
          reference: displayReference,
          invoiceNumber: hasInvoiceReference ? invoiceNumber : undefined,
          status,
          issueDate,
          dueDate,
          periodStart: issueDate,
          periodEnd: (() => {
            const sortedIssueDates = sourceRows.map(row => row.issueDate).filter(Boolean).sort();
            return sortedIssueDates[sortedIssueDates.length - 1] || issueDate;
          })(),
          subtotal,
          vatRate: invoiceTotal && subtotal ? Number(((invoiceTotal - subtotal) / subtotal).toFixed(4)) : 0,
          vatAmount: invoiceTotal && subtotal ? Number((invoiceTotal - subtotal).toFixed(2)) : 0,
          totalAmount: invoiceTotal || subtotal,
          currency: 'GBP',
          items: [],
          lineCount,
          financialIntegrityStatus,
          amountSourceField: amountSourceField || undefined,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
          financeProjectionVersion: FINANCE_PROJECTION_VERSION,
          ...hierarchy,
          ...sourceTracking,
          sourceRecordIds: group.sourceRecordIds,
          sourceRecordCount: group.sourceRecordIds.length,
          linkedRedbookRecordIds: linkedRedbookIds,
          airtableStatus: pick(fields, ['Invocing Status', 'Invoicing Status', 'Invoice Status', 'Status', 'Payment Status']),
          airtableStatusValues: group.sourceStatuses,
          airtablePaid: status === 'PAID',
          paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existingExists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        group.lines.forEach(invoiceLine => {
          const booking = invoiceLine.booking;
          const amountPerLine = invoiceLine.grossAmount;
          const subtotalPerLine = invoiceLine.subtotalAmount;
          const vatPerLine = Number((amountPerLine - subtotalPerLine).toFixed(2));
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || `unmatched_${invoiceLine.sourceRecordIds[0]}`}`;
          const line = summarizeInvoiceLine(booking, invoiceNumber, amountPerLine);
          const lineHierarchy = projectClientInvoiceLineHierarchy(booking ? {
            id: booking.id,
            ...(booking.data() || {}),
          } : null);
          batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
            ...line,
            timesheetId,
            id: lineId,
            invoiceId,
            clientInvoiceId: invoiceId,
            clientId,
            ...lineHierarchy,
            sourceRecordId: invoiceLine.sourceRecordIds[0],
            sourceRecordIds: invoiceLine.sourceRecordIds,
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
            const nextStatus = preserveStatusIfLocalAhead(
              bookingData.status,
              mapClientInvoiceStatusToBookingStatus(status),
              sourceOfTruth
            );
            const projectedTotal = amountPerLine || safeNumber(bookingData.clientInvoiceTotal) || safeNumber(bookingData.totalAmount);
            const projectedSubtotal = subtotalPerLine || safeNumber(bookingData.clientInvoiceSubtotal) || projectedTotal;
            const projectedVat = Math.abs(invoiceTotal || subtotal) >= 0.005
              ? vatPerLine
              : safeNumber(bookingData.clientInvoiceVatAmount ?? bookingData.vatAmount);
            batch.update(booking.ref, cleanData({
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceReference: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceStatus: status,
              clientInvoiceTotal: projectedTotal,
              clientInvoiceSubtotal: projectedSubtotal,
              clientInvoiceVatAmount: projectedVat,
              vatAmount: projectedVat,
              totalAmount: projectedTotal,
              paymentStatus: mapClientInvoiceStatusToPaymentStatus(status),
              billingState: status === 'PAID' ? 'PAID' : status === 'SENT' ? 'INVOICED' : status === 'CANCELLED' ? 'ISSUE' : 'INVOICING',
              status: nextStatus,
              invoicedAt: issueDate,
              paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceStatus: status,
              clientInvoiceTotal: projectedTotal,
              clientInvoiceSubtotal: projectedSubtotal,
              clientInvoiceVatAmount: projectedVat,
              totalAmount: projectedTotal,
              status: nextStatus,
              paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt
            });
            batchOps += 2;
          }
        });
      }

      if (details.length < MAX_DETAILS) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceRecordIds: group.sourceRecordIds,
          sourceRecordCount: group.sourceRecordIds.length,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: CLIENT_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber,
          clientName,
          clientResolutionAction: clientResolution.action,
          linkedJobs: linkedRedbookIds.length,
          matchedBookings: bookings.length,
          conflict: reportJobLinkConflict ? (linkedRedbookIds.length === 0 ? 'INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
          status,
          sourceStatuses: group.sourceStatuses,
          statusMismatch: group.statusMismatch,
          lineCount,
          totalAmount: invoiceTotal || subtotal,
          amountSourceField: amountSourceField || undefined,
          financialIntegrityStatus,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
        });
      }

      await commitIfNeeded();
      group.sourceRecordIds.forEach(sourceRecordId => {
        markConflictScopeProcessed(conflictContext, CLIENT_INVOICES_TABLE, sourceRecordId);
      });
    } catch (error) {
      stats.error += 1;
      if (details.length < MAX_DETAILS) {
        details.push({
          action: 'error',
          sourceRecordId: fallbackSourceRecordId,
          sourceRecordIds: group.sourceRecordIds,
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
  runId?: string,
  conflictContext?: ConflictReconciliationContext
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
      const rawInvoiceReference = pick(fields, [
        'Invoice Number',
        'Invoice Reference',
        'Invoice Ref',
        'INV Number',
        'Reference',
        'Name',
        'INV name'
      ]);
      const hasInvoiceReference = Boolean(rawInvoiceReference) && !/^rec[a-z0-9]+$/i.test(rawInvoiceReference);
      const invoiceRefText = hasInvoiceReference ? rawInvoiceReference : `AIRTABLE-INT-${record.id}`;
      const interpreterEmail = cleanEmail(pick(fields, ['INT EMAIL (from 🖥️ REDBOOK)']));
      const interpreterName = pick(fields, ['INV name', 'assign to (from 🖥️ REDBOOK)']) || firstBooking.interpreterName || 'Interpreter';
      const interpreterPhone = pick(fields, [
        'PHONE (from assign to)',
        'PHONE (from assign to (from 🖥️ REDBOOK))',
        'Interpreter Phone',
        'INT PHONE'
      ]);
      const resolvedInterpreter = firstBooking.interpreterId
        ? {
          id: firstBooking.interpreterId,
          name: firstBooking.interpreterName || interpreterName,
          email: firstBooking.interpreterEmail || interpreterEmail,
          photoUrl: firstBooking.interpreterPhotoUrl || ''
        }
        : await resolveInterpreterCached(interpreterEmail, interpreterName, '', interpreterPhone);
      const hasPersonConflict = !resolvedInterpreter?.id;
      const interpreterId = resolvedInterpreter?.id || `airtable_interpreter_${slugify(interpreterEmail || interpreterName || record.id)}`;
      const invoiceId = `airtable_interpreter_invoice_${record.id}`;
      const totalSelection = selectMoneyField(fields, [
        'INV Total',
        'Invoice Total',
        'Total Amount',
        'Amount',
        'Payable',
        'INT Total',
        'Interpreter Total',
        'INV Session fees',
        'Session Fees',
        'Fees'
      ], ['invoicetotal', 'totalamount', 'payable', 'interpretertotal', 'sessionfees', 'invoicefees']);
      const totalAmount = totalSelection.value;
      const amountSourceField = totalSelection.fieldName;
      const status = mapInterpreterInvoiceStatus(fields);
      const issueDate = dateOnly(pickRaw(fields, [
        'Invoice Date',
        'Issue Date',
        'Submitted Date',
        'Last Modified'
      ]) || record.createdTime);
      const paidDateRaw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
      const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
      const lineCount = Math.max(bookings.length, 1);
      const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
        ? 'AMOUNT_MISSING'
        : hasJobLinkConflict || hasPersonConflict
          ? 'LINK_MISSING'
          : 'VERIFIED';
      const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
      const invoiceSnapshot = {
        financeProjectionVersion: FINANCE_PROJECTION_VERSION,
        invoiceRefText,
        status,
        totalAmount,
        amountSourceField,
        financialIntegrityStatus,
        lineCount,
        interpreterId,
        paidDate,
        linkedRedbookIds
      };
      const sourceTracking = buildSourceTracking(
        record,
        INTERPRETER_INVOICES_TABLE,
        invoiceRefText,
        invoiceSnapshot,
        runId
      );
      const snapshotHash = normalize(sourceTracking.airtableSnapshotHash);
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
          incomingValue: { interpreterEmail, interpreterName, interpreterPhone },
          recommendedAction: 'Link this Airtable payable to an existing interpreter profile or passive imported interpreter before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (financialIntegrityStatus === 'AMOUNT_MISSING') {
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
          reason: 'PAYABLE_AMOUNT_MISSING',
          currentValue: { totalAmount: existingData?.totalAmount || 0 },
          incomingValue: { availableFields: Object.keys(fields).sort() },
          recommendedAction: 'Map the Airtable payable total field or enter a verified amount before approval or payment.',
          dryRun: mode.dryRun
        });
      }

      if (!hasInvoiceReference) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: INTERPRETER_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: 'MEDIUM',
          reason: 'PAYABLE_REFERENCE_MISSING',
          incomingValue: { availableFields: Object.keys(fields).sort() },
          recommendedAction: 'Map or enter the supplier invoice reference before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        if (batchOps > 350) await commitIfNeeded(true);
        const lineBookings = bookings.length ? bookings : [null];
        const expectedLineIds = new Set(lineBookings.map((booking, index) => (
          `${invoiceId}_${booking?.id || record.id}_${index}`
        )));
        const staleLineRefs = await getStaleImportedInvoiceLineRefs(
          'interpreterInvoiceLines',
          invoiceId,
          record.id,
          expectedLineIds
        );
        staleLineRefs.forEach(lineRef => {
          batch.delete(lineRef);
          batchOps += 1;
        });
        batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          interpreterId,
          interpreterName: resolvedInterpreter?.name || interpreterName,
          interpreterEmail: resolvedInterpreter?.email || interpreterEmail,
          model: 'UPLOAD',
          status,
          externalInvoiceReference: hasInvoiceReference ? invoiceRefText : 'Reference missing',
          totalAmount,
          issueDate,
          items: [],
          lineCount,
          financialIntegrityStatus,
          amountSourceField: amountSourceField || undefined,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
          financeProjectionVersion: FINANCE_PROJECTION_VERSION,
          currency: 'GBP',
          ...sourceTracking,
          linkedRedbookRecordIds: linkedRedbookIds,
          airtableStatus: pick(fields, ['Invoice Status', 'INV Status', 'Status', 'Payment Status', 'Approval Status']),
          paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        lineBookings.forEach((booking, index) => {
          const amountPerLine = allocateInvoiceLineAmount(totalAmount, index, lineBookings.length);
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
            const projectedPayable = amountPerLine
              || safeNumber(bookingData.interpreterInvoiceTotal)
              || safeNumber(bookingData.interpreterAmountCalculated)
              || safeNumber(bookingData.professionalCost);
            batch.update(booking.ref, cleanData({
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceReference: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceStatus: status,
              interpreterPaymentStatus: status,
              interpreterInvoiceTotal: projectedPayable,
              interpreterAmountCalculated: projectedPayable,
              professionalCost: projectedPayable,
              interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
              status: nextStatus,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceStatus: status,
              interpreterPaymentStatus: status,
              interpreterInvoiceTotal: projectedPayable,
              interpreterAmountCalculated: projectedPayable,
              totalToPay: projectedPayable,
              interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
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
          totalAmount,
          amountSourceField: amountSourceField || undefined,
          financialIntegrityStatus,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
        });
      }

      await commitIfNeeded();
      markConflictScopeProcessed(conflictContext, INTERPRETER_INVOICES_TABLE, record.id);
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
  runId?: string,
  conflictContext?: ConflictReconciliationContext
) => {
  const stats: Record<SyncAction, number> = emptyActionStats();
  const details: Array<Record<string, unknown>> = [];
  const directory = await buildClientInvoiceSyncDirectory(!mode.dryRun);
  const clientsById = directory.clientsById;
  const preparedRows: Array<{
    record: AirtableRecord;
    fields: Record<string, unknown>;
    invoiceNumber: string;
    hasInvoiceReference: boolean;
    linkedTranslationIds: string[];
    bookings: admin.firestore.QueryDocumentSnapshot[];
    totalAmount: number;
    amountSourceField: string;
    status: string;
    clientName: string;
    issueDate: string;
    dueDate: string;
    paidDate: string;
  }> = [];

  for (const record of records) {
    const fields = record.fields;
    const rawInvoiceNumber = pick(fields, [
      'TR Invoice Nbr',
      'Invoice Number',
      'Invoice No',
      'Invoice Reference',
      'Reference',
      'Name'
    ]);
    const hasInvoiceReference = Boolean(rawInvoiceNumber) && !/^rec[a-z0-9]+$/i.test(rawInvoiceNumber);
    const invoiceNumber = hasInvoiceReference ? rawInvoiceNumber : `AIRTABLE-TR-INV-${record.id}`;
    const linkedTranslationIds = pickLinkedIds(fields, [
      '📄 Translations',
      'Translations',
      'TR NUMBER (from 📄 Translations)',
      'TR NUMBER (from Translations)',
      'TR ID (from 📄 Translations)',
      'TR ID'
    ]);
    const bookings = getBookingsFromClientInvoiceDirectory(linkedTranslationIds, directory);
    const totalSelection = selectMoneyField(fields, [
      'FQ+VAT (from 📄 Translations)',
      'FQ+VAT',
      'FINAL QUOTE (from 📄 Translations)',
      'FINAL QUOTE',
      'Invoice Total',
      'Invoice Amount',
      'Total Amount',
      'TR Invoice Total',
      'Total inc VAT',
      'Amount Due',
      'Amount'
    ], ['fqvat', 'finalquote', 'invoicetotal', 'invoiceamount', 'totalamount', 'translationtotal', 'amountdue']);
    const firstBooking = bookings[0]?.data() || {};
    const issueDate = dateOnly(pickRaw(fields, [
      'Invoice Date',
      'Issue Date',
      'Invoiced on',
      'COMPLETED (from 📄 Translations)',
      'COMPLETED',
      'Last Modified'
    ]) || record.createdTime);
    const dueDateRaw = pickRaw(fields, ['Due Date', 'Payment Due Date', 'Payment Due', 'Due']);
    const paidDateRaw = pickRaw(fields, ['paid date', 'Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);

    preparedRows.push({
      record,
      fields,
      invoiceNumber,
      hasInvoiceReference,
      linkedTranslationIds,
      bookings,
      totalAmount: totalSelection.value,
      amountSourceField: totalSelection.fieldName,
      status: mapClientInvoiceStatus(fields),
      clientName: pick(fields, [
        'TR Agency (from 📄 Translations)',
        'TR Agency',
        'TR Requested By (from 📄 Translations)',
        'TR Requested By',
        'TR client email (from 📄 Translations)',
        'TR client email'
      ]) || firstBooking.clientName || 'Translation Client',
      issueDate,
      dueDate: dueDateRaw ? dateOnly(dueDateRaw) : '',
      paidDate: paidDateRaw ? dateOnly(paidDateRaw) : '',
    });
  }

  const invoiceGroups = aggregateClientInvoiceRows(preparedRows.map(row => ({
    sourceRecordId: row.record.id,
    invoiceNumber: row.invoiceNumber,
    hasInvoiceReference: row.hasInvoiceReference,
    linkedSourceIds: row.linkedTranslationIds,
    bookings: row.bookings,
    grossAmount: row.totalAmount,
    subtotalAmount: row.totalAmount,
    status: row.status,
  })), booking => booking.id);
  const preparedRowsBySourceId = new Map(preparedRows.map(row => [row.record.id, row]));
  let batch = db.batch();
  let batchOps = 0;

  const commitIfNeeded = async (force = false) => {
    if (mode.dryRun || batchOps === 0 || (!force && batchOps < 450)) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const group of invoiceGroups) {
    const fallbackSourceRecordId = group.sourceRecordIds[0] || group.key;
    try {
      const sourceRows = group.sourceRecordIds
        .map(sourceRecordId => preparedRowsBySourceId.get(sourceRecordId))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      const representative = sourceRows[0];
      if (!representative) throw new Error(`Translation invoice group ${group.key} has no source rows.`);
      const record = representative.record;
      const fields = Object.assign({}, ...sourceRows.map(row => row.fields));
      const hasInvoiceReference = group.hasInvoiceReference;
      const invoiceNumber = group.invoiceNumber;
      const displayReference = hasInvoiceReference ? invoiceNumber : 'Reference missing';
      const invoiceId = `airtable_translation_client_invoice_${slugify(invoiceNumber || record.id)}`;
      const existing = directory.invoicesById.get(invoiceId);
      const existingData = existing?.data();
      const linkedTranslationIds = group.linkedSourceIds;
      const bookings = group.bookings;
      const hasJobLinkConflict = sourceRows.some(row => (
        row.linkedTranslationIds.length === 0 || row.bookings.length === 0
      ));
      const totalAmount = group.grossAmount || group.subtotalAmount;
      const amountSourceField = uniqueValues(
        ...sourceRows.map(row => row.amountSourceField)
      ).join(', ');
      const status = group.status;
      const reportJobLinkConflict = shouldReportInvoiceLinkConflict(status, hasJobLinkConflict);
      const clientName = sourceRows.map(row => row.clientName).find(name => (
        name && name !== 'Translation Client'
      )) || bookings[0]?.data()?.clientName || 'Translation Client';
      const bookingClientIds = uniqueValues(
        ...bookings.map(booking => normalize(booking.data()?.clientId))
      );
      const canonicalBookingClientIds = uniqueValues(
        ...bookingClientIds.map(clientId => canonicalClientIdFromDirectory(clientId, clientsById))
      );
      const existingInvoiceClientId = normalize(existingData?.clientId);
      const resolvedKnownClientId = preferredInvoiceClientId(
        bookingClientIds,
        existingInvoiceClientId,
        clientsById
      );
      const clientResolution = await resolveInvoiceClient(resolvedKnownClientId, clientName, fields, mode.dryRun);
      const clientId = clientResolution.id;
      const issueDates = sourceRows.map(row => row.issueDate).filter(Boolean).sort();
      const issueDate = issueDates[0] || dateOnly(record.createdTime);
      const dueDate = sourceRows.map(row => row.dueDate).find(Boolean) || '';
      const paidDates = sourceRows.map(row => row.paidDate).filter(Boolean).sort();
      const paidDate = paidDates[paidDates.length - 1] || '';
      const lineCount = group.lines.length;
      const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
        ? 'AMOUNT_MISSING'
        : hasJobLinkConflict
          ? 'LINK_MISSING'
          : 'VERIFIED';
      const hierarchy = projectClientFinanceHierarchy(bookings.map(booking => ({
        id: booking.id,
        ...(booking.data() || {}),
      })));
      const invoiceSnapshot = {
        financeProjectionVersion: FINANCE_PROJECTION_VERSION,
        invoiceNumber,
        status,
        totalAmount,
        amountSourceField,
        financialIntegrityStatus,
        lineCount,
        dueDate,
        paidDate,
        clientId,
        clientName,
        clientResolutionAction: clientResolution.action,
        linkedTranslationIds,
        sourceRecordIds: group.sourceRecordIds,
        sourceStatuses: group.sourceStatuses,
        lineProjection: group.lines.map(line => ({
          key: line.key,
          sourceRecordIds: line.sourceRecordIds,
          grossAmount: line.grossAmount,
        })),
        hierarchy
      };
      const sourceTracking = buildSourceTracking(
        record,
        TRANSLATION_CLIENT_INVOICES_TABLE,
        invoiceNumber,
        invoiceSnapshot,
        runId
      );
      const snapshotHash = normalize(sourceTracking.airtableSnapshotHash);
      const sourceBackfillNeeded = Boolean(existing) && needsSourceTrackingBackfill(existingData, sourceTracking);
      const action: SyncAction = existing
        ? (existingData?.airtableSnapshotHash === snapshotHash && !sourceBackfillNeeded ? 'skipped' : 'updated')
        : 'created';

      stats[action] += 1;

      if (reportJobLinkConflict) {
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

      if (group.statusMismatch) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'TRANSLATION_INVOICE_GROUP_STATUS_MISMATCH',
          currentValue: { status: existingData?.status || '' },
          incomingValue: {
            aggregateStatus: status,
            sourceStatuses: group.sourceStatuses,
            sourceRecordIds: group.sourceRecordIds,
          },
          recommendedAction: 'Align every Airtable translation row sharing this invoice number to one financial status, then rerun sync.',
          dryRun: mode.dryRun,
        });
      }

      if (clientResolution.action.startsWith('unresolved')) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'INVOICE_CLIENT_NOT_RESOLVED',
          currentValue: {
            clientId: existingInvoiceClientId,
            canonicalClientId: canonicalClientIdFromDirectory(existingInvoiceClientId, clientsById),
          },
          incomingValue: {
            proposedClientId: clientId,
            clientName,
            clientResolutionAction: clientResolution.action,
            bookingClientIds,
            canonicalBookingClientIds,
          },
          recommendedAction: 'Link the translation invoice to a canonical Client CRM organisation. Invoice imports must not create client records.',
          dryRun: mode.dryRun,
        });
      }

      if (financialIntegrityStatus === 'AMOUNT_MISSING' && requiresIssuedInvoiceIntegrity(status)) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'HIGH',
          reason: 'TRANSLATION_INVOICE_AMOUNT_MISSING',
          currentValue: { totalAmount: existingData?.totalAmount || 0 },
          incomingValue: {
            status,
            amountSourceField,
            financialFields: collectFinancialFieldEvidence(fields),
          },
          recommendedAction: 'Map the translation invoice total field or enter a verified amount before sending, paying or reporting this invoice.',
          dryRun: mode.dryRun
        });
      }

      if (!hasInvoiceReference && requiresIssuedInvoiceIntegrity(status)) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'clientInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceNumber,
          severity: 'MEDIUM',
          reason: 'TRANSLATION_INVOICE_REFERENCE_MISSING',
          currentValue: {
            invoiceNumber: existingData?.invoiceNumber || existingData?.reference || '',
          },
          incomingValue: {
            status,
            financialFields: collectFinancialFieldEvidence(fields),
          },
          recommendedAction: 'Map or enter the external translation invoice reference before financial sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        if (batchOps > 350) await commitIfNeeded(true);
        const expectedLineIds = new Set(group.lines.map(line => (
          `${invoiceId}_${line.booking?.id || `unmatched_${line.sourceRecordIds[0]}`}`
        )));
        const staleLineRefs = getStaleImportedInvoiceLineRefsFromDirectory(
          invoiceId,
          record.id,
          expectedLineIds,
          directory
        );
        staleLineRefs.forEach(lineRef => {
          batch.delete(lineRef);
          batchOps += 1;
        });
        if (batchOps > 350) await commitIfNeeded(true);
        batch.set(db.collection('clientInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          clientId,
          clientName,
          reference: displayReference,
          invoiceNumber: hasInvoiceReference ? invoiceNumber : undefined,
          status,
          issueDate,
          dueDate,
          periodStart: issueDate,
          periodEnd: issueDates[issueDates.length - 1] || issueDate,
          subtotal: totalAmount,
          vatRate: 0,
          vatAmount: 0,
          totalAmount,
          currency: 'GBP',
          items: [],
          serviceCategory: 'TRANSLATION',
          lineCount,
          financialIntegrityStatus,
          amountSourceField: amountSourceField || undefined,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
          financeProjectionVersion: FINANCE_PROJECTION_VERSION,
          ...hierarchy,
          ...sourceTracking,
          airtableSourceRecordIds: group.sourceRecordIds,
          linkedTranslationRecordIds: linkedTranslationIds,
          airtableStatus: pick(fields, ['TR Status', 'Status']),
          paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        for (const line of group.lines) {
          if (batchOps > 430) await commitIfNeeded(true);
          const booking = line.booking;
          const amountPerLine = line.grossAmount || line.subtotalAmount;
          const timesheetId = booking?.exists ? getMirroredTimesheetId(booking.id) : '';
          const lineId = `${invoiceId}_${booking?.id || `unmatched_${line.sourceRecordIds[0]}`}`;
          const lineSourceRows = line.sourceRecordIds
            .map(sourceRecordId => preparedRowsBySourceId.get(sourceRecordId))
            .filter((row): row is NonNullable<typeof row> => Boolean(row));
          const lineFields = Object.assign({}, ...lineSourceRows.map(row => row.fields));
          const lineHierarchy = projectClientInvoiceLineHierarchy(booking ? {
            id: booking.id,
            ...(booking.data() || {}),
          } : null);
          batch.set(db.collection('clientInvoiceLines').doc(lineId), cleanData({
            id: lineId,
            invoiceId,
            clientInvoiceId: invoiceId,
            clientId,
            ...lineHierarchy,
            bookingId: booking?.id || '',
            timesheetId,
            description: `Airtable translation ${booking?.data()?.jobNumber || invoiceNumber}`,
            units: safeNumber(pickRaw(lineFields, [
              'WORD COUNT (from 📄 Translations)',
              'WORD COUNT',
              'TR owed words'
            ])) || 1,
            rate: amountPerLine,
            lineAmount: amountPerLine,
            total: amountPerLine,
            serviceCategory: 'TRANSLATION',
            sourceSystem: 'AIRTABLE',
            sourceRecordId: line.sourceRecordIds[0],
            sourceRecordIds: line.sourceRecordIds,
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
            const nextStatus = preserveStatusIfLocalAhead(
              bookingData.status,
              mapClientInvoiceStatusToBookingStatus(status),
              sourceOfTruth
            );
            const projectedTotal = amountPerLine || safeNumber(bookingData.clientInvoiceTotal) || safeNumber(bookingData.totalAmount);
            batch.update(booking.ref, cleanData({
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceReference: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceStatus: status,
              clientInvoiceTotal: projectedTotal,
              totalAmount: projectedTotal,
              paymentStatus: mapClientInvoiceStatusToPaymentStatus(status),
              billingState: status === 'PAID' ? 'PAID' : status === 'SENT' ? 'INVOICED' : status === 'CANCELLED' ? 'ISSUE' : 'INVOICING',
              status: nextStatus,
              invoicedAt: issueDate,
              paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              clientInvoiceId: invoiceId,
              clientInvoiceNumber: hasInvoiceReference ? invoiceNumber : '',
              clientInvoiceStatus: status,
              clientInvoiceTotal: projectedTotal,
              totalAmount: projectedTotal,
              status: nextStatus,
              paidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.paidAt
            });
            batchOps += 2;
          }
        }
      }

      if (details.length < MODULE_DETAIL_LIMIT) {
        details.push({
          action,
          sourceRecordId: record.id,
          sourceRecordIds: group.sourceRecordIds,
          sourceBaseId: DEFAULT_BASE_ID,
          sourceTable: TRANSLATION_CLIENT_INVOICES_TABLE,
          snapshotHash,
          syncRunId: !mode.dryRun ? runId : undefined,
          invoiceNumber,
          clientName,
          clientResolutionAction: clientResolution.action,
          linkedJobs: linkedTranslationIds.length,
          matchedBookings: bookings.length,
          conflict: reportJobLinkConflict ? (linkedTranslationIds.length === 0 ? 'TRANSLATION_INVOICE_WITHOUT_SOURCE_JOB_LINK' : 'TRANSLATION_INVOICE_JOB_LINK_NOT_RESOLVED') : undefined,
          status,
          totalAmount,
          amountSourceField: amountSourceField || undefined,
          financialIntegrityStatus,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
        });
      }

      await commitIfNeeded();
      group.sourceRecordIds.forEach(sourceRecordId => (
        markConflictScopeProcessed(conflictContext, TRANSLATION_CLIENT_INVOICES_TABLE, sourceRecordId)
      ));
    } catch (error) {
      stats.error += 1;
      pushErrorDetail(details, {
        action: 'error',
        sourceRecordId: fallbackSourceRecordId,
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
  runId?: string,
  conflictContext?: ConflictReconciliationContext
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
      const rawInvoiceReference = pick(fields, [
        'Invoice Number',
        'Invoice Reference',
        'Invoice Ref',
        'Reference',
        'Name',
        'TR NUMBER (from Translations)'
      ]);
      const hasInvoiceReference = Boolean(rawInvoiceReference) && !/^rec[a-z0-9]+$/i.test(rawInvoiceReference);
      const invoiceRefText = hasInvoiceReference ? rawInvoiceReference : `AIRTABLE-TR-PAY-${record.id}`;
      const translatorEmail = cleanEmail(pick(fields, ['EMAIL', 'EMAIL (from Assign to TR)']));
      const translatorName = pick(fields, ['Assign to', 'TRANSLATOR']) || firstBooking.interpreterName || 'Translator';
      const translatorPhone = pick(fields, [
        'PHONE (from Assign to TR)',
        'PHONE (from assign to)',
        'Translator Phone',
        'TR PHONE'
      ]);
      const resolvedTranslator = firstBooking.interpreterId
        ? {
          id: firstBooking.interpreterId,
          name: firstBooking.interpreterName || translatorName,
          email: firstBooking.interpreterEmail || translatorEmail,
          photoUrl: firstBooking.interpreterPhotoUrl || ''
        }
        : await resolveInterpreterCached(translatorEmail, translatorName, '', translatorPhone);
      const hasPersonConflict = !resolvedTranslator?.id;
      const interpreterId = resolvedTranslator?.id || `airtable_interpreter_${slugify(translatorEmail || translatorName || record.id)}`;
      const invoiceId = `airtable_translator_invoice_${record.id}`;
      const totalSelection = selectMoneyField(fields, [
        'RTR INV FEES',
        'TR owed fees',
        'Invoice Total',
        'Total Amount',
        'Translator Total',
        'Payable',
        'Amount',
        'Fees'
      ], ['invoicefees', 'totalamount', 'translatortotal', 'payable', 'owedfees']);
      const totalAmount = totalSelection.value;
      const amountSourceField = totalSelection.fieldName;
      const wordCount = safeNumber(pickRaw(fields, ['RTR INV WORDS', 'TR owed words']));
      const docs = safeNumber(pickRaw(fields, ['RTR INV DOCS', 'TR owed docs']));
      const status = mapInterpreterInvoiceStatus(fields);
      const issueDate = dateOnly(pickRaw(fields, [
        'Invoice Date',
        'Issue Date',
        'Submitted Date',
        'Last Modified'
      ]) || record.createdTime);
      const paidDateRaw = pickRaw(fields, ['Paid Date', 'Payment Date', 'Date Paid', 'Paid on']);
      const paidDate = paidDateRaw ? dateOnly(paidDateRaw) : '';
      const lineCount = Math.max(bookings.length, 1);
      const financialIntegrityStatus = Math.abs(totalAmount) < 0.005
        ? 'AMOUNT_MISSING'
        : hasJobLinkConflict || hasPersonConflict
          ? 'LINK_MISSING'
          : 'VERIFIED';
      const existing = await db.collection('interpreterInvoices').doc(invoiceId).get();
      const invoiceSnapshot = {
        financeProjectionVersion: FINANCE_PROJECTION_VERSION,
        invoiceRefText,
        status,
        totalAmount,
        amountSourceField,
        financialIntegrityStatus,
        lineCount,
        interpreterId,
        linkedTranslationIds,
        paidDate,
        wordCount,
        docs
      };
      const sourceTracking = buildSourceTracking(
        record,
        TRANSLATOR_INVOICES_TABLE,
        invoiceRefText,
        invoiceSnapshot,
        runId
      );
      const snapshotHash = normalize(sourceTracking.airtableSnapshotHash);
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
          incomingValue: { translatorEmail, translatorName, translatorPhone },
          recommendedAction: 'Link this Airtable translator payable to an existing translator/interpreter profile or passive imported profile before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (financialIntegrityStatus === 'AMOUNT_MISSING') {
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
          reason: 'TRANSLATOR_PAYABLE_AMOUNT_MISSING',
          currentValue: { totalAmount: existingData?.totalAmount || 0 },
          incomingValue: { availableFields: Object.keys(fields).sort() },
          recommendedAction: 'Map the translator payable total field or enter a verified amount before approval or payment.',
          dryRun: mode.dryRun
        });
      }

      if (!hasInvoiceReference) {
        stats.conflict += 1;
        await writeSyncConflict({
          runId,
          entityType: 'interpreterInvoice',
          entityId: invoiceId,
          sourceTable: TRANSLATOR_INVOICES_TABLE,
          sourceRecordId: record.id,
          sourceBaseId: DEFAULT_BASE_ID,
          legacyRef: invoiceRefText,
          severity: 'MEDIUM',
          reason: 'TRANSLATOR_PAYABLE_REFERENCE_MISSING',
          incomingValue: { availableFields: Object.keys(fields).sort() },
          recommendedAction: 'Map or enter the translator invoice reference before payment sign-off.',
          dryRun: mode.dryRun
        });
      }

      if (!mode.dryRun && action !== 'skipped') {
        if (batchOps > 350) await commitIfNeeded(true);
        const lineBookings = bookings.length ? bookings : [null];
        const expectedLineIds = new Set(lineBookings.map((booking, index) => (
          `${invoiceId}_${booking?.id || record.id}_${index}`
        )));
        const staleLineRefs = await getStaleImportedInvoiceLineRefs(
          'interpreterInvoiceLines',
          invoiceId,
          record.id,
          expectedLineIds
        );
        staleLineRefs.forEach(lineRef => {
          batch.delete(lineRef);
          batchOps += 1;
        });
        batch.set(db.collection('interpreterInvoices').doc(invoiceId), cleanData({
          id: invoiceId,
          organizationId: 'lingland-main',
          interpreterId,
          interpreterName: resolvedTranslator?.name || translatorName,
          interpreterEmail: resolvedTranslator?.email || translatorEmail,
          model: 'UPLOAD',
          status,
          externalInvoiceReference: hasInvoiceReference ? invoiceRefText : 'Reference missing',
          totalAmount,
          issueDate,
          items: [],
          currency: 'GBP',
          serviceCategory: 'TRANSLATION',
          lineCount,
          financialIntegrityStatus,
          amountSourceField: amountSourceField || undefined,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING',
          financeProjectionVersion: FINANCE_PROJECTION_VERSION,
          ...sourceTracking,
          linkedTranslationRecordIds: linkedTranslationIds,
          airtableStatus: pick(fields, ['TR Invoice Status', 'Invoice Status', 'INV Status', 'Status', 'Payment Status']),
          paidAt: status === 'PAID' ? (paidDate || issueDate) : existingData?.paidAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: existing.exists ? existingData?.createdAt : admin.firestore.FieldValue.serverTimestamp()
        }), { merge: true });
        batchOps += 1;

        lineBookings.forEach((booking, index) => {
          const amountPerLine = allocateInvoiceLineAmount(totalAmount, index, lineBookings.length);
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
            const projectedPayable = amountPerLine
              || safeNumber(bookingData.interpreterInvoiceTotal)
              || safeNumber(bookingData.interpreterAmountCalculated)
              || safeNumber(bookingData.professionalCost);
            const nextStatus = preserveStatusIfLocalAhead(
              bookingData.status,
              STATUS_RANK[bookingData.status] >= STATUS_RANK.INVOICED ? bookingData.status : 'TIMESHEET_SUBMITTED',
              sourceOfTruth
            );
            batch.update(booking.ref, cleanData({
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceReference: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceStatus: status,
              interpreterPaymentStatus: status,
              interpreterInvoiceTotal: projectedPayable,
              interpreterAmountCalculated: projectedPayable,
              professionalCost: projectedPayable,
              interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
              status: nextStatus,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            batchOps += 1;
            mirrorTimesheetArtifact(batch, booking.id, {
              ...bookingData,
              interpreterInvoiceId: invoiceId,
              interpreterInvoiceNumber: hasInvoiceReference ? invoiceRefText : '',
              interpreterInvoiceStatus: status,
              interpreterPaymentStatus: status,
              interpreterInvoiceTotal: projectedPayable,
              interpreterAmountCalculated: projectedPayable,
              totalToPay: projectedPayable,
              interpreterPaidAt: status === 'PAID' ? (paidDate || issueDate) : bookingData.interpreterPaidAt,
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
          totalAmount,
          amountSourceField: amountSourceField || undefined,
          financialIntegrityStatus,
          referenceIntegrityStatus: hasInvoiceReference ? 'VERIFIED' : 'MISSING'
        });
      }

      await commitIfNeeded();
      markConflictScopeProcessed(conflictContext, TRANSLATOR_INVOICES_TABLE, record.id);
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
  interpreterDirectoryPromise = null;
  clientCache.clear();
  platformClientDirectoryPromise = null;
  bookingByAirtableRecordCache.clear();
  const conflictContext = createConflictReconciliationContext();
  const platformMode = await getPlatformMode();
  const importMode = platformMode.airtableImportMode || 'ON';
  const lastSyncIso = await getLastSyncIso();
  const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
  const redbookFormula = buildAirtableFormula(mode.syncStrategy, redbookTableName, lastSyncIso);
  const redbookBatch = mode.sourceRecordIds?.length
    ? await fetchAirtableRecordsByIds(mode.sourceRecordIds, DEFAULT_TABLE_NAME)
    : await fetchAirtableRecordBatch(
      mode.limitRecords,
      DEFAULT_TABLE_NAME,
      mode.tableOffsets?.[DEFAULT_TABLE_NAME] || '',
      { filterByFormula: redbookFormula, strategy: mode.syncStrategy, stabilize: true }
    );
  const redbookExistingBySourceId = await getExistingRedbookBySourceId();
  const allRedbookRecords = redbookBatch.records;
  const selectiveRedbookProcessing = shouldUseSelectiveRedbookProcessing(mode.syncStrategy) && !mode.sourceRecordIds?.length;
  const records = selectiveRedbookProcessing
    ? allRedbookRecords.filter(record => shouldProcessRedbookRecord(record, redbookExistingBySourceId))
    : allRedbookRecords;
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
    skipped: selectiveRedbookProcessing ? allRedbookRecords.length - records.length : 0,
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

  await processWithConcurrency(records, REDBOOK_PROCESS_CONCURRENCY, async record => {
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
      const preloadedExistingSnap = redbookExistingBySourceId.get(record.id);
      if (mode.dryRun) {
        existingSnap = preloadedExistingSnap || null;
        existing = existingSnap?.exists ? existingSnap.data() || null : null;
      } else {
        if (preloadedExistingSnap) {
          existingRef = preloadedExistingSnap.ref;
          existingSnap = preloadedExistingSnap;
        } else {
          existingRef = await findExistingBooking(record, mapped.booking.jobNumber, mapped.booking.legacyAirtableRef);
          existingSnap = await existingRef.get();
        }
        existing = existingSnap.exists ? existingSnap.data() || null : null;
      }
      mapped.booking.status = preserveStatusIfLocalAhead(existing?.status, mapped.booking.status, platformMode.sourceOfTruth);
      const conflictReasons: string[] = [];
      const hasInterpreterSignal = Boolean(
        mapped.sourceSnapshot.interpreterName
        || mapped.sourceSnapshot.interpreterEmail
        || mapped.sourceSnapshot.interpreterPhone
        || mapped.sourceSnapshot.interpreterAirtableRecordId
      );
      const unresolvedInterpreter = hasInterpreterSignal && !mapped.booking.interpreterId;
      if (unresolvedInterpreter) {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        conflictReasons.push(mapped.sourceSnapshot.interpreterAmbiguousCandidates?.length
          ? 'PROFESSIONAL_MATCH_AMBIGUOUS'
          : 'PROFESSIONAL_NOT_RESOLVED');
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
            phone: mapped.sourceSnapshot.interpreterPhone,
            airtableRecordId: mapped.sourceSnapshot.interpreterAirtableRecordId
          },
          recommendedAction: 'Review interpreter identity, link the Airtable professional to an interpreter profile, then rerun sync.',
          dryRun: mode.dryRun || importMode === 'READ_ONLY'
        });
      }
      if (existing?.status && existing.status !== mapped.booking.status && platformMode.sourceOfTruth !== 'AIRTABLE') {
        mapped.booking.syncStatus = 'CONFLICT';
        stats.conflict += 1;
        conflictReasons.push('STATUS_SOURCE_OF_TRUTH_MISMATCH');
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

      pushPrioritizedDetail(details, {
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
          conflictReasons,
          status: mapped.booking.status,
          skipReason: action === 'skipped' && isTerminalStableStatus(mapped.booking.status)
            ? 'TERMINAL_STABLE_ALREADY_MIRRORED'
            : undefined,
          workflowArtifacts
        }, MAX_DETAILS);
      markConflictScopeProcessed(conflictContext, mapped.booking.sourceTable || DEFAULT_TABLE_NAME, record.id);
    } catch (error) {
      stats.error += 1;
      pushErrorDetail(details, {
        action: 'error',
        sourceRecordId: record.id,
        sourceTable: DEFAULT_TABLE_NAME,
        message: error instanceof Error ? error.message : 'Unknown error'
      }, MAX_DETAILS);
    }
  });

  const [clientInvoiceSync, interpreterInvoiceSync] = includeFinance
    ? await Promise.all([
      syncClientInvoices(clientInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id, conflictContext),
      syncInterpreterInvoices(interpreterInvoiceRecords, { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' }, platformMode.sourceOfTruth, runRef.id, conflictContext)
    ])
    : [
      { stats: emptyActionStats(), details: [] },
      { stats: emptyActionStats(), details: [] }
    ];
  const financeErrorCount = clientInvoiceSync.stats.error + interpreterInvoiceSync.stats.error;
  const autoResolvedConflicts = await resolveStaleSyncConflicts(
    runRef.id,
    conflictContext,
    mode.dryRun || importMode === 'READ_ONLY'
  );

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
    totalRecords: allRedbookRecords.length,
    processedRecords: records.length,
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
    autoResolvedConflicts,
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
      lastTotalRecords: allRedbookRecords.length,
      lastProcessedRecords: records.length,
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

const addCounts = (
  target: Record<string, number>,
  incoming: Record<string, number>,
) => {
  Object.entries(incoming).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + Number(value || 0);
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
  interpreterDirectoryPromise = null;
  clientCache.clear();
  platformClientDirectoryPromise = null;
  bookingByAirtableRecordCache.clear();
  const conflictContext = createConflictReconciliationContext();

  const platformMode = await getPlatformMode();
  const importMode = platformMode.airtableImportMode || 'ON';
  const effectiveMode = { ...mode, dryRun: mode.dryRun || importMode === 'READ_ONLY' };
  const startedAt = new Date().toISOString();
  const runRef = db.collection('syncRuns').doc();
  const overallStats: Record<SyncAction, number> = emptyActionStats();
  const moduleResults: Array<Record<string, unknown>> = [];
  let nestedAutoResolvedConflicts = 0;
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
    result: {
      stats: Record<SyncAction, number>;
      details: Array<Record<string, unknown>>;
      identityEvidence?: Record<string, unknown>;
      diagnostics?: Record<string, unknown>;
    }
  ) => {
    addStats(overallStats, result.stats);
    moduleResults.push({
      module,
      label,
      tableNames,
      records,
      stats: result.stats,
      details: result.details,
      ...(result.identityEvidence ? { identityEvidence: result.identityEvidence } : {}),
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
      ...((result.diagnostics?.writeReadiness || (result.diagnostics?.clientsBook as Record<string, unknown> | undefined)?.writeReadiness)
        ? {
            writeReadiness: result.diagnostics?.writeReadiness
              || (result.diagnostics?.clientsBook as Record<string, unknown>)?.writeReadiness,
          }
        : {}),
      syncStrategy: mode.syncStrategy
    });
  };

  if (modules.includes('clients')) {
    const [clientsBatch, clientsBookBatch, departmentsBatch] = await Promise.all([
      fetchModuleRecords(CLIENTS_TABLE),
      fetchModuleRecords(CLIENTS_BOOK_TABLE),
      fetchModuleRecords(DEPARTMENTS_TABLE),
    ]);
    const clients = clientsBatch.records;
    const clientsBook = clientsBookBatch.records;
    const departments = departmentsBatch.records;
    const clientsResult = await syncClients(clients, CLIENTS_TABLE, effectiveMode, runRef.id);
    const clientsBookResult = await syncClientBookHierarchy(
      clientsBook,
      departments,
      clientsResult.clientIdBySourceRecordId,
      clientsResult.clientNameBySourceRecordId,
      clientsResult.canonicalAccounts,
      clientsResult.plannedCreatedClientIds,
      clientsResult.approvedPendingCanonicalAccountsById,
      effectiveMode,
      runRef.id,
      conflictContext,
    );
    const combined = {
      stats: emptyActionStats(),
      details: [...clientsResult.details, ...clientsBookResult.details].slice(0, MAX_DETAILS),
      diagnostics: {
        canonicalAccounts: clientsResult.diagnostics,
        clientsBook: clientsBookResult.diagnostics,
        writeReadiness: {
          ready: clientsResult.diagnostics.writeReadiness.ready
            && clientsBookResult.diagnostics.writeReadiness.ready,
          blockerCount: clientsResult.diagnostics.writeReadiness.blockerCount
            + clientsBookResult.diagnostics.writeReadiness.blockerCount,
          blockers: [
            ...clientsResult.diagnostics.writeReadiness.blockers,
            ...clientsBookResult.diagnostics.writeReadiness.blockers,
          ],
        },
      },
    };
    addStats(combined.stats, clientsResult.stats);
    addStats(combined.stats, clientsBookResult.stats);
    pushModule(
      'clients',
      'Client CRM hierarchy',
      [CLIENTS_TABLE, CLIENTS_BOOK_TABLE, DEPARTMENTS_TABLE],
      clients.length + clientsBook.length + departments.length,
      combined,
    );
  }

  if (modules.includes('redbook')) {
    const redbookResult = await syncRecords(effectiveMode, false) as any;
    nestedAutoResolvedConflicts += Number(redbookResult.autoResolvedConflicts || 0);
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
    const evidenceBatch = await fetchAirtableRecordBatch(
      Math.max(1000, Math.min(mode.limitRecords, 5000)),
      TRANSLATION_CLIENT_INVOICES_TABLE,
      '',
      { strategy: 'FULL_AUDIT' },
    );
    const clientEvidenceByTranslationId = buildTranslationClientEvidence(evidenceBatch.records);
    const translations = translationsBatch.records;
    const webTranslations = webTranslationsBatch.records;
    const translationResult = await syncTranslationBookings(
      translations,
      TRANSLATIONS_TABLE,
      effectiveMode,
      platformMode.sourceOfTruth,
      runRef.id,
      conflictContext,
      clientEvidenceByTranslationId,
    );
    const webTranslationResult = await syncTranslationBookings(
      webTranslations,
      WEB_TRANSLATIONS_TABLE,
      effectiveMode,
      platformMode.sourceOfTruth,
      runRef.id,
      conflictContext,
      clientEvidenceByTranslationId,
    );
    const combined = {
      stats: emptyActionStats(),
      details: [...translationResult.details, ...webTranslationResult.details].slice(0, MAX_DETAILS),
      identityEvidence: {
        invoiceRecordsScanned: evidenceBatch.records.length,
        linkedTranslations: clientEvidenceByTranslationId.size,
        complete: !evidenceBatch.nextOffset,
      },
      diagnostics: {
        conflictReasons: {} as Record<string, number>,
        clientResolutionActions: {} as Record<string, number>,
        wouldCreateBookings: [
          ...translationResult.diagnostics.wouldCreateBookings,
          ...webTranslationResult.diagnostics.wouldCreateBookings,
        ],
        clientCandidates: [
          ...translationResult.diagnostics.clientCandidates,
          ...webTranslationResult.diagnostics.clientCandidates,
        ],
        professionalCandidates: [
          ...translationResult.diagnostics.professionalCandidates,
          ...webTranslationResult.diagnostics.professionalCandidates,
        ],
      },
    };
    addStats(combined.stats, translationResult.stats);
    addStats(combined.stats, webTranslationResult.stats);
    addCounts(combined.diagnostics.conflictReasons, translationResult.diagnostics.conflictReasons);
    addCounts(combined.diagnostics.conflictReasons, webTranslationResult.diagnostics.conflictReasons);
    addCounts(combined.diagnostics.clientResolutionActions, translationResult.diagnostics.clientResolutionActions);
    addCounts(combined.diagnostics.clientResolutionActions, webTranslationResult.diagnostics.clientResolutionActions);
    pushModule('translations', 'Translation jobs', [TRANSLATIONS_TABLE, WEB_TRANSLATIONS_TABLE], translations.length + webTranslations.length, combined);
  }

  if (modules.includes('clientInvoices')) {
    const selection = await fetchModuleRecords(CLIENT_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
    pushModule('clientInvoices', 'Client invoices', [CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('interpreterInvoices')) {
    const selection = await fetchModuleRecords(INTERPRETER_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncInterpreterInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
    pushModule('interpreterInvoices', 'Interpreter invoices', [INTERPRETER_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translationClientInvoices')) {
    const selection = await fetchModuleRecords(TRANSLATION_CLIENT_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncTranslationClientInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
    pushModule('translationClientInvoices', 'Translation client invoices', [TRANSLATION_CLIENT_INVOICES_TABLE], records.length, result);
  }

  if (modules.includes('translatorInvoices')) {
    const selection = await fetchModuleRecords(TRANSLATOR_INVOICES_TABLE);
    const records = selection.records;
    const result = await syncTranslatorInvoices(records, effectiveMode, platformMode.sourceOfTruth, runRef.id, conflictContext);
    pushModule('translatorInvoices', 'Translator invoices', [TRANSLATOR_INVOICES_TABLE], records.length, result);
  }

  const autoResolvedConflicts = nestedAutoResolvedConflicts + await resolveStaleSyncConflicts(
    runRef.id,
    conflictContext,
    effectiveMode.dryRun
  );
  const finishedAt = new Date().toISOString();
  const writeBlockedModules = moduleResults
    .filter(module => (module.writeReadiness as { ready?: boolean } | undefined)?.ready === false)
    .map(module => ({
      module: module.module,
      label: module.label,
      blockerCount: Number((module.writeReadiness as { blockerCount?: number }).blockerCount || 0),
      blockers: (module.writeReadiness as { blockers?: unknown[] }).blockers || [],
    }));
  const result = {
    success: overallStats.error === 0,
    syncRunId: runRef.id,
    mappingVersion: AIRTABLE_SYNC_MAPPING_VERSION,
    syncStrategy: mode.syncStrategy,
    limitRecords: mode.limitRecords,
    dryRun: effectiveMode.dryRun,
    importMode,
    triggeredBy: mode.triggeredBy,
    userId: mode.userId || '',
    approvedByDryRunId: mode.approvedByDryRunId || '',
    modules,
    startedAt,
    finishedAt,
    stats: overallStats,
    nextOffsets,
    financePullThrough: {
      workflowSourceRecordIds: workflowSourceRecordIds.size,
      filterActive: mode.syncStrategy !== 'FULL_AUDIT' && mode.syncStrategy !== 'CUSTOM_LIMIT' && workflowSourceRecordIds.size > 0
    },
    autoResolvedConflicts,
    writeApproval: {
      ready: writeBlockedModules.length === 0,
      blockerCount: writeBlockedModules.reduce((total, module) => total + module.blockerCount, 0),
      blockedModules: writeBlockedModules,
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

const canonicalStatusLabel = (value?: string) => {
  const raw = normalize(value);
  if (!raw) return 'UNKNOWN';
  return canonicalAirtableStatus(raw).replace(/\s+/g, '_').toUpperCase();
};

const countByStatus = (values: Array<string | undefined>) => values.reduce<Record<string, number>>((acc, value) => {
  const label = canonicalStatusLabel(value);
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

const getMirrorStatusDivergences = (
  records: AirtableRecord[],
  platformBySourceId: Map<string, admin.firestore.QueryDocumentSnapshot>
) => records.flatMap(record => {
  const platformDoc = platformBySourceId.get(record.id);
  if (!platformDoc) return [];
  const booking = platformDoc.data();
  const airtableStatus = canonicalStatusLabel(normalize(record.fields.Status));
  const platformSourceStatus = canonicalStatusLabel(
    normalize(booking.sourceStatusRaw) || normalize(booking.airtableOperationalStatus)
  );
  if (airtableStatus === platformSourceStatus) return [];
  return [{
    sourceRecordId: record.id,
    bookingId: platformDoc.id,
    jobNumber: normalize(record.fields['Job Number'])
      || normalize(booking.jobNumber)
      || normalize(booking.displayRef)
      || record.id,
    airtableStatus,
    platformSourceStatus
  }];
});

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
    { filterByFormula: redbookFormula, strategy: syncStrategy, stabilize: true }
  );

  const platformSnap = await db.collection('bookings')
    .where('sourceTable', '==', DEFAULT_TABLE_NAME)
    .get();
  const platformDocs = platformSnap.docs.filter(doc => normalize(doc.data().sourceRecordId));
  const platformBySourceId = new Map(platformDocs.map(doc => [normalize(doc.data().sourceRecordId), doc]));
  const airtableIds = new Set(redbookBatch.records.map(record => record.id));
  const matched = redbookBatch.records.filter(record => platformBySourceId.has(record.id));
  const platformOnlyDocs = platformDocs.filter(doc => !airtableIds.has(normalize(doc.data().sourceRecordId)));
  const statusDivergences = getMirrorStatusDivergences(redbookBatch.records, platformBySourceId);

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
    statusDivergenceCount: statusDivergences.length,
    nextOffset: redbookBatch.nextOffset || '',
    airtableStatusCounts: countByStatus(redbookBatch.records.map(record => normalize(record.fields.Status))),
    platformStatusCounts: countByStatus(platformDocs.map(doc => normalize(doc.data().sourceStatusRaw) || normalize(doc.data().status))),
    missingInPlatform: getMirrorAuditSample(redbookBatch.records, platformBySourceId),
    statusDivergences: statusDivergences.slice(0, 50),
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

export const getAirtableSyncAuditTrail = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const runLimit = Math.min(Math.max(Number(data?.runLimit || 5), 1), 25);
  const conflictLimit = Math.min(Math.max(Number(data?.conflictLimit || 50), 1), 100);
  const [runsSnap, conflictsSnap] = await Promise.all([
    db.collection('syncRuns')
      .orderBy('finishedAt', 'desc')
      .limit(runLimit)
      .get(),
    db.collection('syncConflicts')
      .where('resolutionStatus', '==', 'OPEN')
      .limit(conflictLimit)
      .get()
  ]);

  return {
    runs: runsSnap.docs.map(doc => ({
      id: doc.id,
      ...cleanReportData(doc.data())
    })),
    conflicts: conflictsSnap.docs.map(doc => ({
      id: doc.id,
      ...cleanReportData(doc.data())
    }))
  };
});

type AuditedClientIdentityTarget = {
  canonicalClientId: string;
  canonicalCompanyName: string;
  targetState: 'EXISTING' | 'PENDING_APPROVED';
  targetApprovalMappingId?: string;
  reviewRunId?: string;
};

const resolveAuditedClientIdentityTarget = async (
  requestedClientId: string,
  requestedCompanyName: string,
  actorId: string,
  syncRunId?: string,
  suppliedRun?: Record<string, unknown> | null,
): Promise<AuditedClientIdentityTarget> => {
  const selected = await db.collection('clients').doc(requestedClientId).get();
  if (selected.exists) {
    const canonical = await canonicalClientDocument(selected);
    const state = normalize(canonical.data()?.recordState).toUpperCase();
    if (!canonical.exists || state === 'ARCHIVED') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The selected client is archived or unavailable.',
      );
    }
    return {
      canonicalClientId: canonical.id,
      canonicalCompanyName: normalize(canonical.data()?.companyName)
        || requestedCompanyName
        || canonical.id,
      targetState: 'EXISTING',
    };
  }

  const reviewRunId = normalize(syncRunId);
  if (!reviewRunId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This client does not exist yet. Run a fresh Clients Dry Run and select an approved pending account.',
    );
  }
  let run = suppliedRun;
  if (!run) {
    const runSnapshot = await db.collection('syncRuns').doc(reviewRunId).get();
    run = runSnapshot.exists ? cleanReportData(runSnapshot.data() || {}) : null;
  }
  const targetValidation = validateClientIdentityPendingCanonicalTarget(
    run,
    requestedClientId,
    actorId,
    AIRTABLE_SYNC_MAPPING_VERSION,
  );
  if (!targetValidation.ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `The pending canonical account is not safely approved in this review (${targetValidation.reason}). Run a fresh Clients Dry Run.`,
    );
  }

  const target = targetValidation.target;
  const approvalMappingId = clientIdentityMappingId(target.sourceTable, target.groupKey);
  const approvalSnapshot = await db.collection('airtableClientIdentityMappings').doc(approvalMappingId).get();
  const approval = approvalSnapshot.data() || {};
  const approvalValidation = validateClientIdentityPendingCanonicalApproval(
    target,
    approvalSnapshot.exists ? approval : null,
  );
  if (!approvalValidation.ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `The official account approval changed after the Dry Run (${approvalValidation.reason}). Run a fresh Clients Dry Run.`,
    );
  }

  return {
    canonicalClientId: target.clientId,
    canonicalCompanyName: normalize(approval.canonicalCompanyName)
      || target.companyName
      || requestedCompanyName,
    targetState: 'PENDING_APPROVED',
    targetApprovalMappingId: approvalMappingId,
    reviewRunId,
  };
};

export const saveAirtableClientIdentityMapping = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  const sourceTable = normalize(data?.sourceTable);
  const groupKey = normalizeOrganizationName(data?.groupKey);
  const action = normalize(data?.action).toUpperCase() as ClientIdentityMappingAction;
  const requestedClientId = normalize(data?.canonicalClientId);
  const requestedCompanyName = normalize(data?.canonicalCompanyName);

  if (![CLIENTS_TABLE, CLIENTS_BOOK_TABLE, DEPARTMENTS_TABLE].includes(sourceTable)) {
    throw new functions.https.HttpsError('invalid-argument', 'Only Clients, Clients Book and Departments identities can be staged here.');
  }
  if (!groupKey) {
    throw new functions.https.HttpsError('invalid-argument', 'A stable Airtable identity key is required.');
  }
  if (!['MAP_TO_CLIENT', 'APPROVE_NEW_CLIENT'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Choose an existing client or approve a new canonical organisation.');
  }
  if (action === 'APPROVE_NEW_CLIENT' && ![CLIENTS_TABLE, CLIENTS_BOOK_TABLE].includes(sourceTable)) {
    throw new functions.https.HttpsError('failed-precondition', 'Departments must be mapped to an existing client organisation.');
  }
  if (action === 'APPROVE_NEW_CLIENT' && actor.role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only a Super Admin can approve a new canonical client organisation.');
  }

  let canonicalClientId = requestedClientId;
  let canonicalCompanyName = requestedCompanyName;
  let targetState: AuditedClientIdentityTarget['targetState'] | undefined;
  let targetApprovalMappingId = '';
  let reviewRunId = '';
  if (action === 'MAP_TO_CLIENT') {
    if (!canonicalClientId) {
      throw new functions.https.HttpsError('invalid-argument', 'Select the canonical Client CRM organisation.');
    }
    const target = await resolveAuditedClientIdentityTarget(
      canonicalClientId,
      canonicalCompanyName,
      actor.uid,
      normalize(data?.syncRunId),
    );
    canonicalClientId = target.canonicalClientId;
    canonicalCompanyName = target.canonicalCompanyName;
    targetState = target.targetState;
    targetApprovalMappingId = target.targetApprovalMappingId || '';
    reviewRunId = target.reviewRunId || '';
  } else {
    canonicalClientId = `airtable_client_${slugify(groupKey)}`;
    canonicalCompanyName = canonicalCompanyName || normalize(data?.sourceName);
    if (!canonicalCompanyName) {
      throw new functions.https.HttpsError('invalid-argument', 'Confirm the canonical organisation name.');
    }
    const existing = await db.collection('clients').doc(canonicalClientId).get();
    if (existing.exists) {
      throw new functions.https.HttpsError(
        'already-exists',
        'A client already uses this canonical identity. Map the source group to that client instead.',
      );
    }
  }

  const mappingId = clientIdentityMappingId(sourceTable, groupKey);
  const mappingRef = db.collection('airtableClientIdentityMappings').doc(mappingId);
  const before = await mappingRef.get();
  const now = new Date().toISOString();
  const mapping = {
    id: mappingId,
    sourceSystem: 'AIRTABLE',
    sourceBaseId: DEFAULT_BASE_ID,
    sourceTable,
    groupKey,
    sourceNames: uniqueValues(...(Array.isArray(data?.sourceNames) ? data.sourceNames.map(normalize) : [])),
    action,
    canonicalClientId,
    canonicalCompanyName,
    canonicalTargetState: action === 'APPROVE_NEW_CLIENT' ? 'PENDING_APPROVED' : targetState,
    canonicalTargetApprovalMappingId: action === 'APPROVE_NEW_CLIENT'
      ? mappingId
      : targetApprovalMappingId,
    reviewRunId,
    status: 'ACTIVE',
    reason: normalize(data?.reason) || 'Reviewed in Airtable Sync Center',
    approvedBy: actor.uid,
    approvedRole: actor.role,
    approvedAt: now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: before.exists ? before.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
  };
  await mappingRef.set(mapping, { merge: true });

  const settings = await db.collection('system').doc('settings').get();
  const auditRef = db.collection('auditEvents').doc();
  await writeAuditEvent(auditRef.id, {
    entityType: 'AIRTABLE_CLIENT_IDENTITY_MAPPING',
    entityId: mappingId,
    action: before.exists ? 'AIRTABLE_CLIENT_IDENTITY_MAPPING_UPDATED' : 'AIRTABLE_CLIENT_IDENTITY_MAPPING_CREATED',
    actorId: actor.uid,
    actorRole: actor.role,
    source: 'AIRTABLE_SYNC_CENTER',
    communicationMode: normalize(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase(),
    syncRunId: reviewRunId,
    changedFields: ['action', 'canonicalClientId', 'canonicalCompanyName', 'status'],
    before: before.exists ? cleanReportData(before.data() || {}) : null,
    after: cleanReportData(mapping),
    organizationId: 'lingland-main',
    bookingId: '',
    createdAt: now,
  });

  return {
    success: true,
    mappingId,
    sourceTable,
    groupKey,
    action,
    canonicalClientId,
    canonicalCompanyName,
  };
});

export const saveAirtableClientIdentityMappingsBatch = functions.runWith({
  timeoutSeconds: 120,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  let requests;
  try {
    requests = validateClientIdentityMappingBatch(data?.mappings, actor.role, data?.confirmed === true);
  } catch (error) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Invalid batch identity review.',
    );
  }
  const syncRunId = normalize(data?.syncRunId);
  if (!syncRunId) {
    throw new functions.https.HttpsError('invalid-argument', 'Run a fresh Clients Dry Run before reviewing recommendations.');
  }
  const syncRun = await db.collection('syncRuns').doc(syncRunId).get();
  const runValidation = validateClientIdentityRecommendationRun(
    syncRun.exists ? cleanReportData(syncRun.data() || {}) : null,
    requests,
    actor.uid,
    AIRTABLE_SYNC_MAPPING_VERSION,
  );
  if (!runValidation.ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `The recommendation audit is stale or no longer matches (${runValidation.reason}). Run a fresh Clients Dry Run.`,
    );
  }

  const prepared = await Promise.all(requests.map(async request => {
    const sourceTable = normalize(request.sourceTable);
    const groupKey = normalizeOrganizationName(request.groupKey);
    const requestedClient = await db.collection('clients').doc(request.canonicalClientId).get();
    if (!requestedClient.exists) {
      throw new functions.https.HttpsError('not-found', `Client ${request.canonicalClientId} no longer exists.`);
    }
    const canonical = await canonicalClientDocument(requestedClient);
    const state = normalize(canonical.data()?.recordState).toUpperCase();
    if (!canonical.exists || state === 'ARCHIVED') {
      throw new functions.https.HttpsError('failed-precondition', `Client ${request.canonicalClientId} is archived or unavailable.`);
    }

    const mappingId = clientIdentityMappingId(sourceTable, groupKey);
    const mappingRef = db.collection('airtableClientIdentityMappings').doc(mappingId);
    const before = await mappingRef.get();
    const canonicalCompanyName = normalize(canonical.data()?.companyName)
      || normalize(request.canonicalCompanyName)
      || canonical.id;
    const now = new Date().toISOString();
    const mapping = {
      id: mappingId,
      sourceSystem: 'AIRTABLE',
      sourceBaseId: DEFAULT_BASE_ID,
      sourceTable,
      groupKey,
      sourceNames: uniqueValues(...(request.sourceNames || [])),
      action: 'MAP_TO_CLIENT' as const,
      canonicalClientId: canonical.id,
      canonicalCompanyName,
      status: 'ACTIVE',
      reason: normalize(request.reason) || 'Accepted high-confidence recommendation in Airtable Sync Center',
      recommendationConfidence: 'HIGH',
      reviewMethod: 'BATCH_RECOMMENDATION',
      approvedBy: actor.uid,
      approvedRole: actor.role,
      approvedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: before.exists ? before.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
    };
    return { request, mappingId, mappingRef, before, mapping, canonicalCompanyName, now };
  }));

  const settings = await db.collection('system').doc('settings').get();
  const communicationMode = normalize(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase();
  const batch = db.batch();
  prepared.forEach(item => {
    batch.set(item.mappingRef, item.mapping, { merge: true });
    const auditRef = db.collection('auditEvents').doc();
    batch.set(auditRef, {
      id: auditRef.id,
      schemaVersion: 1,
      entityType: 'AIRTABLE_CLIENT_IDENTITY_MAPPING',
      entityId: item.mappingId,
      action: item.before.exists
        ? 'AIRTABLE_CLIENT_IDENTITY_MAPPING_UPDATED'
        : 'AIRTABLE_CLIENT_IDENTITY_MAPPING_CREATED',
      actorId: actor.uid,
      actorRole: actor.role,
      source: 'AIRTABLE_SYNC_CENTER_BATCH_REVIEW',
      communicationMode,
      syncRunId: '',
      changedFields: ['action', 'canonicalClientId', 'canonicalCompanyName', 'status'],
      before: item.before.exists ? cleanReportData(item.before.data() || {}) : null,
      after: {
        sourceTable: item.mapping.sourceTable,
        groupKey: item.mapping.groupKey,
        action: item.mapping.action,
        canonicalClientId: item.mapping.canonicalClientId,
        canonicalCompanyName: item.mapping.canonicalCompanyName,
        status: item.mapping.status,
        recommendationConfidence: item.mapping.recommendationConfidence,
        reviewMethod: item.mapping.reviewMethod,
      },
      organizationId: 'lingland-main',
      bookingId: '',
      createdAt: item.now,
      timestamp: item.now,
    }, { merge: false });
  });
  await batch.commit();

  return {
    success: true,
    saved: prepared.length,
    mappings: prepared.map(item => ({
      mappingId: item.mappingId,
      sourceTable: item.mapping.sourceTable,
      groupKey: item.mapping.groupKey,
      canonicalClientId: item.mapping.canonicalClientId,
      canonicalCompanyName: item.canonicalCompanyName,
    })),
  };
});

export const saveAirtableClientIdentityMappingsManualBatch = functions.runWith({
  timeoutSeconds: 120,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  if (actor.role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only a Super Admin can save manual client identity batches.',
    );
  }

  let requests;
  try {
    requests = validateClientIdentityManualMappingBatch(
      data?.mappings,
      actor.role,
      data?.confirmed === true,
    );
  } catch (error) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Invalid manual client identity batch.',
    );
  }

  const syncRunId = normalize(data?.syncRunId);
  if (!syncRunId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Run a fresh Clients Dry Run before saving a manual identity batch.',
    );
  }
  const syncRun = await db.collection('syncRuns').doc(syncRunId).get();
  const syncRunData = syncRun.exists ? cleanReportData(syncRun.data() || {}) : null;
  const runValidation = validateClientIdentityManualReviewRun(
    syncRunData,
    requests,
    actor.uid,
    AIRTABLE_SYNC_MAPPING_VERSION,
  );
  if (!runValidation.ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `The client identity review is stale or changed (${runValidation.reason}). Run a fresh Clients Dry Run.`,
    );
  }

  const target = await resolveAuditedClientIdentityTarget(
    requests[0].canonicalClientId,
    normalize(requests[0].canonicalCompanyName),
    actor.uid,
    syncRunId,
    syncRunData,
  );
  const canonicalCompanyName = target.canonicalCompanyName;

  const prepared = await Promise.all(requests.map(async request => {
    const sourceTable = normalize(request.sourceTable);
    const groupKey = normalizeOrganizationName(request.groupKey);
    const mappingId = clientIdentityMappingId(sourceTable, groupKey);
    const mappingRef = db.collection('airtableClientIdentityMappings').doc(mappingId);
    const before = await mappingRef.get();
    if (before.exists && normalize(before.data()?.status).toUpperCase() === 'ACTIVE') {
      throw new functions.https.HttpsError(
        'aborted',
        `Identity ${request.sourceNames[0] || groupKey} was reviewed by another action. Run a fresh Clients Dry Run.`,
      );
    }
    const now = new Date().toISOString();
    const mapping = {
      id: mappingId,
      sourceSystem: 'AIRTABLE',
      sourceBaseId: DEFAULT_BASE_ID,
      sourceTable,
      groupKey,
      sourceNames: uniqueValues(...request.sourceNames.map(normalize)),
      action: 'MAP_TO_CLIENT' as const,
      canonicalClientId: target.canonicalClientId,
      canonicalCompanyName,
      canonicalTargetState: target.targetState,
      canonicalTargetApprovalMappingId: target.targetApprovalMappingId || '',
      status: 'ACTIVE',
      reason: normalize(request.reason) || 'Manually mapped in an audited Airtable Sync Center batch',
      recommendationConfidence: 'MANUAL',
      reviewMethod: 'MANUAL_BATCH',
      reviewRunId: syncRunId,
      approvedBy: actor.uid,
      approvedRole: actor.role,
      approvedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: before.exists ? before.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
    };
    return { mappingId, mappingRef, before, mapping, now };
  }));

  const settings = await db.collection('system').doc('settings').get();
  const communicationMode = normalize(
    settings.data()?.platformMode?.communicationMode || 'SUPPRESSED',
  ).toUpperCase();
  const batch = db.batch();
  prepared.forEach(item => {
    batch.set(item.mappingRef, item.mapping, { merge: true });
    const auditRef = db.collection('auditEvents').doc();
    batch.set(auditRef, {
      id: auditRef.id,
      schemaVersion: 1,
      entityType: 'AIRTABLE_CLIENT_IDENTITY_MAPPING',
      entityId: item.mappingId,
      action: item.before.exists
        ? 'AIRTABLE_CLIENT_IDENTITY_MAPPING_UPDATED'
        : 'AIRTABLE_CLIENT_IDENTITY_MAPPING_CREATED',
      actorId: actor.uid,
      actorRole: actor.role,
      source: 'AIRTABLE_SYNC_CENTER_MANUAL_BATCH',
      communicationMode,
      syncRunId,
      changedFields: ['action', 'canonicalClientId', 'canonicalCompanyName', 'status'],
      before: item.before.exists ? cleanReportData(item.before.data() || {}) : null,
      after: {
        sourceTable: item.mapping.sourceTable,
        groupKey: item.mapping.groupKey,
        action: item.mapping.action,
        canonicalClientId: item.mapping.canonicalClientId,
        canonicalCompanyName: item.mapping.canonicalCompanyName,
        status: item.mapping.status,
        recommendationConfidence: item.mapping.recommendationConfidence,
        reviewMethod: item.mapping.reviewMethod,
        reviewRunId: syncRunId,
      },
      organizationId: 'lingland-main',
      bookingId: '',
      createdAt: item.now,
      timestamp: item.now,
    }, { merge: false });
  });
  await batch.commit();

  return {
    success: true,
    saved: prepared.length,
    reviewRunId: syncRunId,
    canonicalClientId: target.canonicalClientId,
    canonicalCompanyName,
    mappings: prepared.map(item => ({
      mappingId: item.mappingId,
      sourceTable: item.mapping.sourceTable,
      groupKey: item.mapping.groupKey,
      canonicalClientId: target.canonicalClientId,
      canonicalCompanyName,
    })),
  };
});

export const deferAirtableClientIdentitySource = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  let request;
  try {
    request = validateClientIdentityDeferralRequest(
      data,
      actor.role,
      data?.confirmed === true,
    );
  } catch (error) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      error instanceof Error ? error.message : 'Invalid client identity deferral.',
    );
  }

  const syncRunId = normalize(data?.syncRunId);
  if (!syncRunId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Run a fresh Clients Dry Run before deferring a source identity.',
    );
  }
  const syncRun = await db.collection('syncRuns').doc(syncRunId).get();
  const syncRunData = syncRun.exists ? cleanReportData(syncRun.data() || {}) : null;
  const runValidation = validateClientIdentityDeferralReviewRun(
    syncRunData,
    request,
    actor.uid,
    AIRTABLE_SYNC_MAPPING_VERSION,
  );
  if (!runValidation.ok) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `The client identity review is stale or changed (${runValidation.reason}). Run a fresh Clients Dry Run.`,
    );
  }

  const mappingId = clientIdentityMappingId(request.sourceTable, request.groupKey);
  const mappingRef = db.collection('airtableClientIdentityMappings').doc(mappingId);
  const before = await mappingRef.get();
  if (before.exists && normalize(before.data()?.status).toUpperCase() === 'ACTIVE') {
    throw new functions.https.HttpsError(
      'aborted',
      'This source identity already has an active decision. Refresh the mapping ledger before continuing.',
    );
  }

  const now = new Date().toISOString();
  const mapping = {
    id: mappingId,
    sourceSystem: 'AIRTABLE',
    sourceBaseId: DEFAULT_BASE_ID,
    sourceTable: request.sourceTable,
    groupKey: normalizeOrganizationName(request.groupKey),
    sourceNames: uniqueValues(...request.sourceNames.map(normalize)),
    action: 'DEFER_SOURCE' as const,
    canonicalClientId: '',
    canonicalCompanyName: '',
    canonicalTargetState: 'DEFERRED',
    deferralCategory: request.category,
    status: 'ACTIVE',
    reason: request.reason,
    recommendationConfidence: 'MANUAL',
    reviewMethod: 'MANUAL_DEFERRAL',
    reviewRunId: syncRunId,
    approvedBy: actor.uid,
    approvedRole: actor.role,
    approvedAt: now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: before.exists ? before.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
  };
  await mappingRef.set(mapping, { merge: true });

  const settings = await db.collection('system').doc('settings').get();
  const auditRef = db.collection('auditEvents').doc();
  await writeAuditEvent(auditRef.id, {
    entityType: 'AIRTABLE_CLIENT_IDENTITY_MAPPING',
    entityId: mappingId,
    action: 'AIRTABLE_CLIENT_IDENTITY_SOURCE_DEFERRED',
    actorId: actor.uid,
    actorRole: actor.role,
    source: 'AIRTABLE_SYNC_CENTER',
    communicationMode: normalize(
      settings.data()?.platformMode?.communicationMode || 'SUPPRESSED',
    ).toUpperCase(),
    syncRunId,
    changedFields: ['action', 'deferralCategory', 'reason', 'status'],
    before: before.exists ? cleanReportData(before.data() || {}) : null,
    after: cleanReportData(mapping),
    organizationId: 'lingland-main',
    bookingId: '',
    createdAt: now,
  });

  return {
    success: true,
    mappingId,
    sourceTable: request.sourceTable,
    groupKey: request.groupKey,
    action: 'DEFER_SOURCE',
    deferralCategory: request.category,
  };
});

export const listAirtableClientIdentityMappings = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const requestedLimit = Number(data?.limit);
  const resultLimit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 200;
  const snapshot = await db.collection('airtableClientIdentityMappings')
    .where('status', '==', 'ACTIVE')
    .limit(500)
    .get();
  const mappings = snapshot.docs
    .map(document => {
      const mapping = document.data() || {};
      return {
        mappingId: document.id,
        sourceTable: normalize(mapping.sourceTable),
        groupKey: normalizeOrganizationName(mapping.groupKey),
        sourceNames: uniqueValues(...(Array.isArray(mapping.sourceNames) ? mapping.sourceNames.map(normalize) : [])),
        action: normalize(mapping.action).toUpperCase(),
        canonicalClientId: normalize(mapping.canonicalClientId),
        canonicalCompanyName: normalize(mapping.canonicalCompanyName),
        canonicalTargetState: normalize(mapping.canonicalTargetState).toUpperCase(),
        deferralCategory: normalize(mapping.deferralCategory).toUpperCase(),
        reviewMethod: normalize(mapping.reviewMethod).toUpperCase(),
        reason: normalize(mapping.reason),
        approvedAt: normalize(mapping.approvedAt),
        approvedBy: normalize(mapping.approvedBy),
      };
    })
    .filter(mapping => (
      mapping.sourceTable
      && mapping.groupKey
      && ['MAP_TO_CLIENT', 'APPROVE_NEW_CLIENT', 'DEFER_SOURCE'].includes(mapping.action)
      && (mapping.action === 'DEFER_SOURCE' || mapping.canonicalClientId)
    ))
    .sort((left, right) => (
      right.approvedAt.localeCompare(left.approvedAt)
      || left.sourceTable.localeCompare(right.sourceTable)
      || left.groupKey.localeCompare(right.groupKey)
    ))
    .slice(0, resultLimit);

  return {
    success: true,
    mappings,
    total: snapshot.size,
    limit: resultLimit,
  };
});

export const revokeAirtableClientIdentityMapping = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  const sourceTable = normalize(data?.sourceTable);
  const groupKey = normalizeOrganizationName(data?.groupKey);
  if (![CLIENTS_TABLE, CLIENTS_BOOK_TABLE, DEPARTMENTS_TABLE].includes(sourceTable) || !groupKey) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid mapping scope is required.');
  }
  const mappingId = clientIdentityMappingId(sourceTable, groupKey);
  const mappingRef = db.collection('airtableClientIdentityMappings').doc(mappingId);
  const before = await mappingRef.get();
  if (!before.exists) throw new functions.https.HttpsError('not-found', 'Identity mapping not found.');
  const now = new Date().toISOString();
  await mappingRef.set({
    status: 'REVOKED',
    revokedBy: actor.uid,
    revokedAt: now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  const auditRef = db.collection('auditEvents').doc();
  await writeAuditEvent(auditRef.id, {
    entityType: 'AIRTABLE_CLIENT_IDENTITY_MAPPING',
    entityId: mappingId,
    action: 'AIRTABLE_CLIENT_IDENTITY_MAPPING_REVOKED',
    actorId: actor.uid,
    actorRole: actor.role,
    source: 'AIRTABLE_SYNC_CENTER',
    communicationMode: 'SUPPRESSED',
    syncRunId: '',
    changedFields: ['status'],
    before: cleanReportData(before.data() || {}),
    after: { status: 'REVOKED' },
    organizationId: 'lingland-main',
    bookingId: '',
    createdAt: now,
  });
  return { success: true, mappingId };
});

type FinancialAuditIssue = {
  id: string;
  invoiceType: 'CLIENT' | 'INTERPRETER';
  invoiceId: string;
  reference: string;
  partyName: string;
  sourceTable: string;
  sourceRecordId: string;
  serviceCategory: string;
  reason: string;
  severity: 'MEDIUM' | 'HIGH';
  recommendedAction: string;
  totalAmount: number;
  lineTotal: number;
  lineCount: number;
  declaredLineCount?: number;
  platformStatus: string;
  expectedStatus?: string;
};

const indexInvoiceLines = (
  docs: admin.firestore.QueryDocumentSnapshot[],
  invoiceIdFields: string[]
) => docs.reduce<Map<string, admin.firestore.QueryDocumentSnapshot[]>>((index, line) => {
  const data = line.data();
  const invoiceId = invoiceIdFields.map(field => normalize(data[field])).find(Boolean);
  if (!invoiceId) return index;
  const current = index.get(invoiceId) || [];
  current.push(line);
  index.set(invoiceId, current);
  return index;
}, new Map());

const auditFinancialInvoice = (
  invoice: admin.firestore.QueryDocumentSnapshot,
  invoiceType: 'CLIENT' | 'INTERPRETER',
  lines: admin.firestore.QueryDocumentSnapshot[]
): FinancialAuditIssue[] => {
  const data = invoice.data();
  const sourceSystem = normalize(data.sourceSystem).toUpperCase();
  const reference = normalize(
    invoiceType === 'CLIENT'
      ? data.invoiceNumber || data.reference
      : data.externalInvoiceReference || data.reference
  );
  const partyName = normalize(invoiceType === 'CLIENT' ? data.clientName : data.interpreterName);
  const totalAmount = safeNumber(data.totalAmount);
  const lineTotal = Number(lines.reduce((sum, line) => {
    const value = line.data();
    return sum + safeNumber(value.total ?? value.lineAmount ?? value.amount);
  }, 0).toFixed(2));
  const platformStatus = normalize(data.status).toUpperCase();
  const expectedStatus = getExpectedFinancialInvoiceStatus(invoiceType, data);
  const declaredLineCount = Number.isFinite(Number(data.lineCount)) ? Number(data.lineCount) : undefined;
  const hasLinkedJob = lines.some(line => Boolean(normalize(line.data().bookingId)));
  const issues: FinancialAuditIssue[] = [];
  const pushIssue = (
    reason: string,
    severity: 'MEDIUM' | 'HIGH',
    recommendedAction: string
  ) => issues.push(cleanData({
    id: `${invoiceType.toLowerCase()}_${invoice.id}_${reason.toLowerCase()}`,
    invoiceType,
    invoiceId: invoice.id,
    reference: reference && !/^rec[a-z0-9]+$/i.test(reference) ? reference : 'Reference missing',
    partyName: partyName || 'Unknown party',
    sourceTable: normalize(data.sourceTable),
    sourceRecordId: normalize(data.sourceRecordId),
    serviceCategory: normalize(data.serviceCategory) || 'INTERPRETING',
    reason,
    severity,
    recommendedAction,
    totalAmount,
    lineTotal,
    lineCount: lines.length,
    declaredLineCount,
    platformStatus,
    expectedStatus: expectedStatus || undefined
  }) as FinancialAuditIssue);

  if (Math.abs(totalAmount) < 0.005) {
    pushIssue('AMOUNT_MISSING', 'HIGH', 'Map or enter a verified invoice amount before financial progression.');
  }
  if (!lines.length) {
    pushIssue('LINES_MISSING', 'HIGH', 'Rebuild the invoice lines from linked jobs or timesheets.');
  }
  if (sourceSystem === 'AIRTABLE' && lines.length > 0 && !hasLinkedJob) {
    pushIssue('JOB_LINK_MISSING', 'HIGH', 'Resolve the Airtable source job link and rerun the relevant finance sync.');
  }
  if (lines.length > 0 && Math.abs(totalAmount) >= 0.005 && Math.abs(totalAmount - lineTotal) > 0.01) {
    pushIssue('LINE_TOTAL_DIVERGENCE', 'HIGH', 'Rebuild invoice line allocation so line totals equal the document total.');
  }
  if (declaredLineCount !== undefined && declaredLineCount !== lines.length) {
    pushIssue('LINE_COUNT_DIVERGENCE', 'MEDIUM', 'Rerun the finance sync to replace stale imported lines and refresh the indexed count.');
  }
  if (!reference || reference === 'Reference missing' || /^rec[a-z0-9]+$/i.test(reference)) {
    pushIssue('REFERENCE_MISSING', 'MEDIUM', 'Map or enter the external invoice reference before sign-off.');
  }
  if (sourceSystem === 'AIRTABLE' && expectedStatus && platformStatus && expectedStatus !== platformStatus) {
    pushIssue('STATUS_DIVERGENCE', 'HIGH', 'Rerun the source finance sync and review the Airtable payment status mapping.');
  }
  return issues;
};

export const getFinancialReconciliationAudit = functions.runWith({
  timeoutSeconds: 120,
  memory: '512MB'
}).https.onCall(async (_data, context) => {
  await assertAdmin(context);
  const [clientInvoices, interpreterInvoices, clientLines, interpreterLines, bookings] = await Promise.all([
    db.collection('clientInvoices').get(),
    db.collection('interpreterInvoices').get(),
    db.collection('clientInvoiceLines').get(),
    db.collection('interpreterInvoiceLines').get(),
    db.collection('bookings').get(),
  ]);
  const clientLinesByInvoice = indexInvoiceLines(clientLines.docs, ['invoiceId', 'clientInvoiceId']);
  const interpreterLinesByInvoice = indexInvoiceLines(interpreterLines.docs, ['interpreterInvoiceId', 'invoiceId']);
  const invoiceIssues = [
    ...clientInvoices.docs.flatMap(invoice => auditFinancialInvoice(
      invoice,
      'CLIENT',
      clientLinesByInvoice.get(invoice.id) || []
    )),
    ...interpreterInvoices.docs.flatMap(invoice => auditFinancialInvoice(
      invoice,
      'INTERPRETER',
      interpreterLinesByInvoice.get(invoice.id) || []
    ))
  ];
  const bookingIssues = auditBookingInvoiceLinks({
    bookings: bookings.docs.map(document => ({ id: document.id, data: document.data() || {} })),
    clientInvoices: clientInvoices.docs.map(document => ({ id: document.id, data: document.data() || {} })),
    clientInvoiceLines: clientLines.docs.map(document => ({ id: document.id, data: document.data() || {} })),
  });
  const allIssues = [...invoiceIssues, ...bookingIssues];
  const byReason = allIssues.reduce<Record<string, number>>((summary, issue) => {
    summary[issue.reason] = (summary[issue.reason] || 0) + 1;
    return summary;
  }, {});
  const bySeverity = allIssues.reduce<Record<string, number>>((summary, issue) => {
    summary[issue.severity] = (summary[issue.severity] || 0) + 1;
    return summary;
  }, {});
  const affectedInvoiceIds = new Set(invoiceIssues.map(issue => `${issue.invoiceType}:${issue.invoiceId}`));
  const affectedBookingIds = new Set(bookingIssues.map(issue => issue.bookingId));
  const totalInvoices = clientInvoices.size + interpreterInvoices.size;

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    totalInvoices,
    clientInvoices: clientInvoices.size,
    interpreterInvoices: interpreterInvoices.size,
    healthyInvoices: totalInvoices - affectedInvoiceIds.size,
    affectedInvoices: affectedInvoiceIds.size,
    affectedBookings: affectedBookingIds.size,
    issueCount: allIssues.length,
    byReason,
    bySeverity,
    issues: invoiceIssues.slice(0, 250),
    issuesTruncated: invoiceIssues.length > 250,
    bookingIssues: bookingIssues.slice(0, 250),
    bookingIssuesTruncated: bookingIssues.length > 250,
  };
});

export const repairMissingRedbookRecords = functions.runWith({
  secrets: ['AIRTABLE_API_KEY'],
  timeoutSeconds: 300,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  await assertAdmin(context);

  const dryRun = Boolean(data?.dryRun);
  const syncStrategy = normalizeSyncStrategy(data?.syncStrategy);
  // A booking repair also resolves clients, assignments, workflow artifacts and
  // audit events. Keep each callable deliberately small so repair is resumable.
  const limitRecords = Math.min(Math.max(Number(data?.limitRecords || 20), 1), 25);
  const lastSyncIso = await getLastSyncIso();
  const redbookTableName = process.env.AIRTABLE_REDBOOK_TABLE || DEFAULT_TABLE_NAME;
  const redbookFormula = buildAirtableFormula(syncStrategy, redbookTableName, lastSyncIso);
  const redbookBatch = await fetchAirtableRecordBatch(
    effectiveLimitForStrategy(syncStrategy, Number(data?.auditLimit || 5000)),
    DEFAULT_TABLE_NAME,
    '',
    { filterByFormula: redbookFormula, strategy: syncStrategy, stabilize: true }
  );
  const existingBySourceId = await getExistingRedbookBySourceId();
  const allMissingIds = redbookBatch.records
    .filter(record => !existingBySourceId.has(record.id))
    .map(record => record.id);
  const missingIds = allMissingIds.slice(0, limitRecords);
  const remainingBeforeRepair = Math.max(allMissingIds.length - missingIds.length, 0);

  if (!missingIds.length) {
    return {
      success: true,
      dryRun,
      importMode: (await getPlatformMode()).airtableImportMode || 'ON',
      syncStrategy,
      totalRecords: redbookBatch.records.length,
      processedRecords: 0,
      missingRecords: 0,
      remainingMissingRecords: 0,
      hasMoreMissingRecords: false,
      stats: emptyActionStats(),
      details: [],
      message: 'No missing REDBOOK records found for the selected strategy.'
    };
  }

  const result = await syncRecords({
    dryRun,
    limitRecords: missingIds.length,
    syncStrategy,
    triggeredBy: 'manual',
    userId: context.auth?.uid,
    sourceRecordIds: missingIds
  }, false);

  return {
    ...result,
    repairMode: 'MISSING_REDBOOK',
    missingRecords: missingIds.length,
    remainingMissingRecords: remainingBeforeRepair,
    hasMoreMissingRecords: remainingBeforeRepair > 0,
    sourceRecordIds: missingIds
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
  const userId = context.auth?.uid || '';
  const expectedDryRunId = normalize(data?.expectedDryRunId);
  const approvalRef = expectedDryRunId ? db.collection('syncRuns').doc(expectedDryRunId) : null;

  if (!dryRun) {
    if (!approvalRef) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Run a new Dry Run with the exact same scope before writing Airtable data.',
        { reason: 'DRY_RUN_REQUIRED' },
      );
    }

    await db.runTransaction(async transaction => {
      const approvalSnapshot = await transaction.get(approvalRef);
      const validation = validateSyncWriteApproval(
        approvalSnapshot.exists ? approvalSnapshot.data() : null,
        {
          userId,
          modules,
          syncStrategy,
          limitRecords,
          mappingVersion: AIRTABLE_SYNC_MAPPING_VERSION,
        },
      );

      if (!validation.ok) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'The Dry Run approval is no longer valid. Run a new Dry Run before writing data.',
          { reason: validation.reason },
        );
      }

      transaction.update(approvalRef, {
        writeApprovalStatus: 'RESERVED',
        writeReservedAt: admin.firestore.FieldValue.serverTimestamp(),
        writeReservedBy: userId,
        writeRequest: {
          modules,
          syncStrategy,
          limitRecords,
          mappingVersion: AIRTABLE_SYNC_MAPPING_VERSION,
        },
      });
    });
  }

  try {
    const result = await syncAirtableOperations({
      dryRun,
      limitRecords,
      syncStrategy,
      triggeredBy: 'manual',
      userId,
      tableOffsets: data?.tableOffsets || data?.offsets || {},
      approvedByDryRunId: dryRun ? undefined : expectedDryRunId,
    }, modules);

    if (!dryRun && approvalRef) {
      await approvalRef.set({
        writeApprovalStatus: 'CONSUMED',
        writeConsumedAt: admin.firestore.FieldValue.serverTimestamp(),
        writeSyncRunId: 'syncRunId' in result ? result.syncRunId : '',
        writeSucceeded: result.success === true,
      }, { merge: true });
    }

    return result;
  } catch (error) {
    if (!dryRun && approvalRef) {
      await approvalRef.set({
        writeApprovalStatus: 'FAILED',
        writeFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    throw error;
  }
});

export const linkAirtableProfessionalIdentity = functions.runWith({
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context);
  let request;
  try {
    request = validateProfessionalIdentityLinkRequest(data, actor.role);
  } catch (error) {
    throw new functions.https.HttpsError(
      actor.role === 'SUPER_ADMIN' ? 'invalid-argument' : 'permission-denied',
      error instanceof Error ? error.message : 'Invalid professional identity mapping.',
    );
  }

  const targetRef = db.collection('interpreters').doc(request.interpreterId);
  const mappingRef = db.collection('professionalIdentityMappings')
    .doc(`airtable_professional_identity_${request.professionalRecordId}`);
  const [targetSnapshot, directMatches, linkedMatches, existingMapping] = await Promise.all([
    targetRef.get(),
    db.collection('interpreters')
      .where('sourceRecordId', '==', request.professionalRecordId)
      .limit(3)
      .get(),
    db.collection('interpreters')
      .where('airtableRecordIds', 'array-contains', request.professionalRecordId)
      .limit(3)
      .get(),
    mappingRef.get(),
  ]);

  if (!targetSnapshot.exists) {
    throw new functions.https.HttpsError('not-found', 'The selected interpreter profile no longer exists.');
  }

  const conflictingProfileIds = Array.from(new Set(
    [...directMatches.docs, ...linkedMatches.docs]
      .map(profile => profile.id)
      .filter(profileId => profileId !== request.interpreterId),
  ));
  if (conflictingProfileIds.length > 0) {
    throw new functions.https.HttpsError(
      'already-exists',
      'This Airtable professional identity is already linked to another profile.',
      { conflictingProfileIds },
    );
  }

  const existingData = existingMapping.data();
  if (
    existingMapping.exists
    && existingData?.active !== false
    && normalize(existingData?.interpreterId) !== request.interpreterId
  ) {
    throw new functions.https.HttpsError(
      'already-exists',
      'This Airtable professional identity already has an active reviewed mapping.',
      { conflictingProfileIds: [normalize(existingData?.interpreterId)].filter(Boolean) },
    );
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  const targetUpdate: admin.firestore.DocumentData = {
    airtableRecordIds: admin.firestore.FieldValue.arrayUnion(request.professionalRecordId),
    professionalIdentityConfirmedAt: now,
    professionalIdentityConfirmedBy: actor.uid,
    professionalIdentityReason: request.reason,
    updatedAt: now,
  };
  if (request.sourceName) {
    targetUpdate.identityAliases = admin.firestore.FieldValue.arrayUnion(request.sourceName);
  }
  batch.set(targetRef, targetUpdate, { merge: true });
  batch.set(mappingRef, {
    id: mappingRef.id,
    sourceSystem: 'AIRTABLE',
    sourceBaseId: DEFAULT_BASE_ID,
    sourceTable: INTERPRETERS_TABLE,
    professionalRecordId: request.professionalRecordId,
    sourceName: request.sourceName,
    interpreterId: request.interpreterId,
    interpreterName: normalize(targetSnapshot.data()?.name),
    reason: request.reason,
    active: true,
    mappedBy: actor.uid,
    mappedAt: now,
    updatedAt: now,
    createdAt: existingMapping.exists ? existingData?.createdAt || now : now,
  }, { merge: true });
  batch.set(db.collection('auditLogs').doc(), {
    action: 'AIRTABLE_PROFESSIONAL_IDENTITY_LINKED',
    actorUserId: actor.uid,
    professionalRecordId: request.professionalRecordId,
    interpreterId: request.interpreterId,
    sourceName: request.sourceName,
    reason: request.reason,
    createdAt: now,
  });
  await batch.commit();

  return {
    success: true,
    mappingId: mappingRef.id,
    professionalRecordId: request.professionalRecordId,
    interpreterId: request.interpreterId,
    requiresResync: true,
  };
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
