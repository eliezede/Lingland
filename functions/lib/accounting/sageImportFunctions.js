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
exports.getSageImportRun = exports.finalizeSageImportCommit = exports.commitSageImportBatch = exports.finalizeSageImportPreview = exports.stageSageImportBatch = exports.createSageImportRun = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const sageImportCore_1 = require("./sageImportCore");
const db = admin.firestore();
const RUNTIME = { timeoutSeconds: 540, memory: '1GB' };
const MAX_BATCH_RECORDS = 75;
const MAX_BATCH_BYTES = 850000;
const DEFAULT_ORGANIZATION_ID = 'lingland-main';
const nowIso = () => new Date().toISOString();
const assertSuperAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    const snapshot = await db.collection('users').doc(uid).get();
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.status !== 'ACTIVE' || (0, sageImportCore_1.text)(data.role, 40).toUpperCase() !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only an active super administrator can import Sage accounting data.');
    }
    return { uid, role: 'SUPER_ADMIN', organizationId: (0, sageImportCore_1.text)(data.organizationId, 160) || DEFAULT_ORGANIZATION_ID };
};
const assertCommunicationsSuppressed = async () => {
    const settings = await db.collection('system').doc('settings').get();
    const mode = (0, sageImportCore_1.text)(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED', 40).toUpperCase();
    if (mode !== 'SUPPRESSED') {
        throw new functions.https.HttpsError('failed-precondition', 'Sage migration writes require Communication Mode SUPPRESSED.');
    }
};
const runRef = (runId) => db.collection('accountingImportRuns').doc(runId);
const batchRef = (runId, module, batchIndex) => (runRef(runId).collection('batches').doc(`${module}_${String(batchIndex).padStart(5, '0')}`));
const requireRun = async (runId) => {
    const snapshot = await runRef(runId).get();
    if (!snapshot.exists)
        throw new functions.https.HttpsError('not-found', 'Sage import run not found.');
    return { snapshot, data: snapshot.data() };
};
const batchPayloadBytes = (records) => Buffer.byteLength(JSON.stringify(records), 'utf8');
const writeImportEvent = async (runId, actor, action, details) => {
    await runRef(runId).collection('events').add({
        action,
        details,
        actorId: actor.uid,
        actorRole: actor.role,
        organizationId: actor.organizationId,
        communicationMode: 'SUPPRESSED',
        createdAt: nowIso(),
    });
};
exports.createSageImportRun = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertSuperAdmin(context.auth?.uid);
    await assertCommunicationsSuppressed();
    let manifest;
    try {
        manifest = (0, sageImportCore_1.validateSageImportManifest)(input?.manifest);
    }
    catch (error) {
        throw new functions.https.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid Sage manifest.');
    }
    if (manifest.validationSummary?.passed !== true || manifest.validationSummary.failedCheckCount !== 0) {
        throw new functions.https.HttpsError('failed-precondition', 'The Sage package must pass all extraction validations before staging.');
    }
    const runId = `sage_${manifest.manifestHash.slice(0, 24)}`;
    const ref = runRef(runId);
    const existing = await ref.get();
    if (existing.exists) {
        const current = existing.data();
        if (current.manifest?.manifestHash !== manifest.manifestHash) {
            throw new functions.https.HttpsError('already-exists', 'A different Sage package already uses this import run id.');
        }
        return { runId, status: current.status, resumed: true, preview: current.preview || null };
    }
    const createdAt = nowIso();
    await ref.create({
        runId,
        sourceSystem: 'SAGE',
        targetSystem: 'LINGLAND_XERO_CANONICAL',
        manifest,
        status: 'STAGING',
        communicationMode: 'SUPPRESSED',
        organizationId: actor.organizationId,
        createdAt,
        createdBy: actor.uid,
        updatedAt: createdAt,
        updatedBy: actor.uid,
    });
    await writeImportEvent(runId, actor, 'SAGE_IMPORT_RUN_CREATED', {
        datasetId: manifest.datasetId,
        manifestHash: manifest.manifestHash,
        expectedModuleCounts: manifest.expectedModuleCounts,
    });
    return { runId, status: 'STAGING', resumed: false, preview: null };
});
exports.stageSageImportBatch = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertSuperAdmin(context.auth?.uid);
    const runId = (0, sageImportCore_1.text)(input?.runId, 80);
    const module = input?.module;
    const batchIndex = Number(input?.batchIndex);
    const batchCount = Number(input?.batchCount);
    const rawRecords = Array.isArray(input?.records) ? input.records : [];
    if (!runId || !(0, sageImportCore_1.isSageImportModule)(module) || !Number.isInteger(batchIndex) || batchIndex < 0
        || !Number.isInteger(batchCount) || batchCount < 1 || batchIndex >= batchCount) {
        throw new functions.https.HttpsError('invalid-argument', 'Run, module and valid batch coordinates are required.');
    }
    if (!rawRecords.length || rawRecords.length > MAX_BATCH_RECORDS) {
        throw new functions.https.HttpsError('invalid-argument', `Each Sage batch must contain 1-${MAX_BATCH_RECORDS} records.`);
    }
    const { data: run } = await requireRun(runId);
    if (run.status !== 'STAGING') {
        throw new functions.https.HttpsError('failed-precondition', 'This Sage run is no longer accepting staged batches.');
    }
    let records;
    try {
        records = rawRecords.map((record) => (0, sageImportCore_1.normalizeSageImportRecord)(module, record, run.manifest.datasetId));
    }
    catch (error) {
        throw new functions.https.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid Sage batch.');
    }
    if (batchPayloadBytes(records) > MAX_BATCH_BYTES) {
        throw new functions.https.HttpsError('resource-exhausted', 'This Sage batch is too large. Reduce the client-side batch size.');
    }
    const ids = records.map(record => record.id);
    if (new Set(ids).size !== ids.length) {
        throw new functions.https.HttpsError('invalid-argument', 'A Sage batch contains duplicate record ids.');
    }
    const ref = batchRef(runId, module, batchIndex);
    const existing = await ref.get();
    const batchHash = (0, sageImportCore_1.hashSageBatch)(records);
    if (existing.exists) {
        if (existing.data()?.batchHash !== batchHash) {
            throw new functions.https.HttpsError('already-exists', 'A different payload was already staged for this batch.');
        }
        return { runId, module, batchIndex, recordCount: records.length, batchHash, idempotent: true };
    }
    await ref.create({
        module,
        batchIndex,
        batchCount,
        recordCount: records.length,
        batchHash,
        records,
        status: 'STAGED',
        stagedAt: nowIso(),
        stagedBy: actor.uid,
    });
    await runRef(runId).set({ updatedAt: nowIso(), updatedBy: actor.uid }, { merge: true });
    return { runId, module, batchIndex, recordCount: records.length, batchHash, idempotent: false };
});
exports.finalizeSageImportPreview = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertSuperAdmin(context.auth?.uid);
    const runId = (0, sageImportCore_1.text)(input?.runId, 80);
    const { data: run } = await requireRun(runId);
    if (run.status === 'PREVIEW_READY' || run.status === 'COMMITTING' || run.status === 'COMMITTED') {
        return { runId, status: run.status, preview: run.preview, idempotent: true };
    }
    if (run.status !== 'STAGING')
        throw new functions.https.HttpsError('failed-precondition', 'This Sage run cannot be previewed.');
    const batches = await runRef(runId).collection('batches').get();
    const moduleCounts = {};
    const moduleIndexes = new Map();
    const moduleBatchCounts = new Map();
    const recordIds = new Set();
    const hashes = [];
    for (const document of batches.docs) {
        const data = document.data();
        const module = data.module;
        if (!(0, sageImportCore_1.isSageImportModule)(module))
            throw new functions.https.HttpsError('data-loss', `Unknown staged module in ${document.id}.`);
        const batchIndex = Number(data.batchIndex);
        const batchCount = Number(data.batchCount);
        const records = Array.isArray(data.records) ? data.records : [];
        moduleCounts[module] = (moduleCounts[module] || 0) + records.length;
        if (!moduleIndexes.has(module))
            moduleIndexes.set(module, new Set());
        moduleIndexes.get(module).add(batchIndex);
        if (moduleBatchCounts.has(module) && moduleBatchCounts.get(module) !== batchCount) {
            throw new functions.https.HttpsError('data-loss', `Inconsistent batch count for ${module}.`);
        }
        moduleBatchCounts.set(module, batchCount);
        hashes.push((0, sageImportCore_1.text)(data.batchHash, 64));
        for (const record of records) {
            const scopedId = `${module}:${record.id}`;
            if (recordIds.has(scopedId))
                throw new functions.https.HttpsError('data-loss', `Duplicate staged id ${scopedId}.`);
            recordIds.add(scopedId);
        }
    }
    for (const [module, expected] of Object.entries(run.manifest.expectedModuleCounts)) {
        const typedModule = module;
        if ((moduleCounts[typedModule] || 0) !== expected) {
            throw new functions.https.HttpsError('failed-precondition', `${typedModule} staged ${moduleCounts[typedModule] || 0} of ${expected} expected records.`);
        }
        const expectedBatches = moduleBatchCounts.get(typedModule) || 0;
        const indexes = moduleIndexes.get(typedModule) || new Set();
        if (!expectedBatches || indexes.size !== expectedBatches
            || Array.from({ length: expectedBatches }, (_, index) => index).some(index => !indexes.has(index))) {
            throw new functions.https.HttpsError('failed-precondition', `${typedModule} has incomplete staged batches.`);
        }
    }
    const previewHash = (0, sageImportCore_1.stableSageId)('preview', [run.manifest.manifestHash, ...hashes.sort()].join('|')).replace('preview_', '');
    const preview = {
        ready: true,
        batchCount: batches.size,
        recordCount: recordIds.size,
        moduleCounts,
        previewHash,
        completedAt: nowIso(),
    };
    await runRef(runId).set({ status: 'PREVIEW_READY', preview, updatedAt: nowIso(), updatedBy: actor.uid }, { merge: true });
    await writeImportEvent(runId, actor, 'SAGE_IMPORT_PREVIEW_APPROVED', preview);
    return { runId, status: 'PREVIEW_READY', preview, idempotent: false };
});
const collectionForModule = (module) => {
    if (module === 'contacts')
        return 'accountingContacts';
    if (module === 'accounts')
        return 'accountingAccounts';
    if (module === 'bankAccounts')
        return 'accountingBankAccounts';
    if (module === 'salesDocuments' || module === 'purchaseDocuments')
        return 'accountingDocuments';
    if (module === 'customerPayments' || module === 'supplierPayments')
        return 'accountingPayments';
    if (module === 'bankJournalEntries')
        return 'accountingLedgerEntries';
    return 'accountingSourceArtifacts';
};
const canonicalClientCandidates = async (contact) => {
    const sageAccountRef = (0, sageImportCore_1.text)(contact.sageAccountRef, 80);
    const nameKey = (0, sageImportCore_1.text)(contact.normalizedName, 200) || (0, sageImportCore_1.normalizedName)(contact.name);
    const emails = Array.isArray(contact.emails) ? contact.emails.map(email => (0, sageImportCore_1.text)(email, 320).toLowerCase()).filter(Boolean) : [];
    const bySage = await db.collection('clients').where('sageAccountRef', '==', sageAccountRef).limit(3).get();
    if (!bySage.empty)
        return bySage.docs;
    if (nameKey) {
        const byName = await db.collection('clients').where('normalizedCompanyName', '==', nameKey).limit(3).get();
        const active = byName.docs.filter(document => {
            const data = document.data();
            return (0, sageImportCore_1.text)(data.recordState, 40).toUpperCase() !== 'MERGED' && !(0, sageImportCore_1.text)(data.mergedIntoClientId, 160);
        });
        if (active.length)
            return active;
    }
    for (const email of emails.slice(0, 3)) {
        const byInvoiceEmail = await db.collection('clients').where('invoiceEmail', '==', email).limit(3).get();
        if (!byInvoiceEmail.empty)
            return byInvoiceEmail.docs;
    }
    return [];
};
const upsertCanonicalClient = async (contact, runId, actor) => {
    const candidates = await canonicalClientCandidates(contact);
    if (candidates.length > 1)
        return { status: 'NEEDS_REVIEW', clientId: '', reason: 'MULTIPLE_CANONICAL_CLIENT_MATCHES' };
    const sageAccountRef = (0, sageImportCore_1.text)(contact.sageAccountRef, 80);
    const companyName = (0, sageImportCore_1.text)(contact.name, 200);
    const nameKey = (0, sageImportCore_1.text)(contact.normalizedName, 200) || (0, sageImportCore_1.normalizedName)(companyName);
    const emails = Array.isArray(contact.emails) ? contact.emails.map(email => (0, sageImportCore_1.text)(email, 320).toLowerCase()).filter(Boolean) : [];
    const phones = Array.isArray(contact.phones) ? contact.phones.map(phone => (0, sageImportCore_1.text)(phone, 80)).filter(Boolean) : [];
    const addressLines = Array.isArray(contact.addressLines) ? contact.addressLines.map(line => (0, sageImportCore_1.text)(line, 300)).filter(Boolean) : [];
    const clientId = candidates[0]?.id || (0, sageImportCore_1.stableSageId)('sage_client', sageAccountRef);
    const ref = db.collection('clients').doc(clientId);
    const snapshot = candidates[0] || await ref.get();
    const current = snapshot.exists ? snapshot.data() || {} : {};
    const now = nowIso();
    const aliases = Array.from(new Set([
        ...(Array.isArray(current.accountAliases) ? current.accountAliases.map((alias) => (0, sageImportCore_1.text)(alias, 200)) : []),
        companyName,
        sageAccountRef,
    ].filter(Boolean)));
    const payload = {
        id: clientId,
        organizationId: (0, sageImportCore_1.text)(current.organizationId, 160) || actor.organizationId,
        companyName: (0, sageImportCore_1.text)(current.companyName || current.name, 200) || companyName,
        normalizedCompanyName: (0, sageImportCore_1.text)(current.normalizedCompanyName, 200) || nameKey,
        billingAddress: (0, sageImportCore_1.text)(current.billingAddress, 2000) || addressLines.join(', '),
        paymentTermsDays: Number(current.paymentTermsDays) || Number(contact.paymentTermsDays) || 30,
        contactPerson: (0, sageImportCore_1.text)(current.contactPerson, 160) || (0, sageImportCore_1.text)(contact.contactName, 160),
        email: (0, sageImportCore_1.text)(current.email, 320).toLowerCase() || emails[0] || '',
        phone: (0, sageImportCore_1.text)(current.phone, 80) || phones[0] || '',
        invoiceEmail: (0, sageImportCore_1.text)(current.invoiceEmail, 320).toLowerCase() || emails[0] || '',
        status: (0, sageImportCore_1.text)(current.status, 40) || 'ACTIVE',
        recordState: (0, sageImportCore_1.text)(current.recordState, 40) || 'ACTIVE',
        defaultCostCodeType: (0, sageImportCore_1.text)(current.defaultCostCodeType, 40) || 'PO',
        sourceKey: (0, sageImportCore_1.text)(current.sourceKey, 160) || sageAccountRef,
        sageAccountRef,
        accountingContactId: contact.id,
        accountAliases: aliases,
        crmCohort: (0, sageImportCore_1.text)(current.crmCohort, 40) || 'CURRENT',
        crmReviewStatus: (0, sageImportCore_1.text)(current.crmReviewStatus, 40) || 'CANONICAL',
        sourceSystem: (0, sageImportCore_1.text)(current.sourceSystem, 60) || 'SAGE',
        sourceTable: (0, sageImportCore_1.text)(current.sourceTable, 120) || (0, sageImportCore_1.text)(contact.sourceTable, 120),
        sourceRecordId: (0, sageImportCore_1.text)(current.sourceRecordId, 200) || (0, sageImportCore_1.text)(contact.sourceRecordId, 200),
        syncStatus: (0, sageImportCore_1.text)(current.syncStatus, 40) || 'SYNCED',
        lastSageImportRunId: runId,
        lastSageImportedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
    };
    if (!snapshot.exists) {
        payload.createdAt = now;
        payload.createdBy = actor.uid;
        payload.crmCohortAssignedAt = now;
        payload.crmReviewedAt = now;
        payload.crmReviewedBy = actor.uid;
    }
    await ref.set(payload, { merge: true });
    return { status: snapshot.exists ? 'LINKED_EXISTING' : 'CREATED_CANONICAL', clientId, reason: '' };
};
const linkSupplierProfessional = async (contact, runId, actor) => {
    const emails = Array.isArray(contact.emails) ? contact.emails.map(email => (0, sageImportCore_1.text)(email, 320).toLowerCase()).filter(Boolean) : [];
    for (const email of emails.slice(0, 4)) {
        const matches = await db.collection('interpreters').where('email', '==', email).limit(3).get();
        if (matches.size === 1) {
            await matches.docs[0].ref.set({
                sageSupplierRef: (0, sageImportCore_1.text)(contact.sageAccountRef, 80),
                accountingContactId: contact.id,
                lastSageImportRunId: runId,
                lastSageImportedAt: nowIso(),
                updatedAt: nowIso(),
                updatedBy: actor.uid,
            }, { merge: true });
            return { status: 'LINKED_EXISTING', interpreterId: matches.docs[0].id, reason: '' };
        }
        if (matches.size > 1)
            return { status: 'NEEDS_REVIEW', interpreterId: '', reason: 'MULTIPLE_EMAIL_MATCHES' };
    }
    return { status: 'UNRESOLVED', interpreterId: '', reason: 'NO_EXACT_EMAIL_MATCH' };
};
const commitContact = async (record, runId, actor) => {
    const contactType = (0, sageImportCore_1.text)(record.contactType, 20).toUpperCase();
    const requiresIdentityReview = (0, sageImportCore_1.text)(record.identityStatus, 40).toUpperCase() === 'REVIEW_REQUIRED';
    const reviewReason = (0, sageImportCore_1.text)(record.identityReviewReason, 120) || 'SOURCE_IDENTITY_REQUIRES_REVIEW';
    const link = requiresIdentityReview
        ? (contactType === 'CUSTOMER'
            ? { status: 'NEEDS_REVIEW', clientId: '', reason: reviewReason }
            : { status: 'NEEDS_REVIEW', interpreterId: '', reason: reviewReason })
        : (contactType === 'CUSTOMER'
            ? await upsertCanonicalClient(record, runId, actor)
            : await linkSupplierProfessional(record, runId, actor));
    await db.collection('accountingContacts').doc(record.id).set({
        ...record,
        organizationId: actor.organizationId,
        platformLinkStatus: link.status,
        platformClientId: 'clientId' in link ? link.clientId : '',
        platformInterpreterId: 'interpreterId' in link ? link.interpreterId : '',
        linkReviewReason: link.reason,
        lastImportRunId: runId,
        importedAt: nowIso(),
        importedBy: actor.uid,
        updatedAt: nowIso(),
    }, { merge: true });
    return link.status;
};
exports.commitSageImportBatch = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertSuperAdmin(context.auth?.uid);
    await assertCommunicationsSuppressed();
    const runId = (0, sageImportCore_1.text)(input?.runId, 80);
    const module = input?.module;
    const batchIndex = Number(input?.batchIndex);
    if (!runId || !(0, sageImportCore_1.isSageImportModule)(module) || !Number.isInteger(batchIndex) || batchIndex < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Run, module and batch index are required.');
    }
    const { data: run } = await requireRun(runId);
    if (!run.preview?.ready || !['PREVIEW_READY', 'COMMITTING', 'COMMITTED'].includes(run.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'A complete Sage preview is required before commit.');
    }
    const ref = batchRef(runId, module, batchIndex);
    const snapshot = await ref.get();
    if (!snapshot.exists)
        throw new functions.https.HttpsError('not-found', 'Staged Sage batch not found.');
    const batch = snapshot.data() || {};
    if (batch.status === 'COMMITTED') {
        return { runId, module, batchIndex, recordCount: batch.recordCount || 0, idempotent: true, linkSummary: batch.linkSummary || {} };
    }
    const records = Array.isArray(batch.records) ? batch.records : [];
    await runRef(runId).set({ status: 'COMMITTING', updatedAt: nowIso(), updatedBy: actor.uid }, { merge: true });
    const linkSummary = {};
    if (module === 'contacts') {
        for (const record of records) {
            const status = await commitContact(record, runId, actor);
            linkSummary[status] = (linkSummary[status] || 0) + 1;
        }
    }
    else {
        const writer = db.bulkWriter();
        const collection = collectionForModule(module);
        for (const record of records) {
            writer.set(db.collection(collection).doc(record.id), {
                ...record,
                organizationId: actor.organizationId,
                lastImportRunId: runId,
                importedAt: nowIso(),
                importedBy: actor.uid,
                updatedAt: nowIso(),
            }, { merge: true });
        }
        await writer.close();
    }
    await ref.set({
        status: 'COMMITTED',
        committedAt: nowIso(),
        committedBy: actor.uid,
        linkSummary,
        records: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return { runId, module, batchIndex, recordCount: records.length, idempotent: false, linkSummary };
});
exports.finalizeSageImportCommit = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertSuperAdmin(context.auth?.uid);
    const runId = (0, sageImportCore_1.text)(input?.runId, 80);
    const { data: run } = await requireRun(runId);
    if (run.status === 'COMMITTED')
        return { runId, status: 'COMMITTED', summary: run.preview, idempotent: true };
    if (!run.preview?.ready)
        throw new functions.https.HttpsError('failed-precondition', 'The Sage preview is not ready.');
    const batches = await runRef(runId).collection('batches').get();
    const pending = batches.docs.filter(document => document.data().status !== 'COMMITTED');
    if (pending.length) {
        throw new functions.https.HttpsError('failed-precondition', `${pending.length} Sage batch(es) still need commit.`);
    }
    const completedAt = nowIso();
    await runRef(runId).set({ status: 'COMMITTED', completedAt, updatedAt: completedAt, updatedBy: actor.uid }, { merge: true });
    await writeImportEvent(runId, actor, 'SAGE_IMPORT_COMMITTED', {
        moduleCounts: run.preview.moduleCounts,
        recordCount: run.preview.recordCount,
        previewHash: run.preview.previewHash,
    });
    return { runId, status: 'COMMITTED', summary: run.preview, idempotent: false };
});
exports.getSageImportRun = functions.runWith(RUNTIME).https.onCall(async (input, context) => {
    await assertSuperAdmin(context.auth?.uid);
    const runId = (0, sageImportCore_1.text)(input?.runId, 80);
    const { snapshot } = await requireRun(runId);
    const batches = await runRef(runId).collection('batches').select('module', 'batchIndex', 'batchCount', 'recordCount', 'status', 'linkSummary').get();
    return {
        runId,
        ...snapshot.data(),
        batches: batches.docs.map(document => ({ id: document.id, ...document.data() })),
    };
});
//# sourceMappingURL=sageImportFunctions.js.map