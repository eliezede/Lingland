import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_REGISTRY,
  mergeAIControlConfig,
  normalizeConfidence,
  suggestionFingerprint,
  validateAIControlPatch,
} from './policy';

describe('AI control policy', () => {
  it('locks execution and external communication regardless of stored values', () => {
    const config = mergeAIControlConfig({
      mode: 'SUGGEST',
      executionEnabled: true,
      externalCommunicationEnabled: true,
    });

    expect(config.mode).toBe('SUGGEST');
    expect(config.executionEnabled).toBe(false);
    expect(config.externalCommunicationEnabled).toBe(false);
  });

  it('rejects autonomous modes during the suggestions-only stage', () => {
    expect(() => validateAIControlPatch({ mode: 'CONTROLLED_AUTOPILOT' }))
      .toThrow(/locked/i);
  });

  it('bounds confidence and run settings', () => {
    expect(normalizeConfidence(142)).toBe(100);
    expect(normalizeConfidence(-10)).toBe(0);
    expect(validateAIControlPatch({ minimumConfidence: 20, dailyRunLimit: 999 }))
      .toEqual({ minimumConfidence: 50, dailyRunLimit: 50 });
  });

  it('defines only non-executing and non-communicating actions', () => {
    for (const action of Object.values(AI_ACTION_REGISTRY)) {
      expect(action.executionAvailable).toBe(false);
      expect(action.externalCommunication).toBe(false);
    }
  });

  it('generates a stable fingerprint for equivalent findings', () => {
    const first = suggestionFingerprint({ action: 'REVIEW_ASSIGNMENT', entityType: 'BOOKING', entityId: 'job-1', title: ' Review assignment ' });
    const second = suggestionFingerprint({ action: 'REVIEW_ASSIGNMENT', entityType: 'BOOKING', entityId: 'job-1', title: 'review assignment' });
    expect(first).toBe(second);
  });
});
