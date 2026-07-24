import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Info,
  Languages,
  Loader2,
  Mail,
  Download,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  UserCog,
  Users,
  Wallet,
  X
} from 'lucide-react';
import { MigrationService } from '../../services/migrationService';
import {
  AIRTABLE_SYNC_MODULES,
  AirtableModuleResult,
  AirtableDependencyCounts,
  AirtableConflictSeverity,
  AirtableSyncConflict,
  AirtableSyncCheckpoint,
  AirtableSyncModule,
  AirtableSyncRunSummary,
  AirtableSyncStrategy,
  AirtableSyncResult,
  AirtableMirrorAudit,
  AirtableClientIdentityDeferralCategory,
  AirtableClientIdentityMappingLedgerEntry,
  FinancialReconciliationAudit,
  AirtableSyncService
} from '../../services/airtableSyncService';
import { ClientService } from '../../services/clientService';
import { Client } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { clientCrmReviewKey, deduplicateClientCrmReviewScopes } from '../../utils/clientCrmReview';

type WorkspaceTab = 'overview' | 'interpreters' | 'reconciliation' | AirtableSyncModule;

type ClientCrmRecommendation = {
  canonicalClientId: string;
  canonicalCompanyName: string;
  confidence: 'HIGH' | 'MEDIUM';
  score: number;
  autoReviewEligible: boolean;
  evidence: Array<{
    code: string;
    label: string;
    value: string;
    strength: 'STRONG' | 'SUPPORTING';
  }>;
  alternatives?: Array<{
    canonicalClientId: string;
    canonicalCompanyName: string;
    score: number;
  }>;
};

type ClientCrmConflictCandidate = {
  sourceTable: 'Clients Book' | 'Departments';
  reason: string;
  groupKey: string;
  sourceRecordIds?: string[];
  companyNames: string[];
  candidateClientIds: string[];
  recommendation?: ClientCrmRecommendation;
};

type ClientCrmNewOrganisationCandidate = {
  groupKey: string;
  canonicalCompanyName: string;
  proposedClientId: string;
  sourceRecordCount: number;
  sourceNames: string[];
  recommendation?: ClientCrmRecommendation;
};

type ClientCrmDiagnostics = {
  canonicalAccounts?: {
    sourceRecords?: number;
    approvedPendingCanonicalAccounts?: Array<{
      sourceTable: 'Clients';
      sourceRecordId: string;
      groupKey: string;
      clientId: string;
      companyName: string;
      sageAccountRef?: string;
    }>;
    wouldCreateCanonicalAccounts?: Array<{
      companyName: string;
      sageAccountRef: string;
      clientId: string;
      groupKey: string;
    }>;
    writeReadiness?: {
      ready: boolean;
      blockerCount: number;
      blockers: Array<{ reason: string; count: number }>;
    };
  };
  clientsBook?: {
    clientsBookSourceRecords?: number;
    departmentSourceRecords?: number;
    exactOrganisationGroups?: number;
    canonicalOrganisations?: number;
    resolutionMethods?: Record<string, number>;
    conflictReasons?: Record<string, number>;
    conflictCandidates?: ClientCrmConflictCandidate[];
    newCanonicalOrganisationCandidates?: ClientCrmNewOrganisationCandidate[];
    projectedDepartments?: number;
    projectedAgents?: number;
    projectedMemberships?: number;
    unresolvedContacts?: number;
    deferredIdentityGroups?: Array<{
      sourceTable: 'Clients Book' | 'Departments';
      groupKey: string;
      sourceRecordIds: string[];
      sourceNames: string[];
      category: AirtableClientIdentityDeferralCategory;
      reason: string;
    }>;
    deferredIdentityGroupCount?: number;
    deferredSourceRecordCount?: number;
    writeReadiness?: {
      ready: boolean;
      blockerCount: number;
      blockers: Array<{ reason: string; count: number }>;
    };
  };
};

type ClientCrmCanonicalTarget = {
  id: string;
  companyName: string;
  sageAccountRef?: string;
  targetState: 'EXISTING' | 'PENDING_APPROVED';
};

type ClientCrmMappingTarget = {
  sourceTable: 'Clients' | 'Clients Book' | 'Departments';
  groupKey: string;
  displayName: string;
  sourceNames: string[];
  reason: string;
  recommendedClientId?: string;
};

type ClientCrmBatchCandidate = {
  sourceTable: 'Clients Book' | 'Departments';
  groupKey: string;
  displayName: string;
  sourceNames: string[];
  recommendation: ClientCrmRecommendation;
};

const syncStrategyOptions: Array<{
  id: AirtableSyncStrategy;
  label: string;
  description: string;
  defaultLimit: number;
}> = [
  {
    id: 'OPEN_WORKFLOW',
    label: 'Open workflow',
    description: 'Daily Mirror Cycle: open, active or financially unfinished workflow.',
    defaultLimit: 5000
  },
  {
    id: 'UPDATED_SINCE_LAST_SYNC',
    label: 'Updated since last sync',
    description: 'Only records touched in Airtable after the last successful sync.',
    defaultLimit: 1000
  },
  {
    id: 'RECENT_OPEN',
    label: 'Recent + open',
    description: 'Open workflow plus recently created records for transition safety.',
    defaultLimit: 1500
  },
  {
    id: 'FULL_AUDIT',
    label: 'Full audit',
    description: 'Heavy reconciliation pass for weekly/monthly proof, not daily work.',
    defaultLimit: 5000
  },
  {
    id: 'CUSTOM_LIMIT',
    label: 'Custom limit',
    description: 'Manual record count for controlled troubleshooting.',
    defaultLimit: 500
  }
];

const getStrategyConfig = (strategy: AirtableSyncStrategy) => (
  syncStrategyOptions.find(option => option.id === strategy) || syncStrategyOptions[0]
);

const moduleIcons: Record<AirtableSyncModule | 'overview' | 'interpreters' | 'reconciliation', React.ElementType> = {
  overview: Database,
  interpreters: Users,
  reconciliation: ShieldCheck,
  clients: Building2,
  redbook: ClipboardList,
  translations: Languages,
  clientInvoices: FileText,
  interpreterInvoices: UserCog,
  translationClientInvoices: FileText,
  translatorInvoices: Wallet
};

const moduleTone: Record<string, string> = {
  clients: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200',
  redbook: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200',
  translations: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200',
  clientInvoices: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
  interpreterInvoices: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-200',
  translationClientInvoices: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/30 dark:text-fuchsia-200',
  translatorInvoices: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200'
};

const fullOrder: AirtableSyncModule[] = AIRTABLE_SYNC_MODULES.map(module => module.id);

const normalizeDateInput = (value?: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const data = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
    if (typeof data.toDate === 'function') return data.toDate().toISOString();
    if (typeof data.seconds === 'number') {
      return new Date(data.seconds * 1000 + Math.floor((data.nanoseconds || 0) / 1000000)).toISOString();
    }
    if (typeof data._seconds === 'number') {
      return new Date(data._seconds * 1000 + Math.floor((data._nanoseconds || 0) / 1000000)).toISOString();
    }
  }
  return '';
};

const formatDateTime = (value?: unknown) => {
  const normalized = normalizeDateInput(value);
  if (!normalized) return 'Never';
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleString();
};

const safeInlineText = (value: unknown, fallback = 'N/A') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  const normalizedDate = normalizeDateInput(value);
  if (normalizedDate) return formatDateTime(normalizedDate);
  return fallback;
};

const StatPill = ({ label, value, className = '' }: { label: string; value: number; className?: string }) => (
  <div className={`rounded-lg border px-3 py-2 ${className || 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'}`}>
    <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
    <p className="mt-0.5 text-xl font-black">{value}</p>
  </div>
);

const ClientRecommendationSummary = ({ recommendation }: { recommendation: ClientCrmRecommendation }) => (
  <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/20">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
        recommendation.confidence === 'HIGH'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
      }`}>
        {recommendation.confidence} · SCORE {recommendation.score}
      </span>
      <span className="min-w-0 truncate text-xs font-black text-blue-800 dark:text-blue-200">
        Suggested: {recommendation.canonicalCompanyName}
      </span>
    </div>
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {recommendation.evidence.slice(0, 3).map(evidence => (
        <span key={`${evidence.code}-${evidence.value}`} title={`${evidence.label}: ${evidence.value}`} className="max-w-full truncate rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
          {evidence.label}: {evidence.value}
        </span>
      ))}
    </div>
  </div>
);

export const AdminMigration = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('clients');
  const [loading, setLoading] = useState(false);
  const [interpreterLoading, setInterpreterLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; deduplicated: number } | null>(null);
  const [syncStrategy, setSyncStrategy] = useState<AirtableSyncStrategy>('OPEN_WORKFLOW');
  const [recordLimit, setRecordLimit] = useState(() => getStrategyConfig('OPEN_WORKFLOW').defaultLimit);
  const [syncResult, setSyncResult] = useState<AirtableSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttemptLabel, setSyncAttemptLabel] = useState<string>('');
  const [lastRunAt, setLastRunAt] = useState<string | undefined>();
  const [moduleCheckpoints, setModuleCheckpoints] = useState<NonNullable<AirtableSyncCheckpoint['moduleCheckpoints']>>({});
  const [dependencyCounts, setDependencyCounts] = useState<AirtableDependencyCounts>({});
  const [recentRuns, setRecentRuns] = useState<AirtableSyncRunSummary[]>([]);
  const [openConflicts, setOpenConflicts] = useState<AirtableSyncConflict[]>([]);
  const [mirrorAudit, setMirrorAudit] = useState<AirtableMirrorAudit | null>(null);
  const [mirrorAuditLoading, setMirrorAuditLoading] = useState(false);
  const [financialAudit, setFinancialAudit] = useState<FinancialReconciliationAudit | null>(null);
  const [financialAuditLoading, setFinancialAuditLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [cleanRepairDryRun, setCleanRepairDryRun] = useState(false);
  const [conflictSeverityFilter, setConflictSeverityFilter] = useState<AirtableConflictSeverity>('ALL');
  const [conflictModuleFilter, setConflictModuleFilter] = useState<'ALL' | AirtableSyncModule>('ALL');
  const [approvedDryRunIds, setApprovedDryRunIds] = useState<Record<string, string>>({});
  const [detailFilter, setDetailFilter] = useState<'all' | 'errors' | 'conflicts' | 'unmatched' | 'changes'>('all');
  const [showInfo, setShowInfo] = useState(false);
  const [crmReviewFilter, setCrmReviewFilter] = useState('');
  const [crmMappingTarget, setCrmMappingTarget] = useState<ClientCrmMappingTarget | null>(null);
  const [crmClientSearch, setCrmClientSearch] = useState('');
  const [crmClientDirectory, setCrmClientDirectory] = useState<Client[]>([]);
  const [crmSelectedClientId, setCrmSelectedClientId] = useState('');
  const [crmMappingLoading, setCrmMappingLoading] = useState(false);
  const [crmBatchSelection, setCrmBatchSelection] = useState<Record<string, boolean>>({});
  const [crmBatchSaving, setCrmBatchSaving] = useState(false);
  const [crmManualBatchMode, setCrmManualBatchMode] = useState(false);
  const [crmManualBatchSelection, setCrmManualBatchSelection] = useState<Record<string, boolean>>({});
  const [crmManualBatchTargets, setCrmManualBatchTargets] = useState<ClientCrmMappingTarget[]>([]);
  const [crmMappingLedgerOpen, setCrmMappingLedgerOpen] = useState(false);
  const [crmMappingLedgerLoading, setCrmMappingLedgerLoading] = useState(false);
  const [crmMappingLedger, setCrmMappingLedger] = useState<AirtableClientIdentityMappingLedgerEntry[]>([]);
  const [crmMappingLedgerTotal, setCrmMappingLedgerTotal] = useState(0);
  const [crmMappingLedgerSearch, setCrmMappingLedgerSearch] = useState('');
  const [crmRevokingMappingId, setCrmRevokingMappingId] = useState('');
  const [crmDeferralTarget, setCrmDeferralTarget] = useState<ClientCrmMappingTarget | null>(null);
  const [crmDeferralCategory, setCrmDeferralCategory] = useState<AirtableClientIdentityDeferralCategory>('INSUFFICIENT_SOURCE_EVIDENCE');
  const [crmDeferralReason, setCrmDeferralReason] = useState('');
  const [crmDeferralLoading, setCrmDeferralLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [inviteResult, setInviteResult] = useState<{ sent: number; suppressed?: number; errors: number } | null>(null);
  const interpreterStatsRequestedRef = useRef(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { settings } = useSettings();
  const { isSuperAdmin } = useAuth();
  const platformMode = settings.platformMode;
  const importMode = platformMode?.airtableImportMode || 'ON';
  const communicationMode = platformMode?.communicationMode || 'SUPPRESSED';
  const operatingMode = platformMode?.operatingMode || 'AIRTABLE_MIRROR';
  const importLocked = importMode !== 'ON';

  const moduleResults = useMemo(() => {
    const map = new Map<AirtableSyncModule, AirtableModuleResult>();
    syncResult?.moduleResults?.forEach(result => map.set(result.module, result));
    return map;
  }, [syncResult]);

  const activeModule = AIRTABLE_SYNC_MODULES.find(module => module.id === activeTab);
  const activeResult = activeModule ? moduleResults.get(activeModule.id) : null;
  const activeDependency = activeModule?.dependency
    ? AIRTABLE_SYNC_MODULES.find(item => item.id === activeModule.dependency)
    : undefined;
  const activeModuleCheckpoint = activeModule ? moduleCheckpoints?.[activeModule.id] : undefined;
  const dependencyWritten = !activeModule?.dependency
    || Boolean(moduleCheckpoints?.[activeModule.dependency]?.success && (dependencyCounts[activeModule.dependency] || 0) > 0);
  const syncNowBlockedByDependency = Boolean(activeModule?.dependency && !dependencyWritten);
  const activeStrategyConfig = getStrategyConfig(syncStrategy);
  const fullRunKey = `full:${syncStrategy}:${recordLimit}`;
  const moduleRunKey = activeModule ? `${activeModule.id}:${syncStrategy}:${recordLimit}` : fullRunKey;
  const hasCleanDryRun = Boolean(approvedDryRunIds[moduleRunKey]);
  const hasCleanFullDryRun = Boolean(approvedDryRunIds[fullRunKey]);
  const writeBlockedByDryRun = activeModule ? !hasCleanDryRun : !hasCleanFullDryRun;
  const activeModuleOptions = [
    { id: 'overview' as WorkspaceTab, label: 'Overview' },
    { id: 'interpreters' as WorkspaceTab, label: 'Interpreters' },
    { id: 'reconciliation' as WorkspaceTab, label: 'Reconciliation' },
    ...AIRTABLE_SYNC_MODULES.map(module => ({ id: module.id as WorkspaceTab, label: module.label }))
  ];
  const conflictModuleByTable = useMemo(() => {
    const map = new Map<string, AirtableSyncModule>();
    AIRTABLE_SYNC_MODULES.forEach(module => module.tables.forEach(table => map.set(table, module.id)));
    return map;
  }, []);
  const filteredConflicts = useMemo(() => openConflicts.filter(conflict => {
    const severityMatches = conflictSeverityFilter === 'ALL' || conflict.severity === conflictSeverityFilter;
    const moduleMatches = conflictModuleFilter === 'ALL' || conflictModuleByTable.get(conflict.sourceTable || '') === conflictModuleFilter;
    return severityMatches && moduleMatches;
  }), [conflictModuleByTable, conflictModuleFilter, conflictSeverityFilter, openConflicts]);
  const conflictSummary = useMemo(() => {
    const bySeverity = openConflicts.reduce<Record<string, number>>((acc, conflict) => {
      const key = conflict.severity || 'MEDIUM';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const byReason = openConflicts.reduce<Record<string, number>>((acc, conflict) => {
      const key = conflict.reason || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return { bySeverity, byReason };
  }, [openConflicts]);
  const crmCanonicalTargets = useMemo<ClientCrmCanonicalTarget[]>(() => {
    const diagnostics = moduleResults.get('clients')?.diagnostics as ClientCrmDiagnostics | undefined;
    const pending = diagnostics?.canonicalAccounts?.approvedPendingCanonicalAccounts || [];
    const targets = new Map<string, ClientCrmCanonicalTarget>();
    pending.forEach(target => targets.set(target.clientId, {
      id: target.clientId,
      companyName: target.companyName,
      sageAccountRef: target.sageAccountRef,
      targetState: 'PENDING_APPROVED',
    }));
    crmClientDirectory.forEach(client => targets.set(client.id, {
      id: client.id,
      companyName: client.companyName,
      sageAccountRef: client.sageAccountRef,
      targetState: 'EXISTING',
    }));
    return Array.from(targets.values()).sort((left, right) => (
      left.companyName.localeCompare(right.companyName)
    ));
  }, [crmClientDirectory, moduleResults]);
  const visibleCrmClients = useMemo(() => {
    const query = crmClientSearch.trim().toLowerCase();
    return crmCanonicalTargets
      .filter(client => !query || [client.companyName, client.sageAccountRef, client.id]
        .some(value => String(value || '').toLowerCase().includes(query)))
      .slice(0, 60);
  }, [crmCanonicalTargets, crmClientSearch]);
  const activeCrmMappingTargets = crmManualBatchTargets.length > 0
    ? crmManualBatchTargets
    : crmMappingTarget
      ? [crmMappingTarget]
      : [];
  const isManualCrmMappingBatch = crmManualBatchTargets.length > 0;
  const selectedCrmCanonicalTarget = crmCanonicalTargets.find(target => (
    target.id === crmSelectedClientId
  ));
  const visibleCrmMappingLedger = useMemo(() => {
    const query = crmMappingLedgerSearch.trim().toLowerCase();
    if (!query) return crmMappingLedger;
    return crmMappingLedger.filter(mapping => [
      mapping.sourceTable,
      mapping.groupKey,
      ...mapping.sourceNames,
      mapping.canonicalCompanyName,
      mapping.canonicalClientId,
      mapping.action,
      mapping.deferralCategory,
      mapping.reviewMethod,
      mapping.reason,
    ].some(value => String(value || '').toLowerCase().includes(query)));
  }, [crmMappingLedger, crmMappingLedgerSearch]);

  const loadInterpreterStats = async () => {
    setInterpreterLoading(true);
    try {
      setStats(await MigrationService.getActiveInterpreterStats());
    } catch {
      showToast('Error loading Airtable interpreter stats', 'error');
    } finally {
      setInterpreterLoading(false);
    }
  };

  const loadCheckpoint = async () => {
    try {
      const checkpoint = await AirtableSyncService.getCheckpoint();
      setLastRunAt(checkpoint?.lastRunAt);
      setModuleCheckpoints(checkpoint?.moduleCheckpoints || {});
    } catch (err) {
      console.warn('Failed to load Airtable Sync Center checkpoint', err);
    }
  };

  const loadDependencyCounts = async () => {
    try {
      setDependencyCounts(await AirtableSyncService.getDependencyCounts());
    } catch (err) {
      console.warn('Failed to load Airtable dependency counts', err);
      setDependencyCounts({});
    }
  };

  const loadSyncAuditTrail = async () => {
    try {
      const auditTrail = await AirtableSyncService.getAuditTrail();
      setRecentRuns(auditTrail.runs);
      setOpenConflicts(auditTrail.conflicts);
    } catch (err) {
      console.warn('Failed to load Airtable sync audit trail', err);
      setRecentRuns([]);
      setOpenConflicts([]);
    }
  };

  const runMirrorAudit = async () => {
    setMirrorAuditLoading(true);
    try {
      const audit = await AirtableSyncService.getMirrorAudit(recordLimit, syncStrategy);
      setMirrorAudit(audit);
      setCleanRepairDryRun(false);
      if (audit.missingInPlatformCount > 0) {
        showToast(`${audit.missingInPlatformCount} Airtable REDBOOK records are not mirrored yet`, 'info');
      } else {
        showToast('Airtable REDBOOK mirror audit is balanced for this strategy', 'success');
      }
    } catch (err) {
      console.warn('Failed to run Airtable mirror audit', err);
      showToast('Error running Airtable mirror audit', 'error');
    } finally {
      setMirrorAuditLoading(false);
    }
  };

  const runFinancialAudit = async () => {
    setFinancialAuditLoading(true);
    try {
      const audit = await AirtableSyncService.getFinancialReconciliationAudit();
      setFinancialAudit(audit);
      const affectedBookings = Number(audit.affectedBookings || 0);
      const affectedRecords = audit.affectedInvoices + affectedBookings;
      showToast(
        affectedRecords
          ? `${audit.affectedInvoices} invoice document(s) and ${affectedBookings} job link(s) require reconciliation`
          : 'Financial invoice reconciliation is balanced',
        affectedRecords ? 'info' : 'success'
      );
    } catch (err) {
      console.warn('Failed to run financial reconciliation audit', err);
      showToast('Error running financial reconciliation audit', 'error');
    } finally {
      setFinancialAuditLoading(false);
    }
  };

  const runMissingRedbookRepair = async (dryRun: boolean) => {
    if (!dryRun && importLocked) {
      showToast(`Repair is locked because Airtable Import Mode is ${importMode}.`, 'error');
      return;
    }
    if (!dryRun && !cleanRepairDryRun) {
      showToast('Run Dry repair before writing missing REDBOOK records.', 'error');
      return;
    }
    if (!dryRun && !window.confirm('Write missing REDBOOK records from Airtable into the platform? This only targets records missing from Mirror proof.')) return;

    setRepairLoading(true);
    setSyncError(null);
    setSyncResult(null);
    setSyncAttemptLabel(`${dryRun ? 'Dry repair' : 'Write repair'} · Missing REDBOOK · ${activeStrategyConfig.label}`);
    try {
      const result = await AirtableSyncService.repairMissingRedbook(dryRun, 20, syncStrategy);
      setSyncResult(result);
      setCleanRepairDryRun(dryRun && result.success && result.stats.error === 0);
      await Promise.all([loadCheckpoint(), loadDependencyCounts(), loadSyncAuditTrail()]);
      if (!dryRun) {
        setCleanRepairDryRun(false);
        await runMirrorAudit();
      }
      showToast(
        dryRun
          ? `Dry repair complete: ${result.missingRecords || 0} record(s) inspected${result.hasMoreMissingRecords ? `, ${result.remainingMissingRecords} queued after this batch` : ''}.`
          : `Repair complete: ${result.stats.created} created, ${result.stats.updated} updated${result.hasMoreMissingRecords ? `; ${result.remainingMissingRecords} remain for the next safe batch` : ''}.`,
        result.success ? 'success' : 'error'
      );
    } catch (err: any) {
      const message = err?.message || 'Missing REDBOOK repair failed';
      setSyncError(message);
      showToast(message, 'error');
    } finally {
      setRepairLoading(false);
    }
  };

  const exportConflictReport = () => {
    const csv = AirtableSyncService.exportConflictsCsv(filteredConflicts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `airtable-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportFinancialAudit = () => {
    if (!financialAudit || (!financialAudit.issues.length && !financialAudit.bookingIssues?.length)) return;
    const csv = AirtableSyncService.exportFinancialAuditCsv(
      financialAudit.issues,
      financialAudit.bookingIssues || [],
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleMigrateInterpreters = async () => {
    if (importLocked) {
      showToast(`Airtable import is ${importMode}. Enable import in Platform Mode settings first.`, 'error');
      return;
    }
    if (!window.confirm('Start interpreter import from Airtable? This will create/update imported profiles.')) return;

    setInterpreterLoading(true);
    try {
      const result = await MigrationService.migrateActiveInterpreters();
      setMigrationResult(result);
      showToast(`Interpreter import complete: ${result.created} created, ${result.skipped} skipped.`, 'success');
    } catch {
      showToast('Interpreter import failed', 'error');
    } finally {
      setInterpreterLoading(false);
    }
  };

  const handleSendInvites = async () => {
    if (!window.confirm('Process activation emails for imported interpreters? Communication mode still controls delivery.')) return;

    setInterpreterLoading(true);
    try {
      const result = await MigrationService.sendActivationInvites();
      setInviteResult(result);
      showToast(`Invites processed: ${result.sent} sent, ${result.suppressed || 0} suppressed, ${result.errors} failed.`, 'success');
    } catch {
      showToast('Failed to process invites', 'error');
    } finally {
      setInterpreterLoading(false);
    }
  };

  const runSync = async (dryRun: boolean, modules: AirtableSyncModule[] | 'full') => {
    if (!dryRun && importLocked) {
      showToast(`Sync is locked because Airtable Import Mode is ${importMode}.`, 'error');
      return;
    }

    const requestedKey = modules === 'full'
      ? `full:${syncStrategy}:${recordLimit}`
      : `${modules.join('+')}:${syncStrategy}:${recordLimit}`;

    const expectedDryRunId = approvedDryRunIds[requestedKey];
    if (!dryRun && !expectedDryRunId) {
      showToast('Run a clean Dry Run with the same module and sync strategy before writing data.', 'error');
      return;
    }

    if (!dryRun && modules !== 'full') {
      const missingDependency = modules
        .map(module => AIRTABLE_SYNC_MODULES.find(item => item.id === module))
        .find(module => module?.dependency && !(
          moduleCheckpoints?.[module.dependency]?.success
          && (dependencyCounts[module.dependency] || 0) > 0
        ));

      if (missingDependency?.dependency) {
        const dependencyLabel = AIRTABLE_SYNC_MODULES.find(item => item.id === missingDependency.dependency)?.label || missingDependency.dependency;
        showToast(`Run Sync Now for ${dependencyLabel} before writing ${missingDependency.label}. Dry Run is still available.`, 'error');
        return;
      }
    }

    const moduleLabel = modules === 'full'
      ? 'Full Sync'
      : modules.map(module => AIRTABLE_SYNC_MODULES.find(item => item.id === module)?.label || module).join(', ');
    if (!dryRun && !window.confirm(`Run ${moduleLabel} now using ${activeStrategyConfig.label}? This writes Airtable data into Firestore.`)) return;

    setLoading(true);
    setSyncResult(null);
    setSyncError(null);
    setSyncAttemptLabel(`${dryRun ? 'Dry Run' : 'Write Sync'} · ${moduleLabel} · ${activeStrategyConfig.label}`);
    try {
      const result = await AirtableSyncService.run(
        dryRun,
        modules,
        recordLimit,
        syncStrategy,
        dryRun ? undefined : expectedDryRunId,
      );
      setSyncResult(result);
      await loadCheckpoint();
      await loadDependencyCounts();
      await loadSyncAuditTrail();
      if (
        dryRun
        && result.success
        && result.stats.error === 0
        && result.writeApproval?.ready === true
        && result.syncRunId
      ) {
        setApprovedDryRunIds(prev => ({ ...prev, [requestedKey]: result.syncRunId as string }));
      } else {
        setApprovedDryRunIds(prev => {
          const next = { ...prev };
          delete next[requestedKey];
          return next;
        });
      }
      showToast(
        dryRun
          ? result.writeApproval?.ready === false
            ? `Dry Run complete with ${result.writeApproval.blockerCount} write blocker(s). Review staging before Write Sync.`
            : `Dry Run complete: ${result.moduleResults.length} module(s) inspected.`
          : `Sync complete: ${result.stats.created} created, ${result.stats.updated} updated.`,
        !result.success ? 'error' : result.writeApproval?.ready === false ? 'info' : 'success'
      );
    } catch (err: any) {
      const message = err?.message || 'Airtable sync failed';
      setSyncError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheckpoint();
    loadDependencyCounts();
    loadSyncAuditTrail();
  }, []);

  useEffect(() => {
    if (activeTab !== 'interpreters' || interpreterStatsRequestedRef.current) return;
    interpreterStatsRequestedRef.current = true;
    loadInterpreterStats();
  }, [activeTab]);

  const loadClientIdentityMappingLedger = async () => {
    setCrmMappingLedgerLoading(true);
    try {
      const ledger = await AirtableSyncService.listClientIdentityMappings(300);
      setCrmMappingLedger(ledger.mappings);
      setCrmMappingLedgerTotal(ledger.total);
    } catch (error: any) {
      showToast(error?.message || 'Could not load the client identity mapping ledger.', 'error');
    } finally {
      setCrmMappingLedgerLoading(false);
    }
  };

  const openClientIdentityMappingLedger = async () => {
    setCrmMappingTarget(null);
    setCrmManualBatchTargets([]);
    setCrmMappingLedgerSearch('');
    setCrmMappingLedgerOpen(true);
    await loadClientIdentityMappingLedger();
  };

  const openClientIdentityMapping = async (target: ClientCrmMappingTarget) => {
    setCrmManualBatchTargets([]);
    setCrmMappingTarget(target);
    setCrmClientSearch('');
    setCrmSelectedClientId(target.recommendedClientId || '');
    if (crmClientDirectory.length) return;
    setCrmMappingLoading(true);
    try {
      const clients = await ClientService.getAll();
      setCrmClientDirectory(clients
        .filter(client => client.recordState !== 'ARCHIVED')
        .sort((left, right) => left.companyName.localeCompare(right.companyName)));
    } catch (error) {
      console.warn('Failed to load canonical client directory', error);
      showToast('Could not load the Client CRM directory.', 'error');
    } finally {
      setCrmMappingLoading(false);
    }
  };

  const openClientIdentityManualBatch = async (targets: ClientCrmMappingTarget[]) => {
    if (!targets.length) return;
    setCrmMappingTarget(null);
    setCrmManualBatchTargets(targets);
    setCrmClientSearch('');
    setCrmSelectedClientId('');
    if (crmClientDirectory.length) return;
    setCrmMappingLoading(true);
    try {
      const clients = await ClientService.getAll();
      setCrmClientDirectory(clients
        .filter(client => client.recordState !== 'ARCHIVED')
        .sort((left, right) => left.companyName.localeCompare(right.companyName)));
    } catch (error) {
      console.warn('Failed to load canonical client directory', error);
      showToast('Could not load the Client CRM directory.', 'error');
    } finally {
      setCrmMappingLoading(false);
    }
  };

  const refreshClientIdentityDryRun = async () => {
    setApprovedDryRunIds({});
    setCrmBatchSelection({});
    setCrmManualBatchMode(false);
    setCrmManualBatchSelection({});
    setCrmManualBatchTargets([]);
    setCrmDeferralTarget(null);
    setCrmDeferralReason('');
    await runSync(true, ['clients']);
  };

  const openClientIdentityDeferral = (target: ClientCrmMappingTarget) => {
    if (target.sourceTable === 'Clients') return;
    setCrmMappingTarget(null);
    setCrmManualBatchTargets([]);
    setCrmDeferralTarget(target);
    setCrmDeferralCategory('INSUFFICIENT_SOURCE_EVIDENCE');
    setCrmDeferralReason('');
  };

  const saveClientIdentityDeferral = async () => {
    if (!crmDeferralTarget || crmDeferralLoading) return;
    if (!syncResult?.dryRun || !syncResult.syncRunId) {
      showToast('Run a fresh Clients Dry Run before deferring a source identity.', 'error');
      return;
    }
    const reason = crmDeferralReason.trim();
    if (reason.length < 20) {
      showToast('Explain the reviewed evidence in at least 20 characters.', 'error');
      return;
    }

    setCrmDeferralLoading(true);
    try {
      await AirtableSyncService.deferClientIdentitySource({
        sourceTable: crmDeferralTarget.sourceTable as 'Clients Book' | 'Departments',
        groupKey: crmDeferralTarget.groupKey,
        sourceNames: crmDeferralTarget.sourceNames,
        category: crmDeferralCategory,
        reason,
        syncRunId: syncResult.syncRunId,
      });
      showToast(
        `${crmDeferralTarget.displayName} was deferred without creating or changing a client.`,
        'success',
      );
      setCrmDeferralTarget(null);
      setCrmDeferralReason('');
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not defer the source identity.', 'error');
    } finally {
      setCrmDeferralLoading(false);
    }
  };

  const revokeClientIdentityMapping = async (mapping: AirtableClientIdentityMappingLedgerEntry) => {
    if (crmRevokingMappingId) return;
    const confirmed = await confirm({
      title: mapping.action === 'DEFER_SOURCE' ? 'Revoke source deferral' : 'Revoke client identity mapping',
      message: mapping.action === 'DEFER_SOURCE'
        ? `Return "${mapping.sourceNames[0] || mapping.groupKey}" to the unresolved review queue? Future mirror cycles will stop deferring this source.`
        : `Return "${mapping.sourceNames[0] || mapping.groupKey}" to review instead of mapping it to ${mapping.canonicalCompanyName || mapping.canonicalClientId}? The revocation is audited and future mirror cycles will stop using this rule.`,
      confirmLabel: mapping.action === 'DEFER_SOURCE' ? 'Return to review' : 'Revoke mapping',
      variant: 'warning',
    });
    if (!confirmed) return;

    setCrmRevokingMappingId(mapping.mappingId);
    try {
      await AirtableSyncService.revokeClientIdentityMapping(mapping.sourceTable, mapping.groupKey);
      showToast('Client identity mapping revoked. Running a fresh Dry Run...', 'success');
      await loadClientIdentityMappingLedger();
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not revoke the client identity mapping.', 'error');
    } finally {
      setCrmRevokingMappingId('');
    }
  };

  const saveRecommendedIdentityMappings = async (candidates: ClientCrmBatchCandidate[]) => {
    if (!candidates.length || crmBatchSaving) return;
    if (!syncResult?.dryRun || !syncResult.syncRunId) {
      showToast('Run a fresh Clients Dry Run before saving recommendations.', 'error');
      return;
    }
    if (candidates.length > 25) {
      showToast('Review at most 25 client identity recommendations in one batch.', 'error');
      return;
    }
    const confirmed = await confirm({
      title: 'Confirm recommended mappings',
      message: `Map ${candidates.length} Airtable identit${candidates.length === 1 ? 'y' : 'ies'} to the suggested existing Client CRM organisation${candidates.length === 1 ? '' : 's'}? Each mapping is audited and can be revoked.`,
      confirmLabel: `Map ${candidates.length}`,
      variant: 'primary',
    });
    if (!confirmed) return;
    setCrmBatchSaving(true);
    try {
      const result = await AirtableSyncService.saveClientIdentityMappingsBatch(
        candidates.map(candidate => ({
          sourceTable: candidate.sourceTable,
          groupKey: candidate.groupKey,
          sourceNames: candidate.sourceNames,
          action: 'MAP_TO_CLIENT',
          canonicalClientId: candidate.recommendation.canonicalClientId,
          canonicalCompanyName: candidate.recommendation.canonicalCompanyName,
          recommendationConfidence: 'HIGH',
          reason: `Accepted high-confidence recommendation for ${candidate.displayName} in Airtable Sync Center`,
        })),
        syncResult.syncRunId,
      );
      showToast(`${result.saved} client identity mapping${result.saved === 1 ? '' : 's'} saved. Running a fresh Dry Run...`, 'success');
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not save the selected client identity mappings.', 'error');
    } finally {
      setCrmBatchSaving(false);
    }
  };

  const saveClientIdentityMapping = async () => {
    if (!crmMappingTarget || !crmSelectedClientId) return;
    const selected = crmCanonicalTargets.find(client => client.id === crmSelectedClientId);
    if (!selected) return;
    if (selected.targetState === 'PENDING_APPROVED' && (!syncResult?.dryRun || !syncResult.syncRunId)) {
      showToast('Run a fresh Clients Dry Run before mapping to an approved pending account.', 'error');
      return;
    }
    const confirmed = await confirm({
      title: 'Confirm client identity mapping',
      message: `Map "${crmMappingTarget.displayName}" to ${selected.companyName} (${selected.sageAccountRef || selected.id})? This audited rule will be reused by future mirror cycles.`,
      confirmLabel: 'Save mapping',
      variant: 'primary',
    });
    if (!confirmed) return;

    setCrmMappingLoading(true);
    try {
      await AirtableSyncService.saveClientIdentityMapping({
        sourceTable: crmMappingTarget.sourceTable,
        groupKey: crmMappingTarget.groupKey,
        sourceNames: crmMappingTarget.sourceNames,
        action: 'MAP_TO_CLIENT',
        canonicalClientId: selected.id,
        canonicalCompanyName: selected.companyName,
        reason: `Mapped ${crmMappingTarget.displayName} to ${selected.companyName} in Airtable Sync Center`,
        syncRunId: selected.targetState === 'PENDING_APPROVED' ? syncResult?.syncRunId : undefined,
      });
      setCrmMappingTarget(null);
      showToast(`${crmMappingTarget.displayName} is now mapped to ${selected.companyName}.`, 'success');
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not save the client identity mapping.', 'error');
    } finally {
      setCrmMappingLoading(false);
    }
  };

  const saveManualClientIdentityMappings = async () => {
    if (!crmManualBatchTargets.length || !crmSelectedClientId || crmMappingLoading) return;
    if (!syncResult?.dryRun || !syncResult.syncRunId) {
      showToast('Run a fresh Clients Dry Run before saving a manual batch.', 'error');
      return;
    }
    const selected = crmCanonicalTargets.find(client => client.id === crmSelectedClientId);
    if (!selected) return;
    const confirmed = await confirm({
      title: 'Confirm client identity mapping',
      message: `Map ${crmManualBatchTargets.length} selected Airtable identit${crmManualBatchTargets.length === 1 ? 'y' : 'ies'} to ${selected.companyName} (${selected.sageAccountRef || selected.id})? This audited rule will be reused by future mirror cycles.`,
      confirmLabel: `Map ${crmManualBatchTargets.length}`,
      variant: 'primary',
    });
    if (!confirmed) return;

    setCrmMappingLoading(true);
    try {
      const result = await AirtableSyncService.saveClientIdentityMappingsManualBatch(
        crmManualBatchTargets.map(target => ({
          sourceTable: target.sourceTable as 'Clients Book' | 'Departments',
          groupKey: target.groupKey,
          sourceNames: target.sourceNames,
          action: 'MAP_TO_CLIENT',
          canonicalClientId: selected.id,
          canonicalCompanyName: selected.companyName,
          reason: `Manually mapped ${target.displayName} to ${selected.companyName} in Airtable Sync Center`,
        })),
        syncResult.syncRunId,
      );
      setCrmManualBatchTargets([]);
      showToast(
        `${result.saved} client identity mapping${result.saved === 1 ? '' : 's'} saved. Running one fresh Dry Run...`,
        'success',
      );
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not save the manual client identity batch.', 'error');
    } finally {
      setCrmMappingLoading(false);
    }
  };

  const approveNewCanonicalOrganisation = async (
    candidate: ClientCrmNewOrganisationCandidate,
    sourceTable: 'Clients' | 'Clients Book' = 'Clients Book',
  ) => {
    const confirmed = await confirm({
      title: 'Approve canonical organisation',
      message: `Approve "${candidate.canonicalCompanyName}" as a new canonical Client CRM organisation? Use this only when it is not a department, alias or duplicate.`,
      confirmLabel: 'Approve organisation',
      variant: 'warning',
    });
    if (!confirmed) return;
    setCrmMappingLoading(true);
    try {
      await AirtableSyncService.saveClientIdentityMapping({
        sourceTable,
        groupKey: candidate.groupKey,
        sourceNames: candidate.sourceNames,
        sourceName: candidate.canonicalCompanyName,
        action: 'APPROVE_NEW_CLIENT',
        canonicalCompanyName: candidate.canonicalCompanyName,
        reason: 'Explicitly approved as a new canonical organisation in Airtable Sync Center',
      });
      showToast(`${candidate.canonicalCompanyName} was approved for canonical creation.`, 'success');
      await refreshClientIdentityDryRun();
    } catch (error: any) {
      showToast(error?.message || 'Could not approve the new canonical organisation.', 'error');
    } finally {
      setCrmMappingLoading(false);
    }
  };

  const renderStats = (result?: AirtableModuleResult | null) => {
    if (!result) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Run Dry Run to preview this module before writing data.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatPill label="Created" value={result.stats.created} className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" />
        <StatPill label="Updated" value={result.stats.updated} className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200" />
        <StatPill label="Skipped" value={result.stats.skipped} />
        <StatPill label="Conflicts" value={result.stats.conflict} className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200" />
        <StatPill label="Errors" value={result.stats.error} className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" />
      </div>
    );
  };

  const renderClientCrmStaging = (result?: AirtableModuleResult | null) => {
    if (!result?.diagnostics) return null;
    const diagnostics = result.diagnostics as ClientCrmDiagnostics;
    const accounts = diagnostics.canonicalAccounts || {};
    const clientsBook = diagnostics.clientsBook || {};
    const newOrganisations = clientsBook.newCanonicalOrganisationCandidates || [];
    const deferredIdentities = clientsBook.deferredIdentityGroups || [];
    const conflicts = deduplicateClientCrmReviewScopes(clientsBook.conflictCandidates || []);
    const departmentConflicts = conflicts.filter(candidate => candidate.sourceTable === 'Departments');
    const identityConflicts = conflicts.filter(candidate => (
      candidate.sourceTable === 'Clients Book'
      && candidate.reason !== 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED'
    ));
    const query = crmReviewFilter.trim().toLowerCase();
    const matchesQuery = (values: string[]) => !query || values.some(value => value.toLowerCase().includes(query));
    const visibleNewOrganisations = newOrganisations.filter(candidate => matchesQuery([
      candidate.canonicalCompanyName,
      candidate.groupKey,
      ...candidate.sourceNames,
    ]));
    const visibleDepartmentConflicts = departmentConflicts.filter(candidate => matchesQuery([
      candidate.groupKey,
      ...candidate.companyNames,
    ]));
    const visibleIdentityConflicts = identityConflicts.filter(candidate => matchesQuery([
      candidate.groupKey,
      candidate.reason,
      ...candidate.companyNames,
      ...candidate.candidateClientIds,
    ]));
    const visibleDeferredIdentities = deferredIdentities.filter(candidate => matchesQuery([
      candidate.groupKey,
      candidate.category,
      candidate.reason,
      ...candidate.sourceNames,
    ]));
    const canonicalCreates = accounts.wouldCreateCanonicalAccounts || [];
    const visibleCanonicalCreates = canonicalCreates.filter(candidate => matchesQuery([
      candidate.companyName,
      candidate.sageAccountRef,
      candidate.clientId,
      candidate.groupKey,
    ]));
    const reviewTotal = canonicalCreates.length + newOrganisations.length + departmentConflicts.length + identityConflicts.length;
    const writeBlockerCount = result.writeReadiness?.blockerCount || reviewTotal;

    const highRecommendationCandidates: ClientCrmBatchCandidate[] = [
      ...newOrganisations.map(candidate => ({
        sourceTable: 'Clients Book' as const,
        groupKey: candidate.groupKey,
        displayName: candidate.canonicalCompanyName,
        sourceNames: candidate.sourceNames,
        recommendation: candidate.recommendation,
      })),
      ...[...departmentConflicts, ...identityConflicts].map(candidate => ({
        sourceTable: candidate.sourceTable,
        groupKey: candidate.groupKey,
        displayName: candidate.companyNames[0] || candidate.groupKey,
        sourceNames: candidate.companyNames,
        recommendation: candidate.recommendation,
      })),
    ].filter((candidate): candidate is ClientCrmBatchCandidate => Boolean(
      candidate.recommendation?.confidence === 'HIGH'
      && candidate.recommendation.autoReviewEligible,
    ));
    const visibleHighRecommendations = highRecommendationCandidates.filter(candidate => matchesQuery([
      candidate.displayName,
      candidate.groupKey,
      candidate.recommendation.canonicalCompanyName,
    ]));
    const selectedHighRecommendations = highRecommendationCandidates.filter(candidate => (
      crmBatchSelection[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)]
    ));
    const allVisibleHighSelected = visibleHighRecommendations.length > 0 && visibleHighRecommendations.every(candidate => (
      crmBatchSelection[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)]
    ));

    const toggleRecommendation = (candidate: ClientCrmBatchCandidate) => {
      const key = clientCrmReviewKey(candidate.sourceTable, candidate.groupKey);
      setCrmBatchSelection(current => ({ ...current, [key]: !current[key] }));
    };

    const reviewCheckbox = (candidate: ClientCrmBatchCandidate | null) => candidate ? (
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(crmBatchSelection[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)])}
          onChange={() => toggleRecommendation(candidate)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
        />
        Include
      </label>
    ) : null;

    const batchCandidateFor = (
      sourceTable: 'Clients Book' | 'Departments',
      groupKey: string,
    ) => highRecommendationCandidates.find(candidate => (
      candidate.sourceTable === sourceTable && candidate.groupKey === groupKey
    )) || null;

    const mappingTargetFor = (candidate: ClientCrmConflictCandidate): ClientCrmMappingTarget => ({
      sourceTable: candidate.sourceTable,
      groupKey: candidate.groupKey,
      displayName: candidate.companyNames[0] || candidate.groupKey,
      sourceNames: candidate.companyNames,
      reason: candidate.reason,
      recommendedClientId: candidate.recommendation?.canonicalClientId,
    });

    const mappingTargetForNewOrganisation = (
      candidate: ClientCrmNewOrganisationCandidate,
    ): ClientCrmMappingTarget => ({
      sourceTable: 'Clients Book',
      groupKey: candidate.groupKey,
      displayName: candidate.canonicalCompanyName,
      sourceNames: candidate.sourceNames,
      reason: 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED',
      recommendedClientId: candidate.recommendation?.canonicalClientId,
    });

    const manualBatchCandidates = deduplicateClientCrmReviewScopes<ClientCrmMappingTarget>([
      ...newOrganisations.map(mappingTargetForNewOrganisation),
      ...departmentConflicts.map(mappingTargetFor),
      ...identityConflicts.map(mappingTargetFor),
    ]);
    const selectedManualCandidates = manualBatchCandidates.filter(candidate => (
      crmManualBatchSelection[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)]
    ));

    const toggleManualCandidate = (candidate: ClientCrmMappingTarget) => {
      const key = clientCrmReviewKey(candidate.sourceTable, candidate.groupKey);
      const selected = Boolean(crmManualBatchSelection[key]);
      if (!selected && selectedManualCandidates.length >= 25) {
        showToast('Select at most 25 identities in one manual batch.', 'error');
        return;
      }
      setCrmManualBatchSelection(current => ({ ...current, [key]: !current[key] }));
    };

    const rowReviewControl = (
      target: ClientCrmMappingTarget,
      recommendationCandidate: ClientCrmBatchCandidate | null,
    ) => crmManualBatchMode ? (
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-black text-blue-700 dark:text-blue-300">
        <input
          type="checkbox"
          aria-label={`Select ${target.displayName} for manual batch mapping`}
          checked={Boolean(crmManualBatchSelection[clientCrmReviewKey(target.sourceTable, target.groupKey)])}
          onChange={() => toggleManualCandidate(target)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
        />
        Select
      </label>
    ) : reviewCheckbox(recommendationCandidate);

    const deferralControl = (target: ClientCrmMappingTarget) => (
      isSuperAdmin && target.sourceTable !== 'Clients' ? (
        <button
          onClick={() => openClientIdentityDeferral(target)}
          className="h-9 rounded-lg border border-amber-200 px-3 text-sm font-black text-amber-800 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"
        >
          Defer source
        </button>
      ) : null
    );

    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-lg p-2 ${result.writeReadiness?.ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
              {result.writeReadiness?.ready ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">Client CRM staging</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Canonical organisations are separated from departments and agents before any write is approved.
              </p>
            </div>
          </div>
          <Link
            to="/admin/clients/identity-audit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Open identity audit <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 md:grid-cols-4 lg:grid-cols-7">
          {[
            ['Account records', accounts.sourceRecords || 0],
            ['Contact rows', clientsBook.clientsBookSourceRecords || 0],
            ['Canonical clients', clientsBook.canonicalOrganisations || 0],
            ['Departments', clientsBook.projectedDepartments || 0],
            ['Agents', clientsBook.projectedAgents || 0],
            ['Needs review', reviewTotal],
            ['Deferred', clientsBook.deferredSourceRecordCount || 0],
          ].map(([label, value], index) => (
            <div key={String(label)} className={`px-4 py-3 ${index ? 'border-l border-slate-200 dark:border-slate-800' : ''}`}>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {!result.writeReadiness?.ready && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 shrink-0" size={17} />
              <p>
                Write Sync is locked by {writeBlockerCount} blocked source row{writeBlockerCount === 1 ? '' : 's'}
                {writeBlockerCount !== reviewTotal
                  ? ` across ${reviewTotal} unique review decision${reviewTotal === 1 ? '' : 's'}`
                  : ''}. Resolving a review decision records an auditable rule; rerun Dry Run until this gate is clear.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={crmReviewFilter}
              onChange={event => setCrmReviewFilter(event.target.value)}
              placeholder="Find an organisation, department or source key"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {visibleCanonicalCreates.length + visibleNewOrganisations.length + visibleDepartmentConflicts.length + visibleIdentityConflicts.length + visibleDeferredIdentities.length} visible
            </p>
            {!crmManualBatchMode && visibleHighRecommendations.length > 0 && (
              <button
                onClick={() => setCrmBatchSelection(current => {
                  const next = { ...current };
                  if (allVisibleHighSelected) {
                    visibleHighRecommendations.forEach(candidate => {
                      next[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)] = false;
                    });
                  } else {
                    const selectedCount = highRecommendationCandidates.filter(candidate => (
                      next[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)]
                    )).length;
                    visibleHighRecommendations
                      .filter(candidate => !next[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)])
                      .slice(0, Math.max(0, 25 - selectedCount))
                      .forEach(candidate => {
                        next[clientCrmReviewKey(candidate.sourceTable, candidate.groupKey)] = true;
                      });
                  }
                  return next;
                })}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {allVisibleHighSelected ? 'Clear visible' : `Select strong (${Math.min(visibleHighRecommendations.length, 25)})`}
              </button>
            )}
            {!crmManualBatchMode && selectedHighRecommendations.length > 0 && (
              <button
                onClick={() => saveRecommendedIdentityMappings(selectedHighRecommendations)}
                disabled={crmBatchSaving}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {crmBatchSaving && <Loader2 className="animate-spin" size={14} />}
                Save reviewed ({selectedHighRecommendations.length})
              </button>
            )}
            {isSuperAdmin && !crmManualBatchMode && (
              <button
                onClick={openClientIdentityMappingLedger}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ClipboardList size={14} /> Mapping ledger
              </button>
            )}
            {isSuperAdmin && reviewTotal > 0 && !crmManualBatchMode && (
              <button
                onClick={() => {
                  setCrmManualBatchMode(true);
                  setCrmManualBatchSelection({});
                }}
                className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
              >
                Manual batch
              </button>
            )}
            {crmManualBatchMode && (
              <>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {selectedManualCandidates.length}/25 selected
                </span>
                {selectedManualCandidates.length > 0 && (
                  <button
                    onClick={() => setCrmManualBatchSelection({})}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => {
                    setCrmManualBatchMode(false);
                    setCrmManualBatchSelection({});
                  }}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => openClientIdentityManualBatch(selectedManualCandidates)}
                  disabled={selectedManualCandidates.length === 0}
                  className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Map selected
                </button>
              </>
            )}
          </div>
        </div>

        <div className="max-h-[560px] overflow-y-auto">
          {visibleIdentityConflicts.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Ambiguous identities</p>
                <span className="text-xs font-black text-slate-500">{visibleIdentityConflicts.length}</span>
              </div>
              {visibleIdentityConflicts.map((candidate, index) => (
                <div key={`${candidate.sourceTable}-${candidate.groupKey}-${candidate.reason}-${candidate.sourceRecordIds?.join('-') || index}`} className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">{candidate.companyNames[0] || candidate.groupKey}</p>
                    <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{candidate.reason.replaceAll('_', ' ')}</p>
                    {candidate.candidateClientIds.length > 0 && <p className="mt-1 truncate text-xs text-slate-500">Candidates: {candidate.candidateClientIds.join(', ')}</p>}
                    {candidate.recommendation && <ClientRecommendationSummary recommendation={candidate.recommendation} />}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {rowReviewControl(
                      mappingTargetFor(candidate),
                      batchCandidateFor(candidate.sourceTable, candidate.groupKey),
                    )}
                    <button
                      onClick={() => openClientIdentityMapping(mappingTargetFor(candidate))}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {candidate.recommendation ? 'Review mapping' : 'Map client'}
                    </button>
                    {deferralControl(mappingTargetFor(candidate))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleNewOrganisations.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">New organisation review</p>
                <span className="text-xs font-black text-slate-500">{visibleNewOrganisations.length}</span>
              </div>
              {visibleNewOrganisations.map(candidate => (
                <div key={candidate.groupKey} className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">{candidate.canonicalCompanyName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{candidate.sourceRecordCount} source row{candidate.sourceRecordCount === 1 ? '' : 's'} · {candidate.groupKey}</p>
                    {candidate.recommendation && <ClientRecommendationSummary recommendation={candidate.recommendation} />}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {rowReviewControl(
                      mappingTargetForNewOrganisation(candidate),
                      batchCandidateFor('Clients Book', candidate.groupKey),
                    )}
                    <button
                      onClick={() => openClientIdentityMapping(mappingTargetForNewOrganisation(candidate))}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {candidate.recommendation ? 'Review existing' : 'Map existing'}
                    </button>
                    <button
                      onClick={() => approveNewCanonicalOrganisation(candidate)}
                      disabled={crmMappingLoading}
                      className="h-9 rounded-lg bg-slate-950 px-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      Approve new
                    </button>
                    {deferralControl(mappingTargetForNewOrganisation(candidate))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleDepartmentConflicts.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Departments without a client</p>
                <span className="text-xs font-black text-slate-500">{visibleDepartmentConflicts.length}</span>
              </div>
              {visibleDepartmentConflicts.map((candidate, index) => (
                <div key={`${candidate.sourceTable}-${candidate.groupKey}-${candidate.sourceRecordIds?.join('-') || index}`} className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">{candidate.companyNames[0] || candidate.groupKey}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">Airtable Departments · {candidate.sourceRecordIds?.join(', ') || candidate.groupKey}</p>
                    {candidate.recommendation && <ClientRecommendationSummary recommendation={candidate.recommendation} />}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {rowReviewControl(
                      mappingTargetFor(candidate),
                      batchCandidateFor('Departments', candidate.groupKey),
                    )}
                    <button
                      onClick={() => openClientIdentityMapping(mappingTargetFor(candidate))}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {candidate.recommendation ? 'Review client' : 'Assign client'}
                    </button>
                    {deferralControl(mappingTargetFor(candidate))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleDeferredIdentities.length > 0 && (
            <details className="border-b border-slate-200 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-amber-50/70 px-4 py-3 text-xs font-black uppercase tracking-wider text-amber-900 hover:bg-amber-50 dark:bg-amber-950/20 dark:text-amber-200">
                <span>Deferred source identities</span>
                <span>{visibleDeferredIdentities.length}</span>
              </summary>
              {visibleDeferredIdentities.map(candidate => (
                <div
                  key={`${candidate.sourceTable}-${candidate.groupKey}`}
                  className="grid gap-2 border-t border-amber-100 px-4 py-3 dark:border-amber-900/30 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">
                      {candidate.sourceNames[0] || candidate.groupKey}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {candidate.category.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {candidate.reason}
                  </p>
                  <button
                    onClick={openClientIdentityMappingLedger}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    View ledger
                  </button>
                </div>
              ))}
            </details>
          )}

          {reviewTotal === 0 && (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center">
              <CheckCircle2 className="text-emerald-600" size={26} />
              <p className="font-black text-slate-950 dark:text-white">Client identities are ready for write review</p>
              <p className="text-sm text-slate-500">
                No organisation, department or generic client identity is unresolved in this dry run.
                {deferredIdentities.length > 0 ? ` ${deferredIdentities.length} audited source group${deferredIdentities.length === 1 ? ' remains' : 's remain'} deferred from write.` : ''}
              </p>
            </div>
          )}
          {reviewTotal > 0 && visibleCanonicalCreates.length + visibleNewOrganisations.length + visibleDepartmentConflicts.length + visibleIdentityConflicts.length + visibleDeferredIdentities.length === 0 && (
            <div className="p-8 text-center text-sm font-semibold text-slate-500">No staging rows match this search.</div>
          )}
        </div>

        {visibleCanonicalCreates.length > 0 && (
          <details className="border-t border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
              {visibleCanonicalCreates.length} canonical account record{visibleCanonicalCreates.length === 1 ? '' : 's'} would be created from Airtable Clients
            </summary>
            <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2">
              {visibleCanonicalCreates.map(candidate => (
                <div key={candidate.clientId} className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">{candidate.companyName}</p>
                    <p className="truncate text-xs text-slate-500">{candidate.sageAccountRef || 'No Sage ref'} · {candidate.clientId}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => openClientIdentityMapping({
                        sourceTable: 'Clients',
                        groupKey: candidate.groupKey,
                        displayName: candidate.companyName,
                        sourceNames: [candidate.companyName],
                        reason: 'CANONICAL_ACCOUNT_MATCH_REQUIRED',
                      })}
                      className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Map existing
                    </button>
                    <button
                      onClick={() => approveNewCanonicalOrganisation({
                        groupKey: candidate.groupKey,
                        canonicalCompanyName: candidate.companyName,
                        proposedClientId: candidate.clientId,
                        sourceRecordCount: 1,
                        sourceNames: [candidate.companyName],
                      }, 'Clients')}
                      disabled={crmMappingLoading}
                      className="h-8 rounded-lg bg-slate-950 px-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      Approve new
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    );
  };

  const renderDetails = (result?: AirtableModuleResult | null) => {
    if (!result?.details?.length) return null;
    const isErrorDetail = (detail: any) => detail.action === 'error';
    const isConflictDetail = (detail: any) => detail.action === 'conflict' || Boolean(detail.conflictReasons?.length);
    const isUnmatchedDetail = (detail: any) => (
      detail.matchedBookings === 0
      || detail.interpreterResolved === false
      || ['created', 'would-create'].includes(detail.clientAction)
    );
    const filteredDetails = result.details.filter((detail: any) => {
      if (detailFilter === 'errors') return isErrorDetail(detail);
      if (detailFilter === 'conflicts') return isConflictDetail(detail);
      if (detailFilter === 'unmatched') return isUnmatchedDetail(detail);
      if (detailFilter === 'changes') return ['created', 'updated', 'conflict'].includes(detail.action);
      return true;
    });
    const filterOptions: Array<{ id: typeof detailFilter; label: string; count: number }> = [
      { id: 'all', label: 'All', count: result.details.length },
      { id: 'errors', label: 'Errors', count: result.details.filter(isErrorDetail).length },
      { id: 'conflicts', label: 'Conflicts', count: result.details.filter(isConflictDetail).length },
      { id: 'unmatched', label: 'Unmatched', count: result.details.filter(isUnmatchedDetail).length },
      { id: 'changes', label: 'Changes', count: result.details.filter((detail: any) => ['created', 'updated', 'conflict'].includes(detail.action)).length }
    ];

    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">Audit rows</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{filteredDetails.length} of {result.details.length} shown</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map(option => (
              <button
                key={option.id}
                onClick={() => setDetailFilter(option.id)}
                className={`h-8 rounded-lg border px-3 text-xs font-black ${
                  detailFilter === option.id
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-blue-500 dark:bg-blue-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[980px] divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Client</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Person</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Match</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDetails.map((detail: any, index) => (
                <tr key={`${detail.sourceRecordId}-${index}`} className="align-top dark:text-slate-200">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-black uppercase ${
                      detail.action === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : detail.action === 'created'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : detail.action === 'updated'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}>
                      {detail.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950 dark:text-white">
                      {detail.displayRef || detail.jobNumber || detail.invoiceNumber || detail.clientName || detail.sourceRecordId}
                    </p>
                    <p className="text-xs text-slate-500">{detail.sourceTable || result.tableNames.join(', ')} / {detail.sourceRecordId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{detail.clientName || '-'}</p>
                    {detail.clientAction && <p className={`text-xs font-bold ${detail.clientAction === 'created' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>Client {detail.clientAction}</p>}
                    {detail.email && <p className="text-xs text-slate-500">{detail.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{detail.interpreterName || '-'}</p>
                    {detail.interpreterName && (
                      <p className={`text-xs font-bold ${detail.interpreterResolved ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                        {detail.interpreterResolved ? 'Matched profile' : 'Name only'}
                      </p>
                    )}
                    {(detail.interpreterMatchMethod || detail.interpreterMatchConfidence !== undefined) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {detail.interpreterMatchMethod || 'unknown'} · {detail.interpreterMatchConfidence || 0}%
                      </p>
                    )}
                    {detail.ambiguousCandidates?.length ? (
                      <p className="text-xs font-bold text-red-600 dark:text-red-300">
                        {detail.ambiguousCandidates.length} possible profiles
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {detail.matchedBookings !== undefined ? (
                      <p className={`font-black ${detail.matchedBookings > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                        {detail.matchedBookings} booking match{detail.matchedBookings === 1 ? '' : 'es'}
                      </p>
                    ) : (
                      <p className="text-slate-500">-</p>
                    )}
                    {detail.linkedJobs !== undefined && <p className="text-xs text-slate-500">{detail.linkedJobs} linked source ref{detail.linkedJobs === 1 ? '' : 's'}</p>}
                    {detail.workflowArtifacts?.assignment && (
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-300">Assignment {detail.workflowArtifacts.assignment}</p>
                    )}
                    {detail.workflowArtifacts?.timesheet && (
                      <p className="text-xs font-bold text-purple-600 dark:text-purple-300">Timesheet {detail.workflowArtifacts.timesheet}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{detail.status || '-'}</p>
                    {detail.conflictReasons?.map((reason: string) => (
                      <p key={reason} className="mt-1 max-w-xs text-xs font-bold text-amber-700 dark:text-amber-300">
                        {reason.replaceAll('_', ' ')}
                      </p>
                    ))}
                    {detail.message && <p className="max-w-xs text-xs text-red-600 dark:text-red-300">{detail.message}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredDetails.length && (
            <div className="p-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              No rows match this filter.
            </div>
          )}
        </div>
      </div>
    );
  };

  const runActiveDryRun = () => {
    if (activeModule) return runSync(true, [activeModule.id]);
    return runSync(true, 'full');
  };

  const runActiveWrite = () => {
    if (activeModule) return runSync(false, [activeModule.id]);
    return runSync(false, 'full');
  };

  const activeTitle = activeModule?.label
    || (activeTab === 'interpreters' ? 'Interpreters' : activeTab === 'reconciliation' ? 'Reconciliation' : 'Full Sync');
  const activeSubtitle = activeModule?.description
    || (activeTab === 'interpreters'
      ? 'Active team import and activation'
      : activeTab === 'reconciliation'
        ? 'Open discrepancies, severity and next action'
        : 'All modules in dependency order');
  const activeWriteDisabled = loading
    || importLocked
    || activeTab === 'interpreters'
    || activeTab === 'reconciliation'
    || syncNowBlockedByDependency
    || writeBlockedByDryRun;
  const activeWriteLabel = activeModule ? 'Write Sync' : 'Write Full Sync';
  const activeDryRunLabel = activeModule ? 'Dry Run' : 'Full Dry Run';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Airtable Sync Center</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Mirror Mode cockpit for clients, jobs, translations, invoices and activation workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black uppercase">
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60"
          >
            <Info size={14} />
            Info
          </button>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{operatingMode}</span>
          <span className={`rounded-full px-3 py-1 ${importMode === 'ON' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
            Import {importMode}
          </span>
          <span className={`rounded-full px-3 py-1 ${communicationMode === 'LIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            Email {communicationMode}
          </span>
        </div>
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">Airtable Migration Info</p>
                <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">How this Sync Center works</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Use this page to mirror Airtable data into Lingland while keeping operations safe during transition.
                </p>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-black text-slate-950 dark:text-white">Safe operating rule</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li><strong>Dry Run</strong> reads Airtable and previews what would happen. It does not write data.</li>
                  <li><strong>Write Sync</strong> writes to Firestore and is blocked until a clean Dry Run was run with the same module and sync strategy.</li>
                  <li><strong>Import Mode</strong> controls whether writes are allowed. `READ_ONLY` and `OFF` prevent production writes.</li>
                  <li><strong>Email Mode</strong> still controls communication. Mirror imports do not send client/interpreter emails by themselves.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-black text-slate-950 dark:text-white">Required order</h3>
                <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>1. Import <strong>Clients</strong>.</li>
                  <li>2. Import <strong>Interpretation Jobs</strong> and/or <strong>Translation Jobs</strong>.</li>
                  <li>3. Import <strong>Client Invoices</strong> and <strong>Interpreter/Translator Invoices</strong>.</li>
                  <li>4. Review unmatched rows before running higher limits.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-black text-slate-950 dark:text-white">What gets mirrored</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>REDBOOK jobs become Lingland bookings with Airtable refs and job numbers.</li>
                  <li>Translations become bookings with `serviceCategory: TRANSLATION`.</li>
                  <li>Assigned interpreters/translators are linked to platform profiles when possible.</li>
                  <li>Status is mapped into the Lingland job workflow: assignment, booked, timesheet, invoice and paid stages.</li>
                  <li>Invoices create invoice documents and invoice lines linked back to matched bookings.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-black text-slate-950 dark:text-white">Workflow artifacts</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>Assigned jobs create mirrored canonical `assignments` records used by Operations and the interpreter app.</li>
                  <li>Accepted/booked jobs create accepted assignment state.</li>
                  <li>Timesheet/invoice/paid signals create mirrored `timesheets`.</li>
                  <li>Invoice lines point to mirrored timesheets when a booking match exists.</li>
                  <li>Job events are recorded for audit without triggering interpreter/client communication.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 lg:col-span-2">
                <h3 className="font-black">Before writing real data</h3>
                <p className="mt-2 text-sm">
                  Use <strong>Open workflow</strong> for the daily Mirror Cycle. Use <strong>Updated since last sync</strong> for quick catch-up runs, <strong>Recent + open</strong> during transition checks, and <strong>Full audit</strong> only for reconciliation proof. If invoices show zero booking matches, do not write finance yet: import or repair the related jobs first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <SlidersHorizontal size={14} />
                  Active workspace
                </span>
                {activeDependency && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                    dependencyWritten
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}>
                    {dependencyWritten ? 'Dependency ready' : `Requires ${activeDependency.label}`}
                  </span>
                )}
                {activeModuleCheckpoint?.lastWriteAt && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Last write {formatDateTime(activeModuleCheckpoint.lastWriteAt)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">{activeTitle}</h2>
                  <p className="text-sm leading-5 text-slate-500 dark:text-slate-400 sm:truncate">{activeSubtitle}</p>
                </div>
                <select
                  value={activeTab}
                  onChange={event => setActiveTab(event.target.value as WorkspaceTab)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 xl:hidden"
                >
                  {activeModuleOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {activeTab !== 'interpreters' && activeTab !== 'reconciliation' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={syncStrategy}
                onChange={e => {
                  const nextStrategy = e.target.value as AirtableSyncStrategy;
                  setSyncStrategy(nextStrategy);
                  setRecordLimit(getStrategyConfig(nextStrategy).defaultLimit);
                }}
                title={activeStrategyConfig.description}
                className="h-10 min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                {syncStrategyOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              {syncStrategy === 'CUSTOM_LIMIT' && (
                <select
                  value={recordLimit}
                  onChange={e => setRecordLimit(Number(e.target.value))}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value={100}>100 records</option>
                  <option value={500}>500 records</option>
                  <option value={1000}>1,000 records</option>
                  <option value={5000}>5,000 records</option>
                </select>
              )}
              {syncStrategy !== 'CUSTOM_LIMIT' && (
                <span
                  title={`This strategy will request up to ${recordLimit.toLocaleString()} Airtable records.`}
                  className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                >
                  {recordLimit.toLocaleString()} records
                </span>
              )}
              <button
                onClick={runActiveDryRun}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {activeDryRunLabel}
              </button>
              <button
                onClick={runActiveWrite}
                disabled={activeWriteDisabled}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                {activeWriteLabel}
              </button>
            </div>
            )}
          </div>
        </div>

        {importLocked && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>Import write actions are locked because Airtable Import Mode is {importMode}. Use Dry Run or change Platform Mode when ready.</span>
            </div>
          </div>
        )}

        {writeBlockedByDryRun && activeTab !== 'interpreters' && activeTab !== 'reconciliation' && (
          <div className="mx-4 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="flex gap-2">
              <ShieldCheck size={18} className="mt-0.5 shrink-0" />
              <span>Run a clean {activeDryRunLabel} with the current {activeStrategyConfig.label} strategy before writing data. Approval remains valid for 30 minutes and can be used once.</span>
            </div>
          </div>
        )}

        {(loading || repairLoading) && syncAttemptLabel && (
          <div className="mx-4 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <div className="flex gap-2">
              <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
              <span>{syncAttemptLabel} is running. Keep this page open until the result appears.</span>
            </div>
          </div>
        )}

        {syncError && !loading && !repairLoading && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            <div className="flex gap-2">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{syncAttemptLabel ? `${syncAttemptLabel} failed: ` : ''}{syncError}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden border-b border-slate-200 p-4 dark:border-slate-800 xl:block xl:border-b-0 xl:border-r">
            <div className="space-y-1">
              {([
                { id: 'overview' as WorkspaceTab, label: 'Overview', description: 'Full workflow and dependency order' },
                { id: 'interpreters' as WorkspaceTab, label: 'Interpreters', description: 'Active team import and activation' },
                { id: 'reconciliation' as WorkspaceTab, label: 'Reconciliation', description: 'Open discrepancies and export' }
              ]).map(item => {
                const Icon = moduleIcons[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${activeTab === item.id ? 'bg-slate-950 text-white dark:bg-blue-600' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <Icon size={18} />
                    <span>
                      <span className="block text-sm font-black">{item.label}</span>
                      <span className={`block text-xs ${activeTab === item.id ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Airtable modules</p>
              <div className="space-y-1">
                {AIRTABLE_SYNC_MODULES.map((module, index) => {
                  const Icon = moduleIcons[module.id];
                  const result = moduleResults.get(module.id);
                  return (
                    <button
                      key={module.id}
                      onClick={() => setActiveTab(module.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${activeTab === module.id ? 'bg-slate-950 text-white dark:bg-blue-600' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-black">{index + 1}. {module.label}</span>
                          {result && <CheckCircle2 size={14} className={activeTab === module.id ? 'text-white' : 'text-emerald-500'} />}
                        </span>
                        <span className={`block truncate text-xs ${activeTab === module.id ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                          {module.tables.join(' + ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="min-h-[560px] p-5">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">Dependency order</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Full Sync runs in this order so clients and people exist before jobs, and jobs exist before invoices.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {fullOrder.map((moduleId, index) => {
                      const module = AIRTABLE_SYNC_MODULES.find(item => item.id === moduleId)!;
                      return (
                        <React.Fragment key={moduleId}>
                          <button
                            onClick={() => setActiveTab(moduleId)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs font-black ${moduleTone[moduleId]}`}
                          >
                            {index + 1}. {module.label}
                          </button>
                          {index < fullOrder.length - 1 && <ArrowRight size={16} className="text-slate-400" />}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {syncResult && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-black text-slate-950 dark:text-white">
                          {syncResult.dryRun ? 'Dry Run result' : 'Sync result'}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Mapping {syncResult.mappingVersion || 'unknown'} · {formatDateTime(syncResult.finishedAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${syncResult.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
                        {syncResult.success ? 'Clean' : 'Needs review'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      <StatPill label="Created" value={syncResult.stats.created} className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" />
                      <StatPill label="Updated" value={syncResult.stats.updated} className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200" />
                      <StatPill label="Skipped" value={syncResult.stats.skipped} />
                      <StatPill label="Conflicts" value={syncResult.stats.conflict} className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200" />
                      <StatPill label="Errors" value={syncResult.stats.error} className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" />
                    </div>
                    {syncResult.financePullThrough && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
                        Mirror strategy: {syncResult.syncStrategy || syncStrategy}. Finance pull-through {syncResult.financePullThrough.filterActive ? 'active' : 'not applied'} · {syncResult.financePullThrough.workflowSourceRecordIds || 0} workflow job refs considered
                        {(syncResult.financePullThrough.clientInvoicesDropped || syncResult.financePullThrough.interpreterInvoicesDropped) ? (
                          <span> · {syncResult.financePullThrough.clientInvoicesDropped || 0} client invoices and {syncResult.financePullThrough.interpreterInvoicesDropped || 0} interpreter payables outside the active workflow were skipped for this cycle</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Recent sync runs</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Durable history for Dry Runs and real Sync writes.</p>
                      </div>
                      <button
                        type="button"
                        onClick={loadSyncAuditTrail}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <RefreshCw size={14} />
                        Refresh
                      </button>
                    </div>
                    <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                      {recentRuns.length ? recentRuns.map(run => (
                        <div key={run.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                              {safeInlineText(run.kind, 'AIRTABLE_SYNC')} · {run.dryRun ? 'Dry Run' : 'Sync'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateTime(run.finishedAt)} · {run.modules?.join(', ') || 'redbook'} · {safeInlineText(run.id)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs font-black">
                            <span className={`rounded-full px-2 py-1 ${run.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
                              {run.success ? 'Clean' : 'Review'}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              {run.stats?.conflict || 0} conflicts
                            </span>
                          </div>
                        </div>
                      )) : (
                        <p className="py-4 text-sm text-slate-500 dark:text-slate-400">No sync runs recorded yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">Open conflicts</h2>
                        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/70">Status or ownership mismatches that need staff review.</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {openConflicts.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {openConflicts.length ? openConflicts.map(conflict => (
                        <div key={conflict.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm dark:border-amber-900/40 dark:bg-slate-950">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-black text-slate-950 dark:text-white">{safeInlineText(conflict.legacyRef || conflict.sourceRecordId)}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{safeInlineText(conflict.sourceTable, 'Unknown source')} · {safeInlineText(conflict.reason, 'UNCLASSIFIED')}</p>
                            </div>
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                              {conflict.severity || 'MEDIUM'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{safeInlineText(conflict.recommendedAction, 'Review source record and rerun sync.')}</p>
                        </div>
                      )) : (
                        <p className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-slate-950 dark:text-amber-200">
                          No open conflicts found.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {AIRTABLE_SYNC_MODULES.map(module => {
                    const result = moduleResults.get(module.id);
                    const Icon = moduleIcons[module.id];
                    return (
                      <button
                        key={module.id}
                        onClick={() => setActiveTab(module.id)}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Icon size={18} />
                            </div>
                            <div>
                              <h3 className="font-black text-slate-950 dark:text-white">{module.label}</h3>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{module.description}</p>
                            </div>
                          </div>
                          {result && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{result.records} read</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'interpreters' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <Users size={20} />
                      </div>
                      <div>
                        <h2 className="font-black text-slate-950 dark:text-white">Interpreters</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Active team import</p>
                      </div>
                    </div>
                    <div className="mt-5">
                      {interpreterLoading && !stats ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 size={16} className="animate-spin" /> Checking records...
                        </div>
                      ) : (
                        <>
                          <p className="text-4xl font-black text-slate-950 dark:text-white">{stats?.total || 0}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Unique active interpreters found</p>
                          {stats?.deduplicated ? (
                            <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {stats.deduplicated} merged from multiple rows
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-black text-slate-950 dark:text-white">Actions</h2>
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex gap-3">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-black">Transition rule</p>
                          <p>Imported interpreters can remain passive. Admin can assign and mark acceptance manually while emails are suppressed/internal.</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleMigrateInterpreters}
                        disabled={interpreterLoading || !stats || importLocked}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {interpreterLoading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                        Import interpreters
                      </button>
                      <button
                        onClick={loadInterpreterStats}
                        disabled={interpreterLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <RefreshCw size={16} />
                        Refresh stats
                      </button>
                      <button
                        onClick={handleSendInvites}
                        disabled={interpreterLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Mail size={16} />
                        Process activation emails
                      </button>
                    </div>
                  </div>
                </div>

                {(migrationResult || inviteResult) && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {migrationResult && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Import results</p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <StatPill label="Created" value={migrationResult.created} className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" />
                          <StatPill label="Skipped" value={migrationResult.skipped} />
                          <StatPill label="Errors" value={migrationResult.errors} className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" />
                        </div>
                      </div>
                    )}
                    {inviteResult && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Activation results</p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <StatPill label="Sent" value={inviteResult.sent} className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200" />
                          <StatPill label="Suppressed" value={inviteResult.suppressed || 0} />
                          <StatPill label="Errors" value={inviteResult.errors} className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reconciliation' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                          <ShieldCheck size={20} />
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-slate-950 dark:text-white">Reconciliation Report</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Open discrepancies between Airtable mirror data and platform records.</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={loadSyncAuditTrail}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <RefreshCw size={16} />
                        Refresh
                      </button>
                      <button
                        onClick={runMirrorAudit}
                        disabled={mirrorAuditLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50"
                      >
                        {mirrorAuditLoading ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                        Mirror proof
                      </button>
                      <button
                        onClick={runFinancialAudit}
                        disabled={financialAuditLoading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                      >
                        {financialAuditLoading ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                        Financial proof
                      </button>
                      <button
                        onClick={exportConflictReport}
                        disabled={!filteredConflicts.length}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                      >
                        <Download size={16} />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatPill label="Open issues" value={openConflicts.length} className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200" />
                    <StatPill label="High" value={conflictSummary.bySeverity.HIGH || 0} className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" />
                    <StatPill label="Medium" value={conflictSummary.bySeverity.MEDIUM || 0} className="border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200" />
                    <StatPill label="Low" value={conflictSummary.bySeverity.LOW || 0} />
                  </div>

                  {mirrorAudit && (
                    <div className="mt-5 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mirror proof</p>
                          <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Airtable REDBOOK vs platform</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {mirrorAudit.syncStrategy} · {mirrorAudit.limitRecords.toLocaleString()} record limit · {formatDateTime(mirrorAudit.generatedAt)}
                          </p>
                        </div>
                        {mirrorAudit.nextOffset && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                            Airtable has more pages beyond this audit limit
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                        <StatPill label="Airtable" value={mirrorAudit.airtableRecords} />
                        <StatPill label="Platform" value={mirrorAudit.platformRecords} />
                        <StatPill label="Matched" value={mirrorAudit.matchedRecords} className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" />
                        <StatPill label="Missing" value={mirrorAudit.missingInPlatformCount} className={mirrorAudit.missingInPlatformCount ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'} />
                        <StatPill label="Status drift" value={mirrorAudit.statusDivergenceCount || 0} className={mirrorAudit.statusDivergenceCount ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'} />
                        <StatPill label="Outside set" value={mirrorAudit.platformOnlyCount} />
                      </div>

                      {mirrorAudit.missingInPlatformCount > 0 && (
                        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-sm font-black text-red-800 dark:text-red-100">Repair missing REDBOOK records</p>
                            <p className="text-sm text-red-700 dark:text-red-200">
                              Targets only missing source record ids. Repairs run in resumable batches of 20 to avoid partial writes caused by callable timeouts.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => runMissingRedbookRepair(true)}
                              disabled={repairLoading || mirrorAuditLoading}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
                            >
                              {repairLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                              Dry repair
                            </button>
                            <button
                              onClick={() => runMissingRedbookRepair(false)}
                              disabled={repairLoading || mirrorAuditLoading || !cleanRepairDryRun || importLocked}
                              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                            >
                              {repairLoading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                              Write repair
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Airtable status counts</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(mirrorAudit.airtableStatusCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([status, count]) => (
                              <span key={status} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                                {status}: {count}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Platform source status counts</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(mirrorAudit.platformStatusCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([status, count]) => (
                              <span key={status} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                                {status}: {count}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {mirrorAudit.missingInPlatform.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-red-200 dark:border-red-900/40">
                          <div className="grid grid-cols-[minmax(180px,1fr)_120px_160px] gap-3 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 dark:bg-red-950/30 dark:text-red-200">
                            <span>Missing Airtable job</span>
                            <span>Status</span>
                            <span>Booked for</span>
                          </div>
                          <div className="divide-y divide-red-100 bg-white dark:divide-red-900/30 dark:bg-slate-900">
                            {mirrorAudit.missingInPlatform.slice(0, 10).map(row => (
                              <div key={row.sourceRecordId} className="grid grid-cols-[minmax(180px,1fr)_120px_160px] gap-3 px-4 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-black text-slate-950 dark:text-white">{row.jobNumber || row.sourceRecordId}</p>
                                  <p className="truncate text-xs text-slate-500">{row.sourceRecordId}</p>
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{row.status || 'Unknown'}</span>
                                <span className="text-slate-500 dark:text-slate-400">{row.bookedFor || 'N/A'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {mirrorAudit.statusDivergences?.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900/40">
                          <div className="grid grid-cols-[minmax(180px,1fr)_140px_140px] gap-3 bg-amber-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            <span>Matched job with status drift</span>
                            <span>Airtable</span>
                            <span>Platform source</span>
                          </div>
                          <div className="divide-y divide-amber-100 bg-white dark:divide-amber-900/30 dark:bg-slate-900">
                            {mirrorAudit.statusDivergences.slice(0, 10).map(row => (
                              <div key={row.sourceRecordId} className="grid grid-cols-[minmax(180px,1fr)_140px_140px] gap-3 px-4 py-3 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-black text-slate-900 dark:text-white">{row.jobNumber}</p>
                                  <p className="truncate text-xs text-slate-500">{row.sourceRecordId}</p>
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{row.airtableStatus}</span>
                                <span className="font-bold text-amber-700 dark:text-amber-200">{row.platformSourceStatus}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {financialAudit && (
                    <div className="mt-5 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Financial proof</p>
                          <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Jobs, invoice documents and persisted lines</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Job-to-invoice links, amounts, references, status parity and line totals checked {formatDateTime(financialAudit.generatedAt)}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={exportFinancialAudit}
                          disabled={!financialAudit.issues.length && !financialAudit.bookingIssues?.length}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Download size={15} /> Export financial issues
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
                        <StatPill label="Documents" value={financialAudit.totalInvoices} />
                        <StatPill label="Client" value={financialAudit.clientInvoices} />
                        <StatPill label="Payables" value={financialAudit.interpreterInvoices} />
                        <StatPill label="Healthy" value={financialAudit.healthyInvoices} className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" />
                        <StatPill label="Affected" value={financialAudit.affectedInvoices} className={financialAudit.affectedInvoices ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'} />
                        <StatPill label="Job links" value={financialAudit.affectedBookings || 0} className={financialAudit.affectedBookings ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'} />
                        <StatPill label="Issues" value={financialAudit.issueCount} className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200" />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {Object.entries(financialAudit.byReason).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                          <span key={reason} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {reason.replace(/_/g, ' ')}: {count}
                          </span>
                        ))}
                      </div>

                      {(financialAudit.bookingIssues || []).length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-red-200 dark:border-red-900/40">
                          <div className="min-w-[980px]">
                            <div className="grid grid-cols-[90px_190px_180px_190px_150px_minmax(220px,1fr)] gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                              <span>Severity</span>
                              <span>Job</span>
                              <span>Client</span>
                              <span>Issue</span>
                              <span>Source invoice</span>
                              <span>Next action</span>
                            </div>
                            <div className="divide-y divide-red-100 bg-white dark:divide-red-900/30 dark:bg-slate-900">
                              {(financialAudit.bookingIssues || []).slice(0, 25).map(issue => (
                                <div key={issue.id} className="grid grid-cols-[90px_190px_180px_190px_150px_minmax(220px,1fr)] gap-3 px-4 py-3 text-sm">
                                  <span className={`h-fit w-fit rounded-full px-2 py-1 text-[10px] font-black ${issue.severity === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'}`}>
                                    {issue.severity}
                                  </span>
                                  <div className="min-w-0">
                                    <Link
                                      to={`/admin/bookings/${issue.bookingId}`}
                                      state={{ returnTo: '/admin/administration/migration', returnLabel: 'Reconciliation' }}
                                      className="block truncate font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
                                    >
                                      {issue.jobNumber}
                                    </Link>
                                    <p className="truncate text-xs text-slate-500">{issue.sourceRecordId || issue.bookingId}</p>
                                  </div>
                                  <p className="truncate font-semibold text-slate-700 dark:text-slate-200">{issue.clientName || 'Unresolved client'}</p>
                                  <div className="min-w-0">
                                    <p className="truncate font-black text-slate-800 dark:text-slate-100">{issue.reason.replace(/_/g, ' ')}</p>
                                    <p className="truncate text-xs text-slate-500">{issue.status || issue.billingState || issue.paymentStatus}</p>
                                  </div>
                                  <p className="truncate font-semibold text-slate-600 dark:text-slate-300">
                                    {issue.sourceInvoiceReference || issue.invoiceIds.join(', ') || 'Not linked'}
                                  </p>
                                  <p className="font-semibold leading-5 text-slate-600 dark:text-slate-300">{issue.recommendedAction}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {financialAudit.issues.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="min-w-[980px]">
                            <div className="grid grid-cols-[90px_180px_180px_170px_120px_minmax(220px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                              <span>Severity</span>
                              <span>Document</span>
                              <span>Party</span>
                              <span>Issue</span>
                              <span>Amount</span>
                              <span>Next action</span>
                            </div>
                            <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                              {financialAudit.issues.slice(0, 25).map(issue => (
                                <div key={issue.id} className="grid grid-cols-[90px_180px_180px_170px_120px_minmax(220px,1fr)] gap-3 px-4 py-3 text-sm">
                                  <span className={`h-fit w-fit rounded-full px-2 py-1 text-[10px] font-black ${issue.severity === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'}`}>
                                    {issue.severity}
                                  </span>
                                  <div className="min-w-0">
                                    <Link
                                      to={issue.invoiceType === 'CLIENT' ? `/admin/billing/client-invoices/${issue.invoiceId}` : `/admin/billing/interpreter-invoices/${issue.invoiceId}`}
                                      state={{ returnTo: '/admin/administration/migration', returnLabel: 'Reconciliation' }}
                                      className="block truncate font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
                                    >
                                      {issue.reference}
                                    </Link>
                                    <p className="truncate text-xs text-slate-500">{issue.invoiceType} / {issue.sourceTable || 'Platform'}</p>
                                  </div>
                                  <p className="truncate font-semibold text-slate-700 dark:text-slate-200">{issue.partyName}</p>
                                  <div className="min-w-0">
                                    <p className="truncate font-black text-slate-800 dark:text-slate-100">{issue.reason.replace(/_/g, ' ')}</p>
                                    {issue.expectedStatus && issue.expectedStatus !== issue.platformStatus && (
                                      <p className="truncate text-xs text-slate-500">{issue.platformStatus}{' -> '}{issue.expectedStatus}</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-900 dark:text-white">GBP {Number(issue.totalAmount || 0).toFixed(2)}</p>
                                    <p className="text-xs text-slate-500">Lines GBP {Number(issue.lineTotal || 0).toFixed(2)}</p>
                                  </div>
                                  <p className="font-semibold leading-5 text-slate-600 dark:text-slate-300">{issue.recommendedAction}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                          All invoice documents passed the current financial integrity checks.
                        </div>
                      )}

                      {(financialAudit.issues.length > 25 || financialAudit.issuesTruncated) && (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Showing the first 25 issues. Export CSV contains every issue returned by the audit.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid gap-3 lg:grid-cols-[220px_260px_minmax(0,1fr)]">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Severity</span>
                      <select
                        value={conflictSeverityFilter}
                        onChange={event => setConflictSeverityFilter(event.target.value as AirtableConflictSeverity)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as AirtableConflictSeverity[]).map(value => (
                          <option key={value} value={value}>{value === 'ALL' ? 'All severities' : value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Module</span>
                      <select
                        value={conflictModuleFilter}
                        onChange={event => setConflictModuleFilter(event.target.value as 'ALL' | AirtableSyncModule)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="ALL">All modules</option>
                        {AIRTABLE_SYNC_MODULES.map(module => (
                          <option key={module.id} value={module.id}>{module.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top reasons</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(conflictSummary.byReason).slice(0, 6).map(([reason, count]) => (
                          <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                            {reason}: {count}
                          </span>
                        ))}
                        {!openConflicts.length && <span className="text-sm font-semibold text-slate-500">No open issues.</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid grid-cols-[140px_160px_minmax(190px,1fr)_minmax(220px,1.4fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                    <span>Severity</span>
                    <span>Source</span>
                    <span>Issue</span>
                    <span>Next action</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredConflicts.length ? filteredConflicts.map(conflict => (
                      <div key={conflict.id} className="grid grid-cols-[140px_160px_minmax(190px,1fr)_minmax(220px,1.4fr)] gap-3 px-4 py-3 text-sm">
                        <div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                            conflict.severity === 'HIGH'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200'
                              : conflict.severity === 'LOW'
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
                          }`}>
                            {conflict.severity || 'MEDIUM'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950 dark:text-white">{safeInlineText(conflict.legacyRef || conflict.sourceRecordId)}</p>
                          <p className="truncate text-xs text-slate-500">{safeInlineText(conflict.sourceTable || conflict.entityType, 'Unknown source')}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-800 dark:text-slate-100">{safeInlineText(conflict.reason, 'UNCLASSIFIED')}</p>
                          <p className="truncate text-xs text-slate-500">{safeInlineText(conflict.entityType, 'entity')} · {conflict.lastSeenAt ? formatDateTime(conflict.lastSeenAt) : 'No timestamp'}</p>
                        </div>
                        <p className="text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">{safeInlineText(conflict.recommendedAction, 'Review source record and rerun sync.')}</p>
                      </div>
                    )) : (
                      <div className="p-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        No reconciliation issues match the current filters.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeModule && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg border p-2 ${moduleTone[activeModule.id]}`}>
                        {React.createElement(moduleIcons[activeModule.id], { size: 20 })}
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">{activeModule.label}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{activeModule.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeModule.tables.map(table => (
                        <span key={table} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {table}
                        </span>
                      ))}
                      {activeDependency && (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          dependencyWritten
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}>
                          {dependencyWritten ? 'ready after' : 'requires'} {activeDependency.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {syncNowBlockedByDependency && activeDependency && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    Sync Now is locked until {activeDependency.label} has been written at least once. Use Dry Run here, or run Sync Now on {activeDependency.label} first.
                  </div>
                )}

                {renderStats(activeResult)}
                {activeModule.id === 'clients' && renderClientCrmStaging(activeResult)}
                {activeResult?.financeStats && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Included finance sync</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {(['clientInvoices', 'interpreterInvoices'] as const).map(key => (
                        <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-black text-slate-950 dark:text-white">
                              {key === 'clientInvoices' ? 'Client invoices' : 'Interpreter invoices'}
                            </p>
                            <span className="text-xs font-black text-slate-500">{activeResult.financeRecords?.[key] || 0} read</span>
                          </div>
                          <div className="mt-2 grid grid-cols-5 gap-2 text-center text-xs font-black">
                            <span className="rounded bg-emerald-100 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{activeResult.financeStats?.[key].created}</span>
                            <span className="rounded bg-blue-100 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{activeResult.financeStats?.[key].updated}</span>
                            <span className="rounded bg-slate-200 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{activeResult.financeStats?.[key].skipped}</span>
                            <span className="rounded bg-amber-100 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{activeResult.financeStats?.[key].conflict}</span>
                            <span className="rounded bg-red-100 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-300">{activeResult.financeStats?.[key].error}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {renderDetails(activeResult)}
              </div>
            )}
          </main>
        </div>
      </div>

      {crmMappingLedgerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget
              && !crmMappingLedgerLoading
              && !crmRevokingMappingId
            ) {
              setCrmMappingLedgerOpen(false);
            }
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-mapping-ledger-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-300">
                  Client CRM controls
                </p>
                <h2 id="crm-mapping-ledger-title" className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                  Active identity mappings
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Review the rules reused by Airtable mirror cycles. Revocation returns the source identity to the audit queue.
                </p>
              </div>
              <button
                onClick={() => setCrmMappingLedgerOpen(false)}
                disabled={crmMappingLedgerLoading || Boolean(crmRevokingMappingId)}
                aria-label="Close mapping ledger"
                title="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <X size={17} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <label className="block">
                <span className="sr-only">Find an active mapping</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    autoFocus
                    value={crmMappingLedgerSearch}
                    onChange={event => setCrmMappingLedgerSearch(event.target.value)}
                    placeholder="Find source identity, destination, Sage reference or client ID"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </label>
            </div>

            <div className="min-h-64 flex-1 overflow-y-auto">
              {crmMappingLedgerLoading ? (
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
                  <Loader2 className="animate-spin" size={18} /> Loading active mappings...
                </div>
              ) : visibleCrmMappingLedger.length > 0 ? (
                visibleCrmMappingLedger.map(mapping => (
                  <div
                    key={mapping.mappingId}
                    className="grid gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] md:items-center sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-black text-slate-950 dark:text-white">
                          {mapping.sourceNames[0] || mapping.groupKey}
                        </p>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {mapping.sourceTable}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500" title={mapping.groupKey}>
                        {mapping.groupKey}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-black ${mapping.action === 'DEFER_SOURCE' ? 'text-amber-800 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'}`}>
                        {mapping.action === 'DEFER_SOURCE'
                          ? 'Deferred from client write'
                          : mapping.canonicalCompanyName || mapping.canonicalClientId}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500" title={mapping.action === 'DEFER_SOURCE' ? mapping.reason : mapping.canonicalClientId}>
                        {mapping.action === 'DEFER_SOURCE'
                          ? mapping.deferralCategory?.replaceAll('_', ' ') || 'MANUAL DEFERRAL'
                          : mapping.canonicalClientId}
                        {mapping.reviewMethod ? ` · ${mapping.reviewMethod.replaceAll('_', ' ')}` : ''}
                        {mapping.approvedAt ? ` · ${formatDateTime(mapping.approvedAt)}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeClientIdentityMapping(mapping)}
                      disabled={Boolean(crmRevokingMappingId)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-amber-200 px-3 text-xs font-black text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"
                    >
                      {crmRevokingMappingId === mapping.mappingId
                        ? <Loader2 className="animate-spin" size={14} />
                        : <Undo2 size={14} />}
                      Revoke
                    </button>
                  </div>
                ))
              ) : (
                <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm font-semibold text-slate-500">
                  No active mapping matches this search.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>{visibleCrmMappingLedger.length} shown · {crmMappingLedgerTotal} active rules</span>
              <span>Revoked rules remain in the audit log.</span>
            </div>
          </div>
        </div>
      )}

      {activeCrmMappingTargets.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !crmMappingLoading) {
              setCrmMappingTarget(null);
              setCrmManualBatchTargets([]);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-300">
                  {isManualCrmMappingBatch ? 'Manual batch mapping' : 'Canonical client mapping'}
                </p>
                <h2 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
                  {isManualCrmMappingBatch
                    ? `Map ${activeCrmMappingTargets.length} selected identities`
                    : activeCrmMappingTargets[0]?.displayName}
                </h2>
                {isManualCrmMappingBatch ? (
                  <p
                    className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400"
                    title={activeCrmMappingTargets.map(target => target.displayName).join(', ')}
                  >
                    {activeCrmMappingTargets.slice(0, 3).map(target => target.displayName).join(', ')}
                    {activeCrmMappingTargets.length > 3 ? ` +${activeCrmMappingTargets.length - 3} more` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {activeCrmMappingTargets[0]?.sourceTable} · {activeCrmMappingTargets[0]?.groupKey}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setCrmMappingTarget(null);
                  setCrmManualBatchTargets([]);
                }}
                disabled={crmMappingLoading}
                aria-label="Close"
                title="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <X size={17} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Find canonical client</span>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    autoFocus
                    value={crmClientSearch}
                    onChange={event => setCrmClientSearch(event.target.value)}
                    placeholder="Search organisation, Sage reference or client ID"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </label>
            </div>

            <div className="min-h-48 flex-1 overflow-y-auto">
              {crmMappingLoading && crmCanonicalTargets.length === 0 ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
                  <Loader2 className="animate-spin" size={18} /> Loading Client CRM...
                </div>
              ) : visibleCrmClients.length > 0 ? visibleCrmClients.map(client => (
                <button
                  key={client.id}
                  onClick={() => setCrmSelectedClientId(client.id)}
                  className={`flex w-full items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 text-left dark:border-slate-800 ${crmSelectedClientId === client.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'}`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-black text-slate-950 dark:text-white">{client.companyName}</p>
                      {client.targetState === 'PENDING_APPROVED' && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                          Pending approved
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">{client.sageAccountRef || 'No Sage ref'} · {client.id}</p>
                  </div>
                  <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${crmSelectedClientId === client.id ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-slate-300 dark:border-slate-600'}`} />
                </button>
              )) : (
                <div className="p-8 text-center text-sm font-semibold text-slate-500">No canonical client matches this search.</div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isManualCrmMappingBatch
                  ? selectedCrmCanonicalTarget?.targetState === 'PENDING_APPROVED'
                    ? 'All selected identities will map to this approved official account. The account is created during the same Write Sync.'
                    : 'All selected identities will map to this client. The batch is audited against the current Dry Run.'
                  : selectedCrmCanonicalTarget?.targetState === 'PENDING_APPROVED'
                    ? 'This official Airtable account is approved and will be created during Write Sync.'
                    : 'This rule is audited and reused by future mirror cycles.'}
              </p>
              <button
                onClick={isManualCrmMappingBatch ? saveManualClientIdentityMappings : saveClientIdentityMapping}
                disabled={!crmSelectedClientId || crmMappingLoading}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {crmMappingLoading && <Loader2 className="animate-spin" size={16} />}
                {isManualCrmMappingBatch ? `Save ${activeCrmMappingTargets.length} mappings` : 'Save mapping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {crmDeferralTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !crmDeferralLoading) {
              setCrmDeferralTarget(null);
              setCrmDeferralReason('');
            }
          }}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-deferral-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Audited source deferral
                </p>
                <h2 id="crm-deferral-title" className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
                  {crmDeferralTarget.displayName}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {crmDeferralTarget.sourceTable} / {crmDeferralTarget.groupKey}
                </p>
              </div>
              <button
                onClick={() => {
                  setCrmDeferralTarget(null);
                  setCrmDeferralReason('');
                }}
                disabled={crmDeferralLoading}
                aria-label="Close source deferral"
                title="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                This does not delete or alter Airtable data. The source is excluded from Client CRM writes until this audited decision is revoked.
              </div>

              <label htmlFor="crm-deferral-category" className="block">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Deferral category</span>
                <select
                  id="crm-deferral-category"
                  value={crmDeferralCategory}
                  onChange={event => setCrmDeferralCategory(event.target.value as AirtableClientIdentityDeferralCategory)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="NOT_AN_ORGANISATION">Not an organisation</option>
                  <option value="INSUFFICIENT_SOURCE_EVIDENCE">Insufficient source evidence</option>
                  <option value="SOURCE_DATA_REPAIR_REQUIRED">Source data repair required</option>
                  <option value="OUT_OF_SCOPE_LEGACY_RECORD">Out-of-scope legacy record</option>
                </select>
              </label>

              <div>
                <label htmlFor="crm-deferral-reason" className="block text-xs font-black uppercase tracking-wider text-slate-500">
                  Reviewed evidence and reason
                </label>
                <textarea
                  id="crm-deferral-reason"
                  value={crmDeferralReason}
                  onChange={event => setCrmDeferralReason(event.target.value)}
                  placeholder="State what was checked and why mapping or creating an organisation would be unsafe."
                  className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {crmDeferralReason.trim().length}/20 minimum characters
                </span>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setCrmDeferralTarget(null);
                  setCrmDeferralReason('');
                }}
                disabled={crmDeferralLoading}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={saveClientIdentityDeferral}
                disabled={crmDeferralLoading || crmDeferralReason.trim().length < 20}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-black text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {crmDeferralLoading && <Loader2 className="animate-spin" size={16} />}
                Defer source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
