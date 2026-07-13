import { PlatformModeSettings } from '../types';
import {
  AirtableMirrorAudit,
  AirtableSyncConflict,
  AirtableSyncRunSummary,
  FinancialReconciliationAudit,
} from '../services/airtableSyncService';

export type ReadinessGateStatus = 'PASS' | 'BLOCKED' | 'NOT_RUN';

export interface ReadinessGate {
  id: string;
  label: string;
  status: ReadinessGateStatus;
  detail: string;
}

export interface GoLiveReadinessInput {
  platformMode: PlatformModeSettings;
  mirrorAudit?: AirtableMirrorAudit | null;
  financialAudit?: FinancialReconciliationAudit | null;
  conflicts: AirtableSyncConflict[];
  recentRuns: AirtableSyncRunSummary[];
  auditEventCount: number;
}

export const evaluateGoLiveReadiness = (input: GoLiveReadinessInput): ReadinessGate[] => {
  const latestWriteRun = input.recentRuns.find(run => !run.dryRun);
  const highConflicts = input.conflicts.filter(conflict => conflict.severity === 'HIGH');
  const mirrorIssues = input.mirrorAudit
    ? input.mirrorAudit.missingInPlatformCount + input.mirrorAudit.statusDivergenceCount
    : 0;

  return [
    {
      id: 'mirror',
      label: 'Airtable mirror parity',
      status: input.mirrorAudit ? (mirrorIssues === 0 ? 'PASS' : 'BLOCKED') : 'NOT_RUN',
      detail: input.mirrorAudit
        ? `${input.mirrorAudit.matchedRecords} matched, ${input.mirrorAudit.missingInPlatformCount} missing, ${input.mirrorAudit.statusDivergenceCount} status divergences.`
        : 'Run the final mirror audit to calculate parity.',
    },
    {
      id: 'finance',
      label: 'Financial reconciliation',
      status: input.financialAudit ? (input.financialAudit.affectedInvoices === 0 ? 'PASS' : 'BLOCKED') : 'NOT_RUN',
      detail: input.financialAudit
        ? `${input.financialAudit.healthyInvoices} healthy invoices, ${input.financialAudit.affectedInvoices} affected.`
        : 'Run the final financial audit to verify invoice linkage and totals.',
    },
    {
      id: 'conflicts',
      label: 'Open synchronization conflicts',
      status: input.conflicts.length === 0 ? 'PASS' : 'BLOCKED',
      detail: `${input.conflicts.length} open conflict(s), including ${highConflicts.length} high severity.`,
    },
    {
      id: 'sync',
      label: 'Latest write synchronization',
      status: latestWriteRun ? (latestWriteRun.success === false ? 'BLOCKED' : 'PASS') : 'NOT_RUN',
      detail: latestWriteRun
        ? `${latestWriteRun.kind || 'Airtable sync'} ${latestWriteRun.success === false ? 'failed' : 'completed'}${latestWriteRun.finishedAt ? ` at ${latestWriteRun.finishedAt}` : ''}.`
        : 'No persisted write synchronization was found.',
    },
    {
      id: 'audit',
      label: 'Immutable audit trail',
      status: input.auditEventCount > 0 ? 'PASS' : 'BLOCKED',
      detail: `${input.auditEventCount} audit event(s) are currently recorded.`,
    },
    {
      id: 'communications',
      label: 'Transition communication guard',
      status: input.platformMode.sourceOfTruth === 'AIRTABLE' && input.platformMode.communicationMode === 'LIVE' ? 'BLOCKED' : 'PASS',
      detail: `${input.platformMode.sourceOfTruth} source with ${input.platformMode.communicationMode} communication mode.`,
    },
  ];
};

export const isAutomatedReadinessClear = (gates: ReadinessGate[]) => (
  gates.length > 0 && gates.every(gate => gate.status === 'PASS')
);
