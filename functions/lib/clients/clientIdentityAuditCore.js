"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClientIdentityAudit = exports.extractClientEmails = exports.normalizeClientAddress = exports.normalizeClientPhone = exports.extractUkPostcode = exports.normalizeOrganizationName = exports.normalizeClientEmail = void 0;
const node_crypto_1 = require("node:crypto");
const GENERIC_ORGANIZATION_NAMES = new Set([
    '',
    'airtable client',
    'client',
    'customer',
    'guest',
    'home',
    'n a',
    'na',
    'nhs',
    'none',
    'not provided',
    'tbd',
    'unknown',
]);
const SHARED_MAILBOX_LOCAL_PARTS = new Set([
    'accounts',
    'admin',
    'bookings',
    'enquiries',
    'finance',
    'info',
    'invoice',
    'invoices',
    'office',
    'reception',
    'referrals',
    'team',
]);
const NON_ORGANIZATION_DOMAINS = new Set([
    'aol.com',
    'btinternet.com',
    'gmail.com',
    'googlemail.com',
    'hotmail.co.uk',
    'hotmail.com',
    'icloud.com',
    'live.co.uk',
    'live.com',
    'mail.com',
    'me.com',
    'nhs.net',
    'nhs.uk',
    'outlook.com',
    'proton.me',
    'protonmail.com',
    'yahoo.co.uk',
    'yahoo.com',
]);
const GENERIC_ADDRESS_KEYS = new Set([
    '',
    'address pending',
    'address pending update',
    'not provided',
    'tbd',
    'unknown',
]);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const upperIdentity = (value) => text(value).toUpperCase().replace(/\s+/g, '');
const count = (value) => Math.max(0, Number(value) || 0);
const stableHash = (value) => (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex');
const stableId = (prefix, values) => `${prefix}_${(0, node_crypto_1.createHash)('sha1').update(values.slice().sort().join('|')).digest('hex').slice(0, 12)}`;
const unique = (values) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
const intersects = (left, right) => left.some(value => right.includes(value));
const normalizeClientEmail = (value) => text(value).toLowerCase();
exports.normalizeClientEmail = normalizeClientEmail;
const normalizeOrganizationName = (value) => text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(the|limited|ltd|plc|llp)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
exports.normalizeOrganizationName = normalizeOrganizationName;
const extractUkPostcode = (value) => {
    const match = text(value).toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
    if (!match)
        return '';
    const compact = match[1].replace(/\s+/g, '');
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
};
exports.extractUkPostcode = extractUkPostcode;
const normalizeClientPhone = (value) => {
    let digits = text(value).replace(/\D/g, '');
    if (digits.startsWith('0044'))
        digits = digits.slice(4);
    if (digits.startsWith('44') && digits.length >= 12)
        digits = digits.slice(2);
    if (digits.length === 10)
        digits = `0${digits}`;
    return digits.length >= 10 && digits.length <= 12 ? digits : '';
};
exports.normalizeClientPhone = normalizeClientPhone;
const normalizeClientAddress = (value) => {
    const normalized = (0, exports.normalizeOrganizationName)(text(value).replace(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/gi, ' '));
    return GENERIC_ADDRESS_KEYS.has(normalized) ? '' : normalized;
};
exports.normalizeClientAddress = normalizeClientAddress;
const extractClientEmails = (value) => unique((text(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(exports.normalizeClientEmail));
exports.extractClientEmails = extractClientEmails;
const extractAliases = (source) => {
    const raw = source.accountAliases;
    const values = Array.isArray(raw) ? raw : text(raw).split(/[|;,]/g);
    return unique([
        ...values.map(text),
        text(source.legalName),
        text(source.tradeName),
        text(source.clientTrade),
    ]);
};
const organizationDomains = (emails) => unique(emails
    .map(email => email.split('@')[1] || '')
    .filter(domain => domain && !NON_ORGANIZATION_DOMAINS.has(domain)));
const isSharedMailbox = (email) => SHARED_MAILBOX_LOCAL_PARTS.has(email.split('@')[0] || '');
class UnionFind {
    constructor(size) {
        this.parent = Array.from({ length: size }, (_, index) => index);
    }
    find(index) {
        if (this.parent[index] !== index)
            this.parent[index] = this.find(this.parent[index]);
        return this.parent[index];
    }
    union(left, right) {
        const leftRoot = this.find(left);
        const rightRoot = this.find(right);
        if (leftRoot !== rightRoot)
            this.parent[rightRoot] = leftRoot;
    }
}
const completenessScore = (source, metrics) => {
    const fields = [
        source.companyName,
        source.billingAddress,
        source.contactPerson,
        source.email,
        source.phone,
        source.bookingEmail,
        source.invoiceEmail,
        source.departmentName,
    ].filter(value => text(value)).length;
    const identity = (text(source.sageAccountRef) ? 6 : 0) + (text(source.airtableClientKey) ? 5 : 0);
    const state = text(source.status).toUpperCase() === 'ACTIVE' ? 2 : 0;
    const activity = Math.min(metrics.bookings, 20) + Math.min(metrics.invoices * 3, 15) + Math.min(metrics.users * 4, 12);
    return fields + identity + state + activity;
};
const prepareRecord = (source, input) => {
    const companyName = text(source.companyName) || 'Unnamed client record';
    const normalizedCompanyName = (0, exports.normalizeOrganizationName)(source.normalizedCompanyName || source.companyName);
    const nameKey = GENERIC_ORGANIZATION_NAMES.has(normalizedCompanyName) ? '' : normalizedCompanyName;
    const aliases = extractAliases(source);
    const aliasKeys = unique(aliases.map(exports.normalizeOrganizationName).filter(value => !GENERIC_ORGANIZATION_NAMES.has(value)));
    const contactEmails = unique([
        ...(0, exports.extractClientEmails)(source.email),
        ...(0, exports.extractClientEmails)(source.bookingEmail),
    ]);
    const invoiceEmails = (0, exports.extractClientEmails)(source.invoiceEmail);
    const phoneNumbers = unique([
        (0, exports.normalizeClientPhone)(source.phone),
        (0, exports.normalizeClientPhone)(source.bookingPhone),
        (0, exports.normalizeClientPhone)(source.invoicePhone),
    ]);
    const metrics = {
        bookings: count(input.bookingCounts?.[source.id]),
        invoices: count(input.invoiceCounts?.[source.id]),
        users: count(input.linkedUserCounts?.[source.id]),
    };
    return {
        id: source.id,
        companyName,
        normalizedCompanyName,
        nameKey,
        aliases,
        aliasKeys,
        matchingNames: unique([nameKey, ...aliasKeys]),
        billingAddress: text(source.billingAddress),
        addressKey: (0, exports.normalizeClientAddress)(source.billingAddress),
        postcode: (0, exports.extractUkPostcode)(source.billingAddress),
        departmentName: text(source.departmentName),
        locationName: text(source.locationName),
        contactPerson: text(source.bookingContactName || source.contactPerson),
        contactEmails,
        invoiceEmail: invoiceEmails[0] || '',
        phoneNumbers,
        phoneKeys: phoneNumbers,
        organizationDomains: organizationDomains([...contactEmails, ...invoiceEmails]),
        domainKeys: organizationDomains([...contactEmails, ...invoiceEmails]),
        sageAccountRef: text(source.sageAccountRef),
        sageKey: upperIdentity(source.sageAccountRef),
        airtableClientKey: text(source.airtableClientKey),
        airtableKey: (0, exports.normalizeOrganizationName)(source.airtableClientKey),
        sourceSystem: text(source.sourceSystem),
        status: text(source.status) || 'ACTIVE',
        bookingCount: metrics.bookings,
        invoiceCount: metrics.invoices,
        linkedUserCount: metrics.users,
        completenessScore: completenessScore(source, metrics),
    };
};
const tokenSimilarity = (left, right) => {
    if (!left || !right)
        return 0;
    if (left === right)
        return 1;
    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    const intersection = Array.from(leftTokens).filter(token => rightTokens.has(token)).length;
    return (2 * intersection) / (leftTokens.size + rightTokens.size || 1);
};
const bestNameSimilarity = (left, right) => left.matchingNames.reduce((best, leftName) => Math.max(best, ...right.matchingNames.map(rightName => tokenSimilarity(leftName, rightName))), 0);
const signalsFor = (left, right) => {
    const nameSimilarity = bestNameSimilarity(left, right);
    return {
        sameSage: Boolean(left.sageKey && left.sageKey === right.sageKey),
        sameAirtable: Boolean(left.airtableKey && left.airtableKey === right.airtableKey),
        sameName: Boolean(left.nameKey && left.nameKey === right.nameKey),
        aliasMatch: intersects(left.matchingNames, right.matchingNames) && left.nameKey !== right.nameKey,
        samePostcode: Boolean(left.postcode && left.postcode === right.postcode),
        sameAddress: Boolean(left.addressKey && left.addressKey === right.addressKey),
        samePhone: intersects(left.phoneKeys, right.phoneKeys),
        sameDomain: intersects(left.domainKeys, right.domainKeys),
        nameSimilarity,
    };
};
const shouldLinkOrganizations = (signals) => {
    if (signals.sameSage || signals.sameAirtable)
        return true;
    if (signals.sameName)
        return true;
    if (signals.aliasMatch && (signals.samePostcode || signals.sameAddress || signals.samePhone || signals.sameDomain))
        return true;
    if (signals.nameSimilarity >= 0.70 && signals.samePhone && signals.sameDomain)
        return true;
    if (signals.nameSimilarity >= 0.82 && (signals.samePostcode || signals.sameAddress || signals.samePhone || signals.sameDomain))
        return true;
    return signals.nameSimilarity >= 0.68 && signals.sameAddress && signals.samePostcode;
};
const groupIndexes = (records, keyFor) => {
    const index = new Map();
    records.forEach((record, position) => {
        const key = keyFor(record);
        if (!key)
            return;
        index.set(key, [...(index.get(key) || []), position]);
    });
    return index;
};
const duplicateEvidence = (records, type, label, strength, valueFor) => {
    const groups = groupIndexes(records, valueFor);
    const evidence = [];
    groups.forEach((positions, value) => {
        if (positions.length > 1)
            evidence.push({ type, label, value, strength });
    });
    return evidence;
};
const pairEvidence = (records) => {
    const evidence = [];
    for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
            const left = records[leftIndex];
            const right = records[rightIndex];
            const signals = signalsFor(left, right);
            if (signals.aliasMatch)
                evidence.push({
                    type: 'ORGANIZATION_ALIAS',
                    label: 'Organisation name matches an alias',
                    value: `${left.companyName} / ${right.companyName}`,
                    strength: signals.samePostcode || signals.sameAddress ? 'STRONG' : 'SUPPORTING',
                });
            if (signals.samePhone && signals.nameSimilarity >= 0.68)
                evidence.push({
                    type: 'PHONE',
                    label: 'Same organisation phone',
                    value: left.phoneKeys.find(value => right.phoneKeys.includes(value)) || '',
                    strength: 'STRONG',
                });
            if (signals.sameAddress && signals.nameSimilarity >= 0.68)
                evidence.push({
                    type: 'ADDRESS',
                    label: 'Same billing address',
                    value: left.billingAddress || right.billingAddress,
                    strength: 'STRONG',
                });
            if (signals.sameDomain && signals.nameSimilarity >= 0.70)
                evidence.push({
                    type: 'EMAIL_DOMAIN',
                    label: 'Same specific organisation domain',
                    value: left.domainKeys.find(value => right.domainKeys.includes(value)) || '',
                    strength: 'SUPPORTING',
                });
            if (!signals.sameName && signals.nameSimilarity >= 0.68)
                evidence.push({
                    type: 'NAME_SIMILARITY',
                    label: 'Similar organisation names',
                    value: `${Math.round(signals.nameSimilarity * 100)}% - ${left.companyName} / ${right.companyName}`,
                    strength: 'SUPPORTING',
                });
        }
    }
    return Array.from(new Map(evidence
        .filter(item => item.value)
        .map(item => [`${item.type}|${item.value}`, item])).values());
};
const chooseCanonical = (records) => records.slice().sort((left, right) => {
    if (right.linkedUserCount !== left.linkedUserCount)
        return right.linkedUserCount - left.linkedUserCount;
    if (right.invoiceCount !== left.invoiceCount)
        return right.invoiceCount - left.invoiceCount;
    if (right.completenessScore !== left.completenessScore)
        return right.completenessScore - left.completenessScore;
    if (right.bookingCount !== left.bookingCount)
        return right.bookingCount - left.bookingCount;
    return left.id.localeCompare(right.id);
})[0];
const totalsFor = (records, canonical) => ({
    records: records.length,
    duplicateRecords: Math.max(0, records.length - 1),
    jobs: records.reduce((sum, record) => sum + record.bookingCount, 0),
    invoices: records.reduce((sum, record) => sum + record.invoiceCount, 0),
    linkedUsers: records.reduce((sum, record) => sum + record.linkedUserCount, 0),
    jobsToReassign: records.reduce((sum, record) => sum + (record.id === canonical?.id ? 0 : record.bookingCount), 0),
    invoicesToReassign: records.reduce((sum, record) => sum + (record.id === canonical?.id ? 0 : record.invoiceCount), 0),
    usersToReassign: records.reduce((sum, record) => sum + (record.id === canonical?.id ? 0 : record.linkedUserCount), 0),
});
const publicRecord = (record) => {
    const { nameKey: _nameKey, matchingNames: _matchingNames, aliasKeys: _aliasKeys, addressKey: _addressKey, phoneKeys: _phoneKeys, domainKeys: _domainKeys, sageKey: _sageKey, airtableKey: _airtableKey, ...visible } = record;
    return visible;
};
const fingerprintFor = (kind, records, recommendedClientId, eligibility) => stableHash({
    kind,
    recommendedClientId,
    eligibility,
    records: records.slice().sort((left, right) => left.id.localeCompare(right.id)).map(record => ({
        id: record.id,
        companyName: record.companyName,
        names: record.matchingNames,
        postcode: record.postcode,
        address: record.addressKey,
        phones: record.phoneKeys,
        domains: record.domainKeys,
        sage: record.sageKey,
        airtable: record.airtableKey,
        bookings: record.bookingCount,
        invoices: record.invoiceCount,
        users: record.linkedUserCount,
    })),
});
const buildOrganizationCandidates = (records) => {
    const unionFind = new UnionFind(records.length);
    for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
            if (shouldLinkOrganizations(signalsFor(records[leftIndex], records[rightIndex]))) {
                unionFind.union(leftIndex, rightIndex);
            }
        }
    }
    const components = new Map();
    records.forEach((record, position) => {
        const root = unionFind.find(position);
        components.set(root, [...(components.get(root) || []), record]);
    });
    return Array.from(components.values())
        .filter(component => component.length > 1)
        .map(component => {
        const sorted = component.slice().sort((left, right) => left.id.localeCompare(right.id));
        const canonical = chooseCanonical(sorted);
        const sageKeys = unique(sorted.map(record => record.sageKey));
        const airtableKeys = unique(sorted.map(record => record.airtableKey));
        const postcodes = unique(sorted.map(record => record.postcode));
        const nameKeys = unique(sorted.map(record => record.nameKey));
        const evidence = [
            ...duplicateEvidence(sorted, 'SAGE_ACCOUNT', 'Shared Sage account', 'STRONG', record => record.sageKey),
            ...duplicateEvidence(sorted, 'AIRTABLE_CLIENT_KEY', 'Shared Airtable client key', 'STRONG', record => record.airtableKey),
            ...duplicateEvidence(sorted, 'NAME_AND_POSTCODE', 'Same organisation and postcode', 'STRONG', record => record.nameKey && record.postcode ? `${record.nameKey} | ${record.postcode}` : ''),
            ...duplicateEvidence(sorted, 'COMPANY_NAME', 'Same normalised organisation name', 'SUPPORTING', record => record.nameKey),
            ...pairEvidence(sorted),
        ];
        const totals = totalsFor(sorted, canonical);
        const hasStrongEvidence = evidence.some(item => item.strength === 'STRONG');
        const sourceHasLinkedUser = totals.usersToReassign > 0;
        const hardConflicts = [
            sageKeys.length > 1 ? `Conflicting Sage references: ${sorted.map(record => record.sageAccountRef).filter(Boolean).join(', ')}` : '',
            sourceHasLinkedUser ? `${totals.usersToReassign} linked client user account${totals.usersToReassign === 1 ? '' : 's'} would change access scope.` : '',
        ].filter(Boolean);
        const reviewConflicts = [
            airtableKeys.length > 1 ? `${airtableKeys.length} Airtable client keys need canonical mapping.` : '',
            postcodes.length > 1 && sageKeys.length === 0 && airtableKeys.length !== 1 ? `Multiple postcodes: ${postcodes.join(', ')}` : '',
            !hasStrongEvidence ? 'Only supporting identity signals are available.' : '',
        ].filter(Boolean);
        const conflicts = [...hardConflicts, ...reviewConflicts];
        const executionEligibility = hardConflicts.length > 0
            ? 'BLOCKED'
            : reviewConflicts.length > 0 || totals.invoicesToReassign > 0
                ? 'REVIEW_REQUIRED'
                : 'READY';
        const confidence = hardConflicts.length > 0
            ? 'REVIEW'
            : hasStrongEvidence
                ? 'HIGH'
                : 'MEDIUM';
        const mergeRisk = executionEligibility === 'BLOCKED'
            ? 'HIGH'
            : executionEligibility === 'REVIEW_REQUIRED'
                ? 'MEDIUM'
                : 'LOW';
        conflicts.forEach(value => evidence.push({
            type: 'CONFLICT',
            label: hardConflicts.includes(value) ? 'Merge blocker' : 'Review required',
            value,
            strength: 'RISK',
        }));
        const recommendation = executionEligibility === 'BLOCKED'
            ? 'Resolve the financial identity or portal access blocker before preparing this merge.'
            : executionEligibility === 'REVIEW_REQUIRED'
                ? `Review the highlighted identity and financial differences. ${canonical.companyName} is the provisional canonical record.`
                : `This candidate is eligible for a reversible merge preview, with ${canonical.companyName} as the provisional canonical record.`;
        return {
            id: stableId('org', sorted.map(record => record.id)),
            fingerprint: fingerprintFor('ORGANIZATION', sorted, canonical.id, executionEligibility),
            kind: 'ORGANIZATION',
            label: canonical.companyName,
            confidence,
            mergeRisk,
            executionEligibility,
            evidence,
            conflicts,
            blockers: hardConflicts,
            recommendedClientId: canonical.id,
            recommendation,
            clientIds: sorted.map(record => record.id),
            departments: unique(sorted.map(record => record.departmentName)),
            records: sorted.map(publicRecord),
            totals,
        };
    })
        .sort((left, right) => {
        const eligibilityRank = { BLOCKED: 0, REVIEW_REQUIRED: 1, READY: 2 };
        return eligibilityRank[left.executionEligibility] - eligibilityRank[right.executionEligibility]
            || right.totals.jobs - left.totals.jobs
            || left.label.localeCompare(right.label);
    });
};
const buildAgentCandidates = (records) => {
    const emailIndex = new Map();
    records.forEach(record => {
        record.contactEmails.forEach(email => {
            emailIndex.set(email, [...(emailIndex.get(email) || []), record]);
        });
    });
    return Array.from(emailIndex.entries())
        .filter(([, matches]) => new Set(matches.map(record => record.id)).size > 1)
        .map(([email, matches]) => {
        const sorted = Array.from(new Map(matches.map(record => [record.id, record])).values())
            .sort((left, right) => left.id.localeCompare(right.id));
        const sharedMailbox = isSharedMailbox(email);
        const names = unique(sorted.map(record => record.contactPerson));
        const label = names.length === 1 ? names[0] : email;
        const evidence = [{
                type: 'CONTACT_EMAIL',
                label: 'Same contact or booking email',
                value: email,
                strength: 'STRONG',
            }];
        if (sharedMailbox)
            evidence.push({
                type: 'SHARED_MAILBOX',
                label: 'Shared mailbox pattern',
                value: email.split('@')[0],
                strength: 'RISK',
            });
        const conflicts = sharedMailbox
            ? ['This address appears to be a shared mailbox and must not be treated as one person automatically.']
            : names.length > 1
                ? [`Multiple contact names use this email: ${names.join(', ')}`]
                : [];
        const totals = totalsFor(sorted);
        const executionEligibility = sharedMailbox ? 'BLOCKED' : 'REVIEW_REQUIRED';
        return {
            id: stableId('agent', [email]),
            fingerprint: fingerprintFor('AGENT', sorted, '', executionEligibility),
            kind: 'AGENT',
            label: label || email,
            confidence: sharedMailbox ? 'REVIEW' : 'HIGH',
            mergeRisk: sharedMailbox ? 'HIGH' : totals.linkedUsers > 1 || names.length > 1 ? 'MEDIUM' : 'LOW',
            executionEligibility,
            evidence,
            conflicts,
            blockers: sharedMailbox ? conflicts : [],
            recommendedClientId: '',
            recommendation: sharedMailbox
                ? 'Classify this address as a shared mailbox or split it into named agents. Do not merge organisations.'
                : `Create one agent identity for ${email} and retain a separate membership for every confirmed client or department.`,
            clientIds: sorted.map(record => record.id),
            departments: unique(sorted.map(record => record.departmentName)),
            records: sorted.map(publicRecord),
            totals,
        };
    })
        .sort((left, right) => {
        const riskRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return riskRank[left.mergeRisk] - riskRank[right.mergeRisk]
            || right.totals.records - left.totals.records
            || left.label.localeCompare(right.label);
    });
};
const buildClientIdentityAudit = (input) => {
    const mergedRecordsExcluded = input.clients.filter(client => (text(client.recordState).toUpperCase() === 'MERGED' || Boolean(text(client.mergedIntoClientId)))).length;
    const records = input.clients
        .filter(client => text(client.id))
        .filter(client => text(client.recordState).toUpperCase() !== 'MERGED' && !text(client.mergedIntoClientId))
        .map(client => prepareRecord(client, input));
    const organizationCandidates = buildOrganizationCandidates(records);
    const agentCandidates = buildAgentCandidates(records);
    const uniqueOrganizationRecords = new Set(organizationCandidates.flatMap(candidate => candidate.clientIds));
    const uniqueAgentRecords = new Set(agentCandidates.flatMap(candidate => candidate.clientIds));
    const affectedRecords = new Set([...uniqueOrganizationRecords, ...uniqueAgentRecords]);
    const recordsById = new Map(records.map(record => [record.id, record]));
    const departments = unique(records.map(record => (0, exports.normalizeOrganizationName)(record.departmentName)));
    return {
        generatedAt: input.generatedAt || new Date().toISOString(),
        readOnly: true,
        truncated: input.truncated === true,
        summary: {
            clientRecords: records.length,
            mergedRecordsExcluded,
            organizationCandidates: organizationCandidates.length,
            organizationRecordsInCandidates: uniqueOrganizationRecords.size,
            duplicateOrganizationRecords: organizationCandidates.reduce((sum, candidate) => sum + candidate.totals.duplicateRecords, 0),
            readyToMergeCandidates: organizationCandidates.filter(candidate => candidate.executionEligibility === 'READY').length,
            reviewRequiredCandidates: organizationCandidates.filter(candidate => candidate.executionEligibility === 'REVIEW_REQUIRED').length,
            blockedCandidates: organizationCandidates.filter(candidate => candidate.executionEligibility === 'BLOCKED').length,
            agentCandidates: agentCandidates.length,
            agentRecordsInCandidates: uniqueAgentRecords.size,
            duplicateAgentRecords: agentCandidates.reduce((sum, candidate) => sum + candidate.totals.duplicateRecords, 0),
            highRiskCandidates: [...organizationCandidates, ...agentCandidates].filter(candidate => candidate.mergeRisk === 'HIGH').length,
            departmentsDetected: departments.length,
            jobsAffected: Array.from(affectedRecords).reduce((sum, id) => sum + (recordsById.get(id)?.bookingCount || 0), 0),
            invoicesAffected: Array.from(affectedRecords).reduce((sum, id) => sum + (recordsById.get(id)?.invoiceCount || 0), 0),
            linkedUsersAffected: Array.from(affectedRecords).reduce((sum, id) => sum + (recordsById.get(id)?.linkedUserCount || 0), 0),
            recordsWithoutOrganizationIdentity: records.filter(record => !record.nameKey && !record.sageKey && !record.airtableKey).length,
        },
        organizationCandidates,
        agentCandidates,
    };
};
exports.buildClientIdentityAudit = buildClientIdentityAudit;
//# sourceMappingURL=clientIdentityAuditCore.js.map