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
exports.submitAISuggestionFeedback = exports.reviewAISuggestion = exports.runAIReview = exports.testDeepSeekConnection = exports.updateAIControlSettings = exports.getAIControlState = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const contextBuilder_1 = require("./contextBuilder");
const deepSeekClient_1 = require("./deepSeekClient");
const orchestrator_1 = require("./orchestrator");
const policy_1 = require("./policy");
const types_1 = require("./types");
const auditWriter_1 = require("../audit/auditWriter");
const db = admin.firestore();
const AI_CONFIG_REF = db.collection('system').doc('aiControl');
const SAFE_RUNTIME = { timeoutSeconds: 120, memory: '512MB', secrets: ['DEEPSEEK_API_KEY'] };
const clean = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const deepSeekApiKey = () => {
    const value = process.env.DEEPSEEK_API_KEY?.trim();
    return value && value !== 'NOT_CONFIGURED' ? value : undefined;
};
const boundedString = (value, max = 500) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const assertActiveAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    const snapshot = await db.collection('users').doc(uid).get();
    const data = snapshot.data() || {};
    const role = String(data.role || '').toUpperCase();
    if (!snapshot.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Only active administrators can use AI Control.');
    }
    return {
        uid,
        role: role,
        organizationId: String(data.organizationId || 'lingland-main'),
    };
};
const requireSuperAdmin = (actor) => {
    if (actor.role !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only a super administrator can change AI control settings.');
    }
};
const loadConfig = async () => {
    const snapshot = await AI_CONFIG_REF.get();
    return (0, policy_1.mergeAIControlConfig)(snapshot.exists ? snapshot.data() : undefined);
};
const writeAIAudit = async (input) => {
    const ref = db.collection('aiAuditEvents').doc();
    const createdAt = nowIso();
    await ref.set(clean({
        id: ref.id,
        schemaVersion: 1,
        createdAt,
        timestamp: createdAt,
        actorId: input.actor.uid,
        actorRole: input.actor.role,
        organizationId: input.actor.organizationId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        mode: input.mode,
        scope: input.scope || '',
        risk: input.risk || 'LOW',
        confidence: input.confidence ?? 0,
        approvalStatus: input.approvalStatus || 'NOT_APPLICABLE',
        result: input.result,
        rollbackAvailable: false,
        executionAttempted: false,
        externalCommunicationAttempted: false,
        inputSummary: input.summary,
    }));
    return ref.id;
};
const writeCoreAIEvent = async (input) => {
    const [eventRef, settings] = await Promise.all([
        Promise.resolve(db.collection('auditEvents').doc()),
        db.collection('system').doc('settings').get(),
    ]);
    await (0, auditWriter_1.writeAuditEvent)(eventRef.id, {
        entityType: 'aiControl',
        entityId: input.entityId,
        action: input.action,
        actorId: input.actor.uid,
        actorRole: input.actor.role,
        source: 'AI_CONTROL_CENTER',
        communicationMode: String(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase(),
        syncRunId: '',
        changedFields: input.changedFields || [],
        before: input.before,
        after: input.after,
        organizationId: input.actor.organizationId,
        bookingId: '',
        createdAt: nowIso(),
    });
};
const asCallableError = (error, fallback) => {
    if (error instanceof functions.https.HttpsError)
        return error;
    if (error instanceof deepSeekClient_1.DeepSeekClientError) {
        return new functions.https.HttpsError(error.status === 401 ? 'failed-precondition' : 'unavailable', error.message);
    }
    return new functions.https.HttpsError('internal', fallback);
};
const countQuery = async (query) => {
    const result = await query.count().get();
    return result.data().count;
};
const serializeDocs = (snapshot) => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
exports.getAIControlState = functions.https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const requestedLimit = Math.max(20, Math.min(200, Number(data?.limit) || 100));
    const suggestionCollection = db.collection('aiSuggestions');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [config, suggestions, runs, auditEvents, pendingCount, observedCount, approvedCount, rejectedCount, dismissedCount, reviewedLast30Days, goLive] = await Promise.all([
        loadConfig(),
        suggestionCollection.orderBy('createdAt', 'desc').limit(requestedLimit).get(),
        db.collection('aiRuns').orderBy('createdAt', 'desc').limit(30).get(),
        db.collection('aiAuditEvents').orderBy('createdAt', 'desc').limit(50).get(),
        countQuery(suggestionCollection.where('status', '==', 'PENDING')),
        countQuery(suggestionCollection.where('status', '==', 'OBSERVED')),
        countQuery(suggestionCollection.where('status', '==', 'APPROVED')),
        countQuery(suggestionCollection.where('status', '==', 'REJECTED')),
        countQuery(suggestionCollection.where('status', '==', 'DISMISSED')),
        countQuery(suggestionCollection.where('reviewedAt', '>=', thirtyDaysAgo)),
        db.collection('goLiveControl').doc('current').get(),
    ]);
    const goLiveData = goLive.data() || {};
    const checklist = goLiveData.checklist && typeof goLiveData.checklist === 'object'
        ? Object.values(goLiveData.checklist)
        : [];
    const manualGoLiveSignedOff = checklist.length >= 6 && checklist.every(Boolean);
    return clean({
        config,
        provider: {
            name: 'DeepSeek',
            configured: config.providerConfigured === true,
            lastTestAt: config.lastConnectionTestAt || null,
            lastTestStatus: config.lastConnectionTestStatus || 'NOT_TESTED',
            apiKeyExposed: false,
        },
        capabilities: {
            implementationStage: 'SUGGESTIONS_ONLY',
            readOnlyAnalysis: true,
            suggestions: true,
            humanReview: true,
            structuredFeedback: true,
            execution: false,
            externalCommunication: false,
            advancedModesLocked: true,
            unlockRequirements: [
                { id: 'go_live', label: 'Production go-live controls signed off', satisfied: manualGoLiveSignedOff },
                { id: 'review_history', label: 'At least 30 days of reviewed AI suggestions', satisfied: false },
                { id: 'execution_tools', label: 'Validated reversible action tools', satisfied: false },
            ],
        },
        counts: {
            pending: pendingCount,
            observed: observedCount,
            approved: approvedCount,
            rejected: rejectedCount,
            dismissed: dismissedCount,
            reviewedLast30Days,
        },
        actionRegistry: Object.values(policy_1.AI_ACTION_REGISTRY),
        suggestions: serializeDocs(suggestions),
        runs: serializeDocs(runs),
        auditEvents: serializeDocs(auditEvents),
        viewer: { role: actor.role, canManageSettings: actor.role === 'SUPER_ADMIN' },
    });
});
exports.updateAIControlSettings = functions.https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    requireSuperAdmin(actor);
    const before = await loadConfig();
    let patch;
    try {
        patch = (0, policy_1.validateAIControlPatch)(data?.settings);
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error instanceof Error ? error.message : 'Invalid AI settings.');
    }
    if (Object.keys(patch).length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No supported AI settings were supplied.');
    }
    const changedFields = Object.keys(patch);
    const next = (0, policy_1.mergeAIControlConfig)({
        ...before,
        ...patch,
        executionEnabled: false,
        externalCommunicationEnabled: false,
        updatedAt: nowIso(),
        updatedBy: actor.uid,
    });
    await AI_CONFIG_REF.set(clean(next), { merge: true });
    await Promise.all([
        writeAIAudit({
            actor,
            eventType: 'SETTINGS_UPDATED',
            entityType: 'AI_CONTROL',
            entityId: 'system/aiControl',
            mode: next.mode,
            result: 'SUCCESS',
            summary: { changedFields, executionEnabled: false, externalCommunicationEnabled: false },
        }),
        writeCoreAIEvent({
            actor,
            action: 'AI_SETTINGS_UPDATED',
            entityId: 'system/aiControl',
            before: clean(before),
            after: clean(next),
            changedFields,
        }),
    ]);
    return { success: true, config: next };
});
exports.testDeepSeekConnection = functions.runWith(SAFE_RUNTIME).https.onCall(async (_data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const config = await loadConfig();
    const apiKey = deepSeekApiKey();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'DEEPSEEK_API_KEY is not configured in Firebase Secret Manager.');
    }
    const testedAt = nowIso();
    try {
        const result = await (0, deepSeekClient_1.testDeepSeekConnection)(apiKey);
        const supportedModels = result.models.filter((model) => model.startsWith('deepseek-'));
        await AI_CONFIG_REF.set({
            providerConfigured: true,
            lastConnectionTestAt: testedAt,
            lastConnectionTestStatus: 'CONNECTED',
            updatedAt: testedAt,
            updatedBy: actor.uid,
        }, { merge: true });
        await writeAIAudit({
            actor,
            eventType: 'PROVIDER_CONNECTION_TESTED',
            entityType: 'AI_PROVIDER',
            entityId: 'DEEPSEEK',
            mode: config.mode,
            result: 'SUCCESS',
            summary: { supportedModelCount: supportedModels.length, apiKeyExposed: false },
        });
        return { connected: true, testedAt, models: supportedModels, apiKeyExposed: false };
    }
    catch (error) {
        const invalidKey = error instanceof deepSeekClient_1.DeepSeekClientError && error.status === 401;
        await AI_CONFIG_REF.set({
            ...(invalidKey ? { providerConfigured: false } : {}),
            lastConnectionTestAt: testedAt,
            lastConnectionTestStatus: 'ERROR',
            updatedAt: testedAt,
            updatedBy: actor.uid,
        }, { merge: true });
        await writeAIAudit({
            actor,
            eventType: 'PROVIDER_CONNECTION_TESTED',
            entityType: 'AI_PROVIDER',
            entityId: 'DEEPSEEK',
            mode: config.mode,
            result: 'ERROR',
            summary: { providerStatus: error instanceof deepSeekClient_1.DeepSeekClientError ? error.status || 'NETWORK' : 'UNKNOWN', apiKeyExposed: false },
        });
        throw asCallableError(error, 'DeepSeek connection test failed.');
    }
});
exports.runAIReview = functions.runWith(SAFE_RUNTIME).https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const scope = String(data?.scope || '').toUpperCase();
    if (!types_1.AI_REVIEW_SCOPES.includes(scope)) {
        throw new functions.https.HttpsError('invalid-argument', 'A supported review scope is required.');
    }
    const config = await loadConfig();
    if (config.mode === 'OFF') {
        throw new functions.https.HttpsError('failed-precondition', 'Set AI Control to Read-only audit or Suggest before running a review.');
    }
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const runsToday = await countQuery(db.collection('aiRuns').where('createdAt', '>=', startOfDay.toISOString()));
    if (runsToday >= config.dailyRunLimit) {
        throw new functions.https.HttpsError('resource-exhausted', 'The configured daily AI review limit has been reached.');
    }
    const runRef = db.collection('aiRuns').doc();
    const createdAt = nowIso();
    await runRef.set({
        id: runRef.id,
        scope,
        mode: config.mode,
        model: config.model,
        status: 'RUNNING',
        createdAt,
        createdBy: actor.uid,
        executionAttempted: false,
        externalCommunicationAttempted: false,
    });
    try {
        const reviewContext = await (0, contextBuilder_1.buildAIReviewContext)(scope);
        const result = await (0, orchestrator_1.runAIOrchestrator)({
            context: reviewContext,
            config,
            actorUid: actor.uid,
            apiKey: deepSeekApiKey(),
        });
        const activeSnapshot = await db.collection('aiSuggestions')
            .where('status', 'in', ['PENDING', 'OBSERVED'])
            .limit(500)
            .get();
        const existing = new Map(activeSnapshot.docs.map(doc => [String(doc.data().fingerprint || ''), {
                ref: doc.ref,
                status: String(doc.data().status || ''),
            }]));
        const batch = db.batch();
        let createdCount = 0;
        let promotedCount = 0;
        let duplicateCount = 0;
        for (const draft of result.suggestions) {
            const fingerprint = (0, policy_1.suggestionFingerprint)(draft);
            const previous = existing.get(fingerprint);
            if (previous) {
                if (config.mode === 'SUGGEST' && previous.status === 'OBSERVED') {
                    batch.set(previous.ref, {
                        status: 'PENDING',
                        promotedAt: nowIso(),
                        promotedByRunId: runRef.id,
                        latestRunId: runRef.id,
                        updatedAt: nowIso(),
                    }, { merge: true });
                    promotedCount += 1;
                }
                else {
                    duplicateCount += 1;
                }
                continue;
            }
            const suggestionRef = db.collection('aiSuggestions').doc();
            const definition = policy_1.AI_ACTION_REGISTRY[draft.action];
            batch.set(suggestionRef, clean({
                id: suggestionRef.id,
                schemaVersion: 1,
                runId: runRef.id,
                latestRunId: runRef.id,
                scope,
                mode: config.mode,
                status: config.mode === 'READ_ONLY_AUDIT' ? 'OBSERVED' : 'PENDING',
                action: draft.action,
                category: draft.category,
                risk: definition.risk,
                entityType: draft.entityType,
                entityId: draft.entityId,
                entityLabel: draft.entityLabel,
                title: draft.title,
                reason: draft.reason,
                expectedBenefit: draft.expectedBenefit,
                confidence: draft.confidence,
                evidence: draft.evidence,
                dataUsed: draft.dataUsed,
                source: draft.source,
                fingerprint,
                executionAvailable: false,
                approvalExecutesAction: false,
                externalCommunication: false,
                createdAt: nowIso(),
                createdBy: actor.uid,
            }));
            existing.set(fingerprint, {
                ref: suggestionRef,
                status: config.mode === 'READ_ONLY_AUDIT' ? 'OBSERVED' : 'PENDING',
            });
            createdCount += 1;
        }
        await batch.commit();
        const completedAt = nowIso();
        await runRef.set(clean({
            status: 'COMPLETED',
            completedAt,
            dataSummary: reviewContext.dataSummary,
            localSuggestionCount: result.localSuggestionCount,
            providerSuggestionCount: result.providerSuggestionCount,
            providerStatus: result.providerStatus,
            providerError: result.providerError || '',
            createdSuggestionCount: createdCount,
            promotedSuggestionCount: promotedCount,
            duplicateSuggestionCount: duplicateCount,
            executionAttempted: false,
            externalCommunicationAttempted: false,
        }), { merge: true });
        if (result.providerStatus === 'CONNECTED') {
            await AI_CONFIG_REF.set({ providerConfigured: true }, { merge: true });
        }
        await writeAIAudit({
            actor,
            eventType: 'AI_REVIEW_COMPLETED',
            entityType: 'AI_RUN',
            entityId: runRef.id,
            mode: config.mode,
            scope,
            result: 'SUCCESS',
            summary: {
                dataSummary: reviewContext.dataSummary,
                createdCount,
                promotedCount,
                duplicateCount,
                providerStatus: result.providerStatus,
                executionAttempted: false,
            },
        });
        return {
            success: true,
            runId: runRef.id,
            scope,
            providerStatus: result.providerStatus,
            providerMessage: result.providerError || '',
            createdCount,
            promotedCount,
            duplicateCount,
            dataSummary: reviewContext.dataSummary,
            executionAttempted: false,
            externalCommunicationAttempted: false,
        };
    }
    catch (error) {
        await runRef.set({ status: 'FAILED', completedAt: nowIso(), error: 'AI review could not be completed.' }, { merge: true });
        await writeAIAudit({
            actor,
            eventType: 'AI_REVIEW_FAILED',
            entityType: 'AI_RUN',
            entityId: runRef.id,
            mode: config.mode,
            scope,
            result: 'ERROR',
            summary: { errorType: error instanceof Error ? error.name : 'UNKNOWN', executionAttempted: false },
        });
        throw asCallableError(error, 'AI review could not be completed.');
    }
});
exports.reviewAISuggestion = functions.https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const suggestionId = boundedString(data?.suggestionId, 160);
    const decision = String(data?.decision || '').toUpperCase();
    const note = boundedString(data?.note, 500);
    const statusByDecision = { APPROVE: 'APPROVED', REJECT: 'REJECTED', DISMISS: 'DISMISSED' };
    if (!suggestionId || !statusByDecision[decision]) {
        throw new functions.https.HttpsError('invalid-argument', 'A suggestion and supported review decision are required.');
    }
    const suggestionRef = db.collection('aiSuggestions').doc(suggestionId);
    const reviewedAt = nowIso();
    let before = {};
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(suggestionRef);
        if (!snapshot.exists)
            throw new functions.https.HttpsError('not-found', 'AI suggestion not found.');
        before = snapshot.data() || {};
        if (before.status !== 'PENDING') {
            throw new functions.https.HttpsError('failed-precondition', 'Only pending suggestions can be reviewed.');
        }
        transaction.set(suggestionRef, {
            status: statusByDecision[decision],
            reviewDecision: decision,
            reviewNote: note,
            reviewedAt,
            reviewedBy: actor.uid,
            executionAttempted: false,
            executionResult: 'NOT_AVAILABLE_IN_CURRENT_STAGE',
            updatedAt: reviewedAt,
        }, { merge: true });
    });
    await Promise.all([
        writeAIAudit({
            actor,
            eventType: 'AI_SUGGESTION_REVIEWED',
            entityType: String(before.entityType || 'AI_SUGGESTION'),
            entityId: suggestionId,
            mode: String(before.mode || 'SUGGEST'),
            scope: String(before.scope || ''),
            risk: String(before.risk || 'LOW'),
            confidence: Number(before.confidence) || 0,
            approvalStatus: statusByDecision[decision],
            result: 'RECORDED_NO_EXECUTION',
            summary: { decision, executionAttempted: false, noteProvided: Boolean(note) },
        }),
        writeCoreAIEvent({
            actor,
            action: 'AI_SUGGESTION_REVIEWED',
            entityId: suggestionId,
            before: { status: before.status },
            after: { status: statusByDecision[decision], executionAttempted: false },
            changedFields: ['status', 'reviewDecision', 'reviewedAt', 'reviewedBy'],
        }),
    ]);
    return { success: true, suggestionId, status: statusByDecision[decision], executionAttempted: false };
});
exports.submitAISuggestionFeedback = functions.https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const suggestionId = boundedString(data?.suggestionId, 160);
    const reason = String(data?.reason || '').toUpperCase();
    const comment = boundedString(data?.comment, 500);
    const allowedReasons = ['USEFUL', 'WRONG', 'TOO_RISKY', 'MISSING_CONTEXT', 'GOOD_NOT_NOW', 'SHOULD_BECOME_RULE'];
    if (!suggestionId || !allowedReasons.includes(reason)) {
        throw new functions.https.HttpsError('invalid-argument', 'A suggestion and supported feedback reason are required.');
    }
    const suggestionRef = db.collection('aiSuggestions').doc(suggestionId);
    const snapshot = await suggestionRef.get();
    if (!snapshot.exists)
        throw new functions.https.HttpsError('not-found', 'AI suggestion not found.');
    const suggestion = snapshot.data() || {};
    const feedbackRef = db.collection('aiFeedback').doc();
    const memoryRef = db.collection('aiLearningMemory').doc(String(suggestion.action || 'UNKNOWN'));
    const submittedAt = nowIso();
    await db.runTransaction(async (transaction) => {
        const memory = await transaction.get(memoryRef);
        const counts = (memory.data()?.feedbackCounts || {});
        transaction.set(feedbackRef, clean({
            id: feedbackRef.id,
            suggestionId,
            action: String(suggestion.action || ''),
            category: String(suggestion.category || ''),
            source: String(suggestion.source || ''),
            reason,
            comment,
            submittedAt,
            submittedBy: actor.uid,
            organizationId: actor.organizationId,
        }));
        transaction.set(memoryRef, {
            action: String(suggestion.action || 'UNKNOWN'),
            feedbackCounts: { ...counts, [reason]: Number(counts[reason] || 0) + 1 },
            totalFeedback: Number(memory.data()?.totalFeedback || 0) + 1,
            lastFeedbackAt: submittedAt,
            updatedAt: submittedAt,
        }, { merge: true });
        transaction.set(suggestionRef, {
            latestFeedback: { reason, comment, submittedAt, submittedBy: actor.uid },
            feedbackCount: Number(suggestion.feedbackCount || 0) + 1,
            updatedAt: submittedAt,
        }, { merge: true });
    });
    await writeAIAudit({
        actor,
        eventType: 'AI_SUGGESTION_FEEDBACK_RECORDED',
        entityType: 'AI_SUGGESTION',
        entityId: suggestionId,
        mode: String(suggestion.mode || types_1.DEFAULT_AI_CONTROL_CONFIG.mode),
        scope: String(suggestion.scope || ''),
        risk: String(suggestion.risk || 'LOW'),
        confidence: Number(suggestion.confidence) || 0,
        result: 'SUCCESS',
        summary: { reason, commentProvided: Boolean(comment), learningMemoryUpdated: true },
    });
    return { success: true, feedbackId: feedbackRef.id, learningMemoryUpdated: true };
});
//# sourceMappingURL=aiFunctions.js.map