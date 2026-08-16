import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck2,
  Loader2,
  Play,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useConfirm } from '../../../context/ConfirmContext';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import {
  SageImportManifest,
  SageImportModule,
  SageImportPreview,
  SageMigrationService,
  SagePlatformImportPackage,
} from '../../../services/sageMigrationService';
import { XeroReconciliationPanel } from './XeroReconciliationPanel';

const MODULES: Array<{ id: SageImportModule; label: string; description: string; phase: 'MASTER' | 'FINANCE' }> = [
  { id: 'contacts', label: 'Customers & suppliers', description: 'Canonical contacts; customers link to Client CRM and suppliers to professionals.', phase: 'MASTER' },
  { id: 'accounts', label: 'Nominal accounts', description: 'Sage nominal codes preserved for future Xero account mapping.', phase: 'MASTER' },
  { id: 'bankAccounts', label: 'Bank references', description: 'Masked bank references only; no full bank credentials enter this import.', phase: 'MASTER' },
  { id: 'salesDocuments', label: 'Sales documents', description: 'Receivables archive with settlement and Xero migration states kept separate.', phase: 'FINANCE' },
  { id: 'purchaseDocuments', label: 'Purchase documents', description: 'Payables archive for interpreters, translators and suppliers.', phase: 'FINANCE' },
  { id: 'customerPayments', label: 'Customer receipts', description: 'Inbound settlement history; never inferred as a job status.', phase: 'FINANCE' },
  { id: 'supplierPayments', label: 'Supplier payments', description: 'Outbound settlement history for payables.', phase: 'FINANCE' },
  { id: 'bankJournalEntries', label: 'Bank & journals', description: 'Historical bank and journal movements for reconciliation.', phase: 'FINANCE' },
  { id: 'sourceArtifacts', label: 'Source manifest', description: 'Checksums and row counts for the complete Sage extraction archive.', phase: 'FINANCE' },
];

const MASTER_MODULES = new Set<SageImportModule>(MODULES.filter(module => module.phase === 'MASTER').map(module => module.id));
const MAX_RECORDS_PER_BATCH = 60;
const MAX_BYTES_PER_BATCH = 650_000;
const encoder = new TextEncoder();

type ProgressState = {
  label: string;
  completed: number;
  total: number;
};

type PreparedBatch = {
  module: SageImportModule;
  batchIndex: number;
  batchCount: number;
  records: Array<Record<string, unknown>>;
};

const hashText = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const buildBatches = (
  selectedModules: SageImportModule[],
  data: SagePlatformImportPackage,
): PreparedBatch[] => selectedModules.flatMap(module => {
  const source = data.modules[module] || [];
  const chunks: Array<Array<Record<string, unknown>>> = [];
  let current: Array<Record<string, unknown>> = [];
  let currentBytes = 2;
  source.forEach(record => {
    const recordBytes = encoder.encode(JSON.stringify(record)).byteLength + 1;
    if (current.length && (current.length >= MAX_RECORDS_PER_BATCH || currentBytes + recordBytes > MAX_BYTES_PER_BATCH)) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(record);
    currentBytes += recordBytes;
  });
  if (current.length) chunks.push(current);
  return chunks.map((records, batchIndex) => ({
    module,
    batchIndex,
    batchCount: chunks.length,
    records,
  }));
});

const runPool = async <T,>(items: T[], worker: (item: T) => Promise<void>, concurrency = 3) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  }));
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-GB').format(value || 0);
const formatCurrency = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);

const validatePackage = (parsed: SagePlatformImportPackage) => {
  if (parsed.schemaVersion !== 'lingland.sage-xero.v1' || !parsed.manifestHash || !parsed.modules) {
    throw new Error('This is not a supported Lingland Sage/Xero canonical package.');
  }
  if (!parsed.validationSummary?.passed || parsed.validationSummary.failedCheckCount !== 0) {
    throw new Error('The package has failed extraction validations and cannot be loaded.');
  }
  for (const module of MODULES) {
    if (!Array.isArray(parsed.modules[module.id])) throw new Error(`Package module ${module.id} is missing.`);
    if (parsed.modules[module.id].length !== parsed.expectedModuleCounts[module.id]) {
      throw new Error(`Package module ${module.id} does not match its manifest count.`);
    }
  }
  return parsed;
};

export const SageAccountingMigration = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importPackage, setImportPackage] = useState<SagePlatformImportPackage | null>(null);
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState<Set<SageImportModule>>(() => new Set(MASTER_MODULES));
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [runId, setRunId] = useState('');
  const [preview, setPreview] = useState<SageImportPreview | null>(null);
  const [committed, setCommitted] = useState(false);
  const [linkSummary, setLinkSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const communicationMode = settings.platformMode?.communicationMode || 'SUPPRESSED';
  const isBusy = Boolean(progress);

  const selectedModules = useMemo(() => MODULES.map(module => module.id).filter(module => selected.has(module)), [selected]);
  const selectedRecordCount = useMemo(() => selectedModules.reduce(
    (sum, module) => sum + (importPackage?.modules[module]?.length || 0),
    0,
  ), [importPackage, selectedModules]);

  const setPreset = (preset: 'MASTER' | 'FINANCE' | 'ALL') => {
    if (isBusy) return;
    setSelected(new Set(MODULES.filter(module => preset === 'ALL' || module.phase === preset).map(module => module.id)));
    setRunId('');
    setPreview(null);
    setCommitted(false);
    setLinkSummary({});
  };

  const acceptPackage = (parsed: SagePlatformImportPackage, sourceName: string) => {
    setImportPackage(validatePackage(parsed));
    setFileName(sourceName);
    showToast('Validated Sage/Xero package loaded. No data has been written.', 'success');
  };

  const loadPackage = async (file: File) => {
    setError('');
    setRunId('');
    setPreview(null);
    setCommitted(false);
    setLinkSummary({});
    try {
      const parsed = JSON.parse(await file.text()) as SagePlatformImportPackage;
      acceptPackage(parsed, file.name);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not read the Sage import package.';
      setError(message);
      setImportPackage(null);
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const query = window.location.hash.split('?')[1] || '';
    const packageUrl = new URLSearchParams(query).get('packageUrl');
    if (!packageUrl) return undefined;
    let active = true;
    setError('');
    void fetch(packageUrl)
      .then(response => {
        if (!response.ok) throw new Error(`Local package could not be loaded (${response.status}).`);
        return response.json() as Promise<SagePlatformImportPackage>;
      })
      .then(parsed => {
        if (active) acceptPackage(parsed, packageUrl.split('/').pop() || 'Local Sage package');
      })
      .catch(caught => {
        if (!active) return;
        setImportPackage(null);
        setError(caught instanceof Error ? caught.message : 'Could not load the local Sage package.');
      });
    return () => { active = false; };
  }, []);

  const buildSelectedManifest = async (): Promise<SageImportManifest> => {
    if (!importPackage) throw new Error('Load a Sage package first.');
    const phaseKey = selectedModules.slice().sort().join(',');
    return {
      ...importPackage.manifest,
      datasetId: importPackage.datasetId,
      manifestHash: await hashText(`${importPackage.manifestHash}|${phaseKey}`),
      expectedModuleCounts: Object.fromEntries(selectedModules.map(module => [module, importPackage.modules[module].length])),
    };
  };

  const runPreview = async () => {
    if (!importPackage || !selectedModules.length || isBusy) return;
    setError('');
    setCommitted(false);
    try {
      const manifest = await buildSelectedManifest();
      const batches = buildBatches(selectedModules, importPackage);
      const created = await SageMigrationService.createRun(manifest);
      setRunId(created.runId);
      if (created.status === 'COMMITTED') {
        setPreview(created.preview || null);
        setCommitted(true);
        showToast('This exact Sage phase was already committed. The import is idempotent.', 'success');
        return;
      }
      if (created.status === 'PREVIEW_READY' || created.status === 'COMMITTING') {
        setPreview(created.preview || null);
        showToast('Existing approved preview resumed.', 'success');
        return;
      }
      let completed = 0;
      setProgress({ label: 'Staging validated batches', completed, total: batches.length });
      await runPool(batches, async batch => {
        await SageMigrationService.stageBatch({ runId: created.runId, ...batch });
        completed += 1;
        setProgress({ label: 'Staging validated batches', completed, total: batches.length });
      });
      setProgress({ label: 'Verifying package totals and identifiers', completed: batches.length, total: batches.length });
      const finalized = await SageMigrationService.finalizePreview(created.runId);
      setPreview(finalized.preview || null);
      showToast('Sage preview approved. Live collections are still unchanged.', 'success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Sage preview failed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setProgress(null);
    }
  };

  const commitImport = async () => {
    if (!importPackage || !runId || !preview?.ready || isBusy) return;
    const confirmed = await confirm({
      title: 'Commit Sage accounting phase',
      message: `Write ${formatNumber(preview.recordCount)} validated records to the canonical accounting layer? Communications remain suppressed and existing operational invoices are not overwritten.`,
      confirmLabel: 'Commit import',
      variant: 'warning',
    });
    if (!confirmed) return;
    setError('');
    try {
      const batches = buildBatches(selectedModules, importPackage);
      let completed = 0;
      const combinedLinks: Record<string, number> = {};
      setProgress({ label: 'Writing canonical accounting records', completed, total: batches.length });
      await runPool(batches, async batch => {
        const result = await SageMigrationService.commitBatch({
          runId,
          module: batch.module,
          batchIndex: batch.batchIndex,
        });
        Object.entries(result.linkSummary || {}).forEach(([key, count]) => {
          combinedLinks[key] = (combinedLinks[key] || 0) + count;
        });
        completed += 1;
        setProgress({ label: 'Writing canonical accounting records', completed, total: batches.length });
      }, selected.has('contacts') ? 1 : 3);
      await SageMigrationService.finalizeCommit(runId);
      setLinkSummary(combinedLinks);
      setCommitted(true);
      showToast('Sage accounting phase committed and reconciled.', 'success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Sage commit failed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
              <Database size={16} /> Accounting migration
            </div>
            <h1 className="mt-2 text-2xl font-black">Sage to Lingland / Xero</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Import validated Sage history into a canonical accounting layer designed for Xero. Client receivables, supplier payables and settlement records remain distinct from job workflow.
            </p>
          </div>
          <div className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black ${communicationMode === 'SUPPRESSED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'}`}>
            <ShieldCheck size={16} /> Email {communicationMode}
          </div>
        </header>

        {communicationMode !== 'SUPPRESSED' && (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle size={18} className="shrink-0" /> Set Communication Mode to SUPPRESSED before staging or committing Sage data.
          </div>
        )}

        <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-black">1. Validated source package</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Loading performs local schema, count and validation checks. It does not write data.</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Sage canonical package"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void loadPackage(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={17} /> Select package
            </button>
          </div>
          {importPackage ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">File</p><p className="mt-1 truncate font-bold" title={fileName}>{fileName}</p></div>
              <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Source as of</p><p className="mt-1 font-bold">{importPackage.sourceAsOf}</p></div>
              <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Validation</p><p className="mt-1 inline-flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} /> {importPackage.validationSummary?.checkCount || 0} checks passed</p></div>
              <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Sales archive</p><p className="mt-1 font-bold">{formatCurrency(importPackage.sourceTotals?.salesGross || 0)}</p></div>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Select the generated Lingland Sage/Xero canonical JSON package.</div>
          )}
        </section>

        <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-black">2. Import scope</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Run master data first, then refresh Airtable Clients before importing the finance archive.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['MASTER', 'FINANCE', 'ALL'] as const).map(preset => (
                <button key={preset} type="button" onClick={() => setPreset(preset)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  {preset === 'MASTER' ? 'Master data' : preset === 'FINANCE' ? 'Finance archive' : 'All modules'}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MODULES.map(module => (
              <label key={module.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={selected.has(module.id)}
                  disabled={isBusy || Boolean(runId)}
                  onChange={() => setSelected(current => {
                    const next = new Set(current);
                    if (next.has(module.id)) next.delete(module.id); else next.add(module.id);
                    return next;
                  })}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-bold">{module.label}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{formatNumber(importPackage?.modules[module.id]?.length || 0)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{module.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-black">3. Preview, then commit</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {formatNumber(selectedRecordCount)} selected records. Preview stages validated batches; Commit writes stable IDs and can be safely resumed.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={!importPackage || !selectedModules.length || isBusy || communicationMode !== 'SUPPRESSED' || Boolean(preview)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
              >
                <FileCheck2 size={17} /> Preview import
              </button>
              <button
                type="button"
                onClick={() => void commitImport()}
                disabled={!preview?.ready || isBusy || communicationMode !== 'SUPPRESSED' || committed}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={17} /> Commit import
              </button>
            </div>
          </div>

          {progress && (
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-4 text-sm font-bold"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {progress.label}</span><span>{progress.completed} / {progress.total}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} /></div>
            </div>
          )}

          {preview?.ready && (
            <div className={`mt-4 flex flex-col gap-2 border-l-4 p-4 ${committed ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100'}`}>
              <p className="font-black">{committed ? 'Import committed' : 'Preview approved'}</p>
              <p className="text-sm">{formatNumber(preview.recordCount)} records across {preview.batchCount} controlled batches. Run {runId}.</p>
              {Object.keys(linkSummary).length > 0 && <p className="text-sm">Client/professional links: {Object.entries(linkSummary).map(([key, count]) => `${key} ${count}`).join(' / ')}</p>}
            </div>
          )}

          {error && <div className="mt-4 flex gap-2 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle size={17} className="shrink-0" /> {error}</div>}
        </section>

        <XeroReconciliationPanel />
      </div>
    </div>
  );
};
