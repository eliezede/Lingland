import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Landmark, Link2, RefreshCw, ShieldCheck, Unplug, XCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge, BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import {
  XeroIntegrationService,
  XeroIntegrationStatus,
} from '../../../services/xeroIntegrationService';

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))
  : 'Not yet';

const cleanError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected Xero integration error.';
  return message
    .replace(/^Firebase:\s*/i, '')
    .replace(/^.*?\(functions\/[a-z-]+\)\.\s*/i, '')
    .slice(0, 260);
};

const statusPresentation = (status?: XeroIntegrationStatus['status']): { label: string; variant: BadgeVariant } => {
  if (status === 'CONNECTED') return { label: 'Connected', variant: 'success' };
  if (status === 'TENANT_SELECTION_REQUIRED') return { label: 'Choose organisation', variant: 'warning' };
  if (status === 'ERROR') return { label: 'Attention required', variant: 'danger' };
  return { label: 'Not connected', variant: 'neutral' };
};

const permissionLabel = (scope: string) => ({
  'accounting.invoices.read': 'Invoices: read',
  'accounting.payments.read': 'Payments: read',
  'accounting.contacts.read': 'Contacts: read',
  'accounting.settings.read': 'Organisation settings: read',
  offline_access: 'Maintain secure connection',
}[scope] || null);

export const AdminIntegrations = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<XeroIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'connect' | 'test' | 'select' | 'disconnect' | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');

  const presentation = statusPresentation(status?.status);
  const visiblePermissions = useMemo(() => status?.scopes
    .map(permissionLabel)
    .filter((item): item is string => Boolean(item)) || [], [status?.scopes]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const next = await XeroIntegrationService.getStatus();
      setStatus(next);
      if (next.connectionOptions.length === 1) setSelectedConnectionId(next.connectionOptions[0].connectionId);
    } catch (error) {
      showToast(cleanError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('xero');
    if (!result) return;
    const message = params.get('message');
    if (result === 'connected') showToast('Xero authorised. Run the connection test to verify the organisation.', 'success');
    else if (result === 'select-organisation') showToast('Xero authorised. Choose the organisation Lingland should use.', 'info');
    else if (result === 'cancelled') showToast(message || 'Xero connection was cancelled.', 'info');
    else showToast(message || 'Xero connection could not be completed.', 'error');
    navigate('/admin/administration/integrations', { replace: true });
    void loadStatus();
  }, [location.search]);

  const beginConnection = async () => {
    setAction('connect');
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}#/admin/administration/integrations`;
      const result = await XeroIntegrationService.startConnection(returnUrl);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      showToast(cleanError(error), 'error');
      setAction(null);
    }
  };

  const selectOrganisation = async () => {
    if (!selectedConnectionId) return;
    setAction('select');
    try {
      const next = await XeroIntegrationService.selectOrganisation(selectedConnectionId);
      setStatus(next);
      showToast('Xero organisation selected.', 'success');
    } catch (error) {
      showToast(cleanError(error), 'error');
    } finally {
      setAction(null);
    }
  };

  const testConnection = async () => {
    setAction('test');
    try {
      await XeroIntegrationService.testConnection();
      await loadStatus();
      showToast('Xero read-only connection verified.', 'success');
    } catch (error) {
      showToast(cleanError(error), 'error');
      await loadStatus();
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    const accepted = await confirm({
      title: 'Disconnect Xero',
      message: 'This revokes Lingland access to the selected Xero organisation. It does not delete invoices, contacts or payments in either system.',
      confirmLabel: 'Disconnect',
      variant: 'danger',
    });
    if (!accepted) return;
    setAction('disconnect');
    try {
      await XeroIntegrationService.disconnect();
      await loadStatus();
      showToast('Xero disconnected.', 'success');
    } catch (error) {
      showToast(cleanError(error), 'error');
    } finally {
      setAction(null);
    }
  };

  const copyRedirectUri = async () => {
    if (!status?.redirectUri) return;
    await navigator.clipboard.writeText(status.redirectUri);
    showToast('OAuth callback copied.', 'success');
  };

  return (
    <div className="space-y-5 pb-10">
      <PageHeader title="Integrations" subtitle="Secure connections to external systems. Connecting a provider never enables data synchronisation automatically.">
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadStatus} isLoading={loading}>Refresh</Button>
      </PageHeader>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              <Landmark size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">Xero Accounting</h2>
                <Badge variant={presentation.variant}>{presentation.label}</Badge>
                <Badge variant="info">Read only</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Organisation verification and accounting-read access for the future reconciliation workflow.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {status?.status === 'CONNECTED' && (
              <Button variant="outline" size="sm" icon={ShieldCheck} onClick={testConnection} isLoading={action === 'test'}>Test connection</Button>
            )}
            {status?.viewer.canManage && (
              <Button variant={status.status === 'CONNECTED' ? 'secondary' : 'primary'} size="sm" icon={Link2} onClick={beginConnection} isLoading={action === 'connect'}>
                {status.status === 'CONNECTED' ? 'Reconnect' : 'Connect Xero'}
              </Button>
            )}
          </div>
        </div>

        {loading && !status ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Loading integration state...</div>
        ) : status ? (
          <>
            {status.status === 'TENANT_SELECTION_REQUIRED' && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-500/10 sm:px-5">
                <label htmlFor="xero-organisation" className="text-sm font-semibold text-amber-950 dark:text-amber-100">Choose the Xero organisation for Lingland</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <select
                    id="xero-organisation"
                    value={selectedConnectionId}
                    onChange={event => setSelectedConnectionId(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-amber-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="">Select organisation</option>
                    {status.connectionOptions.map(option => <option key={option.connectionId} value={option.connectionId}>{option.tenantName}</option>)}
                  </select>
                  <Button size="sm" onClick={selectOrganisation} disabled={!selectedConnectionId} isLoading={action === 'select'}>Use organisation</Button>
                </div>
              </div>
            )}

            <div className="grid divide-y divide-slate-200 dark:divide-slate-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="px-4 py-5 sm:px-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Connection</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Organisation</dt><dd className="max-w-[65%] text-right font-semibold text-slate-950 dark:text-white">{status.organisation?.name || status.tenant?.tenantName || 'Not selected'}</dd></div>
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Base currency</dt><dd className="font-semibold text-slate-950 dark:text-white">{status.organisation?.baseCurrency || 'Not verified'}</dd></div>
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Connected</dt><dd className="text-right font-semibold text-slate-950 dark:text-white">{formatDateTime(status.connectedAt)}</dd></div>
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Last test</dt><dd className="text-right font-semibold text-slate-950 dark:text-white">{formatDateTime(status.lastHealthCheckAt)}</dd></div>
                </dl>
                {status.lastHealthCheckMessage && (
                  <div className={`mt-4 flex gap-2 rounded-md border px-3 py-2 text-xs ${status.lastHealthCheckStatus === 'ERROR' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-500/10 dark:text-red-200' : 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-500/10 dark:text-green-200'}`}>
                    {status.lastHealthCheckStatus === 'ERROR' ? <XCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
                    <span>{status.lastHealthCheckMessage}</span>
                  </div>
                )}
              </div>

              <div className="px-4 py-5 sm:px-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Safety boundary</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /><span>No automatic import or export is active.</span></div>
                  <div className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /><span>Lingland cannot create or change Xero records with these permissions.</span></div>
                  <div className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /><span>Xero accounting data is not supplied to the AI provider.</span></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {visiblePermissions.map(permission => <Badge key={permission} variant="neutral">{permission}</Badge>)}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label htmlFor="xero-callback" className="text-xs font-bold uppercase tracking-wider text-slate-400">OAuth callback</label>
                  <div className="mt-1 flex gap-2">
                    <input id="xero-callback" readOnly value={status.redirectUri} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 font-mono text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" />
                    <Button variant="outline" size="sm" icon={Clipboard} onClick={copyRedirectUri}>Copy</Button>
                  </div>
                </div>
                {status.status === 'CONNECTED' && status.viewer.canManage && (
                  <Button variant="danger" size="sm" icon={Unplug} onClick={disconnect} isLoading={action === 'disconnect'}>Disconnect</Button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
};
