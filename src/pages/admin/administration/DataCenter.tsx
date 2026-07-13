import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Database, Download, FileSearch, RefreshCw, Shield, Upload } from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table } from '../../../components/ui/Table';
import { SystemService } from '../../../services/systemService';

type ReadinessRow = {
  id: string;
  area: string;
  owner: string;
  status: 'ACTIVE' | 'PLANNED' | 'REVIEW';
  route?: string;
  detail: string;
};

const statusVariant = (status: ReadinessRow['status']) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'REVIEW') return 'warning';
  return 'neutral';
};

export const DataCenter = () => {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    SystemService.checkConnection().then((connected) => {
      if (mounted) setIsOnline(connected);
    });
    return () => { mounted = false; };
  }, []);

  const readinessRows: ReadinessRow[] = [
    {
      id: 'airtable',
      area: 'Airtable mirror',
      owner: 'Administration',
      status: 'ACTIVE',
      route: '/admin/administration/migration',
      detail: 'Controls Redbook imports, dry runs, mappings and migration guardrails.'
    },
    {
      id: 'audit',
      area: 'Audit visibility',
      owner: 'Security',
      status: 'ACTIVE',
      route: '/admin/system/audit-log',
      detail: 'Immutable operational, finance, communication and synchronization events with actor and source context.'
    },
    {
      id: 'go-live',
      area: 'Go-live readiness',
      owner: 'Super Admin',
      status: 'REVIEW',
      route: '/admin/administration/go-live',
      detail: 'Runs final mirror/finance gates, persists sign-off and provides atomic safe rollback.'
    },
    {
      id: 'settings',
      area: 'Platform mode',
      owner: 'Super Admin',
      status: 'ACTIVE',
      route: '/admin/settings',
      detail: 'Defines hybrid mode, communication suppression, Airtable import mode and job numbering.'
    },
    {
      id: 'exports',
      area: 'Data export pack',
      owner: 'Finance / Ops',
      status: 'PLANNED',
      detail: 'Bulk exports should be implemented as scoped reports, not ad hoc database dumps.'
    }
  ];

  const columns = [
    {
      header: 'Area',
      accessor: (row: ReadinessRow) => (
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">{row.area}</p>
          <p className="mt-0.5 max-w-[520px] truncate text-xs font-medium text-slate-500 dark:text-slate-400">{row.detail}</p>
        </div>
      )
    },
    { header: 'Owner', accessor: (row: ReadinessRow) => <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{row.owner}</span> },
    {
      header: 'Status',
      accessor: (row: ReadinessRow) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
    },
    {
      header: 'Action',
      accessor: (row: ReadinessRow) => row.route ? (
        <Button size="sm" variant="secondary" onClick={() => navigate(row.route!)}>
          Open
        </Button>
      ) : (
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Planned</span>
      )
    }
  ];

  const capabilityCards = [
    { label: 'Import control', icon: Upload, status: 'Active', detail: 'Use Airtable Migration for mirror mode sync.', route: '/admin/administration/migration' },
    { label: 'Export packs', icon: Download, status: 'Planned', detail: 'Needs scoped finance/ops reports before activation.' },
    { label: 'Audit review', icon: FileSearch, status: 'Active', detail: 'Review semantic events, before/after values and sync lineage.', route: '/admin/system/audit-log' },
    { label: 'Platform guard', icon: Shield, status: 'Active', detail: 'Hybrid/email suppression controlled in Settings.', route: '/admin/settings' }
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader title="Data Center" subtitle="Operational readiness for sync, audit and platform control">
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => SystemService.checkConnection().then(setIsOnline)}>
          Check connection
        </Button>
      </PageHeader>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Firestore status</p>
              <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                {isOnline === null ? 'Checking' : isOnline ? 'Connected' : 'Offline'}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            This page is a control map. Destructive database operations are intentionally not exposed here until they have scoped permissions, audit logging and rollback rules.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => card.route && navigate(card.route)}
              disabled={!card.route}
              className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-blue-950/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-50 text-blue-600 dark:bg-slate-950">
                  <card.icon size={16} />
                </div>
                <Badge variant={card.status === 'Active' ? 'success' : card.status === 'Review' ? 'warning' : 'neutral'}>{card.status}</Badge>
              </div>
              <p className="mt-3 text-sm font-black text-slate-950 dark:text-white">{card.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{card.detail}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Database size={16} className="text-blue-600" />
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Readiness map</h3>
        </div>
        <Table data={readinessRows} columns={columns as any} emptyMessage="No readiness items configured." />
      </section>
    </div>
  );
};
