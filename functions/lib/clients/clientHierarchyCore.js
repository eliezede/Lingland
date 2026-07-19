"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClientHierarchySeedPreview = void 0;
const node_crypto_1 = require("node:crypto");
const clientIdentityAuditCore_1 = require("./clientIdentityAuditCore");
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
const SHARED_MAILBOX_PATTERNS = [
    'allocatedtrial',
    'allocation',
    'businesssupport',
    'caseprogression',
    'crew',
    'gateway',
    'referral',
    'support',
    'trials',
    'wcu',
];
const DEPARTMENT_WORDS = new Set([
    'branch',
    'clinic',
    'department',
    'dept',
    'office',
    'service',
    'team',
    'unit',
    'ward',
]);
const ORGANIZATION_DESCRIPTOR_WORDS = new Set([
    'council',
    'foundation',
    'hospital',
    'hospitals',
    'nhs',
    'school',
    'solicitor',
    'solicitors',
    'trust',
    'university',
]);
const ORGANIZATION_ALIAS_WORDS = new Set([
    'and',
    'group',
    'limited',
    'llp',
    'ltd',
    'plc',
    'the',
]);
const DEPARTMENT_SYNONYMS = {
    criminal: 'crime',
    childrens: 'child',
    children: 'child',
    paediatric: 'pediatric',
};
const GENERIC_DEPARTMENT_KEYS = new Set(['', 'main', 'unknown', 'not provided', 'address pending update']);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values) => Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
const stableId = (prefix, value) => `${prefix}_${(0, node_crypto_1.createHash)('sha1').update(value).digest('hex').slice(0, 20)}`;
const isSharedMailbox = (email) => {
    const localPart = (email.split('@')[0] || '').toLowerCase();
    const compact = localPart.replace(/[^a-z0-9]/g, '');
    return SHARED_MAILBOX_LOCAL_PARTS.has(localPart)
        || Array.from(SHARED_MAILBOX_LOCAL_PARTS).some(pattern => compact.includes(pattern))
        || SHARED_MAILBOX_PATTERNS.some(pattern => compact.includes(pattern));
};
const titleCase = (value) => value.replace(/\b\w/g, character => character.toUpperCase());
const departmentFamilyKey = (value) => {
    const tokens = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(value).split(' ').filter(Boolean)
        .filter(token => !DEPARTMENT_WORDS.has(token))
        .map(token => DEPARTMENT_SYNONYMS[token] || token);
    return tokens.join(' ') || (0, clientIdentityAuditCore_1.normalizeOrganizationName)(value);
};
const commonPrefixLength = (left, right) => {
    let length = 0;
    while (length < left.length && length < right.length && left[length] === right[length])
        length += 1;
    return length;
};
const inferDepartmentFromOrganisationVariant = (document, canonicalDocument) => {
    if (document.id === canonicalDocument.id)
        return null;
    const sourceCompanyValue = text(document.data.companyName);
    const canonicalCompanyValue = text(canonicalDocument.data.companyName);
    const sourceTokens = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(sourceCompanyValue).split(' ').filter(Boolean);
    const canonicalTokens = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(canonicalCompanyValue).split(' ').filter(Boolean);
    if (sourceTokens.length === 0 || canonicalTokens.length === 0)
        return null;
    const canonicalTokenCounts = new Map();
    canonicalTokens.forEach(token => canonicalTokenCounts.set(token, (canonicalTokenCounts.get(token) || 0) + 1));
    const extraTokens = sourceTokens.filter(token => {
        const available = canonicalTokenCounts.get(token) || 0;
        if (available > 0) {
            canonicalTokenCounts.set(token, available - 1);
            return false;
        }
        return !ORGANIZATION_ALIAS_WORDS.has(token) && !ORGANIZATION_DESCRIPTOR_WORDS.has(token);
    });
    const sourceCore = sourceTokens.filter(token => !ORGANIZATION_ALIAS_WORDS.has(token));
    const canonicalCore = new Set(canonicalTokens.filter(token => !ORGANIZATION_ALIAS_WORDS.has(token)));
    const sharedCoreTokens = sourceCore.filter(token => canonicalCore.has(token)).length;
    const requiredSharedTokens = Math.min(2, canonicalCore.size);
    const hasUnitDelimiter = /[-,:/()]/.test(sourceCompanyValue);
    const hasStructuralWord = sourceTokens.some(token => DEPARTMENT_WORDS.has(token));
    if (hasUnitDelimiter && sharedCoreTokens >= 1) {
        const unitSegment = sourceCompanyValue
            .split(/\s*[-,:/()]\s*/)
            .map(segment => segment.trim())
            .filter(Boolean)
            .find(segment => {
            const segmentTokens = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(segment).split(' ').filter(Boolean);
            return segmentTokens.some(token => DEPARTMENT_WORDS.has(token))
                && segmentTokens.some(token => !canonicalCore.has(token) && !DEPARTMENT_WORDS.has(token));
        });
        if (unitSegment)
            return {
                name: titleCase(unitSegment),
                normalizedName: departmentFamilyKey(unitSegment),
                confidence: 'INFERRED',
                evidence: ['Organisation label separates an operating unit from its institution'],
            };
    }
    if (extraTokens.length === 0
        || extraTokens.length > 4
        || sharedCoreTokens < requiredSharedTokens
        || (!hasUnitDelimiter && !hasStructuralWord))
        return null;
    const name = titleCase(extraTokens.join(' '));
    return {
        name,
        normalizedName: departmentFamilyKey(name),
        confidence: 'INFERRED',
        evidence: ['Organisation variant adds an operating site or unit'],
    };
};
const inferDepartment = (document, canonicalDocument) => {
    const source = document.data;
    const explicit = [text(source.departmentName), text(source.locationName)]
        .find(value => !GENERIC_DEPARTMENT_KEYS.has((0, clientIdentityAuditCore_1.normalizeOrganizationName)(value)));
    if (explicit)
        return {
            name: explicit,
            normalizedName: (0, clientIdentityAuditCore_1.normalizeOrganizationName)(explicit),
            confidence: 'EXPLICIT',
            evidence: ['Explicit department or location field'],
        };
    const organisationVariant = inferDepartmentFromOrganisationVariant(document, canonicalDocument);
    if (organisationVariant)
        return organisationVariant;
    const companyKey = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(source.companyName);
    const sourceKeyValue = text(source.airtableClientKey || source.sourceKey);
    const sourceKey = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(sourceKeyValue);
    let remainder = sourceKey.startsWith(`${companyKey} `) ? sourceKey.slice(companyKey.length).trim() : '';
    let evidence = sourceKeyValue ? 'Airtable client key extends the organisation name' : '';
    if (!remainder && companyKey && sourceKey) {
        const companyTokens = companyKey.split(' ').filter(Boolean);
        const sourceTokens = sourceKey.split(' ').filter(Boolean);
        const prefixLength = commonPrefixLength(companyTokens, sourceTokens);
        const requiredPrefix = Math.min(2, companyTokens.filter(token => !ORGANIZATION_DESCRIPTOR_WORDS.has(token)).length);
        if (requiredPrefix > 0 && prefixLength >= requiredPrefix) {
            remainder = sourceTokens.slice(prefixLength)
                .filter(token => !ORGANIZATION_DESCRIPTOR_WORDS.has(token))
                .join(' ');
            evidence = 'Airtable client key shares the organisation root and adds an operating unit';
        }
    }
    if (!remainder && companyKey) {
        const documentKey = (0, clientIdentityAuditCore_1.normalizeOrganizationName)(document.id.replace(/^airtable_client_/i, '').replace(/[-_]+/g, ' '));
        if (documentKey.startsWith(`${companyKey} `)) {
            remainder = documentKey.slice(companyKey.length).trim();
            evidence = 'Legacy client identifier extends the organisation name';
        }
    }
    const remainderTokens = remainder.split(' ').filter(Boolean);
    const hasStructuralWord = remainderTokens.some(token => DEPARTMENT_WORDS.has(token));
    const hasSourceDelimiter = /[,(/]|\s[-:]\s/.test(sourceKeyValue);
    if (GENERIC_DEPARTMENT_KEYS.has(remainder)
        || remainderTokens.length === 0
        || (!hasStructuralWord && !hasSourceDelimiter))
        return null;
    return {
        name: titleCase(remainder),
        normalizedName: departmentFamilyKey(remainder),
        confidence: 'INFERRED',
        evidence: [evidence],
    };
};
const preferredName = (names, email, sharedMailbox) => {
    if (sharedMailbox)
        return titleCase(email.split('@')[0].replace(/[._-]+/g, ' '));
    const nonMailboxName = names.find(name => !SHARED_MAILBOX_LOCAL_PARTS.has(name.toLowerCase().replace(/[^a-z]/g, '')));
    if (nonMailboxName)
        return nonMailboxName;
    if (names[0])
        return names[0];
    return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
};
const addAgentEvidence = (index, sourceClientId, emails, name, phone, role, sharedMailboxHints = new Set()) => {
    emails.forEach(email => {
        const normalizedEmail = email.toLowerCase();
        const entry = index.get(normalizedEmail) || {
            email: normalizedEmail,
            names: new Set(),
            phones: new Set(),
            roles: new Set(),
            sourceClientIds: new Set(),
            sharedMailboxHint: false,
        };
        if (name)
            entry.names.add(name);
        if (phone)
            entry.phones.add(phone);
        entry.roles.add(role);
        entry.sourceClientIds.add(sourceClientId);
        if (sharedMailboxHints.has(normalizedEmail))
            entry.sharedMailboxHint = true;
        index.set(normalizedEmail, entry);
    });
};
const buildClientHierarchySeedPreview = (documents, canonicalClientId) => {
    if (!documents.some(document => document.id === canonicalClientId)) {
        throw new Error('The canonical client must belong to the hierarchy source documents.');
    }
    const canonicalDocument = documents.find(document => document.id === canonicalClientId);
    const agentIndex = new Map();
    const operationalEmailsBySource = new Map();
    const unresolvedContacts = [];
    const departmentIndex = new Map();
    documents.forEach(document => {
        const source = document.data;
        const requesterName = text(source.bookingContactName || source.contactPerson);
        const requesterEmails = unique([
            ...(0, clientIdentityAuditCore_1.extractClientEmails)(source.bookingEmail),
            ...(0, clientIdentityAuditCore_1.extractClientEmails)(source.email),
        ]);
        const requesterPhone = (0, clientIdentityAuditCore_1.normalizeClientPhone)(source.bookingPhone || source.phone);
        const financeName = text(source.invoiceContact);
        const financeEmails = (0, clientIdentityAuditCore_1.extractClientEmails)(source.invoiceEmail);
        const financePhone = (0, clientIdentityAuditCore_1.normalizeClientPhone)(source.invoicePhone);
        const department = inferDepartment(document, canonicalDocument);
        const departmentKey = department?.normalizedName.replace(/[^a-z0-9]/g, '') || '';
        const requesterMailboxHints = new Set(requesterEmails.filter(email => {
            const localPart = (email.split('@')[0] || '').replace(/[^a-z0-9]/g, '');
            return departmentKey.length >= 4 && localPart.includes(departmentKey);
        }));
        if (department) {
            const existing = departmentIndex.get(department.normalizedName) || {
                name: department.name,
                confidence: department.confidence,
                sourceClientIds: new Set(),
                evidence: new Set(),
            };
            existing.sourceClientIds.add(document.id);
            department.evidence.forEach(value => existing.evidence.add(value));
            if (department.confidence === 'EXPLICIT')
                existing.confidence = 'EXPLICIT';
            departmentIndex.set(department.normalizedName, existing);
        }
        operationalEmailsBySource.set(document.id, requesterEmails);
        addAgentEvidence(agentIndex, document.id, requesterEmails, requesterName, requesterPhone, 'REQUESTER', requesterMailboxHints);
        addAgentEvidence(agentIndex, document.id, financeEmails, financeName, financePhone, 'FINANCE');
        if (requesterName && requesterEmails.length === 0)
            unresolvedContacts.push({
                sourceClientId: document.id,
                name: requesterName,
                role: 'REQUESTER',
                reason: 'No valid requester email is available for deterministic identity.',
            });
        if (financeName && financeEmails.length === 0)
            unresolvedContacts.push({
                sourceClientId: document.id,
                name: financeName,
                role: 'FINANCE',
                reason: 'No valid finance email is available for deterministic identity.',
            });
    });
    const agents = Array.from(agentIndex.values()).map(entry => {
        const names = unique(Array.from(entry.names));
        const roles = Array.from(entry.roles).sort();
        const sharedMailbox = entry.sharedMailboxHint || isSharedMailbox(entry.email);
        return {
            id: stableId('client_agent', entry.email),
            email: entry.email,
            normalizedEmail: entry.email,
            displayName: preferredName(names, entry.email, sharedMailbox),
            names,
            phoneNumbers: unique(Array.from(entry.phones)),
            agentType: sharedMailbox ? 'SHARED_MAILBOX' : 'PERSON',
            roles,
            sourceClientIds: unique(Array.from(entry.sourceClientIds)),
        };
    }).sort((left, right) => left.email.localeCompare(right.email));
    const agentsByEmail = new Map(agents.map(agent => [agent.normalizedEmail, agent]));
    const departments = Array.from(departmentIndex.entries()).map(([normalizedName, entry]) => ({
        id: stableId('client_department', `${canonicalClientId}|${normalizedName}`),
        clientId: canonicalClientId,
        name: entry.name,
        normalizedName,
        confidence: entry.confidence,
        sourceClientIds: unique(Array.from(entry.sourceClientIds)),
        evidence: unique(Array.from(entry.evidence)),
    })).sort((left, right) => left.name.localeCompare(right.name));
    const departmentBySourceClientId = Object.fromEntries(departments.flatMap(department => (department.sourceClientIds.map(sourceClientId => [sourceClientId, department.id]))));
    const memberships = agents.map(agent => ({
        id: stableId('client_membership', `${canonicalClientId}|${agent.id}`),
        clientId: canonicalClientId,
        agentId: agent.id,
        accessLevel: agent.roles.includes('FINANCE') ? 'CLIENT_FINANCE' : 'AGENT',
        roles: agent.roles,
        departmentIds: unique(agent.sourceClientIds.map(sourceClientId => departmentBySourceClientId[sourceClientId])),
        sourceClientIds: agent.sourceClientIds,
    }));
    const bookingAgentBySourceClientId = {};
    operationalEmailsBySource.forEach((emails, sourceClientId) => {
        const requesterAgents = unique(emails)
            .map(email => agentsByEmail.get(email))
            .filter((agent) => Boolean(agent) && agent?.agentType === 'PERSON');
        if (requesterAgents.length === 1)
            bookingAgentBySourceClientId[sourceClientId] = requesterAgents[0].id;
    });
    return {
        canonicalClientId,
        departments,
        agents,
        memberships,
        departmentBySourceClientId,
        bookingAgentBySourceClientId,
        unresolvedContacts,
        totals: {
            departments: departments.length,
            agents: agents.length,
            memberships: memberships.length,
            sharedMailboxes: agents.filter(agent => agent.agentType === 'SHARED_MAILBOX').length,
            sourceRecordsWithDepartment: Object.keys(departmentBySourceClientId).length,
            sourceRecordsWithBookingAgent: Object.keys(bookingAgentBySourceClientId).length,
            unresolvedContacts: unresolvedContacts.length,
        },
    };
};
exports.buildClientHierarchySeedPreview = buildClientHierarchySeedPreview;
//# sourceMappingURL=clientHierarchyCore.js.map