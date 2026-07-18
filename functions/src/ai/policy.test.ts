import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_REGISTRY,
  executionPolicyDecision,
  mergeAIControlConfig,
  normalizeConfidence,
  suggestionFingerprint,
  validateAIControlPatch,
} from './policy';

describe('AI control policy', () => {
  it('normalizes execution capabilities that do not belong to the selected mode', () => {
    const suggest = mergeAIControlConfig({
      mode: 'SUGGEST',
      executionEnabled: true,
      externalCommunicationEnabled: true,
      autoExecuteHighRisk: true,
    });
    const controlled = mergeAIControlConfig({
      mode: 'CONTROLLED_AUTOPILOT',
      executionEnabled: true,
      externalCommunicationEnabled: true,
      autoExecuteHighRisk: true,
    });

    expect(suggest.executionEnabled).toBe(false);
    expect(suggest.externalCommunicationEnabled).toBe(false);
    expect(suggest.autoExecuteHighRisk).toBe(false);
    expect(controlled.executionEnabled).toBe(true);
    expect(controlled.externalCommunicationEnabled).toBe(false);
    expect(controlled.autoExecuteHighRisk).toBe(false);
  });

  it('accepts every implemented mode and rejects unknown modes', () => {
    expect(validateAIControlPatch({ mode: 'ASSISTED' })).toEqual({ mode: 'ASSISTED' });
    expect(validateAIControlPatch({ mode: 'CONTROLLED_AUTOPILOT' })).toEqual({ mode: 'CONTROLLED_AUTOPILOT' });
    expect(validateAIControlPatch({ mode: 'FULL_AUTOPILOT' })).toEqual({ mode: 'FULL_AUTOPILOT' });
    expect(() => validateAIControlPatch({ mode: 'UNBOUNDED' })).toThrow(/unsupported/i);
  });

  it('bounds confidence, review, action and schedule settings', () => {
    expect(normalizeConfidence(142)).toBe(100);
    expect(normalizeConfidence(-10)).toBe(0);
    expect(validateAIControlPatch({ minimumConfidence: 20, dailyRunLimit: 999, maxActionsPerRun: 99, dailyActionLimit: 0, scheduleIntervalMinutes: 120 }))
      .toEqual({ minimumConfidence: 50, dailyRunLimit: 50, maxActionsPerRun: 20, dailyActionLimit: 1, scheduleIntervalMinutes: 120 });
  });

  it('keeps the action registry closed, typed and explicit about side effects', () => {
    expect(Object.keys(AI_ACTION_REGISTRY)).toHaveLength(12);
    for (const action of Object.values(AI_ACTION_REGISTRY)) {
      expect(action.executionAvailable).toBe(true);
      expect(action.handler).not.toBe('NONE');
    }
    expect(AI_ACTION_REGISTRY.OFFER_INTERPRETER.externalCommunication).toBe(true);
    expect(AI_ACTION_REGISTRY.CREATE_CLIENT_INVOICE_DRAFT.externalCommunication).toBe(false);
  });

  it('requires human approval in Assisted mode', () => {
    const config = mergeAIControlConfig({
      mode: 'ASSISTED',
      executionEnabled: true,
      emergencyPaused: false,
      simulationOnly: true,
    });
    const definition = AI_ACTION_REGISTRY.CREATE_INTERNAL_ALERT;

    expect(executionPolicyDecision({ config, definition, confidence: 90 })).toEqual({ allowed: false, reason: 'HUMAN_APPROVAL_REQUIRED' });
    expect(executionPolicyDecision({ config, definition, confidence: 90, humanApproved: true })).toEqual({ allowed: true, reason: 'HUMAN_APPROVED_SIMULATION' });
  });

  it('allows only configured automatic risk tiers in Controlled Autopilot', () => {
    const config = mergeAIControlConfig({
      mode: 'CONTROLLED_AUTOPILOT',
      executionEnabled: true,
      emergencyPaused: false,
      simulationOnly: false,
      autoExecuteLowRisk: true,
      autoExecuteMediumRisk: true,
      requireApprovalForMediumRisk: true,
    });

    expect(executionPolicyDecision({ config, definition: AI_ACTION_REGISTRY.CREATE_INTERNAL_ALERT, confidence: 90 }))
      .toEqual({ allowed: true, reason: 'LOW_RISK_POLICY' });
    expect(executionPolicyDecision({ config, definition: AI_ACTION_REGISTRY.PLACE_JOB_ON_HOLD, confidence: 90 }))
      .toEqual({ allowed: false, reason: 'MEDIUM_RISK_APPROVAL_REQUIRED' });
    expect(executionPolicyDecision({ config, definition: AI_ACTION_REGISTRY.OFFER_INTERPRETER, confidence: 90 }))
      .toEqual({ allowed: false, reason: 'HIGH_RISK_APPROVAL_REQUIRED' });
  });

  it('requires Full Autopilot and an explicit high-risk policy for automatic offers', () => {
    const config = mergeAIControlConfig({
      mode: 'FULL_AUTOPILOT',
      executionEnabled: true,
      emergencyPaused: false,
      simulationOnly: false,
      autoExecuteHighRisk: true,
      requireApprovalForHighRisk: false,
    });
    expect(executionPolicyDecision({ config, definition: AI_ACTION_REGISTRY.OFFER_INTERPRETER, confidence: 90 }))
      .toEqual({ allowed: true, reason: 'HIGH_RISK_POLICY' });

    config.emergencyPaused = true;
    expect(executionPolicyDecision({ config, definition: AI_ACTION_REGISTRY.OFFER_INTERPRETER, confidence: 90 }))
      .toEqual({ allowed: false, reason: 'EMERGENCY_PAUSED' });
  });

  it('generates a stable fingerprint for equivalent findings', () => {
    const first = suggestionFingerprint({ action: 'REVIEW_ASSIGNMENT', entityType: 'BOOKING', entityId: 'job-1', title: ' Review assignment ' });
    const second = suggestionFingerprint({ action: 'REVIEW_ASSIGNMENT', entityType: 'BOOKING', entityId: 'job-1', title: 'review assignment' });
    expect(first).toBe(second);
  });
});
