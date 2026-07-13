import React, { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { db } from '../../../services/firebaseConfig';
import {
  AirtableDependencyCounts,
  AirtableMirrorAudit,
  AirtableSyncConflict,
  AirtableSyncRunSummary,
  AirtableSyncService,
  FinancialReconciliationAudit,
} from '../../../services/airtableSyncService';
import { GoLiveChecklist, GoLiveService } from '../../../services/goLiveService';
import { useSettings } from '../../../context/SettingsContext';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table } from '../../../components/ui/Table';
import { DEFAULT_SYSTEM_SETTINGS } from '../../../services/systemService';
import { evaluateGoLiveReadiness, isAutomatedReadinessClear, ReadinessGate } from '../../../utils/goLiveReadiness';

const CHECKLIST_ITEMS = [
  { id: 'operations_rehearsal', label: 'Operations rehearsal completed', detail: 'Staff completed intake, assignment, response, delivery and timesheet in the platform.' },
  { id: 'finance_signoff', label: 'Finance reconciliation signed off', detail: 'Client invoices, professional payables and settlements were reviewed.' },
  { id: 'interpreter_pilot', label: 'Interpreter pilot signed off', detail: 'An active interpreter validated offers, jobs, timesheets, messages and history.' },
  { id: 'client_pilot', label: 'Client pilot signed off', detail: 'A client validated booking intake, status visibility and invoice history.' },
  { id: 'intake_switch', label: 'New intake links scheduled', detail: 'Website, internal bookmarks and client instructions point to Lingland forms.' },
  { id: 'rollback_owner', label: 'Rollback owner assigned', detail: 'A named duty role can restore safe mirror mode immediately.' },
];

const gateVariant = (status: ReadinessGate['status']) => {
  if (status === 'PASS') return 'success';
  if (status === 'BLOCKED') return 'danger';
  return 'warning';
};

export const GoLiveControl = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, refreshSettings } = useSettings();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [mirrorAudit, setMirrorAudit] = useState<AirtableMirrorAudit | null>(null);
  const [financialAudit, setFinancialAudit] = useState<FinancialReconciliationAudit | null>(null);
  const [conflicts, setConflicts] = useState<AirtableSyncConflict[]>([]);
  const [recentRuns, setRecentRuns] = useState<AirtableSyncRunSummary[]>([]);
  const [dependencyCounts, setDependencyCounts] = useState<AirtableDependencyCounts>({});
  const [auditEventCount, setAuditEventCount] = useState(0);
  const [checklist, setChecklist] = useState<GoLiveChecklist>({});
  const [lastAudit, setLastAudit] = useState<Record<string, any> | null>(null);

  const actorId = String((user as any)?.id || (user as any)?.uid || 'UNKNOWN');
  const platformMode = settings.platformMode || DEFAULT_SYSTEM_SETTINGS.platformMode!;

  const loadControl = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
        AirtableSyncService.getAuditTrail(10, 250),
        AirtableSyncService.getDependencyCounts(),
        getCountFromServer(collection(db, 'auditEvents')),
        GoLiveService.get(),
    ]);
    const [trailResult, countResult, auditResult, controlResult] = results;
    if (trailResult.status === 'fulfilled') {
      setConflicts(trailResult.value.conflicts);
      setRecentRuns(trailResult.value.runs);
    }
    if (countResult.status === 'fulfilled') setDependencyCounts(countResult.value);
    if (auditResult.status === 'fulfilled') setAuditEventCount(auditResult.value.data().count);
    if (controlResult.status === 'fulfilled') {
      setChecklist(controlResult.value.checklist || {});
      setLastAudit(controlResult.value.lastReadinessAudit || null);
    }
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.warn('Some go-live controls could not be loaded', failures);
      showToast(`${failures.length} readiness source(s) could not be loaded`, 'info');
    }
    setLoading(false);
  };

  useEffect(() => { void loadControl(); }, []);

  const gates = useMemo(() => evaluateGoLiveReadiness({
    platformMode,
    mirrorAudit,
    financialAudit,
    conflicts,
    recentRuns,
    auditEventCount,
  }), [auditEventCount, conflicts, financialAudit, mirrorAudit, platformMode, recentRuns]);

  const automatedReady = isAutomatedReadinessClear(gates);
  const manualReady = CHECKLIST_ITEMS.every(item => checklist[item.id]);
  const ready = automatedReady && manualReady;

  const runFinalAudit = async () => {
    setRunningAudit(true);
    try {
      const [mirror, finance, trail, auditCount] = await Promise.all([
        AirtableSyncService.getMirrorAudit(5000, 'FULL_AUDIT'),
        AirtableSyncService.getFinancialReconciliationAudit(),
        AirtableSyncService.getAuditTrail(10, 250),
        getCountFromServer(collection(db, 'auditEvents')),
      ]);
      setMirrorAudit(mirror);
      setFinancialAudit(finance);
      setConflicts(trail.conflicts);
      setRecentRuns(trail.runs);
      setAuditEventCount(auditCount.data().count);
      const summary = {
        generatedAt: new Date().toISOString(),
        generatedBy: actorId,
        mirror: {
          matchedRecords: mirror.matchedRecords,
          missingInPlatformCount: mirror.missingInPlatformCount,
          platformOnlyCount: mirror.platformOnlyCount,
          statusDivergenceCount: mirror.statusDivergenceCount,
        },
        finance: {
          healthyInvoices: finance.healthyInvoices,
          affectedInvoices: finance.affectedInvoices,
          issueCount: finance.issueCount,
        },
        openConflicts: trail.conflicts.length,
        auditEventCount: auditCount.data().count,
      };
      await GoLiveService.save({ lastReadinessAudit: summary, updatedAt: summary.generatedAt, updatedBy: actorId });
      setLastAudit(summary);
      showToast('Final readiness audit completed', mirror.missingInPlatformCount || finance.affectedInvoices ? 'info' : 'success');
    } catch (error) {
      console.error('Final readiness audit failed', error);
      showToast('Final readiness audit failed', 'error');
    } finally {
      setRunningAudit(false);
    }
  };

  const toggleChecklist = async (id: string) => {
    const next = { ...checklist, [id]: !checklist[id] };
    setChecklist(next);
    try {
      await GoLiveService.save({ checklist: next, updatedAt: new Date().toISOString(), updatedBy: actorId });
    } catch (error) {
      setChecklist(checklist);
      showToast('Could not save checklist state', 'error');
    }
  };

  const enterSafeMirror = async () => {
    const accepted = await confirm({
      title: 'Enter safe mirror mode',
      message: 'This atomically suppresses external communication, restores Airtable as source of truth and enables imports. No commercial records are deleted.',
      confirmLabel: 'Enter safe mirror',
      variant: 'danger',
    });
    if (!accepted) return;
    setRollingBack(true);
    try {
      const rollbackAt = new Date().toISOString();
      await updateSettings({
        platformMode: {
          ...platformMode,
          operatingMode: 'AIRTABLE_MIRROR',
          communicationMode: 'SUPPRESSED',
          sourceOfTruth: 'AIRTABLE',
          airtableImportMode: 'ON',
          hybridOperationsEnabled: true,
        },
      });
      await GoLiveService.save({ lastRollbackAt: rollbackAt, lastRollbackBy: actorId, updatedAt: rollbackAt, updatedBy: actorId });
      await refreshSettings();
      showToast('Safe mirror mode restored', 'success');
    } catch (error) {
      console.error('Rollback failed', error);
      showToast('Could not restore safe mirror mode', 'error');
    } finally {
      setRollingBack(false);
    }
  };

  const exportEvidence = () => {
    const rows = [
      ['Category', 'Check', 'Status', 'Detail'],
      ...gates.map(gate => ['Automated', gate.label, gate.status, gate.detail]),
      ...CHECKLIST_ITEMS.map(item => ['Manual', item.label, checklist[item.id] ? 'SIGNED' : 'PENDING', item.detail]),
      ['Mode', 'Operating mode', platformMode.operatingMode, ''],
      ['Mode', 'Communication mode', platformMode.communicationMode, ''],
      ['Mode', 'Source of truth', platformMode.sourceOfTruth, ''],
      ['Mode', 'Airtable import', platformMode.airtableImportMode, ''],
    ];
    const csv = rows.map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lingland-go-live-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const gateColumns = [
    { header: 'Gate', accessor: (gate: ReadinessGate) => <span className="font-bold text-slate-900 dark:text-white">{gate.label}</span> },
    { header: 'Evidence', accessor: (gate: ReadinessGate) => <span className="text-xs text-slate-600 dark:text-slate-300">{gate.detail}</span> },
    { header: 'Status', accessor: (gate: ReadinessGate) => <Badge variant={gateVariant(gate.status)}>{gate.status}</Badge> },
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader title="Go-Live Control" subtitle="Evidence, sign-off and rollback control for the Airtable transition">
        <Button variant="outline" size="sm" icon={Download} onClick={exportEvidence}>Export evidence</Button>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={runFinalAudit} isLoading={runningAudit}>Run final audit</Button>
      </PageHeader>

      <section className="border-y border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${ready ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'}`}>
              {ready ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">{ready ? 'Ready for controlled activation' : 'Activation remains blocked'}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {ready ? 'Automated evidence and manual sign-offs are complete.' : 'Resolve blocked gates and complete every manual sign-off before changing the source of truth.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <Badge variant="info">{platformMode.operatingMode}</Badge>
            <Badge variant={platformMode.communicationMode === 'LIVE' ? 'success' : 'warning'}>{platformMode.communicationMode}</Badge>
            <Badge variant="neutral">SOURCE {platformMode.sourceOfTruth}</Badge>
            <Badge variant="neutral">IMPORT {platformMode.airtableImportMode}</Badge>
          </div>
        </div>
      </section>

      <section className="px-3 lg:px-5">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-950 dark:text-white">Automated readiness gates</h2>
            <p className="mt-1 text-xs text-slate-500">Final audit checks up to 5,000 Airtable records without writing commercial data.</p>
          </div>
          <p className="text-xs font-bold text-slate-500">
            {lastAudit?.generatedAt ? `Last persisted audit: ${new Date(lastAudit.generatedAt).toLocaleString('en-GB')}` : 'No final audit persisted yet'}
          </p>
        </div>
        <Table data={gates} columns={gateColumns as any} isLoading={loading} />
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3">
          <h2 className="text-sm font-black text-slate-950 dark:text-white">Manual sign-off</h2>
          <p className="mt-1 text-xs text-slate-500">These decisions are persisted for all administrators and included in the evidence export.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {CHECKLIST_ITEMS.map(item => (
            <label key={item.id} className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={Boolean(checklist[item.id])}
                onChange={() => toggleChecklist(item.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{item.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-px border-y border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 lg:grid-cols-2">
        <div className="bg-white p-4 dark:bg-slate-900">
          <h2 className="text-sm font-black text-slate-950 dark:text-white">Current mirrored inventory</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ['Clients', dependencyCounts.clients || 0],
              ['Interpretation', dependencyCounts.redbook || 0],
              ['Translations', dependencyCounts.translations || 0],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/administration/migration')}>Open reconciliation</Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/admin/system/audit-log')}>Open audit ledger</Button>
          </div>
        </div>

        <div className="bg-white p-4 dark:bg-slate-900">
          <h2 className="text-sm font-black text-slate-950 dark:text-white">Rollback rule</h2>
          <ol className="mt-3 space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            <li>1. Suppress every external email and push notification.</li>
            <li>2. Restore Airtable as source of truth and resume imports.</li>
            <li>3. Keep source record ids and platform history unchanged.</li>
            <li>4. Export reconciliation and audit evidence for review.</li>
          </ol>
          <Button className="mt-4" size="sm" variant="danger" icon={RotateCcw} onClick={enterSafeMirror} isLoading={rollingBack}>
            Enter safe mirror mode
          </Button>
        </div>
      </section>
    </div>
  );
};
