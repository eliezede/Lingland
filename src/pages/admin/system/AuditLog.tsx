import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Database, FileSearch, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';

type AuditReadinessRow = {
  id: string;
  area: string;
  status: 'WIRED' | 'NEEDS_BACKEND' | 'POLICY';
  owner: string;
  detail: string;
};

type EventModelRow = {
  id: string;
  event: string;
  actor: string;
  trigger: string;
  requiredData: string;
};

const statusVariant = (status: AuditReadinessRow['status']) => {
  if (status === 'WIRED') return 'success';
  if (status === 'POLICY') return 'info';
  return 'warning';
};

export const AuditLog = () => {
  const navigate = useNavigate();

  const readinessRows: AuditReadinessRow[] = [
    {
      id: 'import-runs',
      area: 'Airtable import runs',
      status: 'WIRED',
      owner: 'Administration',
      detail: 'Migration screen records dry-run/import outcomes and exposes imported counts.'
    },
    {
      id: 'assignment-actions',
      area: 'Assignment and offer actions',
      status: 'NEEDS_BACKEND',
      owner: 'Operations',
      detail: 'Manual assign, offer sent, offer accepted, replacement and cancellation events need durable audit writes.'
    },
    {
      id: 'billing-events',
      area: 'Timesheet and invoice cycle',
      status: 'NEEDS_BACKEND',
      owner: 'Finance',
      detail: 'Timesheet submitted, invoice ready, invoice issued, paid and dispute events need immutable snapshots.'
    },
    {
      id: 'communications',
      area: 'Communication suppression',
      status: 'POLICY',
      owner: 'Super Admin',
      detail: 'Hybrid mode must record when email/SMS was suppressed, internal-only, or actually sent.'
    }
  ];

  const eventModelRows: EventModelRow[] = [
    {
      id: 'job-status',
      event: 'JOB_STATUS_CHANGED',
      actor: 'Staff or sync',
      trigger: 'Status changed from Airtable or admin action',
      requiredData: 'job id, old status, new status, source, timestamp'
    },
    {
      id: 'assignment',
      event: 'INTERPRETER_ASSIGNED',
      actor: 'Operations',
      trigger: 'Direct assign or offer accepted manually/by app',
      requiredData: 'job id, interpreter id, method, communication mode'
    },
    {
      id: 'timesheet',
      event: 'TIMESHEET_REVIEWED',
      actor: 'Interpreter or Finance',
      trigger: 'Timesheet submitted, approved, rejected or manually entered',
      requiredData: 'job id, duration, attachments, reviewer, decision'
    },
    {
      id: 'invoice',
      event: 'INVOICE_STATE_CHANGED',
      actor: 'Finance',
      trigger: 'Client/interpreter invoice generated, sent, paid or reconciled',
      requiredData: 'invoice id, linked jobs, totals, previous state, next state'
    }
  ];

  const readinessColumns = [
    {
      header: 'Area',
      accessor: (row: AuditReadinessRow) => (
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">{row.area}</p>
          <p className="mt-0.5 max-w-[620px] truncate text-xs font-medium text-slate-500 dark:text-slate-400">{row.detail}</p>
        </div>
      )
    },
    { header: 'Owner', accessor: (row: AuditReadinessRow) => <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{row.owner}</span> },
    {
      header: 'State',
      accessor: (row: AuditReadinessRow) => <Badge variant={statusVariant(row.status)}>{row.status.replace('_', ' ')}</Badge>
    }
  ];

  const eventColumns = [
    {
      header: 'Event model',
      accessor: (row: EventModelRow) => (
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">{row.event}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{row.trigger}</p>
        </div>
      )
    },
    { header: 'Actor', accessor: (row: EventModelRow) => <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{row.actor}</span> },
    { header: 'Required snapshot', accessor: (row: EventModelRow) => <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{row.requiredData}</span> }
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader title="Audit & Event Control" subtitle="Readiness map for the operational audit trail">
        <Button variant="outline" size="sm" icon={Database} onClick={() => navigate('/admin/administration/migration')}>
          Import control
        </Button>
        <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => navigate('/admin/settings')}>
          Platform guard
        </Button>
      </PageHeader>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-black text-amber-950 dark:text-amber-100">Operational warning</p>
            <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-200">
              This screen is not yet a legal audit ledger. It documents the event model and what is already connected, so staff know which flows are safe to rely on and which still need backend event capture.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Current purpose</p>
              <p className="text-sm font-black text-slate-950 dark:text-white">Readiness and schema control</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Use this page to decide what must be logged before activating autonomous flows, outbound communication and invoice automation.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <FileSearch className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Missing layer</p>
              <p className="text-sm font-black text-slate-950 dark:text-white">Durable event writer</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Each admin/user/sync mutation should write a compact event with old value, new value, actor, source and linked records.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Go-live rule</p>
              <p className="text-sm font-black text-slate-950 dark:text-white">No automation without trace</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Assignment, communication and billing automation should stay review-first until their audit events are complete.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Audit readiness</h3>
        </div>
        <Table data={readinessRows} columns={readinessColumns as any} emptyMessage="No audit readiness items configured." />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Required event model</h3>
        </div>
        <Table data={eventModelRows} columns={eventColumns as any} emptyMessage="No event models defined." />
      </section>
    </div>
  );
};
