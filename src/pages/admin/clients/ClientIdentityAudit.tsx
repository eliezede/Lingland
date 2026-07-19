import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CircleOff,
  Clock3,
  CheckCircle2,
  ChevronRight,
  Combine,
  Database,
  ExternalLink,
  FileSearch,
  GitBranch,
  Link2,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
  UserRoundSearch,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Spinner } from '../../../components/ui/Spinner';
import {
  ClientIdentityAuditResult,
  ClientIdentityAuditService,
  ClientIdentityCandidate,
  ClientIdentityConfidence,
  ClientMergeEligibility,
  ClientMergePreview,
  ClientMergeResult,
  ClientIdentityRisk,
  ClientIdentityDecision,
  ClientIdentityDecisionType,
  ClientHierarchyIntegrityResult,
  ClientFinanceHierarchyReconciliation,
  ClientInvoiceIdentityBlocker,
  ClientInvoiceIdentityResolutionResult,
} from '../../../services/clientIdentityAuditService';
import { ClientService } from '../../../services/clientService';
import { Client } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

type AuditTab = 'ORGANIZATIONS' | 'AGENTS';
type RiskFilter = 'ALL' | ClientIdentityRisk;

const confidenceClasses: Record<ClientIdentityConfidence, string> = {
  HIGH: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  REVIEW: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
};

const riskClasses: Record<ClientIdentityRisk, string> = {
  LOW: 'text-emerald-700 dark:text-emerald-300',
  MEDIUM: 'text-amber-700 dark:text-amber-300',
  HIGH: 'text-red-700 dark:text-red-300',
};

const eligibilityClasses: Record<ClientMergeEligibility, string> = {
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  REVIEW_REQUIRED: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  BLOCKED: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
};

const eligibilityLabel: Record<ClientMergeEligibility, string> = {
  READY: 'Ready for preview',
  REVIEW_REQUIRED: 'Review required',
  BLOCKED: 'Blocked',
};

const quantityLabel = (value: number, singular: string) => {
  const plural = singular.endsWith('y') ? `${singular.slice(0, -1)}ies` : `${singular}s`;
  return `${value.toLocaleString('en-GB')} ${value === 1 ? singular : plural}`;
};
const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'Empty';
  if (Array.isArray(value)) return value.join(', ') || 'Empty';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const Metric = ({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) => (
  <div className="min-h-[92px] min-w-0 border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-slate-800 sm:px-4">
    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-[10px] font-bold uppercase leading-4 tracking-wider">{label}</span>
    </div>
    <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{value.toLocaleString('en-GB')}</p>
  </div>
);

const IdentityBadge = ({ value }: { value: ClientIdentityConfidence }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${confidenceClasses[value]}`}>
    {value === 'REVIEW' ? 'Manual review' : `${value.toLowerCase()} confidence`}
  </span>
);

const EvidenceSummary = ({ candidate }: { candidate: ClientIdentityCandidate }) => (
  <div className="min-w-0 space-y-1">
    {candidate.evidence.slice(0, 2).map((evidence, index) => (
      <p key={`${evidence.type}-${evidence.value}-${index}`} className={`truncate text-xs ${evidence.strength === 'RISK' ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}>
        {evidence.label}: <span className="font-semibold">{evidence.value}</span>
      </p>
    ))}
    {candidate.evidence.length > 2 && (
      <p className="text-[11px] font-semibold text-slate-400">+{candidate.evidence.length - 2} more signals</p>
    )}
  </div>
);

export const ClientIdentityAudit = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [audit, setAudit] = useState<ClientIdentityAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<AuditTab>('ORGANIZATIONS');
  const [risk, setRisk] = useState<RiskFilter>('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ClientIdentityCandidate | null>(null);
  const [canonicalClientId, setCanonicalClientId] = useState('');
  const [mergePreview, setMergePreview] = useState<ClientMergePreview | null>(null);
  const [mergeResult, setMergeResult] = useState<ClientMergeResult | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [mergeConfirmation, setMergeConfirmation] = useState('');
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [rollbackConfirmation, setRollbackConfirmation] = useState('');
  const [integrity, setIntegrity] = useState<ClientHierarchyIntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(true);
  const [integrityError, setIntegrityError] = useState('');
  const [financePreview, setFinancePreview] = useState<ClientFinanceHierarchyReconciliation | null>(null);
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState('');
  const [financeConfirmation, setFinanceConfirmation] = useState('');
  const [financeRollbackConfirmation, setFinanceRollbackConfirmation] = useState('');
  const [identityBlocker, setIdentityBlocker] = useState<ClientInvoiceIdentityBlocker | null>(null);
  const [identityClients, setIdentityClients] = useState<Client[]>([]);
  const [identityClientQuery, setIdentityClientQuery] = useState('');
  const [identitySelectedClientId, setIdentitySelectedClientId] = useState('');
  const [identityConfirmation, setIdentityConfirmation] = useState('');
  const [identityRollbackConfirmation, setIdentityRollbackConfirmation] = useState('');
  const [identityResolutionResult, setIdentityResolutionResult] = useState<ClientInvoiceIdentityResolutionResult | null>(null);
  const [identityResolverOpen, setIdentityResolverOpen] = useState(false);
  const [identityResolverLoading, setIdentityResolverLoading] = useState(false);
  const [identityResolverError, setIdentityResolverError] = useState('');
  const [decisionMode, setDecisionMode] = useState<ClientIdentityDecisionType | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionRevisitAt, setDecisionRevisitAt] = useState('');
  const [splitAssignments, setSplitAssignments] = useState<Record<string, string>>({});
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [approvalReviewNote, setApprovalReviewNote] = useState('');

  const loadAudit = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      setAudit(await ClientIdentityAuditService.getAudit(forceRefresh));
    } catch (loadError) {
      console.error('Failed to load client identity audit', loadError);
      setError(loadError instanceof Error ? loadError.message : 'The identity audit could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    setIntegrityError('');
    try {
      setIntegrity(await ClientIdentityAuditService.getHierarchyIntegrity());
    } catch (loadError) {
      console.error('Failed to load client hierarchy integrity', loadError);
      setIntegrityError(loadError instanceof Error ? loadError.message : 'The hierarchy integrity audit could not be loaded.');
    } finally {
      setIntegrityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit(false);
    void loadIntegrity();
  }, [loadAudit, loadIntegrity]);

  const previewFinanceReconciliation = async () => {
    setFinanceModalOpen(true);
    setFinanceLoading(true);
    setFinanceError('');
    setFinancePreview(null);
    setFinanceConfirmation('');
    setFinanceRollbackConfirmation('');
    try {
      setFinancePreview(await ClientIdentityAuditService.previewFinanceHierarchyReconciliation());
    } catch (previewError) {
      console.error('Failed to preview finance hierarchy reconciliation', previewError);
      setFinanceError(previewError instanceof Error ? previewError.message : 'The finance reconciliation preview could not be prepared.');
    } finally {
      setFinanceLoading(false);
    }
  };

  const applyFinanceReconciliation = async () => {
    if (!financePreview) return;
    setFinanceLoading(true);
    setFinanceError('');
    try {
      const result = await ClientIdentityAuditService.applyFinanceHierarchyReconciliation(
        financePreview.fingerprint,
        financeConfirmation,
      );
      setFinancePreview(result);
      setFinanceConfirmation('');
      await loadIntegrity();
    } catch (applyError) {
      console.error('Failed to apply finance hierarchy reconciliation', applyError);
      setFinanceError(applyError instanceof Error ? applyError.message : 'The finance hierarchy reconciliation could not be applied.');
    } finally {
      setFinanceLoading(false);
    }
  };

  const rollbackFinanceReconciliation = async () => {
    if (!financePreview?.manifestId) return;
    setFinanceLoading(true);
    setFinanceError('');
    try {
      await ClientIdentityAuditService.rollbackFinanceHierarchyReconciliation(
        financePreview.manifestId,
        financeRollbackConfirmation,
      );
      setFinanceModalOpen(false);
      setFinancePreview(null);
      setFinanceRollbackConfirmation('');
      await loadIntegrity();
    } catch (rollbackError) {
      console.error('Failed to roll back finance hierarchy reconciliation', rollbackError);
      setFinanceError(rollbackError instanceof Error ? rollbackError.message : 'The finance hierarchy reconciliation could not be restored.');
    } finally {
      setFinanceLoading(false);
    }
  };

  const openInvoiceIdentityResolver = async (blocker: ClientInvoiceIdentityBlocker) => {
    setFinanceModalOpen(false);
    setIdentityBlocker(blocker);
    setIdentitySelectedClientId(blocker.candidateClientIds.length === 1 ? blocker.candidateClientIds[0] : '');
    setIdentityClientQuery('');
    setIdentityConfirmation('');
    setIdentityRollbackConfirmation('');
    setIdentityResolutionResult(null);
    setIdentityResolverError('');
    setIdentityResolverOpen(true);
    if (identityClients.length > 0) return;
    setIdentityResolverLoading(true);
    try {
      const clients = await ClientService.getAll();
      setIdentityClients(clients.sort((left, right) => left.companyName.localeCompare(right.companyName)));
    } catch (clientError) {
      console.error('Failed to load canonical clients for invoice identity repair', clientError);
      setIdentityResolverError(clientError instanceof Error ? clientError.message : 'Clients could not be loaded.');
    } finally {
      setIdentityResolverLoading(false);
    }
  };

  const applyInvoiceIdentityResolution = async () => {
    if (!identityBlocker || !financePreview || !identitySelectedClientId) return;
    setIdentityResolverLoading(true);
    setIdentityResolverError('');
    try {
      const result = await ClientIdentityAuditService.resolveClientInvoiceIdentity({
        invoiceId: identityBlocker.invoiceId,
        clientId: identitySelectedClientId,
        expectedFingerprint: financePreview.fingerprint,
        confirmation: identityConfirmation,
      });
      setIdentityResolutionResult(result);
      setIdentityConfirmation('');
      await loadIntegrity();
    } catch (resolutionError) {
      console.error('Failed to resolve invoice client identity', resolutionError);
      setIdentityResolverError(resolutionError instanceof Error ? resolutionError.message : 'The invoice client could not be linked.');
    } finally {
      setIdentityResolverLoading(false);
    }
  };

  const chooseInvoiceIdentityClient = (clientId: string) => {
    if (clientId === identitySelectedClientId) return;
    setIdentitySelectedClientId(clientId);
    setIdentityConfirmation('');
    setIdentityResolverError('');
  };

  const rollbackInvoiceIdentityResolution = async () => {
    if (!identityResolutionResult?.manifestId) return;
    setIdentityResolverLoading(true);
    setIdentityResolverError('');
    try {
      await ClientIdentityAuditService.rollbackFinanceHierarchyReconciliation(
        identityResolutionResult.manifestId,
        identityRollbackConfirmation,
      );
      setIdentityResolverOpen(false);
      setIdentityResolutionResult(null);
      await loadIntegrity();
    } catch (rollbackError) {
      console.error('Failed to restore invoice client identity', rollbackError);
      setIdentityResolverError(rollbackError instanceof Error ? rollbackError.message : 'The invoice client repair could not be restored.');
    } finally {
      setIdentityResolverLoading(false);
    }
  };

  const candidates = useMemo(() => {
    const source = tab === 'ORGANIZATIONS' ? audit?.organizationCandidates || [] : audit?.agentCandidates || [];
    const needle = query.trim().toLowerCase();
    return source.filter(candidate => {
      if (risk !== 'ALL' && candidate.mergeRisk !== risk) return false;
      if (!needle) return true;
      const searchable = [
        candidate.label,
        candidate.recommendation,
        ...candidate.departments,
        ...candidate.evidence.flatMap(item => [item.label, item.value]),
        ...candidate.records.flatMap(record => [record.id, record.companyName, record.contactPerson, ...record.contactEmails]),
      ].join(' ').toLowerCase();
      return searchable.includes(needle);
    });
  }, [audit, query, risk, tab]);

  const visibleIdentityClients = useMemo(() => {
    const needle = identityClientQuery.trim().toLowerCase();
    const suggestedIds = new Set(identityBlocker?.candidateClientIds || []);
    return identityClients
      .filter(client => {
        const companyName = client.companyName.trim().toLowerCase();
        if (['airtable client', 'translation client', 'unknown client', 'client'].includes(companyName)) return false;
        if (!needle) return true;
        return [client.companyName, client.id, client.sageAccountRef, client.airtableClientKey, client.invoiceEmail, client.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => {
        const leftSuggested = suggestedIds.has(left.id) ? 1 : 0;
        const rightSuggested = suggestedIds.has(right.id) ? 1 : 0;
        return rightSuggested - leftSuggested || left.companyName.localeCompare(right.companyName);
      })
      .slice(0, 30);
  }, [identityBlocker, identityClientQuery, identityClients]);

  const inspectedAt = audit?.generatedAt
    ? new Date(audit.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const selectedDecision = selected ? audit?.decisions?.find(decision => decision.candidateId === selected.id) : undefined;
  const splitGroupCount = decisionMode === 'SPLIT'
    ? new Set(selected?.records.map(record => splitAssignments[record.id]).filter(Boolean)).size
    : 0;

  const closeCandidate = () => {
    setSelected(null);
    setCanonicalClientId('');
    setMergePreview(null);
    setMergeResult(null);
    setMergeError('');
    setMergeConfirmation('');
    setReviewAcknowledged(false);
    setRollbackConfirmation('');
    setDecisionMode(null);
    setDecisionReason('');
    setDecisionNotes('');
    setDecisionRevisitAt('');
    setSplitAssignments({});
    setDecisionError('');
    setApprovalLoading(false);
    setApprovalError('');
    setApprovalReviewNote('');
  };

  const openCandidate = (candidate: ClientIdentityCandidate) => {
    closeCandidate();
    setSelected(candidate);
    setCanonicalClientId(candidate.recommendedClientId);
    setSplitAssignments(Object.fromEntries(candidate.records.map((record, index) => [record.id, String(index + 1)])));
  };

  const saveDecision = async () => {
    if (!selected || !decisionMode) return;
    setDecisionLoading(true);
    setDecisionError('');
    const partitions = decisionMode === 'SPLIT'
      ? Object.values(selected.records.reduce<Record<string, string[]>>((groups, record) => {
        const group = splitAssignments[record.id] || '';
        if (!group) return groups;
        groups[group] = [...(groups[group] || []), record.id];
        return groups;
      }, {}))
      : undefined;
    try {
      await ClientIdentityAuditService.saveDecision({
        candidateId: selected.id,
        expectedFingerprint: selected.fingerprint,
        decision: decisionMode,
        reason: decisionReason,
        notes: decisionNotes,
        revisitAt: decisionMode === 'DEFERRED' && decisionRevisitAt
          ? new Date(`${decisionRevisitAt}T12:00:00`).toISOString()
          : '',
        partitions,
      });
      closeCandidate();
      await loadAudit(true);
    } catch (decisionFailure) {
      console.error('Failed to save client identity decision', decisionFailure);
      setDecisionError(decisionFailure instanceof Error ? decisionFailure.message : 'The review decision could not be saved.');
    } finally {
      setDecisionLoading(false);
    }
  };

  const reopenDecision = async (decision: ClientIdentityDecision) => {
    setDecisionLoading(true);
    setError('');
    try {
      await ClientIdentityAuditService.saveDecision({
        candidateId: decision.candidateId,
        decision: 'REOPEN',
      });
      if (selected?.id === decision.candidateId) closeCandidate();
      await loadAudit(true);
    } catch (decisionFailure) {
      console.error('Failed to reopen client identity decision', decisionFailure);
      setError(decisionFailure instanceof Error ? decisionFailure.message : 'The review decision could not be reopened.');
    } finally {
      setDecisionLoading(false);
    }
  };

  const chooseCanonicalClient = (clientId: string) => {
    setCanonicalClientId(clientId);
    setMergePreview(null);
    setMergeResult(null);
    setMergeError('');
    setMergeConfirmation('');
    setReviewAcknowledged(false);
    setApprovalError('');
    setApprovalReviewNote('');
  };

  const prepareMerge = async (fieldSelections: Record<string, string> = {}) => {
    if (!selected || !canonicalClientId || selected.kind !== 'ORGANIZATION' || selected.executionEligibility === 'BLOCKED') return;
    setMergeLoading(true);
    setMergeError('');
    setMergeConfirmation('');
    setReviewAcknowledged(false);
    setApprovalError('');
    setApprovalReviewNote('');
    try {
      setMergePreview(await ClientIdentityAuditService.getMergePreview(selected.id, canonicalClientId, fieldSelections));
    } catch (previewError) {
      console.error('Failed to prepare client merge', previewError);
      setMergeError(previewError instanceof Error ? previewError.message : 'The merge preview could not be prepared.');
    } finally {
      setMergeLoading(false);
    }
  };

  const requestMergeApproval = async () => {
    if (!selected || !mergePreview) return;
    setApprovalLoading(true);
    setApprovalError('');
    try {
      const result = await ClientIdentityAuditService.requestMergeApproval({
        candidateId: selected.id,
        canonicalClientId: mergePreview.canonicalClientId,
        expectedFingerprint: mergePreview.expectedFingerprint,
        fieldSelections: mergePreview.fieldSelections,
      });
      setMergePreview(current => current ? { ...current, approval: result.approval } : current);
    } catch (approvalFailure) {
      console.error('Failed to request client merge approval', approvalFailure);
      setApprovalError(approvalFailure instanceof Error ? approvalFailure.message : 'The second approval could not be requested.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const reviewMergeApproval = async (decision: 'APPROVE' | 'REJECT') => {
    if (!mergePreview?.approval) return;
    setApprovalLoading(true);
    setApprovalError('');
    try {
      const result = await ClientIdentityAuditService.reviewMergeApproval(
        mergePreview.approval.id,
        decision,
        approvalReviewNote,
      );
      setMergePreview(current => current ? { ...current, approval: result.approval } : current);
      setApprovalReviewNote('');
    } catch (approvalFailure) {
      console.error('Failed to review client merge approval', approvalFailure);
      setApprovalError(approvalFailure instanceof Error ? approvalFailure.message : 'The second approval could not be reviewed.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const executeMerge = async () => {
    if (!selected || !mergePreview) return;
    setMergeLoading(true);
    setMergeError('');
    try {
      const result = await ClientIdentityAuditService.executeMerge({
        candidateId: selected.id,
        canonicalClientId: mergePreview.canonicalClientId,
        expectedFingerprint: mergePreview.expectedFingerprint,
        confirmation: mergeConfirmation,
        reviewAcknowledged,
        fieldSelections: mergePreview.fieldSelections,
      });
      setMergeResult(result);
      await loadAudit(true);
    } catch (mergeFailure) {
      console.error('Client merge failed', mergeFailure);
      setMergeError(mergeFailure instanceof Error ? mergeFailure.message : 'The client merge could not be completed.');
    } finally {
      setMergeLoading(false);
    }
  };

  const rollbackMerge = async () => {
    if (!mergeResult) return;
    setMergeLoading(true);
    setMergeError('');
    try {
      await ClientIdentityAuditService.rollbackMerge(mergeResult.manifestId, rollbackConfirmation);
      closeCandidate();
      await loadAudit(true);
    } catch (rollbackFailure) {
      console.error('Client merge rollback failed', rollbackFailure);
      setMergeError(rollbackFailure instanceof Error ? rollbackFailure.message : 'The merge could not be restored.');
    } finally {
      setMergeLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <PageHeader
        title="Client Identity Audit"
        subtitle="Evidence-led duplicate detection with reversible client consolidation and dependency control."
      >
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate('/admin/clients')}>Client CRM</Button>
        <Button variant="secondary" size="sm" icon={RefreshCw} isLoading={loading} onClick={() => void loadAudit(true)}>Refresh audit</Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 lg:px-5 lg:pb-5">
        <div className="flex flex-col gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <p><strong>Safe by default:</strong> refreshing the audit is read-only. A merge requires a live preview, fingerprint, Super Admin confirmation, second approval when material, and rollback manifest.</p>
          </div>
          {inspectedAt && <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-300">Generated {inspectedAt}</span>}
        </div>

        <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Hierarchy and finance integrity</h2>
                {integrity && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${integrity.readyForMembershipCutover ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'}`}>
                    {integrity.readyForMembershipCutover ? 'Cutover ready' : 'Reconciliation required'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Checks jobs, memberships, invoices and invoice lines before legacy client-wide access can be removed.</p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button className="w-full sm:w-auto" variant="secondary" size="sm" icon={RefreshCw} isLoading={integrityLoading} onClick={() => void loadIntegrity()}>Refresh integrity</Button>
              <Button className="w-full sm:w-auto" size="sm" icon={ReceiptText} disabled={!integrity || integrity.truncated} onClick={() => void previewFinanceReconciliation()}>Preview finance repair</Button>
            </div>
          </div>
          {integrityLoading && !integrity ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Spinner size="sm" /> Inspecting hierarchy relationships...</div>
          ) : integrityError && !integrity ? (
            <div className="flex min-h-24 items-center gap-2 px-4 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" /> {integrityError}</div>
          ) : integrity ? (
            <>
              <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 dark:divide-slate-800 sm:grid-cols-4 xl:grid-cols-8">
                {[
                  ['Jobs without department', integrity.summary.bookingsWithoutDepartment],
                  ['Jobs without requester', integrity.summary.bookingsWithoutRequester],
                  ['Invoices to backfill', integrity.summary.invoicesNeedingHierarchyBackfill],
                  ['Lines to backfill', integrity.summary.invoiceLinesNeedingHierarchyBackfill],
                  ['Identity repairs', integrity.summary.invoicesWithSuggestedClientRepair ?? integrity.financeBackfill.inferredClientAssignments?.length ?? 0],
                  ['Blocked invoices', integrity.summary.blockedCrossClientInvoices],
                  ['Critical links', integrity.summary.criticalIssues],
                  ['Warnings', integrity.summary.warningIssues],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase leading-4 tracking-wider text-slate-400">{label}</p>
                    <p className={`mt-1 text-lg font-semibold ${Number(value) > 0 && (label === 'Critical links' || label === 'Invoices to backfill') ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'}`}>{Number(value).toLocaleString('en-GB')}</p>
                  </div>
                ))}
              </div>
              {(integrity.summary.blockedCrossClientInvoices > 0 || integrity.truncated) && (
                <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {integrity.truncated ? 'The safety limit was reached. Reconciliation is disabled.' : `${integrity.summary.blockedCrossClientInvoices} invoice relationship(s) remain ambiguous or invalid and must be resolved before reconciliation.`}
                </div>
              )}
              {integrity.issues.length > 0 && (
                <details className="border-t border-slate-200 dark:border-slate-800">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50">
                    Inspect {Math.min(integrity.issues.length, 250).toLocaleString('en-GB')} hierarchy issue samples
                  </summary>
                  <div className="max-h-52 divide-y divide-slate-200 overflow-y-auto border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {integrity.issues.map(issue => (
                      <div key={`${issue.code}-${issue.entityType}-${issue.entityId}`} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[150px_minmax(0,1fr)_minmax(120px,0.35fr)]">
                        <span className={`font-bold ${issue.severity === 'CRITICAL' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{issue.code.replaceAll('_', ' ')}</span>
                        <span className="text-slate-700 dark:text-slate-300">{issue.message}</span>
                        <span className="truncate font-mono text-[10px] text-slate-400" title={issue.entityId}>{issue.entityId}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : null}
        </section>

        {audit?.truncated && (
          <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The client collection exceeded the 5,000-record safety limit. Results are partial and must not be used for merge preparation.
          </div>
        )}

        {error && audit && (
          <div className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && !audit ? (
          <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Spinner size="lg" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Comparing client identity and dependencies...</p>
          </div>
        ) : error && !audit ? (
          <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 border border-red-200 bg-white p-6 text-center dark:border-red-900/60 dark:bg-slate-900">
            <AlertTriangle className="h-7 w-7 text-red-600" />
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Audit unavailable</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void loadAudit(true)}>Try again</Button>
          </div>
        ) : audit ? (
          <>
            <div className="grid grid-cols-2 overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Client records" value={audit.summary.clientRecords} icon={Database} />
              <Metric label="Possible duplicates" value={audit.summary.duplicateOrganizationRecords} icon={Building2} />
              <Metric label="Repeated agents" value={audit.summary.agentCandidates} icon={UserRoundSearch} />
              <Metric label="High risk" value={audit.summary.highRiskCandidates} icon={AlertTriangle} />
              <Metric label="Jobs in scope" value={audit.summary.jobsAffected} icon={BriefcaseBusiness} />
              <Metric label="Invoices in scope" value={audit.summary.invoicesAffected} icon={ReceiptText} />
            </div>

            {(audit.decisions || []).length > 0 && (
              <details className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <Clock3 className="h-4 w-4 shrink-0 text-blue-600" />
                    Saved review decisions
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {audit.decisionSummary?.deferred || 0} deferred · {audit.decisionSummary?.rejected || 0} not duplicates · {audit.decisionSummary?.split || 0} split
                  </span>
                </summary>
                <div className="max-h-64 divide-y divide-slate-200 overflow-y-auto border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {(audit.decisions || []).map(decision => (
                    <div key={decision.id} className="grid gap-2 px-3 py-2.5 text-xs sm:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1.4fr)_minmax(130px,0.7fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{decision.candidateLabel || decision.candidateId}</p>
                        <p className="mt-0.5 font-mono text-[9px] text-slate-400">{decision.clientIds.length} source records</p>
                      </div>
                      <div className="min-w-0">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${decision.decision === 'DEFERRED' ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300' : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                          {decision.decision === 'REJECTED' ? 'Not duplicates' : decision.decision === 'SPLIT' ? 'Split recorded' : 'Deferred'}
                        </span>
                        {decision.stale && <span className="ml-1.5 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300">New evidence</span>}
                        <p className="mt-1 truncate text-slate-500 dark:text-slate-400" title={decision.reason}>{decision.reason}</p>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        <p>{decision.decidedByName || 'Administrator'}</p>
                        <p className="mt-0.5 text-[10px]">{new Date(decision.updatedAt || decision.decidedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                      <Button variant="secondary" size="sm" icon={Undo2} disabled={decisionLoading} onClick={() => void reopenDecision(decision)}>Reopen</Button>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="flex min-h-0 flex-1 flex-col border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-2 border-b border-slate-200 p-2 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div className="inline-flex h-9 w-full items-center rounded-md bg-slate-100 p-1 dark:bg-slate-800 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setTab('ORGANIZATIONS')}
                    className={`flex h-7 flex-1 items-center justify-center gap-2 rounded px-3 text-xs font-semibold sm:flex-none ${tab === 'ORGANIZATIONS' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    <Building2 className="h-3.5 w-3.5" /> Organisations
                    <span className="rounded-full bg-slate-100 px-1.5 text-[10px] dark:bg-slate-800">{audit.summary.organizationCandidates}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('AGENTS')}
                    className={`flex h-7 flex-1 items-center justify-center gap-2 rounded px-3 text-xs font-semibold sm:flex-none ${tab === 'AGENTS' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    <Users className="h-3.5 w-3.5" /> Agents
                    <span className="rounded-full bg-slate-100 px-1.5 text-[10px] dark:bg-slate-800">{audit.summary.agentCandidates}</span>
                  </button>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Search organisation, agent, email or source ID"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <select
                    aria-label="Filter by merge risk"
                    value={risk}
                    onChange={event => setRisk(event.target.value as RiskFilter)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="ALL">All risk levels</option>
                    <option value="HIGH">High risk</option>
                    <option value="MEDIUM">Medium risk</option>
                    <option value="LOW">Low risk</option>
                  </select>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center px-5 text-center">
                  <ShieldCheck className="h-8 w-8 text-emerald-600" />
                  <h2 className="mt-3 font-semibold text-slate-950 dark:text-white">No candidates in this view</h2>
                  <p className="mt-1 max-w-lg text-sm text-slate-500 dark:text-slate-400">
                    {query || risk !== 'ALL' ? 'Change the search or risk filter.' : 'The deterministic audit found no repeated identities for this category.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden min-h-0 flex-1 overflow-auto md:block">
                    <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                      <colgroup>
                        <col className="w-[25%]" />
                        <col className="w-[29%]" />
                        <col className="w-[17%]" />
                        <col className="w-[25%]" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                        <tr>
                          <th className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">Candidate</th>
                          <th className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">Evidence</th>
                          <th className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">Structure</th>
                          <th className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">Operational impact</th>
                          <th className="w-12 border-b border-slate-200 px-3 py-3 dark:border-slate-800"><span className="sr-only">Inspect</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {candidates.map(candidate => (
                          <tr key={candidate.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="max-w-[260px] px-4 py-3 align-top">
                              <button type="button" onClick={() => openCandidate(candidate)} className="w-full min-w-0 text-left">
                                <span className="block truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{candidate.label}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-2">
                                  <IdentityBadge value={candidate.confidence} />
                                  {candidate.reviewDecision?.decision === 'DEFERRED' && <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">Deferred</span>}
                                  {candidate.kind === 'ORGANIZATION' && <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${eligibilityClasses[candidate.executionEligibility]}`}>{eligibilityLabel[candidate.executionEligibility]}</span>}
                                  <span className={`text-[10px] font-bold uppercase ${riskClasses[candidate.mergeRisk]}`}>{candidate.mergeRisk.toLowerCase()} risk</span>
                                </span>
                              </button>
                            </td>
                            <td className="max-w-[300px] px-4 py-3 align-top"><EvidenceSummary candidate={candidate} /></td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{quantityLabel(candidate.totals.records, 'record')}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{quantityLabel(candidate.departments.length, 'department')} · {quantityLabel(candidate.totals.linkedUsers, 'linked user')}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{quantityLabel(candidate.totals.jobs, 'job')} · {quantityLabel(candidate.totals.invoices, 'invoice')}</p>
                              {candidate.kind === 'ORGANIZATION' && (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Would reassign {quantityLabel(candidate.totals.jobsToReassign, 'job')} and {quantityLabel(candidate.totals.invoicesToReassign, 'invoice')}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <button type="button" aria-label={`Inspect ${candidate.label}`} onClick={() => openCandidate(candidate)} className="rounded-md p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {candidates.map(candidate => (
                        <button key={candidate.id} type="button" onClick={() => openCandidate(candidate)} className="block w-full px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{candidate.label}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <IdentityBadge value={candidate.confidence} />
                                {candidate.reviewDecision?.decision === 'DEFERRED' && <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">Deferred</span>}
                                {candidate.kind === 'ORGANIZATION' && <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${eligibilityClasses[candidate.executionEligibility]}`}>{eligibilityLabel[candidate.executionEligibility]}</span>}
                                <span className={`text-[10px] font-bold uppercase ${riskClasses[candidate.mergeRisk]}`}>{candidate.mergeRisk.toLowerCase()} risk</span>
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                          </div>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{quantityLabel(candidate.totals.records, 'record')} · {quantityLabel(candidate.totals.jobs, 'job')} · {quantityLabel(candidate.totals.invoices, 'invoice')}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>{quantityLabel(candidates.length, 'candidate')} shown</span>
                <span>Email identifies an agent, not an organisation.</span>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={closeCandidate}
        title={selected ? `${selected.kind === 'ORGANIZATION' ? 'Organisation' : 'Agent'} candidate: ${selected.label}` : 'Identity candidate'}
        type="drawer"
        footer={selected ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            {mergeResult ? (
              <>
                <Button variant="secondary" onClick={closeCandidate}>Close</Button>
                <Button variant="danger" icon={Undo2} isLoading={mergeLoading} disabled={rollbackConfirmation.toUpperCase() !== 'ROLLBACK CLIENT MERGE'} onClick={() => void rollbackMerge()}>Restore merge</Button>
              </>
            ) : mergePreview ? (
              <>
                <Button variant="secondary" onClick={() => { setMergePreview(null); setMergeError(''); }}>Back</Button>
                <Button
                  icon={Combine}
                  isLoading={mergeLoading}
                  disabled={
                    !isSuperAdmin
                    || !mergePreview.canExecute
                    || mergeConfirmation.toUpperCase() !== mergePreview.confirmationPhrase
                    || (mergePreview.requiresReviewAcknowledgement && !reviewAcknowledged)
                    || (mergePreview.requiresSecondApproval && mergePreview.approval?.status !== 'APPROVED')
                  }
                  onClick={() => void executeMerge()}
                >Merge records</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={closeCandidate}>Close</Button>
                {selected.kind === 'ORGANIZATION' && <Button icon={FileSearch} isLoading={mergeLoading} disabled={selected.executionEligibility === 'BLOCKED' || !canonicalClientId || Boolean(selected.reviewDecision)} onClick={() => void prepareMerge()}>Prepare merge preview</Button>}
              </>
            )}
          </div>
        ) : null}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
              <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Review recommendation</p>
                <p className="mt-1 leading-5">{selected.recommendation}</p>
              </div>
            </div>

            {selected.kind === 'ORGANIZATION' && (
              <div className={`flex items-start justify-between gap-3 border px-3 py-2.5 ${eligibilityClasses[selected.executionEligibility]}`}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{eligibilityLabel[selected.executionEligibility]}</p>
                  <p className="mt-1 text-xs leading-5">
                    {selected.executionEligibility === 'BLOCKED'
                      ? 'This group cannot be merged until every blocker is resolved.'
                      : 'Preparing a preview is read-only. No record changes until the final confirmation.'}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] opacity-70">{selected.fingerprint.slice(0, 10)}</span>
              </div>
            )}

            {!mergePreview && !mergeResult && (
              <section className="border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Review disposition</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Save the operational decision so the same false positive does not return on every audit refresh.</p>
                  </div>
                  {selectedDecision ? (
                    <Button variant="secondary" size="sm" icon={Undo2} isLoading={decisionLoading} onClick={() => void reopenDecision(selectedDecision)}>Reopen review</Button>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="secondary" size="sm" icon={Clock3} onClick={() => { setDecisionMode('DEFERRED'); setDecisionError(''); }}>Defer</Button>
                      {selected.kind === 'ORGANIZATION' && <Button variant="secondary" size="sm" icon={CircleOff} onClick={() => { setDecisionMode('REJECTED'); setDecisionError(''); }}>Not duplicates</Button>}
                      {selected.kind === 'ORGANIZATION' && <Button variant="secondary" size="sm" icon={GitBranch} onClick={() => { setDecisionMode('SPLIT'); setDecisionError(''); }}>Split group</Button>}
                    </div>
                  )}
                </div>

                {selectedDecision && (
                  <div className="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                    <p className="font-semibold">{selectedDecision.decision === 'DEFERRED' ? 'Review deferred' : 'Decision saved'}</p>
                    <p>{selectedDecision.reason}</p>
                    {selectedDecision.revisitAt && <p className="mt-1 text-blue-700 dark:text-blue-300">Revisit {new Date(selectedDecision.revisitAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</p>}
                  </div>
                )}

                {decisionMode && !selectedDecision && (
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {decisionMode === 'DEFERRED' ? 'Defer this review' : decisionMode === 'REJECTED' ? 'Confirm distinct organisations' : 'Define organisation groups'}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {decisionMode === 'DEFERRED'
                            ? 'The candidate remains visible but merge preparation is paused until reopened.'
                            : decisionMode === 'REJECTED'
                              ? 'Every source record will be treated as a distinct organisation in future audits.'
                              : 'Records in different groups will no longer be connected; records in the same group remain eligible for review.'}
                        </p>
                      </div>
                      <button type="button" aria-label="Cancel review decision" onClick={() => { setDecisionMode(null); setDecisionError(''); }} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
                        <CircleOff className="h-4 w-4" />
                      </button>
                    </div>

                    {decisionMode === 'SPLIT' && (
                      <div className="divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                        {selected.records.map(record => (
                          <label key={record.id} className="grid gap-2 px-3 py-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900 dark:text-white">{record.companyName}</span>
                              <span className="block truncate font-mono text-[9px] text-slate-400">{record.id}</span>
                            </span>
                            <select
                              aria-label={`Group for ${record.companyName}`}
                              value={splitAssignments[record.id] || ''}
                              onChange={event => setSplitAssignments(current => ({ ...current, [record.id]: event.target.value }))}
                              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            >
                              {selected.records.map((_, index) => <option key={index + 1} value={String(index + 1)}>Group {index + 1}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}

                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Decision reason
                      <input value={decisionReason} onChange={event => setDecisionReason(event.target.value)} maxLength={500} placeholder="Evidence reviewed and operational reason" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Notes <span className="font-normal text-slate-400">(optional)</span>
                      <textarea value={decisionNotes} onChange={event => setDecisionNotes(event.target.value)} maxLength={3000} rows={2} className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    {decisionMode === 'DEFERRED' && (
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Revisit date <span className="font-normal text-slate-400">(optional)</span>
                        <input type="date" value={decisionRevisitAt} onChange={event => setDecisionRevisitAt(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                      </label>
                    )}
                    {decisionError && <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{decisionError}</div>}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        icon={decisionMode === 'DEFERRED' ? Clock3 : decisionMode === 'REJECTED' ? CircleOff : GitBranch}
                        isLoading={decisionLoading}
                        disabled={decisionReason.trim().length < 5 || (decisionMode === 'SPLIT' && splitGroupCount < 2)}
                        onClick={() => void saveDecision()}
                      >Save decision</Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {mergeError && (
              <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-5">{mergeError}</p>
              </div>
            )}

            <details key={selected.id} open={selected.evidence.length <= 6} className="border border-slate-200 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Decision signals</span>
                <span className="text-[10px] font-semibold text-slate-400">{quantityLabel(selected.evidence.length, 'signal')}</span>
              </summary>
              <div className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {selected.evidence.map((evidence, index) => (
                  <div key={`${evidence.type}-${evidence.value}-${index}`} className="flex items-start gap-3 px-3 py-2.5">
                    {evidence.strength === 'RISK' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{evidence.label}</p>
                      <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{evidence.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Dependency impact</h3>
              <div className="mt-2 grid grid-cols-2 border border-slate-200 dark:border-slate-800 sm:grid-cols-4">
                {[
                  ['Records', selected.totals.records],
                  ['Jobs', selected.totals.jobs],
                  ['Invoices', selected.totals.invoices],
                  ['User accounts', selected.totals.linkedUsers],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border-b border-r border-slate-200 p-3 last:border-r-0 dark:border-slate-800 sm:border-b-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            {selected.departments.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detected departments</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.departments.map(department => <span key={department} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{department}</span>)}
                </div>
              </section>
            )}

            {mergeResult && (
              <section className="border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-emerald-950 dark:text-emerald-100">Client records consolidated</h3>
                    <p className="mt-1 text-sm leading-5 text-emerald-800 dark:text-emerald-200">{quantityLabel(mergeResult.mergedClientIds.length, 'source record')} and {quantityLabel(mergeResult.migratedDependencies, 'dependency')} now point to the canonical client.</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">Preserved {quantityLabel(mergeResult.hierarchy?.departments || 0, 'department')} and {quantityLabel(mergeResult.hierarchy?.agents || 0, 'agent')} through {quantityLabel(mergeResult.hierarchy?.memberships || 0, 'membership')}. Linked {quantityLabel(mergeResult.linkedBookingDepartments || 0, 'job')} to departments and {quantityLabel(mergeResult.linkedBookingAgents || 0, 'job')} to requesters.</p>
                    <p className="mt-2 break-all font-mono text-[10px] text-emerald-700 dark:text-emerald-300">Manifest {mergeResult.manifestId}</p>
                  </div>
                </div>
                <label className="mt-4 block text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                  Emergency restoration
                  <span className="mt-1 block font-normal leading-5">Type <strong>ROLLBACK CLIENT MERGE</strong> to restore the IDs recorded in this manifest.</span>
                  <input value={rollbackConfirmation} onChange={event => setRollbackConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-emerald-600 dark:border-emerald-800 dark:bg-slate-950 dark:text-white" placeholder="Rollback confirmation" />
                </label>
              </section>
            )}

            {mergePreview && !mergeResult && (
              <section className="space-y-4 border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Reversible merge preview</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">The canonical record remains visible; duplicate records become redirects. Historical names and invoice snapshots are preserved.</p>
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${eligibilityClasses[mergePreview.eligibility]}`}>{eligibilityLabel[mergePreview.eligibility]}</span>
                </div>

                {(mergePreview.blockers.length > 0 || mergePreview.warnings.length > 0) && (
                  <div className="divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {[...mergePreview.blockers, ...mergePreview.warnings].map((message, index) => (
                      <div key={`${message}-${index}`} className="flex items-start gap-2 px-3 py-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
                        <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${index < mergePreview.blockers.length ? 'text-red-600' : 'text-amber-600'}`} />
                        {message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">
                  {[
                    ['Jobs', mergePreview.totals.jobs],
                    ['Client invoices', mergePreview.totals.clientInvoices],
                    ['Timesheets', mergePreview.totals.timesheets],
                    ['Payable lines', mergePreview.totals.interpreterInvoiceLines],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="border-b border-r border-slate-200 p-2.5 last:border-r-0 dark:border-slate-800 sm:border-b-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                      <p className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Contact preservation</h4>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">Departments, requester identities, finance contacts, and memberships are created before source clients are redirected.</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3">
                    {[
                      ['Departments', mergePreview.hierarchy.totals.departments],
                      ['Agents', mergePreview.hierarchy.totals.agents],
                      ['Memberships', mergePreview.hierarchy.totals.memberships],
                      ['Department coverage', mergePreview.hierarchy.bookingDepartmentLinks],
                      ['Requester coverage', mergePreview.hierarchy.bookingAgentLinks],
                      ['Needs review', mergePreview.hierarchy.totals.unresolvedContacts + mergePreview.hierarchy.totals.sharedMailboxes],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="border-b border-r border-slate-200 p-2.5 last:border-r-0 dark:border-slate-800 sm:border-b-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                        <p className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    Coverage counts jobs with a deterministic hierarchy match. The completed result reports only links newly written by this merge.
                  </p>
                  {mergePreview.hierarchy.departments.length > 0 && (
                    <div className="mt-2 divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                      {mergePreview.hierarchy.departments.map(department => (
                        <div key={department.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{department.name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{department.evidence.join(', ')}</p>
                          </div>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${department.confidence === 'EXPLICIT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{department.confidence}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mergePreview.hierarchy.agents.length > 0 && (
                    <div className="mt-2 divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                      {mergePreview.hierarchy.agents.map(agent => (
                        <div key={agent.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{agent.displayName}</p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{agent.email}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            {agent.roles.map(role => <span key={role} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{role}</span>)}
                            {agent.agentType === 'SHARED_MAILBOX' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">SHARED</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {mergePreview.hierarchy.unresolvedContacts.length > 0 && (
                    <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      {quantityLabel(mergePreview.hierarchy.unresolvedContacts.length, 'contact')} will remain in the source snapshot because no deterministic email identity is available.
                    </div>
                  )}
                  {mergePreview.hierarchy.totals.sharedMailboxes > 0 && (
                    <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                      {quantityLabel(mergePreview.hierarchy.totals.sharedMailboxes, 'shared mailbox')} will be preserved as a functional identity and will not be assigned to historical jobs automatically.
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Canonical field decisions</h4>
                  <div className="mt-2 divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {mergePreview.fields.map(field => {
                      const options = [
                        { clientId: field.sourceClientId, value: field.selectedValue },
                        ...field.alternatives,
                      ].filter((option, index, values) => values.findIndex(value => value.clientId === option.clientId && displayValue(value.value) === displayValue(option.value)) === index);
                      return (
                        <div key={field.field} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{field.label}</span>
                          <div className="min-w-0">
                            {field.conflict ? (
                              <select
                                aria-label={`Choose ${field.label}`}
                                value={mergePreview.fieldSelections[field.field] || field.sourceClientId}
                                disabled={mergeLoading}
                                onChange={event => void prepareMerge({ ...mergePreview.fieldSelections, [field.field]: event.target.value })}
                                className="h-9 w-full rounded-md border border-amber-300 bg-white px-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 dark:border-amber-800 dark:bg-slate-950 dark:text-white"
                              >
                                {options.map(option => (
                                  <option key={`${option.clientId}-${displayValue(option.value)}`} value={option.clientId}>
                                    {displayValue(option.value)} - {selected.records.find(record => record.id === option.clientId)?.companyName || option.clientId}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <p className="break-words text-xs font-medium text-slate-900 dark:text-white">{displayValue(field.selectedValue)}</p>
                            )}
                            <p className={`mt-0.5 text-[10px] ${field.conflict ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>{field.overridesCanonical ? 'Selected source value will replace the canonical value' : field.fillsCanonicalGap ? 'Fills an empty canonical field' : field.conflict ? 'Choose the value that belongs on the canonical client' : 'Canonical value preserved'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {mergePreview.requiresSecondApproval && (
                  <div className="border-y border-blue-200 bg-blue-50/70 px-3 py-3 dark:border-blue-900/70 dark:bg-blue-950/25">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-950 dark:text-white">Two-person approval required</h4>
                          <p className="mt-0.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">A different active Super Admin must approve this exact canonical record, field selection, and dependency snapshot.</p>
                        </div>
                      </div>
                      <span className={`inline-flex w-fit shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
                        mergePreview.approval?.status === 'APPROVED'
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                          : mergePreview.approval?.status === 'REJECTED' || mergePreview.approval?.status === 'EXPIRED'
                            ? 'border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                            : 'border-blue-200 bg-white text-blue-800 dark:border-blue-900 dark:bg-slate-950 dark:text-blue-300'
                      }`}>{mergePreview.approval?.status.replace('_', ' ') || 'Not requested'}</span>
                    </div>

                    <ul className="mt-2 space-y-1 pl-6 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                      {mergePreview.secondApprovalReasons.map(reason => <li key={reason} className="list-disc">{reason}</li>)}
                    </ul>

                    {mergePreview.approval && (
                      <div className="mt-3 grid gap-2 border-t border-blue-200 pt-3 text-[11px] text-slate-600 dark:border-blue-900/70 dark:text-slate-300 sm:grid-cols-2">
                        <p><span className="font-semibold text-slate-800 dark:text-slate-100">Requested by:</span> {mergePreview.approval.requestedByName || 'Super Admin'}</p>
                        <p><span className="font-semibold text-slate-800 dark:text-slate-100">Valid until:</span> {new Date(mergePreview.approval.expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        {mergePreview.approval.reviewedByName && <p><span className="font-semibold text-slate-800 dark:text-slate-100">Reviewed by:</span> {mergePreview.approval.reviewedByName}</p>}
                        {mergePreview.approval.reviewNote && <p className="sm:col-span-2"><span className="font-semibold text-slate-800 dark:text-slate-100">Review note:</span> {mergePreview.approval.reviewNote}</p>}
                      </div>
                    )}

                    {(!mergePreview.approval || ['REJECTED', 'EXPIRED', 'ROLLED_BACK'].includes(mergePreview.approval.status)) && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-blue-200 pt-3 dark:border-blue-900/70 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">Requesting approval freezes this preview for 24 hours. Any field or source change requires a new request.</p>
                        {isSuperAdmin ? (
                          <Button className="shrink-0" size="sm" icon={ShieldCheck} isLoading={approvalLoading} onClick={() => void requestMergeApproval()}>Request approval</Button>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-slate-500">Super Admin action</span>
                        )}
                      </div>
                    )}

                    {mergePreview.approval?.status === 'PENDING' && (
                      <div className="mt-3 border-t border-blue-200 pt-3 dark:border-blue-900/70">
                        {user?.id === mergePreview.approval.requestedBy ? (
                          <p className="flex items-start gap-2 text-[11px] leading-5 text-blue-800 dark:text-blue-200"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Waiting for review by a different Super Admin.</p>
                        ) : isSuperAdmin ? (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                              Review note <span className="font-normal text-slate-500">(optional)</span>
                              <textarea value={approvalReviewNote} onChange={event => setApprovalReviewNote(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full resize-y rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-blue-900 dark:bg-slate-950 dark:text-white" />
                            </label>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="danger" size="sm" icon={CircleOff} isLoading={approvalLoading} onClick={() => void reviewMergeApproval('REJECT')}>Reject</Button>
                              <Button size="sm" icon={ShieldCheck} isLoading={approvalLoading} onClick={() => void reviewMergeApproval('APPROVE')}>Approve exact preview</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">Waiting for review by a different Super Admin.</p>
                        )}
                      </div>
                    )}

                    {mergePreview.approval?.status === 'APPROVED' && (
                      <p className="mt-3 flex items-start gap-2 border-t border-emerald-200 pt-3 text-[11px] leading-5 text-emerald-800 dark:border-emerald-900/70 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />The exact preview is approved. Execution will atomically consume this approval.</p>
                    )}
                    {mergePreview.approval?.status === 'IN_PROGRESS' && (
                      <p className="mt-3 flex items-start gap-2 border-t border-blue-200 pt-3 text-[11px] leading-5 text-blue-800 dark:border-blue-900/70 dark:text-blue-200"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />This approval is reserved by a merge execution. Inspect its manifest before retrying.</p>
                    )}
                    {approvalError && <div className="mt-3 flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{approvalError}</div>}
                  </div>
                )}

                {mergePreview.requiresReviewAcknowledgement && (
                  <label className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <input type="checkbox" checked={reviewAcknowledged} disabled={mergePreview.requiresSecondApproval && mergePreview.approval?.status !== 'APPROVED'} onChange={event => setReviewAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                    I reviewed the identity differences, financial references, preserved agents, field winners, and dependency counts shown above.
                  </label>
                )}

                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Final confirmation
                  <span className="mt-1 block font-normal text-slate-500 dark:text-slate-400">{mergePreview.requiresSecondApproval && mergePreview.approval?.status !== 'APPROVED' ? 'Available after this exact preview receives its second approval.' : <>Type <strong>{mergePreview.confirmationPhrase}</strong>. The rollback manifest is written before dependencies change.</>}</span>
                  <input value={mergeConfirmation} disabled={mergePreview.requiresSecondApproval && mergePreview.approval?.status !== 'APPROVED'} onChange={event => setMergeConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-900/60" placeholder="Merge confirmation" />
                </label>
              </section>
            )}

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Source records</h3>
              <div className="mt-2 divide-y divide-slate-200 border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {selected.records.map(record => (
                  <div key={record.id} className={`p-3 ${record.id === canonicalClientId ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{record.companyName}</p>
                          {record.id === canonicalClientId && <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">Selected canonical</span>}
                          {record.id === selected.recommendedClientId && record.id !== canonicalClientId && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">System suggestion</span>}
                        </div>
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{record.id}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {record.id !== canonicalClientId && !mergeResult && (
                          <button type="button" onClick={() => chooseCanonicalClient(record.id)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300">Use as canonical</button>
                        )}
                        <button type="button" aria-label={`Open ${record.companyName}`} onClick={() => navigate(`/admin/clients/${record.id}`)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-300">
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{record.contactPerson || 'No named contact'}</span>
                      <span>{record.departmentName || 'No department'}</span>
                      <span>{record.sageAccountRef ? `Sage ${record.sageAccountRef}` : 'No Sage reference'}</span>
                      <span>{quantityLabel(record.bookingCount, 'job')} · {quantityLabel(record.invoiceCount, 'invoice')}</span>
                    </div>
                    <p className="mt-2 break-words text-[10px] text-slate-400">{record.airtableClientKey ? `Airtable key: ${record.airtableClientKey}` : 'No Airtable client key'}</p>
                    {record.contactEmails.length > 0 && <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">{record.contactEmails.join(', ')}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={financeModalOpen}
        onClose={() => { if (!financeLoading) setFinanceModalOpen(false); }}
        title="Client finance hierarchy reconciliation"
        footer={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={financeLoading} onClick={() => setFinanceModalOpen(false)}>Close</Button>
            {financePreview && !financePreview.applied && (financePreview.invoiceUpdates > 0 || financePreview.lineUpdates > 0) && (
              <Button
                icon={ShieldCheck}
                isLoading={financeLoading}
                disabled={financePreview.blockedInvoiceCount > 0 || financeConfirmation.toUpperCase() !== 'RECONCILE CLIENT FINANCE'}
                onClick={() => void applyFinanceReconciliation()}
              >Apply reviewed repair</Button>
            )}
            {financePreview?.applied && financePreview.manifestId && (
              <Button
                variant="danger"
                icon={Undo2}
                isLoading={financeLoading}
                disabled={financeRollbackConfirmation.toUpperCase() !== 'ROLLBACK CLIENT FINANCE'}
                onClick={() => void rollbackFinanceReconciliation()}
              >Restore repair</Button>
            )}
          </div>
        )}
      >
        <div className="space-y-4">
          {financeLoading && !financePreview ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3"><Spinner size="lg" /><p className="text-sm text-slate-500 dark:text-slate-400">Building a read-only reconciliation plan...</p></div>
          ) : financeError ? (
            <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{financeError}</div>
          ) : financePreview ? (
            <>
              <div className={`border px-3 py-3 text-sm ${financePreview.applied ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100'}`}>
                <p className="font-semibold">{financePreview.applied ? 'Reconciliation applied' : 'Read-only preview'}</p>
                <p className="mt-1 leading-5">{financePreview.applied ? `${financePreview.invoicesWritten || 0} invoices and ${financePreview.linesWritten || 0} lines were updated.` : 'No records have been changed. Review every count and blocker before applying.'}</p>
              </div>
              <div className="grid grid-cols-2 border border-slate-200 dark:border-slate-800 sm:grid-cols-4">
                {[
                  ['Invoices scanned', financePreview.invoicesScanned],
                  ['Invoice updates', financePreview.invoiceUpdates],
                  ['Lines scanned', financePreview.linesScanned],
                  ['Line updates', financePreview.lineUpdates],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border-b border-r border-slate-200 p-3 last:border-r-0 dark:border-slate-800 sm:border-b-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{Number(value).toLocaleString('en-GB')}</p>
                  </div>
                ))}
              </div>
              {financePreview.inferredClientAssignmentCount > 0 && (
                <div className="border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <p className="font-semibold">{financePreview.inferredClientAssignmentCount} invoice client relationship(s) were identified from exact, unique evidence</p>
                  <p className="mt-1">These assignments are part of the reviewed plan and record their method, confidence and previous client ID.</p>
                  {(financePreview.inferredClientAssignments || []).length > 0 && (
                    <div className="mt-2 max-h-28 overflow-y-auto border-t border-emerald-200 pt-2 font-mono text-[10px] dark:border-emerald-900/60">
                      {(financePreview.inferredClientAssignments || []).map(assignment => (
                        <p key={assignment.invoiceId} className="break-all">{assignment.invoiceId} -&gt; {assignment.clientId} ({assignment.method}, {assignment.confidence})</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {financePreview.blockedInvoiceCount > 0 && (
                <div className="border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  <p className="font-semibold">{financePreview.blockedInvoiceCount} invoice(s) have unsafe job or client relationships and block the entire repair</p>
                  <div className="mt-2 max-h-44 divide-y divide-red-200 overflow-y-auto border-t border-red-200 dark:divide-red-900/60 dark:border-red-900/60">
                    {(financePreview.blockedInvoices || []).map(blocker => (
                      <div key={blocker.invoiceId} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-[10px]">{blocker.invoiceId}</p>
                          <p className="font-semibold">{blocker.clientName || blocker.invoiceNumber || 'Client identity missing'} - {blocker.reason.replaceAll('_', ' ')}</p>
                          {blocker.candidateClientIds.length > 0 && <p className="break-all text-[10px]">Candidates: {blocker.candidateClientIds.join(', ')}</p>}
                        </div>
                        {blocker.reason === 'CLIENT_IDENTITY_UNRESOLVED' && (
                          <button type="button" onClick={() => void openInvoiceIdentityResolver(blocker)} className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 hover:border-red-500 dark:border-red-900 dark:bg-slate-950 dark:text-red-300">
                            Resolve
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {financePreview.blockedInvoiceCount > financePreview.blockedInvoiceIds.length && <p className="mt-1">Showing the first {financePreview.blockedInvoiceIds.length} IDs.</p>}
                </div>
              )}
              {financePreview.unlinkedInvoiceCount > 0 && (
                <div className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">{financePreview.unlinkedInvoiceCount} invoice(s) have no linked job</p>
                  <p className="mt-1">They remain client-level records and are not assigned to a department automatically.</p>
                </div>
              )}
              {!financePreview.applied && financePreview.blockedInvoiceCount === 0 && (financePreview.invoiceUpdates > 0 || financePreview.lineUpdates > 0) && (
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Final confirmation
                  <span className="mt-1 block font-normal leading-5 text-slate-500 dark:text-slate-400">Type <strong>RECONCILE CLIENT FINANCE</strong>. A fresh fingerprint is checked immediately before writing.</span>
                  <input value={financeConfirmation} onChange={event => setFinanceConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </label>
              )}
              {!financePreview.applied && financePreview.invoiceUpdates === 0 && financePreview.lineUpdates === 0 && (
                <div className="flex items-start gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Finance hierarchy is already reconciled.</div>
              )}
              {financePreview.applied && financePreview.manifestId && (
                <label className="block text-xs font-semibold text-red-800 dark:text-red-200">
                  Emergency restoration
                  <span className="mt-1 block font-normal leading-5 text-slate-500 dark:text-slate-400">Type <strong>ROLLBACK CLIENT FINANCE</strong> to restore only fields still owned by this manifest.</span>
                  <input value={financeRollbackConfirmation} onChange={event => setFinanceRollbackConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-red-600 dark:border-red-900 dark:bg-slate-950 dark:text-white" />
                </label>
              )}
              {financePreview.manifestId && <p className="break-all font-mono text-[10px] text-slate-400">Manifest {financePreview.manifestId}</p>}
              <p className="break-all font-mono text-[10px] text-slate-400">Fingerprint {financePreview.fingerprint}</p>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={identityResolverOpen}
        onClose={() => { if (!identityResolverLoading) setIdentityResolverOpen(false); }}
        title="Resolve invoice client"
        maxWidth="xl"
        footer={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={identityResolverLoading} onClick={() => setIdentityResolverOpen(false)}>Close</Button>
            {!identityResolutionResult ? (
              <Button
                icon={Link2}
                isLoading={identityResolverLoading}
                disabled={!identitySelectedClientId || identityConfirmation.toUpperCase() !== 'LINK INVOICE TO CLIENT'}
                onClick={() => void applyInvoiceIdentityResolution()}
              >Link reviewed client</Button>
            ) : (
              <Button
                variant="danger"
                icon={Undo2}
                isLoading={identityResolverLoading}
                disabled={identityRollbackConfirmation.toUpperCase() !== 'ROLLBACK CLIENT FINANCE'}
                onClick={() => void rollbackInvoiceIdentityResolution()}
              >Restore previous link</Button>
            )}
          </div>
        )}
      >
        <div className="space-y-4">
          {identityBlocker && (
            <div className="border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
              <p className="font-semibold text-slate-950 dark:text-white">{identityBlocker.invoiceNumber || identityBlocker.invoiceId}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{identityBlocker.clientName || 'No client name'} - {identityBlocker.status || 'No status'}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-400">Current link: {identityBlocker.currentClientId || 'none'}</p>
            </div>
          )}

          {identityResolverError && (
            <div className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{identityResolverError}
            </div>
          )}

          {identityResolutionResult ? (
            <>
              <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <p className="font-semibold">Invoice linked to the reviewed canonical client</p>
                <p className="mt-1 break-all">{identityResolutionResult.invoiceId} -&gt; {identityResolutionResult.clientId}</p>
              </div>
              <label className="block text-xs font-semibold text-red-800 dark:text-red-200">
                Emergency restoration
                <span className="mt-1 block font-normal leading-5 text-slate-500 dark:text-slate-400">Type <strong>ROLLBACK CLIENT FINANCE</strong> to restore the previous relationship while this manifest still owns it.</span>
                <input value={identityRollbackConfirmation} onChange={event => setIdentityRollbackConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-red-600 dark:border-red-900 dark:bg-slate-950 dark:text-white" />
              </label>
              <p className="break-all font-mono text-[10px] text-slate-400">Manifest {identityResolutionResult.manifestId}</p>
            </>
          ) : identityResolverLoading && identityClients.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3"><Spinner size="lg" /><p className="text-sm text-slate-500 dark:text-slate-400">Loading canonical clients...</p></div>
          ) : (
            <>
              <div>
                <label htmlFor="invoice-client-search" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Find canonical client</label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="invoice-client-search" value={identityClientQuery} onChange={event => setIdentityClientQuery(event.target.value)} placeholder="Company, Sage code, email or client ID" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </div>
              </div>
              <div role="group" aria-label="Canonical client choices" className="max-h-64 divide-y divide-slate-200 overflow-y-auto border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {visibleIdentityClients.map(client => {
                  const selectedClient = client.id === identitySelectedClientId;
                  return (
                    <button key={client.id} type="button" aria-pressed={selectedClient} onClick={() => chooseInvoiceIdentityClient(client.id)} className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors ${selectedClient ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' : 'bg-white text-slate-800 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{client.companyName}</span>
                        <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{[client.sageAccountRef, client.invoiceEmail || client.email].filter(Boolean).join(' - ') || 'No account code or email'}</span>
                      </span>
                      <span className="max-w-[42%] truncate font-mono text-[9px] text-slate-400">{client.id}</span>
                    </button>
                  );
                })}
                {visibleIdentityClients.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No canonical clients match this search.</p>}
              </div>
              {identitySelectedClientId && (
                <div className="border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                  <p className="font-semibold">Selected canonical client</p>
                  <p className="mt-1 break-all font-mono text-[10px]">{identitySelectedClientId}</p>
                </div>
              )}
              <label htmlFor="invoice-client-confirmation" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Final confirmation
                <span id="invoice-client-confirmation-help" className="mt-1 block font-normal leading-5 text-slate-500 dark:text-slate-400">Type <strong>LINK INVOICE TO CLIENT</strong>. The current global fingerprint is rechecked before writing.</span>
                <input id="invoice-client-confirmation" aria-describedby="invoice-client-confirmation-help" autoComplete="off" value={identityConfirmation} onChange={event => setIdentityConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              </label>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
