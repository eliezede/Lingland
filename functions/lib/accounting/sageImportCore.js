"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashSageBatch = exports.isSageImportModule = exports.validateSageImportManifest = exports.normalizeSageImportRecord = exports.stableSageId = exports.normalizedName = exports.text = exports.SAGE_IMPORT_MODULES = exports.SAGE_IMPORT_SCHEMA = void 0;
const node_crypto_1 = require("node:crypto");
exports.SAGE_IMPORT_SCHEMA = 'lingland.sage-xero.v1';
exports.SAGE_IMPORT_MODULES = [
    'contacts',
    'accounts',
    'bankAccounts',
    'salesDocuments',
    'purchaseDocuments',
    'customerPayments',
    'supplierPayments',
    'bankJournalEntries',
    'sourceArtifacts',
];
const MODULE_SET = new Set(exports.SAGE_IMPORT_MODULES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
const text = (value, max = 500) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
exports.text = text;
const normalizedName = (value) => (0, exports.text)(value, 200)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
exports.normalizedName = normalizedName;
const stableSageId = (prefix, value) => (`${prefix}_${(0, node_crypto_1.createHash)('sha256').update((0, exports.text)(value, 2000)).digest('hex').slice(0, 24)}`);
exports.stableSageId = stableSageId;
const finite = (value, fallback = 0) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : fallback;
};
const optionalDate = (value) => {
    const clean = (0, exports.text)(value, 40);
    return clean && DATE_PATTERN.test(clean) ? clean : null;
};
const strings = (value, maxItems = 20) => {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value.map(item => (0, exports.text)(item, 500)).filter(Boolean))).slice(0, maxItems);
};
const cleanObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const normalizeSource = (record, datasetId) => {
    const id = (0, exports.text)(record.id, 160);
    const sourceRecordId = (0, exports.text)(record.sourceRecordId || record.recordUuid || id, 200);
    const sourceRecordHash = (0, exports.text)(record.sourceRecordHash || record.recordSha256, 64).toLowerCase();
    const sourceTable = (0, exports.text)(record.sourceTable, 120);
    if (!ID_PATTERN.test(id))
        throw new Error('Every Sage record requires a stable, safe id.');
    if (!sourceRecordId)
        throw new Error(`Sage record ${id} has no source record id.`);
    if (!HASH_PATTERN.test(sourceRecordHash))
        throw new Error(`Sage record ${id} has an invalid SHA-256 hash.`);
    if (!sourceTable)
        throw new Error(`Sage record ${id} has no source table.`);
    return {
        id,
        sourceSystem: 'SAGE',
        sourceDatasetId: datasetId,
        sourceRecordId,
        sourceRecordHash,
        sourceTable,
    };
};
const normalizeContact = (record, datasetId) => {
    const source = normalizeSource(record, datasetId);
    const contactType = (0, exports.text)(record.contactType, 20).toUpperCase();
    const sageAccountRef = (0, exports.text)(record.sageAccountRef, 80).toUpperCase();
    const name = (0, exports.text)(record.name, 200);
    if (!['CUSTOMER', 'SUPPLIER'].includes(contactType) || !sageAccountRef || !name) {
        throw new Error(`Sage contact ${source.id} is missing type, account reference or name.`);
    }
    return {
        ...source,
        contactType,
        sageAccountRef,
        xeroAccountNumber: (0, exports.text)(record.xeroAccountNumber || sageAccountRef, 80).toUpperCase(),
        name,
        normalizedName: (0, exports.normalizedName)(record.normalizedName || name),
        identityStatus: (0, exports.text)(record.identityStatus || 'SOURCE_PROVIDED', 40).toUpperCase(),
        identityReviewReason: (0, exports.text)(record.identityReviewReason, 120).toUpperCase(),
        contactName: (0, exports.text)(record.contactName, 160),
        emails: strings(record.emails, 12).map(email => email.toLowerCase()),
        phones: strings(record.phones, 8),
        addressLines: strings(record.addressLines, 8),
        postcode: (0, exports.text)(record.postcode, 24).toUpperCase(),
        paymentTermsDays: Math.max(0, Math.min(365, Math.trunc(finite(record.paymentTermsDays, 30)))),
        defaultAccountCode: (0, exports.text)(record.defaultAccountCode, 20),
        currency: (0, exports.text)(record.currency || 'GBP', 8).toUpperCase(),
        platformLinkStatus: 'UNRESOLVED',
        xeroContactId: null,
        xeroSyncStatus: 'NOT_SYNCED',
    };
};
const normalizeLine = (value, index) => {
    const line = cleanObject(value);
    const quantity = finite(line.quantity, 1);
    const unitAmount = finite(line.unitAmount);
    const netAmount = finite(line.netAmount, quantity * unitAmount);
    const taxAmount = finite(line.taxAmount);
    return {
        id: (0, exports.text)(line.id, 160) || `line_${index + 1}`,
        sequence: Math.max(1, Math.trunc(finite(line.sequence, index + 1))),
        itemCode: (0, exports.text)(line.itemCode, 80),
        description: (0, exports.text)(line.description, 1000),
        quantity,
        unitAmount,
        netAmount,
        taxAmount,
        grossAmount: finite(line.grossAmount, netAmount + taxAmount),
        accountCode: (0, exports.text)(line.accountCode, 20),
        taxRate: finite(line.taxRate),
        xeroTaxType: (0, exports.text)(line.xeroTaxType, 80),
        serviceCategory: (0, exports.text)(line.serviceCategory, 40).toUpperCase() || 'OTHER',
        lineStatus: (0, exports.text)(line.lineStatus, 40).toUpperCase() || 'INCLUDED',
        includedInTotals: line.includedInTotals !== false,
    };
};
const normalizeDocument = (record, datasetId, direction) => {
    const source = normalizeSource(record, datasetId);
    const documentType = (0, exports.text)(record.documentType, 40).toUpperCase();
    const documentNumber = (0, exports.text)(record.documentNumber, 120);
    const sageAccountRef = (0, exports.text)(record.sageAccountRef, 80).toUpperCase();
    if (!documentType || !documentNumber || !sageAccountRef) {
        throw new Error(`Accounting document ${source.id} is missing type, number or account reference.`);
    }
    const netAmount = finite(record.netAmount);
    const taxAmount = finite(record.taxAmount);
    const grossAmount = finite(record.grossAmount, netAmount + taxAmount);
    const amountPaid = finite(record.amountPaid);
    const outstandingAmount = finite(record.outstandingAmount, grossAmount - amountPaid);
    return {
        ...source,
        direction,
        documentType,
        documentNumber,
        externalAccountingNumber: (0, exports.text)(record.externalAccountingNumber
            || (direction === 'RECEIVABLE' ? documentNumber : ''), 140),
        sourceAuditNumber: (0, exports.text)(record.sourceAuditNumber || record.sageAuditNumber, 80),
        sageAccountRef,
        sourceSageAccountRef: (0, exports.text)(record.sourceSageAccountRef || sageAccountRef, 80).toUpperCase(),
        accountingContactId: (0, exports.text)(record.accountingContactId, 160),
        contactName: (0, exports.text)(record.contactName, 200),
        reference: (0, exports.text)(record.reference, 240),
        description: (0, exports.text)(record.description, 1000),
        issueDate: optionalDate(record.issueDate),
        dueDate: optionalDate(record.dueDate),
        currency: (0, exports.text)(record.currency || 'GBP', 8).toUpperCase(),
        netAmount,
        taxAmount,
        grossAmount,
        amountPaid,
        outstandingAmount,
        settlementStatus: (0, exports.text)(record.settlementStatus, 40).toUpperCase() || 'UNKNOWN',
        accountingStatus: (0, exports.text)(record.accountingStatus, 40).toUpperCase() || 'HISTORICAL',
        migrationDisposition: (0, exports.text)(record.migrationDisposition, 60).toUpperCase() || 'HISTORICAL_ARCHIVE',
        xeroSyncStatus: (0, exports.text)(record.xeroSyncStatus, 40).toUpperCase() || 'NOT_SYNCED',
        xeroDocumentId: null,
        bookingReferences: strings(record.bookingReferences, 30),
        language: (0, exports.text)(record.language, 100),
        preparedBy: (0, exports.text)(record.preparedBy, 120),
        lines: Array.isArray(record.lines) ? record.lines.slice(0, 250).map(normalizeLine) : [],
    };
};
const normalizePayment = (record, datasetId, direction) => {
    const source = normalizeSource(record, datasetId);
    const sageAccountRef = (0, exports.text)(record.sageAccountRef, 80).toUpperCase();
    const amount = finite(record.amount);
    if (!sageAccountRef)
        throw new Error(`Accounting payment ${source.id} has no account reference.`);
    return {
        ...source,
        direction,
        paymentType: (0, exports.text)(record.paymentType, 40).toUpperCase() || (direction === 'INBOUND' ? 'RECEIPT' : 'PAYMENT'),
        sageAccountRef,
        sourceSageAccountRef: (0, exports.text)(record.sourceSageAccountRef || sageAccountRef, 80).toUpperCase(),
        accountingContactId: (0, exports.text)(record.accountingContactId, 160),
        reference: (0, exports.text)(record.reference, 240),
        details: (0, exports.text)(record.details, 1000),
        transactionDate: optionalDate(record.transactionDate),
        postingDate: optionalDate(record.postingDate),
        amount,
        allocatedAmount: finite(record.allocatedAmount),
        outstandingAmount: finite(record.outstandingAmount),
        currency: (0, exports.text)(record.currency || 'GBP', 8).toUpperCase(),
        nominalOrBankCode: (0, exports.text)(record.nominalOrBankCode, 40),
        settlementStatus: (0, exports.text)(record.settlementStatus, 40).toUpperCase() || 'UNKNOWN',
        xeroSyncStatus: 'NOT_SYNCED',
        xeroPaymentId: null,
    };
};
const normalizeSageImportRecord = (module, value, datasetId) => {
    const record = cleanObject(value);
    if (module === 'contacts')
        return normalizeContact(record, datasetId);
    if (module === 'salesDocuments')
        return normalizeDocument(record, datasetId, 'RECEIVABLE');
    if (module === 'purchaseDocuments')
        return normalizeDocument(record, datasetId, 'PAYABLE');
    if (module === 'customerPayments')
        return normalizePayment(record, datasetId, 'INBOUND');
    if (module === 'supplierPayments')
        return normalizePayment(record, datasetId, 'OUTBOUND');
    const source = normalizeSource(record, datasetId);
    if (module === 'accounts') {
        const code = (0, exports.text)(record.code, 20);
        const name = (0, exports.text)(record.name, 200);
        if (!code || !name)
            throw new Error(`Nominal account ${source.id} is missing code or name.`);
        return {
            ...source,
            code,
            name,
            accountType: (0, exports.text)(record.accountType, 40) || 'UNMAPPED',
            mappingStatus: (0, exports.text)(record.mappingStatus || 'UNMAPPED', 40).toUpperCase(),
            mappingReviewReason: (0, exports.text)(record.mappingReviewReason, 120).toUpperCase(),
            xeroAccountId: null,
            xeroSyncStatus: 'NOT_SYNCED',
        };
    }
    if (module === 'bankAccounts') {
        return {
            ...source,
            nominalCode: (0, exports.text)(record.nominalCode, 20),
            name: (0, exports.text)(record.name, 200),
            accountNumberMasked: (0, exports.text)(record.accountNumberMasked, 20),
            sortCodeMasked: (0, exports.text)(record.sortCodeMasked, 20),
            xeroBankAccountId: null,
            xeroSyncStatus: 'NOT_SYNCED',
        };
    }
    if (module === 'bankJournalEntries') {
        return {
            ...source,
            entryType: (0, exports.text)(record.entryType, 40).toUpperCase(),
            accountRef: (0, exports.text)(record.accountRef, 80).toUpperCase(),
            nominalOrBankCode: (0, exports.text)(record.nominalOrBankCode, 40),
            reference: (0, exports.text)(record.reference, 240),
            details: (0, exports.text)(record.details, 1000),
            transactionDate: optionalDate(record.transactionDate),
            postingDate: optionalDate(record.postingDate),
            netAmount: finite(record.netAmount),
            taxAmount: finite(record.taxAmount),
            grossAmount: finite(record.grossAmount),
            xeroSyncStatus: 'NOT_SYNCED',
        };
    }
    return {
        ...source,
        fileName: (0, exports.text)(record.fileName, 260),
        sizeBytes: Math.max(0, Math.trunc(finite(record.sizeBytes))),
        sha256: (0, exports.text)(record.sha256, 64).toLowerCase(),
        recordCount: Math.max(0, Math.trunc(finite(record.recordCount))),
        storageStatus: (0, exports.text)(record.storageStatus, 40) || 'LOCAL_VALIDATED_SOURCE',
    };
};
exports.normalizeSageImportRecord = normalizeSageImportRecord;
const validateSageImportManifest = (value) => {
    const manifest = cleanObject(value);
    const schemaVersion = (0, exports.text)(manifest.schemaVersion, 80);
    const datasetId = (0, exports.text)(manifest.datasetId, 120);
    const manifestHash = (0, exports.text)(manifest.manifestHash, 64).toLowerCase();
    const generatedAt = (0, exports.text)(manifest.generatedAt, 60);
    const sourceAsOf = (0, exports.text)(manifest.sourceAsOf, 40);
    if (schemaVersion !== exports.SAGE_IMPORT_SCHEMA)
        throw new Error(`Unsupported Sage import schema: ${schemaVersion || 'missing'}.`);
    if (!ID_PATTERN.test(datasetId))
        throw new Error('The Sage dataset id is invalid.');
    if (!HASH_PATTERN.test(manifestHash))
        throw new Error('The Sage manifest hash is invalid.');
    const rawCounts = cleanObject(manifest.expectedModuleCounts);
    const expectedModuleCounts = {};
    for (const [key, rawCount] of Object.entries(rawCounts)) {
        if (!MODULE_SET.has(key))
            throw new Error(`Unsupported Sage import module: ${key}.`);
        expectedModuleCounts[key] = Math.max(0, Math.trunc(finite(rawCount)));
    }
    if (!Object.keys(expectedModuleCounts).length)
        throw new Error('The Sage import manifest has no modules.');
    const validation = cleanObject(manifest.validationSummary);
    const rawScope = cleanObject(manifest.scope);
    const scope = rawScope.kind || rawScope.fromDate || rawScope.toDate
        ? {
            kind: (0, exports.text)(rawScope.kind, 80),
            fromDate: (0, exports.text)(rawScope.fromDate, 10),
            toDate: (0, exports.text)(rawScope.toDate, 10),
        }
        : undefined;
    return {
        schemaVersion,
        datasetId,
        manifestHash,
        generatedAt,
        sourceAsOf,
        scope,
        expectedModuleCounts,
        sourceTotals: Object.fromEntries(Object.entries(cleanObject(manifest.sourceTotals)).map(([key, amount]) => [(0, exports.text)(key, 80), finite(amount)])),
        validationSummary: {
            passed: validation.passed === true,
            checkCount: Math.max(0, Math.trunc(finite(validation.checkCount))),
            failedCheckCount: Math.max(0, Math.trunc(finite(validation.failedCheckCount))),
        },
    };
};
exports.validateSageImportManifest = validateSageImportManifest;
const isSageImportModule = (value) => MODULE_SET.has((0, exports.text)(value, 80));
exports.isSageImportModule = isSageImportModule;
const hashSageBatch = (records) => (0, node_crypto_1.createHash)('sha256')
    .update(JSON.stringify(records))
    .digest('hex');
exports.hashSageBatch = hashSageBatch;
//# sourceMappingURL=sageImportCore.js.map