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
exports.analyseOperationalContext = exports.buildAIReviewContext = void 0;
const admin = __importStar(require("firebase-admin"));
const policy_1 = require("./policy");
const token = (value, fallback = '', max = 60) => {
    const normalized = String(value ?? fallback)
        .trim()
        .replace(/[^a-zA-Z0-9 _+./:-]/g, '')
        .slice(0, max);
    return normalized || fallback;
};
const numberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};
const normalizedLabel = (data, id) => token(data.displayRef || data.jobNumber || data.bookingRef || data.reference, `Record ${id.slice(0, 8)}`, 80);
const shouldReadJobs = (scope) => ['JOBS', 'ALLOCATION', 'BILLING', 'COST', 'PLATFORM'].includes(scope);
const shouldReadInvoices = (scope) => ['BILLING', 'COST', 'PLATFORM'].includes(scope);
const shouldReadSync = (scope) => ['SYNC', 'PLATFORM'].includes(scope);
const emptySnapshot = () => ({ docs: [] });
const buildAIReviewContext = async (scope) => {
    const db = admin.firestore();
    const [jobsSnapshot, clientInvoiceSnapshot, interpreterInvoiceSnapshot, conflictSnapshot] = await Promise.all([
        shouldReadJobs(scope) ? db.collection('bookings').limit(500).get() : Promise.resolve(emptySnapshot()),
        shouldReadInvoices(scope) ? db.collection('clientInvoices').limit(300).get() : Promise.resolve(emptySnapshot()),
        shouldReadInvoices(scope) ? db.collection('interpreterInvoices').limit(300).get() : Promise.resolve(emptySnapshot()),
        shouldReadSync(scope)
            ? db.collection('syncConflicts').where('resolutionStatus', '==', 'OPEN').limit(250).get()
            : Promise.resolve(emptySnapshot()),
    ]);
    const entityLookup = {};
    const jobs = jobsSnapshot.docs.map(doc => {
        const data = doc.data();
        const opaqueId = (0, policy_1.opaqueEntityId)('BOOKING', doc.id);
        const entityLabel = normalizedLabel(data, doc.id);
        entityLookup[opaqueId] = { entityType: 'BOOKING', entityId: doc.id, entityLabel };
        return {
            localId: doc.id,
            opaqueId,
            entityLabel,
            status: token(data.status, 'UNKNOWN'),
            date: token(data.date, '', 20),
            startTime: token(data.startTime, '', 10),
            durationMinutes: Math.max(0, Number(data.durationMinutes) || 0),
            serviceCategory: token(data.serviceCategory, 'UNKNOWN'),
            languageFrom: token(data.languageFrom, 'Unknown', 40),
            languageTo: token(data.languageTo, 'Unknown', 40),
            locationType: token(data.locationType || data.sessionMode, 'UNKNOWN', 30),
            assigned: Boolean(data.interpreterId),
            syncStatus: token(data.syncStatus, 'UNKNOWN'),
            timesheetStatus: token(data.timesheetStatus || data.timesheetState, 'UNKNOWN'),
            clientInvoiceStatus: token(data.clientInvoiceStatus || data.billingState, 'UNKNOWN'),
            interpreterInvoiceStatus: token(data.interpreterInvoiceStatus || data.interpreterPaymentStatus, 'UNKNOWN'),
            hasClientInvoice: Boolean(data.clientInvoiceId || data.clientInvoiceNumber || data.clientInvoiceReference),
            hasInterpreterInvoice: Boolean(data.interpreterInvoiceId || data.interpreterInvoiceNumber || data.interpreterInvoiceReference),
            hasCostCode: Boolean(token(data.costCode, '')),
            clientAmount: numberOrNull(data.clientInvoiceTotal ?? data.totalAmount),
            professionalCost: numberOrNull(data.professionalCost ?? data.interpreterInvoiceTotal ?? data.interpreterAmountCalculated),
        };
    });
    const mapInvoices = (docs, entityType) => docs.map(doc => {
        const data = doc.data();
        const opaqueId = (0, policy_1.opaqueEntityId)(entityType, doc.id);
        const entityLabel = normalizedLabel(data, doc.id);
        entityLookup[opaqueId] = { entityType, entityId: doc.id, entityLabel };
        const linked = [
            ...(Array.isArray(data.linkedRedbookRecordIds) ? data.linkedRedbookRecordIds : []),
            ...(Array.isArray(data.linkedTranslationRecordIds) ? data.linkedTranslationRecordIds : []),
            ...(Array.isArray(data.items) ? data.items : []),
        ];
        return {
            localId: doc.id,
            opaqueId,
            entityLabel,
            entityType,
            status: token(data.status, 'UNKNOWN'),
            totalAmount: numberOrNull(data.totalAmount),
            currency: token(data.currency, 'GBP', 10),
            hasReference: Boolean(token(data.reference || data.invoiceNumber || data.externalInvoiceReference, '')),
            linkedRecordCount: linked.length,
            integrityStatus: token(data.financialIntegrityStatus || data.referenceIntegrityStatus, 'UNKNOWN'),
        };
    });
    const clientInvoices = mapInvoices(clientInvoiceSnapshot.docs, 'CLIENT_INVOICE');
    const interpreterInvoices = mapInvoices(interpreterInvoiceSnapshot.docs, 'INTERPRETER_INVOICE');
    const syncConflicts = conflictSnapshot.docs.map(doc => {
        const data = doc.data();
        const opaqueId = (0, policy_1.opaqueEntityId)('SYNC_CONFLICT', doc.id);
        const entityLabel = `Conflict ${doc.id.slice(0, 8)}`;
        entityLookup[opaqueId] = { entityType: 'SYNC_CONFLICT', entityId: doc.id, entityLabel };
        return {
            localId: doc.id,
            opaqueId,
            entityLabel,
            severity: token(data.severity, 'MEDIUM'),
            reason: token(data.reason, 'Mirror inconsistency', 120),
            entityType: token(data.entityType, 'record', 40),
            resolutionStatus: token(data.resolutionStatus, 'OPEN'),
        };
    });
    const providerContext = {
        scope,
        generatedAt: new Date().toISOString(),
        privacyNotice: 'Identifiers are opaque. Names, emails, phones, addresses, free-text notes and patient data are excluded.',
        jobs: jobs.slice(0, 180).map(({ opaqueId, status, date, startTime, durationMinutes, serviceCategory, languageFrom, languageTo, locationType, assigned, syncStatus, timesheetStatus, clientInvoiceStatus, interpreterInvoiceStatus, hasClientInvoice, hasInterpreterInvoice, hasCostCode, clientAmount, professionalCost }) => ({
            id: opaqueId,
            status,
            date,
            startTime,
            durationMinutes,
            serviceCategory,
            languageFrom,
            languageTo,
            locationType,
            assigned,
            syncStatus,
            timesheetStatus,
            clientInvoiceStatus,
            interpreterInvoiceStatus,
            hasClientInvoice,
            hasInterpreterInvoice,
            hasCostCode,
            clientAmount,
            professionalCost,
        })),
        clientInvoices: clientInvoices.slice(0, 100).map(({ opaqueId, status, totalAmount, currency, hasReference, linkedRecordCount, integrityStatus }) => ({
            id: opaqueId, status, totalAmount, currency, hasReference, linkedRecordCount, integrityStatus,
        })),
        interpreterInvoices: interpreterInvoices.slice(0, 100).map(({ opaqueId, status, totalAmount, currency, hasReference, linkedRecordCount, integrityStatus }) => ({
            id: opaqueId, status, totalAmount, currency, hasReference, linkedRecordCount, integrityStatus,
        })),
        syncConflicts: syncConflicts.slice(0, 100).map(({ opaqueId, severity, reason, entityType, resolutionStatus }) => ({
            id: opaqueId, severity, reason, entityType, resolutionStatus,
        })),
    };
    return {
        scope,
        generatedAt: new Date().toISOString(),
        jobs,
        clientInvoices,
        interpreterInvoices,
        syncConflicts,
        entityLookup,
        providerContext,
        dataSummary: {
            jobs: jobs.length,
            clientInvoices: clientInvoices.length,
            interpreterInvoices: interpreterInvoices.length,
            syncConflicts: syncConflicts.length,
        },
    };
};
exports.buildAIReviewContext = buildAIReviewContext;
const parseJobDate = (date, time) => {
    if (!date)
        return null;
    const candidate = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? `${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '00:00'}:00`
        : date;
    const value = new Date(candidate).getTime();
    return Number.isFinite(value) ? value : null;
};
const scopeAllows = (scope, categories) => scope === 'PLATFORM' || categories.includes(scope);
const analyseOperationalContext = (context, now = new Date()) => {
    const suggestions = [];
    const nowMs = now.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const assignmentStatuses = new Set(['DRAFT', 'INCOMING', 'NEEDS_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'OPENED']);
    const deliveredStatuses = new Set(['SESSION_COMPLETED', 'TIMESHEET_SUBMITTED', 'TIMESHEET_VERIFIED', 'READY_FOR_INVOICE', 'INVOICING']);
    for (const job of context.jobs) {
        const scheduledAt = parseJobDate(job.date, job.startTime);
        const daysUntil = scheduledAt === null ? null : (scheduledAt - nowMs) / dayMs;
        if (scopeAllows(context.scope, ['JOBS', 'ALLOCATION'])
            && !job.assigned
            && assignmentStatuses.has(job.status)
            && (daysUntil === null || daysUntil <= 14)) {
            const overdue = daysUntil !== null && daysUntil < 0;
            suggestions.push({
                action: overdue ? 'REVIEW_OVERDUE_JOB' : 'REVIEW_ASSIGNMENT',
                category: overdue ? 'JOBS' : 'ALLOCATION',
                entityType: 'BOOKING',
                entityId: job.localId,
                entityLabel: job.entityLabel,
                title: overdue ? 'Reconcile overdue unassigned job' : 'Review interpreter allocation',
                reason: overdue
                    ? 'The scheduled time has passed and no professional is linked to this job.'
                    : `The job has no professional and is due ${daysUntil === null ? 'without a valid schedule' : `in ${Math.max(0, Math.ceil(daysUntil))} day(s)`}.`,
                expectedBenefit: overdue ? 'Restore a trustworthy operational history.' : 'Reduce late assignment and service failure risk.',
                confidence: overdue ? 94 : daysUntil !== null && daysUntil <= 2 ? 93 : 84,
                evidence: [`Status: ${job.status}`, 'Professional assigned: no', `Scheduled: ${job.date || 'missing'} ${job.startTime || ''}`.trim()],
                source: 'RULE_ENGINE',
                dataUsed: ['job status', 'schedule', 'assignment presence'],
            });
        }
        if (scopeAllows(context.scope, ['JOBS']) && job.status === 'BOOKED' && !job.assigned) {
            suggestions.push({
                action: 'REVIEW_STATUS_CONSISTENCY',
                category: 'JOBS',
                entityType: 'BOOKING',
                entityId: job.localId,
                entityLabel: job.entityLabel,
                title: 'Booked job has no linked professional',
                reason: 'The lifecycle status says BOOKED, but the assignment link is missing.',
                expectedBenefit: 'Prevent a false confirmation from reaching operations or finance.',
                confidence: 98,
                evidence: ['Status: BOOKED', 'Professional assigned: no'],
                source: 'RULE_ENGINE',
                dataUsed: ['job status', 'assignment presence'],
            });
        }
        if (scopeAllows(context.scope, ['BILLING']) && deliveredStatuses.has(job.status) && !job.hasClientInvoice) {
            suggestions.push({
                action: 'REVIEW_BILLING_GAP',
                category: 'BILLING',
                entityType: 'BOOKING',
                entityId: job.localId,
                entityLabel: job.entityLabel,
                title: 'Delivered work may be missing client billing',
                reason: `The job is at ${job.status} and has no linked client invoice.`,
                expectedBenefit: 'Reduce billing leakage and delayed revenue.',
                confidence: job.status === 'READY_FOR_INVOICE' ? 96 : 88,
                evidence: [`Status: ${job.status}`, 'Client invoice linked: no', `Timesheet: ${job.timesheetStatus}`],
                source: 'RULE_ENGINE',
                dataUsed: ['job status', 'timesheet state', 'client invoice presence'],
            });
        }
        if (scopeAllows(context.scope, ['BILLING', 'JOBS'])
            && ['INVOICED', 'PAID'].includes(job.status)
            && !job.hasClientInvoice) {
            suggestions.push({
                action: 'REVIEW_STATUS_CONSISTENCY',
                category: 'BILLING',
                entityType: 'BOOKING',
                entityId: job.localId,
                entityLabel: job.entityLabel,
                title: 'Financial status has no invoice link',
                reason: `The job is ${job.status}, but no client invoice identifier is present.`,
                expectedBenefit: 'Keep the job-to-invoice audit chain complete.',
                confidence: 97,
                evidence: [`Status: ${job.status}`, 'Client invoice linked: no'],
                source: 'RULE_ENGINE',
                dataUsed: ['job status', 'client invoice presence'],
            });
        }
        if (scopeAllows(context.scope, ['COST', 'BILLING'])
            && job.clientAmount !== null
            && job.professionalCost !== null
            && job.professionalCost > job.clientAmount) {
            suggestions.push({
                action: 'REVIEW_COST_ANOMALY',
                category: 'COST',
                entityType: 'BOOKING',
                entityId: job.localId,
                entityLabel: job.entityLabel,
                title: 'Possible negative-margin job',
                reason: 'The recorded professional cost exceeds the recorded client amount.',
                expectedBenefit: 'Catch rate, duration or invoice mapping errors before settlement.',
                confidence: 91,
                evidence: [`Client amount: GBP ${job.clientAmount.toFixed(2)}`, `Professional cost: GBP ${job.professionalCost.toFixed(2)}`],
                source: 'RULE_ENGINE',
                dataUsed: ['client amount', 'professional cost'],
            });
        }
    }
    if (scopeAllows(context.scope, ['BILLING'])) {
        for (const invoice of [...context.clientInvoices, ...context.interpreterInvoices]) {
            const issues = [
                invoice.totalAmount === null || invoice.totalAmount <= 0 ? 'amount missing or zero' : '',
                !invoice.hasReference ? 'reference missing' : '',
                invoice.linkedRecordCount === 0 ? 'no linked work records' : '',
                ['AMOUNT_MISSING', 'LINK_MISSING', 'REVIEW_REQUIRED', 'MISSING'].includes(invoice.integrityStatus) ? `integrity: ${invoice.integrityStatus}` : '',
            ].filter(Boolean);
            if (issues.length === 0)
                continue;
            suggestions.push({
                action: 'REVIEW_INVOICE_INTEGRITY',
                category: 'BILLING',
                entityType: invoice.entityType,
                entityId: invoice.localId,
                entityLabel: invoice.entityLabel,
                title: 'Review incomplete invoice record',
                reason: `Invoice integrity checks found: ${issues.join(', ')}.`,
                expectedBenefit: 'Prevent incomplete invoices from moving through reconciliation.',
                confidence: 94,
                evidence: issues,
                source: 'RULE_ENGINE',
                dataUsed: ['invoice total', 'invoice reference', 'linked records', 'integrity status'],
            });
        }
    }
    if (scopeAllows(context.scope, ['SYNC'])) {
        for (const conflict of context.syncConflicts) {
            suggestions.push({
                action: 'REVIEW_SYNC_CONFLICT',
                category: 'SYNC',
                entityType: 'SYNC_CONFLICT',
                entityId: conflict.localId,
                entityLabel: conflict.entityLabel,
                title: 'Resolve open Airtable mirror conflict',
                reason: conflict.reason,
                expectedBenefit: 'Restore source-to-platform consistency and a clean audit trail.',
                confidence: conflict.severity === 'HIGH' ? 96 : 88,
                evidence: [`Severity: ${conflict.severity}`, `Record type: ${conflict.entityType}`, 'Resolution: OPEN'],
                source: 'RULE_ENGINE',
                dataUsed: ['sync conflict severity', 'reason', 'resolution status'],
            });
        }
    }
    return suggestions;
};
exports.analyseOperationalContext = analyseOperationalContext;
//# sourceMappingURL=contextBuilder.js.map