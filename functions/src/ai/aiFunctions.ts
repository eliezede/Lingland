import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { buildAIReviewContext } from './contextBuilder';
import { DeepSeekClientError, testDeepSeekConnection as testProviderConnection } from './deepSeekClient';
import { runAIOrchestrator } from './orchestrator';
import {
  executeAISuggestionAction,
  executeAutomaticSuggestions,
  rollbackAIExecution,
  verifyAIExecutionOutcomes,
} from './actionEngine';
import {
  AI_ACTION_REGISTRY,
  isExecutionMode,
  mergeAIControlConfig,
  suggestionFingerprint,
  validateAIControlPatch,
} from './policy';
import {
  AIActor,
  AIControlConfig,
  AI_REVIEW_SCOPES,
  AIReviewScope,
  DEFAULT_AI_CONTROL_CONFIG,
} from './types';
import { writeAuditEvent } from '../audit/auditWriter';

const db = admin.firestore();
const AI_CONFIG_REF = db.collection('system').doc('aiControl');
const SAFE_RUNTIME = { timeoutSeconds: 120, memory: '512MB' as const, secrets: ['DEEPSEEK_API_KEY'] };

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = () => new Date().toISOString();
const deepSeekApiKey = () => {
  const value = process.env.DEEPSEEK_API_KEY?.trim();
  return value && value !== 'NOT_CONFIGURED' ? value : undefined;
};
const boundedString = (value: unknown, max = 500) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const assertActiveAdmin = async (uid?: string): Promise<AIActor> => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data() || {};
  const role = String(data.role || '').toUpperCase();
  if (!snapshot.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can use AI Control.');
  }
  return {
    uid,
    role: role as AIActor['role'],
    organizationId: String(data.organizationId || 'lingland-main'),
  };
};

const requireSuperAdmin = (actor: AIActor) => {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only a super administrator can change AI control settings.');
  }
};

const loadConfig = async (): Promise<AIControlConfig> => {
  const snapshot = await AI_CONFIG_REF.get();
  return mergeAIControlConfig(snapshot.exists ? snapshot.data() : undefined);
};

const writeAIAudit = async (input: {
  actor: AIActor;
  eventType: string;
  entityType: string;
  entityId: string;
  mode: string;
  scope?: string;
  risk?: string;
  confidence?: number;
  approvalStatus?: string;
  result: string;
  summary: Record<string, unknown>;
  executionAttempted?: boolean;
  externalCommunicationAttempted?: boolean;
}) => {
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
    executionAttempted: input.executionAttempted === true,
    externalCommunicationAttempted: input.externalCommunicationAttempted === true,
    inputSummary: input.summary,
  }));
  return ref.id;
};

const writeCoreAIEvent = async (input: {
  actor: AIActor;
  action: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields?: string[];
}) => {
  const [eventRef, settings] = await Promise.all([
    Promise.resolve(db.collection('auditEvents').doc()),
    db.collection('system').doc('settings').get(),
  ]);
  await writeAuditEvent(eventRef.id, {
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

const asCallableError = (error: unknown, fallback: string) => {
  if (error instanceof functions.https.HttpsError) return error;
  if (error instanceof DeepSeekClientError) {
    return new functions.https.HttpsError(
      error.status === 401 ? 'failed-precondition' : 'unavailable',
      error.message,
    );
  }
  return new functions.https.HttpsError('internal', fallback);
};

const countQuery = async (query: admin.firestore.Query) => {
  const result = await query.count().get();
  return result.data().count;
};

const serializeDocs = (snapshot: admin.firestore.QuerySnapshot) => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

const SYSTEM_AI_ACTOR: AIActor = {
  uid: 'AI_AUTOPILOT_SYSTEM',
  role: 'SUPER_ADMIN',
  organizationId: 'lingland-main',
};

const advancedMode = (mode: string) => ['ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(mode);

export const getAIControlState = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const requestedLimit = Math.max(20, Math.min(200, Number(data?.limit) || 100));
  const suggestionCollection = db.collection('aiSuggestions');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [config, suggestions, runs, executions, auditEvents, pendingCount, observedCount, approvedCount, executedCount, failedCount, rejectedCount, dismissedCount, reviewedLast30Days, openTaskCount, goLive] = await Promise.all([
    loadConfig(),
    suggestionCollection.orderBy('createdAt', 'desc').limit(requestedLimit).get(),
    db.collection('aiRuns').orderBy('createdAt', 'desc').limit(30).get(),
    db.collection('aiActionExecutions').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('aiAuditEvents').orderBy('createdAt', 'desc').limit(50).get(),
    countQuery(suggestionCollection.where('status', '==', 'PENDING')),
    countQuery(suggestionCollection.where('status', '==', 'OBSERVED')),
    countQuery(suggestionCollection.where('status', '==', 'APPROVED')),
    countQuery(suggestionCollection.where('status', '==', 'EXECUTED')),
    countQuery(suggestionCollection.where('status', '==', 'FAILED')),
    countQuery(suggestionCollection.where('status', '==', 'REJECTED')),
    countQuery(suggestionCollection.where('status', '==', 'DISMISSED')),
    countQuery(suggestionCollection.where('reviewedAt', '>=', thirtyDaysAgo)),
    countQuery(db.collection('aiOperationalTasks').where('status', '==', 'OPEN')),
    db.collection('goLiveControl').doc('current').get(),
  ]);

  const goLiveData = goLive.data() || {};
  const checklist = goLiveData.checklist && typeof goLiveData.checklist === 'object'
    ? Object.values(goLiveData.checklist as Record<string, unknown>)
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
      implementationStage: 'AUTOPILOT_ENGINE',
      readOnlyAnalysis: true,
      suggestions: true,
      humanReview: true,
      structuredFeedback: true,
      execution: true,
      rollback: true,
      outcomeVerification: true,
      scheduledReviews: true,
      externalCommunication: true,
      advancedModesLocked: false,
      unlockRequirements: [
        { id: 'go_live', label: 'Production go-live controls signed off', satisfied: manualGoLiveSignedOff },
        { id: 'review_history', label: 'Reviewed AI evidence is available', satisfied: reviewedLast30Days >= 30 },
        { id: 'execution_tools', label: 'Validated reversible action tools', satisfied: true },
        { id: 'activation_ack', label: 'Super admin accepted the automation boundary', satisfied: Boolean(config.automationAcknowledgedAt) },
        { id: 'live_execution_ack', label: 'Super admin accepted the live-write boundary', satisfied: Boolean(config.liveExecutionAcknowledgedAt) },
      ],
    },
    counts: {
      pending: pendingCount,
      observed: observedCount,
      approved: approvedCount,
      executed: executedCount,
      failed: failedCount,
      rejected: rejectedCount,
      dismissed: dismissedCount,
      reviewedLast30Days,
      openTasks: openTaskCount,
    },
    actionRegistry: Object.values(AI_ACTION_REGISTRY),
    suggestions: serializeDocs(suggestions),
    runs: serializeDocs(runs),
    executions: serializeDocs(executions),
    auditEvents: serializeDocs(auditEvents),
    viewer: { role: actor.role, canManageSettings: actor.role === 'SUPER_ADMIN' },
  });
});

export const updateAIControlSettings = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  requireSuperAdmin(actor);
  const before = await loadConfig();
  let patch: Partial<AIControlConfig>;
  try {
    patch = validateAIControlPatch(data?.settings);
  } catch (error) {
    throw new functions.https.HttpsError('failed-precondition', error instanceof Error ? error.message : 'Invalid AI settings.');
  }
  const requestedMode = String(patch.mode || before.mode);
  if (advancedMode(requestedMode) && !before.automationAcknowledgedAt) {
    if (String(data?.activationConfirmation || '') !== 'ENABLE LINGLAND AUTOPILOT') {
      throw new functions.https.HttpsError('failed-precondition', 'Type ENABLE LINGLAND AUTOPILOT to acknowledge the automation boundary.');
    }
    patch.automationAcknowledgedAt = nowIso();
    patch.automationAcknowledgedBy = actor.uid;
  }
  if (patch.executionEnabled === true && !advancedMode(requestedMode)) {
    throw new functions.https.HttpsError('failed-precondition', 'Execution can only be enabled in Assisted or Autopilot mode.');
  }
  const enablingLiveExecution = patch.executionEnabled === true
    && patch.simulationOnly === false
    && (!before.executionEnabled || before.simulationOnly)
    && !before.liveExecutionAcknowledgedAt;
  if (enablingLiveExecution) {
    if (String(data?.liveExecutionConfirmation || '') !== 'ENABLE LIVE EXECUTION') {
      throw new functions.https.HttpsError('failed-precondition', 'Type ENABLE LIVE EXECUTION to acknowledge platform writes.');
    }
    patch.liveExecutionAcknowledgedAt = nowIso();
    patch.liveExecutionAcknowledgedBy = actor.uid;
  }
  if (patch.autoExecuteHighRisk === true && requestedMode !== 'FULL_AUTOPILOT') {
    throw new functions.https.HttpsError('failed-precondition', 'High-risk automatic execution is available only in Full Autopilot.');
  }
  if (patch.externalCommunicationEnabled === true && !before.externalCommunicationEnabled) {
    if (requestedMode !== 'FULL_AUTOPILOT' || String(data?.externalCommunicationConfirmation || '') !== 'ENABLE EXTERNAL COMMUNICATION') {
      throw new functions.https.HttpsError('failed-precondition', 'External communication requires Full Autopilot and explicit confirmation.');
    }
  }
  if (patch.scheduledReviewsEnabled === true && requestedMode === 'OFF') {
    throw new functions.https.HttpsError('failed-precondition', 'Scheduled reviews cannot run while AI Control is off.');
  }
  const requestedScheduledScopes = patch.scheduledScopes || before.scheduledScopes;
  if (patch.scheduledReviewsEnabled === true && requestedScheduledScopes.length === 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Select at least one scheduled review scope.');
  }
  if (!advancedMode(requestedMode)) {
    patch.executionEnabled = false;
    patch.externalCommunicationEnabled = false;
  }
  if (Object.keys(patch).length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No supported AI settings were supplied.');
  }

  const changedFields = Object.keys(patch);
  const next = mergeAIControlConfig({
    ...before,
    ...patch,
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
      summary: {
        changedFields,
        executionEnabled: next.executionEnabled,
        simulationOnly: next.simulationOnly,
        externalCommunicationEnabled: next.externalCommunicationEnabled,
        emergencyPaused: next.emergencyPaused,
      },
    }),
    writeCoreAIEvent({
      actor,
      action: 'AI_SETTINGS_UPDATED',
      entityId: 'system/aiControl',
      before: clean(before) as unknown as Record<string, unknown>,
      after: clean(next) as unknown as Record<string, unknown>,
      changedFields,
    }),
  ]);
  return { success: true, config: next };
});

export const testDeepSeekConnection = functions.runWith(SAFE_RUNTIME).https.onCall(async (_data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const config = await loadConfig();
  const apiKey = deepSeekApiKey();
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'DEEPSEEK_API_KEY is not configured in Firebase Secret Manager.');
  }
  const testedAt = nowIso();
  try {
    const result = await testProviderConnection(apiKey);
    const supportedModels = result.models.filter((model: string) => model.startsWith('deepseek-'));
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
  } catch (error) {
    const invalidKey = error instanceof DeepSeekClientError && error.status === 401;
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
      summary: { providerStatus: error instanceof DeepSeekClientError ? error.status || 'NETWORK' : 'UNKNOWN', apiKeyExposed: false },
    });
    throw asCallableError(error, 'DeepSeek connection test failed.');
  }
});

const runReviewForActor = async (input: {
  actor: AIActor;
  scope: AIReviewScope;
  config: AIControlConfig;
  trigger: 'AUTO_REVIEW' | 'SCHEDULED_REVIEW';
}) => {
  const { actor, scope, config } = input;
  if (config.mode === 'OFF') throw new functions.https.HttpsError('failed-precondition', 'AI Control is off.');
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
    trigger: input.trigger,
    createdAt,
      createdBy: actor.uid,
    executionAttempted: false,
    externalCommunicationAttempted: false,
  });

  try {
    const reviewContext = await buildAIReviewContext(scope);
    const result = await runAIOrchestrator({
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
    const executionCandidateIds: string[] = [];

    for (const draft of result.suggestions) {
      const fingerprint = suggestionFingerprint(draft);
      const previous = existing.get(fingerprint);
      if (previous) {
        if (config.mode !== 'READ_ONLY_AUDIT' && previous.status === 'OBSERVED') {
          batch.set(previous.ref, {
            status: 'PENDING',
            promotedAt: nowIso(),
            promotedByRunId: runRef.id,
            latestRunId: runRef.id,
            updatedAt: nowIso(),
          }, { merge: true });
          promotedCount += 1;
          executionCandidateIds.push(previous.ref.id);
        } else {
          duplicateCount += 1;
        }
        continue;
      }

      const suggestionRef = db.collection('aiSuggestions').doc();
      const definition = AI_ACTION_REGISTRY[draft.action];
      const suggestionStatus = config.mode === 'READ_ONLY_AUDIT' ? 'OBSERVED' : 'PENDING';
      batch.set(suggestionRef, clean({
        id: suggestionRef.id,
        schemaVersion: 1,
        runId: runRef.id,
        latestRunId: runRef.id,
        scope,
        mode: config.mode,
        status: suggestionStatus,
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
        executionAvailable: definition.executionAvailable,
        approvalExecutesAction: isExecutionMode(config.mode),
        externalCommunication: definition.externalCommunication,
        rollbackAvailable: definition.reversible,
        executionHandler: definition.handler,
        proposedParameters: draft.proposedParameters || {},
        createdAt: nowIso(),
        createdBy: actor.uid,
      }));
      existing.set(fingerprint, {
        ref: suggestionRef,
        status: suggestionStatus,
      });
      if (suggestionStatus === 'PENDING') executionCandidateIds.push(suggestionRef.id);
      createdCount += 1;
    }
    await batch.commit();

    const automaticResults = isExecutionMode(config.mode)
      ? await executeAutomaticSuggestions({
        db,
        suggestionIds: executionCandidateIds,
        actor,
        config,
        trigger: input.trigger,
      })
      : [];
    const succeededActions = automaticResults.filter(item => ['SUCCEEDED', 'SIMULATED'].includes(item.status)).length;
    const failedActions = automaticResults.filter(item => item.status === 'FAILED').length;
    const blockedActions = automaticResults.filter(item => item.status === 'BLOCKED').length;
    const executionAttempted = automaticResults.some(item => item.status === 'SUCCEEDED');
    const externalCommunicationAttempted = automaticResults.some(item => item.externalCommunicationAttempted === true);

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
      automaticExecutionCandidateCount: executionCandidateIds.length,
      automaticExecutionSucceededCount: succeededActions,
      automaticExecutionFailedCount: failedActions,
      automaticExecutionBlockedCount: blockedActions,
      executionAttempted,
      externalCommunicationAttempted,
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
        executionCandidateCount: executionCandidateIds.length,
        succeededActions,
        failedActions,
        blockedActions,
        executionAttempted,
        externalCommunicationAttempted,
      },
      executionAttempted,
      externalCommunicationAttempted,
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
      automaticExecution: { candidates: executionCandidateIds.length, succeeded: succeededActions, failed: failedActions, blocked: blockedActions },
      executionAttempted,
      externalCommunicationAttempted,
    };
  } catch (error) {
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
};

export const runAIReview = functions.runWith(SAFE_RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const scope = String(data?.scope || '').toUpperCase() as AIReviewScope;
  if (!(AI_REVIEW_SCOPES as readonly string[]).includes(scope)) {
    throw new functions.https.HttpsError('invalid-argument', 'A supported review scope is required.');
  }
  const config = await loadConfig();
  return runReviewForActor({ actor, scope, config, trigger: 'AUTO_REVIEW' });
});

export const runScheduledAIReviews = functions.runWith(SAFE_RUNTIME).pubsub
  .schedule('every 30 minutes')
  .timeZone('Europe/London')
  .onRun(async () => {
    const config = await loadConfig();
    if (!config.scheduledReviewsEnabled || config.mode === 'OFF' || config.emergencyPaused) {
      return { skipped: true, reason: config.emergencyPaused ? 'EMERGENCY_PAUSED' : 'SCHEDULE_DISABLED' };
    }
    const lastRunAt = config.lastScheduledRunAt ? new Date(config.lastScheduledRunAt).getTime() : 0;
    if (lastRunAt && Date.now() - lastRunAt < config.scheduleIntervalMinutes * 60 * 1000 - 60_000) {
      return { skipped: true, reason: 'NOT_DUE' };
    }
    const results: Array<Record<string, unknown>> = [];
    for (const scope of config.scheduledScopes) {
      try {
        results.push(clean(await runReviewForActor({ actor: SYSTEM_AI_ACTOR, scope, config, trigger: 'SCHEDULED_REVIEW' })));
      } catch (error) {
        results.push({ scope, error: error instanceof Error ? boundedString(error.message, 180) : 'Scheduled review failed.' });
      }
    }
    const outcomeVerification = await verifyAIExecutionOutcomes({ db, actor: SYSTEM_AI_ACTOR, limit: 50 });
    const completedAt = nowIso();
    await AI_CONFIG_REF.set({ lastScheduledRunAt: completedAt }, { merge: true });
    await writeAIAudit({
      actor: SYSTEM_AI_ACTOR,
      eventType: 'SCHEDULED_AUTOPILOT_CYCLE_COMPLETED',
      entityType: 'AI_SCHEDULE',
      entityId: completedAt,
      mode: config.mode,
      result: 'SUCCESS',
      summary: { scopes: config.scheduledScopes, results, outcomeVerification },
    });
    return { skipped: false, completedAt, scopes: results.length, outcomeVerification };
  });

export const reviewAISuggestion = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const suggestionId = boundedString(data?.suggestionId, 160);
  const decision = String(data?.decision || '').toUpperCase();
  const note = boundedString(data?.note, 500);
  const executeNow = data?.executeNow !== false;
  const statusByDecision: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', DISMISS: 'DISMISSED' };
  if (!suggestionId || !statusByDecision[decision]) {
    throw new functions.https.HttpsError('invalid-argument', 'A suggestion and supported review decision are required.');
  }
  const suggestionRef = db.collection('aiSuggestions').doc(suggestionId);
  const reviewedAt = nowIso();
  let before: Record<string, unknown> = {};

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(suggestionRef);
    if (!snapshot.exists) throw new functions.https.HttpsError('not-found', 'AI suggestion not found.');
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
      executionResult: decision === 'APPROVE' ? 'PENDING_POLICY_EVALUATION' : 'NOT_APPLICABLE',
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
      result: 'DECISION_RECORDED',
      summary: { decision, executeNow, noteProvided: Boolean(note) },
    }),
    writeCoreAIEvent({
      actor,
      action: 'AI_SUGGESTION_REVIEWED',
      entityId: suggestionId,
      before: { status: before.status },
      after: { status: statusByDecision[decision], executeNow },
      changedFields: ['status', 'reviewDecision', 'reviewedAt', 'reviewedBy'],
    }),
  ]);
  let execution: Record<string, unknown> | null = null;
  if (decision === 'APPROVE' && executeNow) {
    try {
      execution = clean(await executeAISuggestionAction({
        db,
        suggestionId,
        actor,
        humanApproved: true,
        trigger: 'HUMAN_APPROVAL',
      })) as unknown as Record<string, unknown>;
    } catch (error) {
      execution = { success: false, status: 'FAILED', reason: error instanceof Error ? boundedString(error.message, 240) : 'Execution failed.' };
    }
  }
  return {
    success: true,
    suggestionId,
    status: statusByDecision[decision],
    executionAttempted: Boolean(execution && execution.status === 'SUCCEEDED'),
    execution,
  };
});

export const executeAIAction = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const suggestionId = boundedString(data?.suggestionId, 160);
  if (!suggestionId) throw new functions.https.HttpsError('invalid-argument', 'suggestionId is required.');
  const suggestion = await db.collection('aiSuggestions').doc(suggestionId).get();
  if (!suggestion.exists) throw new functions.https.HttpsError('not-found', 'AI suggestion not found.');
  if (!['APPROVED', 'FAILED'].includes(String(suggestion.data()?.status || ''))) {
    throw new functions.https.HttpsError('failed-precondition', 'Approve the suggestion before executing it manually.');
  }
  try {
    return await executeAISuggestionAction({ db, suggestionId, actor, humanApproved: true, trigger: 'MANUAL_EXECUTION' });
  } catch (error) {
    throw new functions.https.HttpsError('failed-precondition', error instanceof Error ? error.message : 'AI action failed.');
  }
});

export const rollbackAIAction = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  requireSuperAdmin(actor);
  const executionId = boundedString(data?.executionId, 160);
  if (!executionId) throw new functions.https.HttpsError('invalid-argument', 'executionId is required.');
  try {
    return await rollbackAIExecution({ db, executionId, actor });
  } catch (error) {
    throw new functions.https.HttpsError('failed-precondition', error instanceof Error ? error.message : 'Rollback failed.');
  }
});

export const verifyAIOutcomes = functions.https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  return verifyAIExecutionOutcomes({ db, actor, limit: Number(data?.limit) || 50 });
});

export const submitAISuggestionFeedback = functions.https.onCall(async (data, context) => {
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
  if (!snapshot.exists) throw new functions.https.HttpsError('not-found', 'AI suggestion not found.');
  const suggestion = snapshot.data() || {};
  const feedbackRef = db.collection('aiFeedback').doc();
  const memoryRef = db.collection('aiLearningMemory').doc(String(suggestion.action || 'UNKNOWN'));
  const submittedAt = nowIso();

  await db.runTransaction(async transaction => {
    const memory = await transaction.get(memoryRef);
    const counts = (memory.data()?.feedbackCounts || {}) as Record<string, number>;
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
    mode: String(suggestion.mode || DEFAULT_AI_CONTROL_CONFIG.mode),
    scope: String(suggestion.scope || ''),
    risk: String(suggestion.risk || 'LOW'),
    confidence: Number(suggestion.confidence) || 0,
    result: 'SUCCESS',
    summary: { reason, commentProvided: Boolean(comment), learningMemoryUpdated: true },
  });
  return { success: true, feedbackId: feedbackRef.id, learningMemoryUpdated: true };
});
