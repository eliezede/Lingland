"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveClientIdentity = exports.isPlaceholderClientIdentity = void 0;
const stringValue = (value) => String(value ?? '').trim();
const arrayValues = (value) => Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : [];
const normalizeToken = (value) => stringValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
const PLACEHOLDER_NAMES = new Set([
    'airtableclient',
    'translationclient',
    'unknownclient',
    'client',
    'na',
]);
const isPlaceholderClientIdentity = (clientId, data = {}) => {
    const normalizedId = normalizeToken(clientId.replace(/^airtable_client_/i, ''));
    const normalizedName = normalizeToken(data.companyName || data.clientName || data.normalizedCompanyName);
    return PLACEHOLDER_NAMES.has(normalizedId) || PLACEHOLDER_NAMES.has(normalizedName);
};
exports.isPlaceholderClientIdentity = isPlaceholderClientIdentity;
const unique = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const canonicalResolver = (clients) => {
    const byId = new Map(clients.map(client => [client.id, client]));
    const resolve = (id) => {
        let currentId = id;
        for (let depth = 0; currentId && depth < 8; depth += 1) {
            const current = byId.get(currentId);
            if (!current)
                return '';
            const nextId = stringValue(current.data.mergedIntoClientId);
            if (!nextId || nextId === currentId)
                return currentId;
            currentId = nextId;
        }
        return '';
    };
    return { byId, resolve };
};
const addIndexValue = (index, value, clientId) => {
    if (!value)
        return;
    const ids = index.get(value) || new Set();
    ids.add(clientId);
    index.set(value, ids);
};
const valuesFromFields = (data, fields) => fields
    .flatMap(field => [stringValue(data[field]), ...arrayValues(data[field])])
    .filter(Boolean);
const invalidClientIdKey = (clientId) => {
    if (!clientId.toLowerCase().startsWith('airtable_client_'))
        return '';
    return normalizeToken(clientId.slice('airtable_client_'.length));
};
const referenceAccountKey = (value) => {
    const raw = stringValue(value)
        .replace(/^airtable_(translation_)?client_invoice_/i, '')
        .replace(/^airtable[-_ ]?(tr[-_ ]?)?inv[-_ ]?/i, '');
    const match = raw.match(/^([a-z]{2,}[a-z0-9]*)(?:[-_/ ]|$)/i);
    if (!match)
        return '';
    const normalized = normalizeToken(match[1]);
    return ['airtable', 'invoice', 'inv', 'translation'].includes(normalized) ? '' : normalized;
};
const resolveClientIdentity = (record, clients) => {
    const { byId, resolve } = canonicalResolver(clients);
    const requestedClientId = stringValue(record.data.clientId);
    const existingClientId = resolve(requestedClientId);
    if (existingClientId && !(0, exports.isPlaceholderClientIdentity)(existingClientId, byId.get(existingClientId)?.data)) {
        return {
            status: 'RESOLVED',
            clientId: existingClientId,
            confidence: 'HIGH',
            method: 'ACCOUNT_KEY',
            evidence: [existingClientId === requestedClientId ? 'Existing client ID' : 'Merged client redirect'],
            candidateClientIds: [existingClientId],
        };
    }
    const keyIndex = new Map();
    const nameIndex = new Map();
    clients.forEach(client => {
        const canonicalId = resolve(client.id);
        if (!canonicalId)
            return;
        const canonical = byId.get(canonicalId) || client;
        if ((0, exports.isPlaceholderClientIdentity)(canonicalId, canonical.data))
            return;
        const combined = { ...client.data, ...canonical.data };
        valuesFromFields(combined, [
            'sageAccountRef', 'airtableClientKey', 'sourceKey', 'clientKey', 'accountCode', 'accountRef', 'accountAliases',
        ]).forEach(value => addIndexValue(keyIndex, normalizeToken(value), canonicalId));
        valuesFromFields(combined, [
            'companyName', 'normalizedCompanyName', 'organisationName', 'organizationName', 'companyAliases',
        ]).forEach(value => {
            const normalized = normalizeToken(value);
            if (!PLACEHOLDER_NAMES.has(normalized))
                addIndexValue(nameIndex, normalized, canonicalId);
        });
    });
    const keySignals = unique([
        invalidClientIdKey(requestedClientId),
        referenceAccountKey(record.id),
        ...valuesFromFields(record.data, ['invoiceNumber', 'reference', 'legacyRef']).map(referenceAccountKey),
        ...valuesFromFields(record.data, [
            'sageAccountRef', 'airtableClientKey', 'sourceKey', 'clientKey', 'clientAccountRef', 'accountCode', 'accountRef',
        ]).map(normalizeToken),
    ]);
    const nameSignals = unique(valuesFromFields(record.data, [
        'clientName', 'companyName', 'organisationName', 'organizationName', 'accountName',
    ]).map(normalizeToken).filter(value => !PLACEHOLDER_NAMES.has(value)));
    const methods = [
        { method: 'ACCOUNT_KEY', confidence: 'HIGH', index: keyIndex, signals: keySignals, label: 'Exact account key' },
        { method: 'EXACT_NAME', confidence: 'MEDIUM', index: nameIndex, signals: nameSignals, label: 'Exact canonical name' },
    ];
    for (const method of methods) {
        const matchedSignals = method.signals.filter(signal => method.index.has(signal));
        const candidates = unique(matchedSignals.flatMap(signal => Array.from(method.index.get(signal) || [])));
        if (candidates.length === 1) {
            return {
                status: 'RESOLVED',
                clientId: candidates[0],
                confidence: method.confidence,
                method: method.method,
                evidence: matchedSignals.map(signal => `${method.label}: ${signal}`),
                candidateClientIds: candidates,
            };
        }
        if (candidates.length > 1) {
            return {
                status: 'AMBIGUOUS',
                confidence: method.confidence,
                method: method.method,
                evidence: matchedSignals.map(signal => `${method.label}: ${signal}`),
                candidateClientIds: candidates,
            };
        }
    }
    return {
        status: 'UNMATCHED',
        evidence: [],
        candidateClientIds: [],
    };
};
exports.resolveClientIdentity = resolveClientIdentity;
//# sourceMappingURL=clientIdentityResolution.js.map