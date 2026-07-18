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
exports.executeAutomaticSuggestions = exports.verifyAIExecutionOutcomes = exports.rollbackAIExecution = exports.executeAISuggestionAction = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const actionTools_1 = require("./actionTools");
const policy_1 = require("./policy");
const nowIso = () => new Date().toISOString();
const clean = (value) => JSON.parse(JSON.stringify(value));
const safeError = (error) => (error instanceof Error ? error.message : 'Execution failed.')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
const executionIdFor = (suggestionId, action) => `exec_${(0, crypto_1.createHash)('sha256')
    .update(`lingland-ai-execution-v1|${suggestionId}|${action}`)
    .digest('hex')
    .slice(0, 32)}`;
const writeExecutionAudit = async (db, input) => {
    const createdAt = nowIso();
    const ref = db.collection('aiAuditEvents').doc();
    await ref.set(clean({
        id: ref.id,
        schemaVersion: 2,
        createdAt,
        timestamp: createdAt,
        actorId: input.actor.uid,
        actorRole: input.actor.role,
        organizationId: input.actor.organizationId,
        eventType: `AI_EXECUTION_${input.result}`,
        entityType: input.entityType,
        entityId: input.entityId,
        suggestionId: input.suggestionId,
        executionId: input.executionId,
        mode: input.mode,
        scope: input.action,
        risk: input.risk,
        confidence: Number(input.summary.confidence) || 0,
        approvalStatus: String(input.summary.approvalStatus || 'NOT_APPLICABLE'),
        result: input.result,
        rollbackAvailable: Boolean(input.summary.rollbackAvailable),
        executionAttempted: input.executionAttempted,
        externalCommunicationAttempted: input.externalCommunicationAttempted,
        inputSummary: input.summary,
    }));
};
const loadFreshConfig = async (db) => {
    const snapshot = await db.collection('system').doc('aiControl').get();
    return (0, policy_1.mergeAIControlConfig)(snapshot.data());
};
const executionsToday = async (db) => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const snapshot = await db.collection('aiActionExecutions').where('createdAt', '>=', start.toISOString()).count().get();
    return snapshot.data().count;
};
const executeAISuggestionAction = async (input) => {
    const suggestionRef = input.db.collection('aiSuggestions').doc(input.suggestionId);
    const initialSuggestion = await suggestionRef.get();
    if (!initialSuggestion.exists)
        throw new Error('AI suggestion not found.');
    const suggestion = initialSuggestion.data() || {};
    const action = String(suggestion.action || '');
    if (!(0, policy_1.isKnownAIAction)(action))
        throw new Error('AI suggestion contains an unsupported action.');
    const definition = policy_1.AI_ACTION_REGISTRY[action];
    const freshConfig = await loadFreshConfig(input.db);
    const decision = (0, policy_1.executionPolicyDecision)({
        config: freshConfig,
        definition,
        confidence: Number(suggestion.confidence) || 0,
        humanApproved: input.humanApproved,
    });
    if (!decision.allowed)
        return { success: false, status: 'BLOCKED', reason: decision.reason };
    if (await executionsToday(input.db) >= freshConfig.dailyActionLimit) {
        return { success: false, status: 'BLOCKED', reason: 'DAILY_ACTION_LIMIT_REACHED' };
    }
    const executionId = executionIdFor(input.suggestionId, action);
    const executionRef = input.db.collection('aiActionExecutions').doc(executionId);
    const existing = await executionRef.get();
    if (existing.exists && ['SUCCEEDED', 'SIMULATED', 'ROLLED_BACK'].includes(String(existing.data()?.status || ''))) {
        return {
            success: true,
            executionId,
            status: String(existing.data()?.status || 'SUCCEEDED'),
            idempotent: true,
            simulated: existing.data()?.status === 'SIMULATED',
            externalCommunicationAttempted: existing.data()?.externalCommunicationAttempted === true,
            resultSummary: clean(existing.data()?.resultSummary || {}),
        };
    }
    const createdAt = existing.data()?.createdAt || nowIso();
    const parameters = suggestion.proposedParameters && typeof suggestion.proposedParameters === 'object'
        ? clean(suggestion.proposedParameters)
        : {};
    const baseExecution = {
        id: executionId,
        suggestionId: input.suggestionId,
        runId: String(suggestion.runId || ''),
        action,
        risk: definition.risk,
        entityType: String(suggestion.entityType || 'SYSTEM'),
        entityId: String(suggestion.entityId || ''),
        mode: freshConfig.mode,
        status: freshConfig.simulationOnly ? 'SIMULATED' : 'QUEUED',
        outcomeStatus: freshConfig.simulationOnly ? 'NOT_APPLICABLE' : 'PENDING',
        simulationOnly: freshConfig.simulationOnly,
        idempotencyKey: executionId,
        parameters,
        rollbackAvailable: definition.reversible,
        externalCommunicationAttempted: false,
        createdAt,
        createdBy: input.actor.uid,
    };
    if (freshConfig.simulationOnly) {
        const plan = {
            handler: definition.handler,
            action,
            entityType: suggestion.entityType,
            entityId: suggestion.entityId,
            parameters,
            trigger: input.trigger,
            policyReason: decision.reason,
            externalCommunicationAllowed: freshConfig.externalCommunicationEnabled,
        };
        await Promise.all([
            executionRef.set(clean({ ...baseExecution, status: 'SIMULATED', completedAt: nowIso(), resultSummary: { simulation: true, plan } }), { merge: true }),
            suggestionRef.set({
                lastExecutionId: executionId,
                lastExecutionStatus: 'SIMULATED',
                simulationPlan: clean(plan),
                updatedAt: nowIso(),
            }, { merge: true }),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId,
                suggestionId: input.suggestionId,
                mode: freshConfig.mode,
                action,
                risk: definition.risk,
                entityType: String(suggestion.entityType || 'SYSTEM'),
                entityId: String(suggestion.entityId || ''),
                result: 'SIMULATED',
                executionAttempted: false,
                externalCommunicationAttempted: false,
                summary: { confidence: suggestion.confidence, approvalStatus: suggestion.status, rollbackAvailable: definition.reversible, trigger: input.trigger },
            }),
        ]);
        return { success: true, executionId, status: 'SIMULATED', simulated: true, externalCommunicationAttempted: false, resultSummary: { plan } };
    }
    let idempotent = false;
    let executionConfig = freshConfig;
    await input.db.runTransaction(async (transaction) => {
        const [latestSuggestion, latestExecution, configSnapshot] = await Promise.all([
            transaction.get(suggestionRef),
            transaction.get(executionRef),
            transaction.get(input.db.collection('system').doc('aiControl')),
        ]);
        if (!latestSuggestion.exists)
            throw new Error('AI suggestion no longer exists.');
        const latestConfig = (0, policy_1.mergeAIControlConfig)(configSnapshot.data());
        const latestDecision = (0, policy_1.executionPolicyDecision)({
            config: latestConfig,
            definition,
            confidence: Number(latestSuggestion.data()?.confidence) || 0,
            humanApproved: input.humanApproved,
        });
        if (!latestDecision.allowed || latestConfig.simulationOnly) {
            throw new Error(`Execution policy changed before the action lock was acquired: ${latestDecision.reason}.`);
        }
        executionConfig = latestConfig;
        const latestExecutionStatus = String(latestExecution.data()?.status || '');
        const executionStartedAt = new Date(String(latestExecution.data()?.startedAt || 0)).getTime();
        const executionIsStale = latestExecutionStatus === 'EXECUTING'
            && (!Number.isFinite(executionStartedAt) || Date.now() - executionStartedAt > 10 * 60 * 1000);
        if (latestExecutionStatus === 'SUCCEEDED' || (latestExecutionStatus === 'EXECUTING' && !executionIsStale)) {
            idempotent = true;
            return;
        }
        const latestStatus = String(latestSuggestion.data()?.status || '');
        if (!['PENDING', 'APPROVED', 'FAILED'].includes(latestStatus) && !(latestStatus === 'EXECUTING' && executionIsStale)) {
            throw new Error(`Suggestion cannot execute while ${latestStatus}.`);
        }
        const startedAt = nowIso();
        transaction.set(executionRef, clean({
            ...baseExecution,
            status: 'EXECUTING',
            startedAt,
            attemptCount: Number(latestExecution.data()?.attemptCount || 0) + 1,
            trigger: input.trigger,
            policyReason: latestDecision.reason,
        }), { merge: true });
        transaction.set(suggestionRef, {
            status: 'EXECUTING',
            lastExecutionId: executionId,
            lastExecutionStatus: 'EXECUTING',
            executionStartedAt: startedAt,
            updatedAt: startedAt,
        }, { merge: true });
    });
    if (idempotent)
        return { success: true, executionId, status: 'EXECUTING', idempotent: true };
    try {
        const result = await (0, actionTools_1.executeActionTool)({
            db: input.db,
            executionId,
            suggestionId: input.suggestionId,
            action,
            definition,
            entityType: String(suggestion.entityType || 'SYSTEM'),
            entityId: String(suggestion.entityId || ''),
            entityLabel: String(suggestion.entityLabel || suggestion.entityId || 'Record'),
            category: String(suggestion.category || suggestion.scope || 'PLATFORM'),
            title: String(suggestion.title || definition.description),
            reason: String(suggestion.reason || definition.description),
            risk: definition.risk,
            parameters,
            actorId: input.actor.uid,
            organizationId: input.actor.organizationId,
            externalCommunicationEnabled: executionConfig.externalCommunicationEnabled,
        });
        const completedAt = nowIso();
        await Promise.all([
            executionRef.set(clean({
                status: 'SUCCEEDED',
                outcomeStatus: 'PENDING',
                completedAt,
                beforeSnapshot: result.beforeSnapshot,
                afterSnapshot: result.afterSnapshot,
                resultSummary: result.resultSummary,
                rollbackAvailable: result.rollbackAvailable,
                externalCommunicationAttempted: result.externalCommunicationAttempted,
            }), { merge: true }),
            suggestionRef.set({
                status: 'EXECUTED',
                lastExecutionId: executionId,
                lastExecutionStatus: 'SUCCEEDED',
                executedAt: completedAt,
                executedBy: input.actor.uid,
                updatedAt: completedAt,
            }, { merge: true }),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId,
                suggestionId: input.suggestionId,
                mode: executionConfig.mode,
                action,
                risk: definition.risk,
                entityType: String(suggestion.entityType || 'SYSTEM'),
                entityId: String(suggestion.entityId || ''),
                result: 'SUCCEEDED',
                executionAttempted: true,
                externalCommunicationAttempted: result.externalCommunicationAttempted,
                summary: { confidence: suggestion.confidence, approvalStatus: suggestion.status, rollbackAvailable: result.rollbackAvailable, trigger: input.trigger, result: result.resultSummary },
            }),
        ]);
        return { success: true, executionId, status: 'SUCCEEDED', externalCommunicationAttempted: result.externalCommunicationAttempted, resultSummary: result.resultSummary };
    }
    catch (error) {
        const message = safeError(error);
        const failedAt = nowIso();
        await Promise.all([
            executionRef.set({ status: 'FAILED', completedAt: failedAt, error: message, outcomeStatus: 'DRIFTED' }, { merge: true }),
            suggestionRef.set({ status: 'FAILED', lastExecutionStatus: 'FAILED', executionError: message, updatedAt: failedAt }, { merge: true }),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId,
                suggestionId: input.suggestionId,
                mode: executionConfig.mode,
                action,
                risk: definition.risk,
                entityType: String(suggestion.entityType || 'SYSTEM'),
                entityId: String(suggestion.entityId || ''),
                result: 'FAILED',
                executionAttempted: true,
                externalCommunicationAttempted: false,
                summary: { confidence: suggestion.confidence, approvalStatus: suggestion.status, rollbackAvailable: false, trigger: input.trigger, error: message },
            }),
        ]);
        throw new Error(message);
    }
};
exports.executeAISuggestionAction = executeAISuggestionAction;
const rollbackAIExecution = async (input) => {
    const executionRef = input.db.collection('aiActionExecutions').doc(input.executionId);
    let execution = {};
    await input.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(executionRef);
        if (!snapshot.exists)
            throw new Error('AI execution not found.');
        execution = snapshot.data() || {};
        if (execution.status !== 'SUCCEEDED' || execution.rollbackAvailable !== true) {
            throw new Error('Only a successful reversible execution can be rolled back.');
        }
        if (!(0, policy_1.isKnownAIAction)(String(execution.action || ''))) {
            throw new Error('Execution action is not supported.');
        }
        transaction.set(executionRef, {
            status: 'ROLLING_BACK',
            rollbackStartedAt: nowIso(),
            rollbackStartedBy: input.actor.uid,
        }, { merge: true });
    });
    const action = String(execution.action || '');
    if (!(0, policy_1.isKnownAIAction)(action))
        throw new Error('Execution action is not supported.');
    const definition = policy_1.AI_ACTION_REGISTRY[action];
    try {
        const summary = await (0, actionTools_1.rollbackActionTool)({
            db: input.db,
            executionId: input.executionId,
            handler: definition.handler,
            entityId: String(execution.entityId || ''),
            beforeSnapshot: execution.beforeSnapshot || null,
            afterSnapshot: execution.afterSnapshot || null,
            actorId: input.actor.uid,
        });
        const rolledBackAt = nowIso();
        await Promise.all([
            executionRef.set({ status: 'ROLLED_BACK', outcomeStatus: 'NOT_APPLICABLE', rolledBackAt, rolledBackBy: input.actor.uid, rollbackSummary: clean(summary) }, { merge: true }),
            input.db.collection('aiSuggestions').doc(String(execution.suggestionId || '')).set({ status: 'ROLLED_BACK', lastExecutionStatus: 'ROLLED_BACK', updatedAt: rolledBackAt }, { merge: true }),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId: input.executionId,
                suggestionId: String(execution.suggestionId || ''),
                mode: String(execution.mode || ''),
                action,
                risk: String(execution.risk || definition.risk),
                entityType: String(execution.entityType || ''),
                entityId: String(execution.entityId || ''),
                result: 'ROLLED_BACK',
                executionAttempted: true,
                externalCommunicationAttempted: false,
                summary: { rollbackAvailable: true, rollback: summary },
            }),
        ]);
        return { success: true, executionId: input.executionId, status: 'ROLLED_BACK', summary };
    }
    catch (error) {
        const message = safeError(error);
        await Promise.all([
            executionRef.set({ status: 'ROLLBACK_FAILED', rollbackError: message, rollbackAttemptedAt: nowIso(), rollbackAttemptedBy: input.actor.uid }, { merge: true }),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId: input.executionId,
                suggestionId: String(execution.suggestionId || ''),
                mode: String(execution.mode || ''),
                action,
                risk: String(execution.risk || definition.risk),
                entityType: String(execution.entityType || ''),
                entityId: String(execution.entityId || ''),
                result: 'ROLLBACK_FAILED',
                executionAttempted: true,
                externalCommunicationAttempted: false,
                summary: { rollbackAvailable: true, error: message },
            }),
        ]);
        throw new Error(message);
    }
};
exports.rollbackAIExecution = rollbackAIExecution;
const verifyAIExecutionOutcomes = async (input) => {
    const snapshot = await input.db.collection('aiActionExecutions')
        .where('status', 'in', ['SUCCEEDED', 'EXECUTING'])
        .limit(Math.max(1, Math.min(100, input.limit || 50)))
        .get();
    let checked = 0;
    let verified = 0;
    let drifted = 0;
    for (const doc of snapshot.docs) {
        const execution = doc.data();
        const currentStatus = String(execution.status || '');
        if (currentStatus === 'EXECUTING') {
            const startedAt = new Date(String(execution.startedAt || 0)).getTime();
            const stale = !Number.isFinite(startedAt) || Date.now() - startedAt > 10 * 60 * 1000;
            if (!stale)
                continue;
        }
        const action = String(execution.action || '');
        if (!(0, policy_1.isKnownAIAction)(action))
            continue;
        checked += 1;
        const result = await (0, actionTools_1.verifyActionOutcome)({
            db: input.db,
            executionId: doc.id,
            handler: policy_1.AI_ACTION_REGISTRY[action].handler,
            entityId: String(execution.entityId || ''),
            afterSnapshot: execution.afterSnapshot || null,
        });
        const status = result.verified ? 'VERIFIED' : 'DRIFTED';
        if (result.verified)
            verified += 1;
        else
            drifted += 1;
        const outcomeVerifiedAt = nowIso();
        const recoveryPatch = currentStatus === 'EXECUTING'
            ? result.verified
                ? { status: 'SUCCEEDED', completedAt: outcomeVerifiedAt, recoveredFromInterruptedExecution: true, rollbackAvailable: false }
                : { status: 'FAILED', completedAt: outcomeVerifiedAt, error: `Interrupted execution could not be verified: ${result.detail}` }
            : {};
        await Promise.all([
            doc.ref.set({ ...recoveryPatch, outcomeStatus: status, outcomeDetail: result.detail, outcomeVerifiedAt, outcomeVerifiedBy: input.actor.uid }, { merge: true }),
            currentStatus === 'EXECUTING'
                ? input.db.collection('aiSuggestions').doc(String(execution.suggestionId || '')).set({
                    status: result.verified ? 'EXECUTED' : 'FAILED',
                    lastExecutionStatus: result.verified ? 'SUCCEEDED' : 'FAILED',
                    executionError: result.verified ? admin.firestore.FieldValue.delete() : `Interrupted execution could not be verified: ${result.detail}`,
                    updatedAt: outcomeVerifiedAt,
                }, { merge: true })
                : Promise.resolve(),
            writeExecutionAudit(input.db, {
                actor: input.actor,
                executionId: doc.id,
                suggestionId: String(execution.suggestionId || ''),
                mode: String(execution.mode || ''),
                action,
                risk: String(execution.risk || policy_1.AI_ACTION_REGISTRY[action].risk),
                entityType: String(execution.entityType || ''),
                entityId: String(execution.entityId || ''),
                result: currentStatus === 'EXECUTING'
                    ? result.verified ? 'INTERRUPTED_RECOVERED' : 'INTERRUPTED_FAILED'
                    : result.verified ? 'OUTCOME_VERIFIED' : 'OUTCOME_DRIFTED',
                executionAttempted: currentStatus === 'EXECUTING',
                externalCommunicationAttempted: execution.externalCommunicationAttempted === true,
                summary: { outcomeStatus: status, detail: result.detail, rollbackAvailable: recoveryPatch.rollbackAvailable ?? execution.rollbackAvailable },
            }),
        ]);
    }
    return { checked, verified, drifted };
};
exports.verifyAIExecutionOutcomes = verifyAIExecutionOutcomes;
const executeAutomaticSuggestions = async (input) => {
    const results = [];
    for (const suggestionId of input.suggestionIds.slice(0, input.config.maxActionsPerRun)) {
        try {
            results.push(await (0, exports.executeAISuggestionAction)({ db: input.db, suggestionId, actor: input.actor, trigger: input.trigger }));
        }
        catch (error) {
            results.push({ success: false, status: 'FAILED', reason: safeError(error) });
        }
    }
    return results;
};
exports.executeAutomaticSuggestions = executeAutomaticSuggestions;
//# sourceMappingURL=actionEngine.js.map