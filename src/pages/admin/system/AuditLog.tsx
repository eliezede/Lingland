import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Activity, Download, Eye, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { db, functions } from '../../../services/firebaseConfig';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/ToastContext';

type AuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorRole?: string;
  source: string;
  communicationMode?: string;
  syncRunId?: string;
  bookingId?: string;
  organizationId?: string;
  schemaVersion?: number;
  changedFields: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB');
};

const stateLabel = (event: AuditEvent) => {
  const before = String(event.before?.status || event.before?.paymentStatus || event.before?.resolutionStatus || '');
  const after = String(event.after?.status || event.after?.paymentStatus || event.after?.resolutionStatus || '');
  if (before || after) return before && after && before !== after ? `${before} to ${after}` : (after || before);
  return event.changedFields.slice(0, 3).join(', ') || 'Metadata change';
};

export const AuditLog = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const { showToast } = useToast();

  const loadEvents = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'auditEvents'), orderBy('createdAt', 'desc'), limit(250)));
      setEvents(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as AuditEvent)));
    } catch (error) {
      console.error('Failed to load audit ledger', error);
      showToast('Could not load the audit ledger', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadEvents(); }, []);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      await httpsCallable(functions, 'createAuditHealthCheck')({});
      await loadEvents();
      showToast('Audit writer health check recorded', 'success');
    } catch (error) {
      console.error('Audit health check failed', error);
      showToast('Audit writer health check failed', 'error');
    } finally {
      setHealthChecking(false);
    }
  };

  const entityTypes = useMemo(() => Array.from(new Set(events.map(event => event.entityType))).sort(), [events]);
  const actionTypes = useMemo(() => Array.from(new Set(events.map(event => event.action))).sort(), [events]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter(event => {
      if (entityType !== 'ALL' && event.entityType !== entityType) return false;
      if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
      if (!term) return true;
      return [event.entityType, event.entityId, event.action, event.actorId, event.actorRole, event.source, event.communicationMode, event.syncRunId, event.bookingId, ...event.changedFields]
        .some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [actionFilter, entityType, events, search]);

  const exportCsv = () => {
    const header = ['Timestamp', 'Entity', 'Entity ID', 'Action', 'State', 'Actor', 'Actor role', 'Source', 'Communication mode', 'Sync run', 'Changed fields'];
    const rows = filtered.map(event => [
      event.createdAt,
      event.entityType,
      event.entityId,
      event.action,
      stateLabel(event),
      event.actorId,
      event.actorRole || '',
      event.source,
      event.communicationMode || '',
      event.syncRunId || '',
      event.changedFields.join('|'),
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lingland-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      header: 'Event',
      accessor: (event: AuditEvent) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">{event.entityType} / {event.entityId}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{formatDateTime(event.createdAt)}</p>
        </div>
      )
    },
    {
      header: 'Action',
      accessor: (event: AuditEvent) => (
        <Badge variant={
          /(DELETED|FAILED|ERROR|DECLINED)/.test(event.action) ? 'danger'
            : /(PAID|SENT|APPROVED|ACCEPTED|COMPLETED)/.test(event.action) ? 'success'
              : /(SUPPRESSED|CONFLICT)/.test(event.action) ? 'warning'
                : 'info'
        }>{event.action}</Badge>
      )
    },
    { header: 'State / fields', accessor: (event: AuditEvent) => <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{stateLabel(event)}</span> },
    {
      header: 'Actor',
      accessor: (event: AuditEvent) => (
        <div className="max-w-[180px]">
          <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{event.actorId}</p>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{event.actorRole || 'UNKNOWN'}</p>
        </div>
      )
    },
    {
      header: 'Context',
      accessor: (event: AuditEvent) => (
        <div className="max-w-[190px]">
          <p className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{event.source}</p>
          <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-wide text-slate-400">
            {event.communicationMode || 'MODE UNKNOWN'}{event.syncRunId ? ` / ${event.syncRunId}` : ''}
          </p>
        </div>
      )
    },
    { header: '', className: 'w-10', accessor: () => <Eye size={15} className="text-slate-400" /> },
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader title="Audit Ledger" subtitle="Immutable event history for critical platform records">
        <Button variant="outline" size="sm" icon={Activity} onClick={runHealthCheck} isLoading={healthChecking}>Run health check</Button>
        <Button variant="outline" size="sm" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadEvents} isLoading={loading}>Refresh</Button>
      </PageHeader>

      <div className="flex flex-col gap-2 border-y border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search entity, actor, source or changed field"
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <select
          value={entityType}
          onChange={event => setEntityType(event.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="ALL">All entities</option>
          {entityTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <select
          value={actionFilter}
          onChange={event => setActionFilter(event.target.value)}
          className="h-10 max-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="ALL">All actions</option>
          {actionTypes.map(action => <option key={action} value={action}>{action}</option>)}
        </select>
        <div className="inline-flex h-10 items-center gap-2 px-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          <ShieldCheck size={16} className="text-emerald-600" /> {filtered.length} events
        </div>
      </div>

      <div className="overflow-hidden border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <Table
          data={filtered}
          columns={columns as any}
          onRowClick={event => setSelectedEvent(event)}
          emptyMessage={loading ? 'Loading audit events...' : 'No audit events match this view.'}
        />
      </div>

      <Modal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent ? `${selectedEvent.action} / ${selectedEvent.entityType}` : 'Audit event'}
        maxWidth="2xl"
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-2">
              {[
                ['Entity', `${selectedEvent.entityType} / ${selectedEvent.entityId}`],
                ['Timestamp', formatDateTime(selectedEvent.createdAt)],
                ['Actor', `${selectedEvent.actorRole || 'UNKNOWN'} / ${selectedEvent.actorId}`],
                ['Source', selectedEvent.source],
                ['Communication', selectedEvent.communicationMode || 'UNKNOWN'],
                ['Sync run', selectedEvent.syncRunId || 'Not linked'],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-3 py-2.5 dark:bg-slate-900">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-1 break-all text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Changed fields</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedEvent.changedFields.length > 0
                  ? selectedEvent.changedFields.map(field => <Badge key={field} variant="neutral">{field}</Badge>)
                  : <span className="text-sm text-slate-500">No field-level changes recorded.</span>}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {[
                ['Before', selectedEvent.before],
                ['After', selectedEvent.after],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{String(label)}</p>
                  <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-[11px] leading-5 text-slate-100 dark:border-slate-700">
                    {JSON.stringify(value, null, 2) || 'null'}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
