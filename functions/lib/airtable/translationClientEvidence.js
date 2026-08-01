"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichTranslationClientIdentity = exports.buildTranslationClientEvidence = exports.accountRefFromTranslationInvoice = exports.normalizeTranslationClientName = void 0;
const text = (value) => {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const candidate = value;
        return text(candidate.id || candidate.name || candidate.value);
    }
    return '';
};
const values = (value) => {
    if (!Array.isArray(value)) {
        const normalized = text(value);
        return normalized ? [normalized] : [];
    }
    return value.flatMap(item => values(item));
};
const normalizeFieldName = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const collectFieldValues = (fields, names) => {
    const requested = names.map(normalizeFieldName);
    const collected = [];
    Object.entries(fields).forEach(([fieldName, value]) => {
        const normalized = normalizeFieldName(fieldName);
        if (requested.some(name => normalized === name || normalized.startsWith(name) || normalized.endsWith(name))) {
            collected.push(...values(value));
        }
    });
    return unique(collected);
};
const collectExactFieldValues = (fields, names) => {
    const requested = new Set(names.map(normalizeFieldName));
    const collected = [];
    Object.entries(fields).forEach(([fieldName, value]) => {
        if (requested.has(normalizeFieldName(fieldName))) {
            collected.push(...values(value));
        }
    });
    return unique(collected);
};
const unique = (input) => Array.from(new Set(input.map(value => value.trim()).filter(Boolean)));
const addAccountRefSupport = (index, key, accountRefs) => {
    if (!key)
        return;
    const support = index.get(key) || new Map();
    accountRefs.forEach(accountRef => {
        support.set(accountRef, (support.get(accountRef) || 0) + 1);
    });
    index.set(key, support);
};
const collectAccountRefSupport = (index, keys) => {
    const combined = new Map();
    unique(keys).forEach(key => {
        index.get(key)?.forEach((count, accountRef) => {
            combined.set(accountRef, (combined.get(accountRef) || 0) + count);
        });
    });
    return combined;
};
const dominantAccountRef = (support) => {
    const ranked = Array.from(support.entries()).sort((a, b) => (b[1] - a[1] || a[0].localeCompare(b[0])));
    if (ranked.length < 2)
        return '';
    const [topRef, topCount] = ranked[0];
    const runnerUpCount = ranked[1][1];
    return topCount >= 5 && topCount >= runnerUpCount * 3 ? topRef : '';
};
const normalizeTranslationClientName = (value) => value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|plc|nhs|trust|cic|llp|department|dept|service|services)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
exports.normalizeTranslationClientName = normalizeTranslationClientName;
const translationAgencyEvidenceKey = (value) => {
    const normalized = (0, exports.normalizeTranslationClientName)(value)
        .replace(/\bethnic minority traveller achievement\b/g, ' emtas ')
        .replace(/\bhampshire county council\b/g, ' hcc ')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(new Set(normalized.split(' ').filter(Boolean))).sort().join(' ');
};
const accountRefFromTranslationInvoice = (invoiceNumber) => {
    const normalized = invoiceNumber.trim().toUpperCase();
    if (!normalized || /^REC[A-Z0-9]+$/.test(normalized))
        return '';
    const match = normalized.match(/^([A-Z][A-Z0-9]{2,})(?=[.\s/_-]|$)/);
    if (!match)
        return '';
    const candidate = match[1];
    return ['AIRTABLE', 'INVOICE', 'TRANSLATION', 'LOSS'].includes(candidate) ? '' : candidate;
};
exports.accountRefFromTranslationInvoice = accountRefFromTranslationInvoice;
const buildTranslationClientEvidence = (records) => {
    const evidence = new Map();
    const refsByEmail = new Map();
    const refsByAgency = new Map();
    records.forEach(record => {
        // Only the actual linked-record field may establish invoice ownership.
        // Lookup fields such as "Assign to (from Translations)" can also contain
        // Airtable record IDs and must never be interpreted as translation IDs.
        const linkedTranslationIds = collectExactFieldValues(record.fields, [
            'Translations',
            'TR ID',
            'TR ID (from Translations)',
        ]).filter(value => /^rec[a-z0-9]+$/i.test(value));
        if (linkedTranslationIds.length === 0)
            return;
        const invoiceNumbers = collectFieldValues(record.fields, [
            'TR Invoice Nbr',
            'Invoice Number',
            'Invoice No',
            'Invoice Reference',
            'Reference',
            'Name',
        ]).filter(value => !/^rec[a-z0-9]+$/i.test(value));
        const accountRefs = unique(invoiceNumbers.map(exports.accountRefFromTranslationInvoice));
        const agencyNames = collectFieldValues(record.fields, ['TR Agency']);
        const requestedByNames = collectFieldValues(record.fields, ['TR Requested By']);
        const emails = collectFieldValues(record.fields, ['TR client email']).map(value => value.toLowerCase());
        if (accountRefs.length === 1) {
            agencyNames.forEach(agency => {
                addAccountRefSupport(refsByAgency, translationAgencyEvidenceKey(agency), accountRefs);
            });
            emails.forEach(email => addAccountRefSupport(refsByEmail, email.toLowerCase(), accountRefs));
        }
        linkedTranslationIds.forEach(translationRecordId => {
            const current = evidence.get(translationRecordId) || {
                translationRecordId,
                invoiceRecordIds: [],
                invoiceNumbers: [],
                accountRefs: [],
                candidateAccountRefs: [],
                agencyCandidateAccountRefs: [],
                emailCandidateAccountRefs: [],
                agencyNames: [],
                requestedByNames: [],
                emails: [],
                accountRefAmbiguous: false,
                accountRefSource: '',
            };
            const mergedAccountRefs = unique([...current.accountRefs, ...accountRefs]);
            evidence.set(translationRecordId, {
                translationRecordId,
                invoiceRecordIds: unique([...current.invoiceRecordIds, record.id]),
                invoiceNumbers: unique([...current.invoiceNumbers, ...invoiceNumbers]),
                accountRefs: mergedAccountRefs,
                candidateAccountRefs: mergedAccountRefs,
                agencyCandidateAccountRefs: current.agencyCandidateAccountRefs,
                emailCandidateAccountRefs: current.emailCandidateAccountRefs,
                agencyNames: unique([...current.agencyNames, ...agencyNames]),
                requestedByNames: unique([...current.requestedByNames, ...requestedByNames]),
                emails: unique([...current.emails, ...emails]),
                accountRefAmbiguous: mergedAccountRefs.length > 1,
                accountRefSource: mergedAccountRefs.length === 1 ? 'INVOICE_NUMBER' : '',
            });
        });
    });
    evidence.forEach((item, translationRecordId) => {
        if (item.accountRefs.length > 0)
            return;
        const emailSupport = collectAccountRefSupport(refsByEmail, item.emails.map(email => email.toLowerCase()));
        const agencySupport = collectAccountRefSupport(refsByAgency, item.agencyNames.map(translationAgencyEvidenceKey));
        const emailRefs = Array.from(emailSupport.keys());
        const agencyRefs = Array.from(agencySupport.keys());
        const dominantAgency = dominantAccountRef(agencySupport);
        const competingRefs = unique([...emailRefs, ...agencyRefs]);
        // An exact organisation/department label is stronger than a shared requester email.
        // The same agent may place work for more than one department under a parent client.
        const inferredRefs = agencyRefs.length === 1
            ? agencyRefs
            : dominantAgency
                ? [dominantAgency]
                : emailRefs.length === 1 && (agencyRefs.length === 0 || agencyRefs.includes(emailRefs[0]))
                    ? emailRefs
                    : [];
        evidence.set(translationRecordId, {
            ...item,
            accountRefs: inferredRefs,
            candidateAccountRefs: competingRefs,
            agencyCandidateAccountRefs: agencyRefs,
            emailCandidateAccountRefs: emailRefs,
            accountRefAmbiguous: competingRefs.length > 1 && inferredRefs.length === 0,
            accountRefSource: agencyRefs.length === 1
                ? 'EXACT_AGENCY'
                : dominantAgency
                    ? 'DOMINANT_AGENCY'
                    : inferredRefs.length === 1
                        ? 'SHARED_EMAIL'
                        : '',
        });
    });
    return evidence;
};
exports.buildTranslationClientEvidence = buildTranslationClientEvidence;
const enrichTranslationClientIdentity = (identity, evidence) => {
    if (!evidence)
        return identity;
    const accountRef = evidence.accountRefs.length === 1 ? evidence.accountRefs[0] : '';
    const companyName = identity.companyName === 'Airtable Client'
        ? evidence.agencyNames[0] || identity.companyName
        : identity.companyName;
    const email = identity.email || evidence.emails[0] || '';
    return {
        ...identity,
        companyName,
        normalizedCompanyName: (0, exports.normalizeTranslationClientName)(companyName),
        bookingAgent: identity.bookingAgent || evidence.requestedByNames[0] || '',
        email,
        uniqueClientKey: identity.uniqueClientKey || accountRef,
        sageAccountRef: identity.sageAccountRef || accountRef,
        invoiceEmail: identity.invoiceEmail || email,
    };
};
exports.enrichTranslationClientIdentity = enrichTranslationClientIdentity;
//# sourceMappingURL=translationClientEvidence.js.map