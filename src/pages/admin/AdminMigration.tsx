import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Languages,
  Loader2,
  Mail,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users,
  Wallet
} from 'lucide-react';
import { AirtableService } from '../../services/airtableService';
import { MigrationService } from '../../services/migrationService';
import {
  AIRTABLE_SYNC_MODULES,
  AirtableModuleResult,
  AirtableSyncModule,
  AirtableSyncResult,
  AirtableSyncService
} from '../../services/airtableSyncService';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';

type WorkspaceTab = 'overview' | 'interpreters' | AirtableSyncModule;

const moduleIcons: Record<AirtableSyncModule | 'overview' | 'interpreters', React.ElementType> = {
  overview: Database,
  interpreters: Users,
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

const formatDateTime = (value?: string) => {
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const StatPill = ({ label, value, className = '' }: { label: string; value: number; className?: string }) => (
  <div className={`rounded-lg border px-3 py-2 ${className || 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'}`}>
    <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
    <p className="mt-0.5 text-xl font-black">{value}</p>
  </div>
);

export const AdminMigration = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [loading, setLoading] = useState(false);
  const [interpreterLoading, setInterpreterLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; deduplicated: number } | null>(null);
  const [recordLimit, setRecordLimit] = useState(500);
  const [syncResult, setSyncResult] = useState<AirtableSyncResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | undefined>();
  const [migrationResult, setMigrationResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [inviteResult, setInviteResult] = useState<{ sent: number; suppressed?: number; errors: number } | null>(null);
  const { showToast } = useToast();
  const { settings } = useSettings();
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

  const loadInterpreterStats = async () => {
    setInterpreterLoading(true);
    try {
      const data = await AirtableService.fetchActiveInterpreters();
      setStats({
        total: data.length,
        deduplicated: data.filter(d => d.languages && d.languages.length > 1).length
      });
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
    } catch (err) {
      console.warn('Failed to load Airtable Sync Center checkpoint', err);
    }
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

    const moduleLabel = modules === 'full'
      ? 'Full Sync'
      : modules.map(module => AIRTABLE_SYNC_MODULES.find(item => item.id === module)?.label || module).join(', ');
    if (!dryRun && !window.confirm(`Run ${moduleLabel} now? This writes Airtable data into Firestore.`)) return;

    setLoading(true);
    setSyncResult(null);
    try {
      const result = await AirtableSyncService.run(dryRun, modules, recordLimit);
      setSyncResult(result);
      await loadCheckpoint();
      showToast(
        dryRun
          ? `Dry Run complete: ${result.moduleResults.length} module(s) inspected.`
          : `Sync complete: ${result.stats.created} created, ${result.stats.updated} updated.`,
        result.success ? 'success' : 'error'
      );
    } catch (err: any) {
      showToast(err?.message || 'Airtable sync failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterpreterStats();
    loadCheckpoint();
  }, []);

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

  const renderDetails = (result?: AirtableModuleResult | null) => {
    if (!result?.details?.length) return null;

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Action</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Client</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Person</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.details.map((detail: any, index) => (
              <tr key={`${detail.sourceRecordId}-${index}`} className="align-top dark:text-slate-200">
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-200">
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
                  {detail.clientAction && <p className="text-xs font-bold text-amber-600 dark:text-amber-300">Client {detail.clientAction}</p>}
                  {detail.email && <p className="text-xs text-slate-500">{detail.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{detail.interpreterName || '-'}</p>
                  {detail.interpreterName && (
                    <p className={`text-xs font-bold ${detail.interpreterResolved ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                      {detail.interpreterResolved ? 'Matched profile' : 'Name only'}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{detail.status || '-'}</p>
                  {detail.message && <p className="text-xs text-red-600 dark:text-red-300">{detail.message}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{operatingMode}</span>
          <span className={`rounded-full px-3 py-1 ${importMode === 'ON' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
            Import {importMode}
          </span>
          <span className={`rounded-full px-3 py-1 ${communicationMode === 'LIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            Email {communicationMode}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950 dark:text-white">Transition guard</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last full write sync: {formatDateTime(lastRunAt)}. Dry Run is always safe; Sync Now respects Platform Mode.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={() => runSync(true, 'full')}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Full Dry Run
            </button>
            <button
              onClick={() => runSync(false, 'full')}
              disabled={loading || importLocked}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              Full Sync
            </button>
          </div>
        </div>

        {importLocked && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Import write actions are locked because Airtable Import Mode is {importMode}. Use Dry Run or change Platform Mode when ready.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 dark:border-slate-800 xl:border-b-0 xl:border-r">
            <div className="space-y-1">
              {([
                { id: 'overview' as WorkspaceTab, label: 'Overview', description: 'Full workflow and dependency order' },
                { id: 'interpreters' as WorkspaceTab, label: 'Interpreters', description: 'Active team import and activation' }
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
                  </div>
                )}

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
                      {activeModule.dependency && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          depends on {AIRTABLE_SYNC_MODULES.find(item => item.id === activeModule.dependency)?.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => runSync(true, [activeModule.id])}
                      disabled={loading}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                      Dry Run
                    </button>
                    <button
                      onClick={() => runSync(false, [activeModule.id])}
                      disabled={loading || importLocked}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                      Sync Now
                    </button>
                  </div>
                </div>

                {renderStats(activeResult)}
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
    </div>
  );
};
