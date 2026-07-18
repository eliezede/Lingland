import { describe, expect, it } from 'vitest';
import { normalizeAIControlState } from './aiControlStateNormalizer';

describe('normalizeAIControlState', () => {
  it('upgrades legacy callable payloads without weakening safety defaults', () => {
    const state = normalizeAIControlState({
      config: { mode: 'SUGGEST', emergencyPaused: false },
      provider: { configured: true, lastTestStatus: 'CONNECTED' },
      counts: { pending: 3 },
      suggestions: [{ id: 'suggestion-1' }],
      viewer: { role: 'SUPER_ADMIN', canManageSettings: true },
    });

    expect(state.config.mode).toBe('SUGGEST');
    expect(state.config.executionEnabled).toBe(false);
    expect(state.config.externalCommunicationEnabled).toBe(false);
    expect(state.config.simulationOnly).toBe(true);
    expect(state.config.scheduledScopes).toEqual(['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM']);
    expect(state.executions).toEqual([]);
    expect(state.actionRegistry).toEqual([]);
    expect(state.auditEvents).toEqual([]);
    expect(state.counts.pending).toBe(3);
    expect(state.counts.failed).toBe(0);
  });

  it('rejects malformed collections and unknown modes', () => {
    const state = normalizeAIControlState({
      config: { mode: 'UNSAFE', executionEnabled: true, scheduledScopes: 'JOBS' },
      executions: {},
      suggestions: null,
    });

    expect(state.config.mode).toBe('OFF');
    expect(state.config.scheduledScopes.length).toBeGreaterThan(0);
    expect(state.executions).toEqual([]);
    expect(state.suggestions).toEqual([]);
  });
});
