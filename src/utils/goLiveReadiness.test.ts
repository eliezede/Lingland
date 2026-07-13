import { describe, expect, it } from 'vitest';
import { evaluateGoLiveReadiness, isAutomatedReadinessClear } from './goLiveReadiness';

const platformMode = {
  operatingMode: 'AIRTABLE_MIRROR' as const,
  communicationMode: 'SUPPRESSED' as const,
  sourceOfTruth: 'AIRTABLE' as const,
  airtableImportMode: 'ON' as const,
  hybridOperationsEnabled: true,
  jobNumbering: { prefix: 'LING', year: 26, nextSequence: 17037, displayIncludesLanguage: true },
};

describe('go-live readiness', () => {
  it('requires explicit mirror and finance audits', () => {
    const gates = evaluateGoLiveReadiness({ platformMode, conflicts: [], recentRuns: [], auditEventCount: 1 });
    expect(gates.find(gate => gate.id === 'mirror')?.status).toBe('NOT_RUN');
    expect(gates.find(gate => gate.id === 'finance')?.status).toBe('NOT_RUN');
    expect(isAutomatedReadinessClear(gates)).toBe(false);
  });

  it('blocks missing records, finance issues and high conflicts', () => {
    const gates = evaluateGoLiveReadiness({
      platformMode,
      mirrorAudit: { matchedRecords: 20, missingInPlatformCount: 2, statusDivergenceCount: 1 } as any,
      financialAudit: { healthyInvoices: 10, affectedInvoices: 1 } as any,
      conflicts: [{ id: 'c1', severity: 'HIGH' }],
      recentRuns: [{ id: 'r1', success: true, dryRun: false }],
      auditEventCount: 2,
    });
    expect(gates.filter(gate => gate.status === 'BLOCKED').map(gate => gate.id)).toEqual(['mirror', 'finance', 'conflicts']);
  });

  it('passes when reconciliation, sync and audit evidence are clear', () => {
    const gates = evaluateGoLiveReadiness({
      platformMode,
      mirrorAudit: { matchedRecords: 20, missingInPlatformCount: 0, statusDivergenceCount: 0 } as any,
      financialAudit: { healthyInvoices: 10, affectedInvoices: 0 } as any,
      conflicts: [],
      recentRuns: [{ id: 'r1', success: true, dryRun: false }],
      auditEventCount: 2,
    });
    expect(isAutomatedReadinessClear(gates)).toBe(true);
  });
});
