import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Download,
  FileText,
  Filter,
  LineChart as LineChartIcon,
  Pencil,
  PoundSterling,
  Receipt,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { useBookings } from '../../../hooks/useBookings';
import { useAuth } from '../../../context/AuthContext';
import { Booking, BookingStatus, PlatformModeSettings, UserRole } from '../../../types';
import { formatLanguagePair } from '../../../utils/languageDisplay';
import { ReportApprovalRequest, ReportExportLog, ReportSchedule, ReportScheduleFrequency, ReportService, SavedReport, SavedReportFilterState, SavedReportVisibility } from '../../../services/reportService';
import { SystemService } from '../../../services/systemService';
import {
  buildReportModel,
  DateBasis,
  getAgingBucket,
  getClientCharge,
  getCompanyName,
  getJobRef,
  getMargin,
  getProfessionalName,
  getProfessionalCost,
  isDateBasis,
  isPeriodFilter,
  isReportPreset,
  isServiceFilter,
  isTranslationJob,
  PeriodFilter,
  ReportInsight,
  ReportPreset,
  reportPresets,
  ServiceFilter,
  statusLabel,
} from '../../../services/reportingService';
import { useToast } from '../../../context/ToastContext';

const defaultSavedReports: SavedReport[] = [
  {
    id: 'system_accounts_monthly_finance',
    name: 'Accounts Monthly Finance',
    description: 'Monthly finance control across revenue, unpaid invoices and margin.',
    workspace: 'finance',
    visibility: 'TEAM',
    favorite: true,
    system: true,
    filters: { preset: 'FINANCE_OVERVIEW', period: 'THIS_MONTH', dateBasis: 'invoice', service: 'ALL', status: 'ALL', clientQuery: '' },
    createdAt: 'system',
    updatedAt: 'system',
  },
  {
    id: 'system_invoice_readiness',
    name: 'Invoice Ready Queue',
    description: 'Jobs ready for Accounts to move into client billing.',
    workspace: 'finance',
    visibility: 'TEAM',
    favorite: true,
    system: true,
    filters: { preset: 'INVOICE_READINESS', period: 'OPEN_FINANCE', dateBasis: 'timesheet', service: 'ALL', status: 'ALL', clientQuery: '' },
    createdAt: 'system',
    updatedAt: 'system',
  },
  {
    id: 'system_interpreter_payables',
    name: 'Interpreter Payables',
    description: 'Professional cost exposure and payable readiness.',
    workspace: 'finance',
    visibility: 'TEAM',
    favorite: true,
    system: true,
    filters: { preset: 'PAYABLES', period: 'OPEN_FINANCE', dateBasis: 'timesheet', service: 'ALL', status: 'ALL', clientQuery: '' },
    createdAt: 'system',
    updatedAt: 'system',
  },
  {
    id: 'system_bookings_daily_ops',
    name: 'Bookings Daily Operations',
    description: 'Daily assignment and delivery blockers for the bookings team.',
    workspace: 'operations',
    visibility: 'TEAM',
    favorite: true,
    system: true,
    filters: { preset: 'DAILY_OPERATIONS', period: 'OPEN_FINANCE', dateBasis: 'booked', service: 'ALL', status: 'ALL', clientQuery: '' },
    createdAt: 'system',
    updatedAt: 'system',
  },
  {
    id: 'system_sync_health',
    name: 'Mirror Sync Health',
    description: 'Airtable mirror confidence and conflict review.',
    workspace: 'reconciliation',
    visibility: 'TEAM',
    favorite: false,
    system: true,
    filters: { preset: 'SYNC_HEALTH', period: 'ALL', dateBasis: 'synced', service: 'ALL', status: 'ALL', clientQuery: '' },
    createdAt: 'system',
    updatedAt: 'system',
  },
];

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const currencyPrecise = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="min-h-[300px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-4">
      <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    <div className="h-60">{children}</div>
  </section>
);

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, value, helper, icon: Icon, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-0 rounded-lg border p-4 text-left shadow-sm transition ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10 dark:border-blue-700 dark:bg-blue-950/30' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60 dark:hover:bg-slate-900/80'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
      </div>
      <span className="rounded-md bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon size={18} />
      </span>
    </div>
    <p className="mt-3 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{helper}</p>
  </button>
);

export const AdminReports = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { bookings, loading, refresh } = useBookings();
  const initialParams = useMemo(() => new URLSearchParams(location.search), []);
  const [preset, setPreset] = useState<ReportPreset>(() => isReportPreset(initialParams.get('report')) ? initialParams.get('report') as ReportPreset : 'FINANCE_OVERVIEW');
  const [period, setPeriod] = useState<PeriodFilter>(() => isPeriodFilter(initialParams.get('period')) ? initialParams.get('period') as PeriodFilter : 'THIS_MONTH');
  const [dateBasis, setDateBasis] = useState<DateBasis>(() => isDateBasis(initialParams.get('basis')) ? initialParams.get('basis') as DateBasis : 'booked');
  const [service, setService] = useState<ServiceFilter>(() => isServiceFilter(initialParams.get('service')) ? initialParams.get('service') as ServiceFilter : 'ALL');
  const [status, setStatus] = useState<string>(() => initialParams.get('status') || 'ALL');
  const [clientQuery, setClientQuery] = useState(() => initialParams.get('client') || '');
  const [drilldown, setDrilldown] = useState<{ label: string; predicate: (job: Booking) => boolean } | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState(() => initialParams.get('saved') || '');
  const [saveName, setSaveName] = useState('');
  const [reportVisibility, setReportVisibility] = useState<SavedReportVisibility>('PRIVATE');
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [reportSchedules, setReportSchedules] = useState<ReportSchedule[]>([]);
  const [scheduleFrequency, setScheduleFrequency] = useState<ReportScheduleFrequency>('WEEKLY');
  const [scheduleRecipients, setScheduleRecipients] = useState('');
  const [scheduleActive, setScheduleActive] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [platformMode, setPlatformMode] = useState<PlatformModeSettings | null>(null);
  const [exportLogs, setExportLogs] = useState<ReportExportLog[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ReportApprovalRequest[]>([]);
  const [approvalSavingId, setApprovalSavingId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const canExportReports = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const communicationMode = platformMode?.communicationMode || 'SUPPRESSED';
  const scheduleDeliveryEnabled = communicationMode !== 'SUPPRESSED';

  const currentFilters = useMemo<SavedReportFilterState>(() => ({
    preset,
    period,
    dateBasis,
    service,
    status,
    clientQuery,
  }), [preset, period, dateBasis, service, status, clientQuery]);

  useEffect(() => {
    let cancelled = false;
    const loadReports = async () => {
      if (!user?.id) return;
      const [reports, schedules, mode, logs, approvals] = await Promise.all([
        ReportService.getUserReports(user.id),
        ReportService.getUserSchedules(user.id),
        SystemService.getPlatformMode(),
        ReportService.getRecentExportLogs(8),
        ReportService.getRecentApprovalRequests(8),
      ]);
      if (!cancelled) {
        setSavedReports(reports);
        setReportSchedules(schedules);
        setPlatformMode(mode);
        setExportLogs(logs);
        setApprovalRequests(approvals);
      }
    };
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const allReports = useMemo(() => {
    const userReports = [...savedReports].sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return [...defaultSavedReports, ...userReports];
  }, [savedReports]);

  useEffect(() => {
    if (!selectedReportId) return;
    const report = allReports.find(item => item.id === selectedReportId);
    if (!report) return;
    if (saveName && !report.system) return;
    setPreset(report.filters.preset as ReportPreset);
    setPeriod(report.filters.period as PeriodFilter);
    setDateBasis(report.filters.dateBasis as DateBasis);
    setService(report.filters.service as ServiceFilter);
    setStatus(report.filters.status);
    setClientQuery(report.filters.clientQuery || '');
    setSaveName(report.system ? '' : report.name);
    setReportVisibility(report.visibility || 'PRIVATE');
  }, [allReports, selectedReportId, saveName, preset]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('report', preset);
    params.set('period', period);
    params.set('basis', dateBasis);
    if (service !== 'ALL') params.set('service', service);
    if (status !== 'ALL') params.set('status', status);
    if (clientQuery.trim()) params.set('client', clientQuery.trim());
    if (selectedReportId) params.set('saved', selectedReportId);
    navigate(`/admin/reports?${params.toString()}`, { replace: true });
  }, [preset, period, dateBasis, service, status, clientQuery, selectedReportId, navigate]);

  const applySavedReport = (reportId: string) => {
    setSelectedReportId(reportId);
    if (!reportId) return;
    const report = allReports.find(item => item.id === reportId);
    if (!report) return;
    setPreset(report.filters.preset as ReportPreset);
    setPeriod(report.filters.period as PeriodFilter);
    setDateBasis(report.filters.dateBasis as DateBasis);
    setService(report.filters.service as ServiceFilter);
    setStatus(report.filters.status);
    setClientQuery(report.filters.clientQuery || '');
    setSaveName(report.system ? '' : report.name);
    setReportVisibility(report.visibility || 'PRIVATE');
    setDrilldown(null);
  };

  const saveCurrentReport = async () => {
    if (!user?.id) {
      showToast('You must be signed in to save reports.', 'error');
      return;
    }

    const trimmedName = saveName.trim();
    if (!trimmedName) {
      showToast('Name the report before saving.', 'error');
      return;
    }

    setIsSavingReport(true);
    try {
      const now = new Date().toISOString();
      const existing = selectedReportId ? savedReports.find(item => item.id === selectedReportId) : null;
      const nextReport: SavedReport = {
        id: existing?.id || `report_${Date.now()}`,
        name: trimmedName,
        description: reportPresets.find(item => item.id === preset)?.description,
        workspace: preset === 'DAILY_OPERATIONS' ? 'operations' : preset === 'SYNC_HEALTH' ? 'reconciliation' : 'finance',
        visibility: reportVisibility,
        filters: currentFilters,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const nextReports = existing
        ? savedReports.map(item => item.id === existing.id ? nextReport : item)
        : [nextReport, ...savedReports];

      await ReportService.saveUserReports(user.id, nextReports);
      setSavedReports(nextReports);
      setSelectedReportId(nextReport.id);
      showToast(existing ? 'Report updated.' : 'Report saved.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not save this report.', 'error');
    } finally {
      setIsSavingReport(false);
    }
  };

  const deleteSavedReport = async () => {
    if (!user?.id || !selectedReportId) return;
    const report = savedReports.find(item => item.id === selectedReportId);
    if (!report) return;

    setIsSavingReport(true);
    try {
      const nextReports = savedReports.filter(item => item.id !== selectedReportId);
      await ReportService.saveUserReports(user.id, nextReports);
      setSavedReports(nextReports);
      setSelectedReportId('');
      setSaveName('');
      showToast('Saved report deleted.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not delete this report.', 'error');
    } finally {
      setIsSavingReport(false);
    }
  };

  const selectedReport = allReports.find(item => item.id === selectedReportId);
  const selectedUserReport = savedReports.find(item => item.id === selectedReportId);
  const selectedSchedule = reportSchedules.find(item => item.reportId === selectedReportId);

  useEffect(() => {
    if (!selectedSchedule) {
      setScheduleFrequency('WEEKLY');
      setScheduleRecipients(user?.email || '');
      setScheduleActive(false);
      return;
    }

    setScheduleFrequency(selectedSchedule.frequency);
    setScheduleRecipients(selectedSchedule.recipients.join(', '));
    setScheduleActive(selectedSchedule.active);
  }, [selectedSchedule, user?.email]);

  const toggleFavoriteReport = async () => {
    if (!user?.id || !selectedReportId) return;
    const report = savedReports.find(item => item.id === selectedReportId);
    if (!report) return;

    setIsSavingReport(true);
    try {
      const nextReports = savedReports.map(item => item.id === selectedReportId ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() } : item);
      await ReportService.saveUserReports(user.id, nextReports);
      setSavedReports(nextReports);
      showToast(report.favorite ? 'Removed from favorites.' : 'Added to favorites.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not update favorite report.', 'error');
    } finally {
      setIsSavingReport(false);
    }
  };

  const saveSchedule = async () => {
    if (!user?.id || !selectedReportId || !selectedReport) {
      showToast('Select a saved report before scheduling.', 'error');
      return;
    }

    if (!canExportReports) {
      showToast('Only admin users can schedule reports.', 'error');
      return;
    }

    const recipients = scheduleRecipients
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      showToast('Add at least one internal recipient.', 'error');
      return;
    }

    setIsSavingSchedule(true);
    try {
      const now = new Date().toISOString();
      const nextActive = scheduleActive && scheduleDeliveryEnabled;
      const nextSchedule: ReportSchedule = {
        id: selectedSchedule?.id || `schedule_${Date.now()}`,
        userId: user.id,
        reportId: selectedReportId,
        reportName: selectedReport.name,
        frequency: scheduleFrequency,
        deliveryMode: 'INTERNAL_ONLY',
        recipients,
        active: nextActive,
        nextRunLabel: scheduleFrequency === 'WEEKLY' ? 'Next Monday 08:00 UK time' : 'First day of next month 08:00 UK time',
        createdAt: selectedSchedule?.createdAt || now,
        updatedAt: now,
      };
      const nextSchedules = selectedSchedule
        ? reportSchedules.map(item => item.id === selectedSchedule.id ? nextSchedule : item)
        : [nextSchedule, ...reportSchedules];

      await ReportService.saveUserSchedules(user.id, nextSchedules);
      setReportSchedules(nextSchedules);
      if (scheduleActive && !scheduleDeliveryEnabled) {
        setScheduleActive(false);
        showToast('Schedule saved as draft because communications are suppressed.', 'success');
      } else {
        showToast(nextActive ? 'Report schedule saved.' : 'Draft schedule saved.', 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Could not save report schedule.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const deleteSchedule = async () => {
    if (!user?.id || !selectedSchedule) return;

    setIsSavingSchedule(true);
    try {
      const nextSchedules = reportSchedules.filter(item => item.id !== selectedSchedule.id);
      await ReportService.saveUserSchedules(user.id, nextSchedules);
      setReportSchedules(nextSchedules);
      showToast('Report schedule removed.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not remove report schedule.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const reportModel = useMemo(() => buildReportModel(bookings, {
    period,
    dateBasis,
    service,
    status,
    clientQuery,
  }, value => currencyPrecise.format(value)), [bookings, period, dateBasis, service, status, clientQuery]);

  const {
    filteredBookings,
    metrics,
    statusData,
    revenueTrend,
    serviceData,
    agingData,
    topClients,
    invoiceFunnelData,
    payableByProfessionalData,
    clientMarginData,
    sanityChecks,
    insights: reportInsights,
  } = reportModel;

  const reportRows = useMemo(() => drilldown ? filteredBookings.filter(drilldown.predicate) : filteredBookings, [filteredBookings, drilldown]);

  const recordReportExport = (exportType: ReportExportLog['exportType'], reportName: string, recordCount: number) => {
    const logInput = {
      userId: user?.id || 'unknown',
      userRole: user?.role,
      reportName,
      exportType,
      filters: currentFilters,
      recordCount,
      selectedReportId: selectedReportId || undefined,
    };

    const localLog: ReportExportLog = {
      ...logInput,
      id: `local_${Date.now()}`,
      organizationId: 'lingland-main',
      createdAt: new Date().toISOString(),
    };
    setExportLogs(prev => [localLog, ...prev].slice(0, 8));

    void ReportService.logExport(logInput).then(logId => {
      if (!logId) return;
      setExportLogs(prev => prev.map(item => item.id === localLog.id ? { ...item, id: logId } : item));
    });
  };

  const requestInsightApproval = async (insight: ReportInsight) => {
    if (!canExportReports) {
      showToast('Only admin users can request report approvals.', 'error');
      return;
    }

    const selectedPreset = reportPresets.find(item => item.id === preset)?.label || 'Reports';
    setApprovalSavingId(insight.id);
    try {
      const approvalInput = {
        userId: user?.id || 'unknown',
        userRole: user?.role,
        reportName: selectedPreset,
        insightId: insight.id,
        insightTitle: insight.title,
        requestedAction: insight.actionLabel,
        filters: currentFilters,
        recordCount: filteredBookings.filter(insight.predicate).length,
        selectedReportId: selectedReportId || undefined,
      };
      const localApproval: ReportApprovalRequest = {
        ...approvalInput,
        id: `local_approval_${Date.now()}`,
        status: 'PENDING',
        organizationId: 'lingland-main',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setApprovalRequests(prev => [localApproval, ...prev].slice(0, 8));
      const approvalId = await ReportService.createApprovalRequest(approvalInput);
      if (approvalId) {
        setApprovalRequests(prev => prev.map(item => item.id === localApproval.id ? { ...item, id: approvalId } : item));
      }
      showToast('Approval request created. No records were changed.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not create approval request.', 'error');
    } finally {
      setApprovalSavingId(null);
    }
  };

  const exportPdf = () => {
    if (!canExportReports) {
      showToast('Only admin users can export reports.', 'error');
      return;
    }

    const selectedPreset = reportPresets.find(item => item.id === preset)?.label || 'Reports';
    const generatedAt = new Date().toLocaleString('en-GB');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const reportScope = `${period} | ${dateBasis} date | ${service} | ${status}`;
    const lastY = (fallback = 34) => ((doc as any).lastAutoTable?.finalY || fallback);

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Lingland Reports', 14, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(generatedAt, pageWidth - 14, 18, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(selectedPreset, 14, 41);

    autoTable(doc, {
      startY: 47,
      body: [
        ['Saved report', selectedReport?.name || 'Unsaved working report'],
        ['Visibility', selectedReport?.visibility || 'Working view'],
        ['Filters', reportScope],
        ['Client search', clientQuery || 'All clients'],
        ['Records', `${filteredBookings.length} filtered / ${reportRows.length} in detail table`],
      ],
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.6, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { textColor: [15, 23, 42] },
      },
    });

    autoTable(doc, {
      startY: lastY() + 5,
      head: [['Executive metric', 'Value', 'Operational meaning']],
      body: [
        ['Filtered jobs', String(filteredBookings.length), 'Total jobs matching the active report filters'],
        ['Revenue', currencyPrecise.format(metrics.revenue), 'Client charge estimate for the selected period'],
        ['Ready to invoice', `${metrics.readyCount} / ${currencyPrecise.format(metrics.readyAmount)}`, 'Work that can move into client invoicing'],
        ['Unpaid', `${metrics.unpaidCount} / ${currencyPrecise.format(metrics.unpaidAmount)}`, 'Open collection exposure'],
        ['Interpreter payables', `${metrics.payableCount} / ${currencyPrecise.format(metrics.payableAmount)}`, 'Expected supplier payment queue'],
        ['Margin', `${currencyPrecise.format(metrics.margin)} (${metrics.marginPct.toFixed(1)}%)`, 'Revenue less interpreter cost estimate'],
        ['Operational blockers', String(metrics.blockerCount), 'Jobs needing operational attention'],
        ['Mirror sync issues', String(metrics.conflictCount), 'Records requiring sync or data quality review'],
      ],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 38 },
      },
    });

    if (reportInsights.length > 0) {
      autoTable(doc, {
        startY: lastY() + 6,
        head: [['Insight', 'Finding', 'Recommended action']],
        body: reportInsights.slice(0, 7).map(insight => [
          insight.category,
          insight.title,
          insight.actionLabel,
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 48 },
        },
      });
    }

    autoTable(doc, {
      startY: lastY() + 6,
      head: [['Data check', 'Status', 'Detail']],
      body: sanityChecks.map(check => [check.label, check.status, check.detail]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
      },
    });

    autoTable(doc, {
      startY: lastY() + 6,
      head: [['Status', 'Jobs', 'Amount', 'Service', 'Jobs', 'Amount']],
      body: Array.from({ length: Math.max(statusData.length, serviceData.length) }).slice(0, 8).map((_, index) => [
        statusData[index]?.name || '',
        statusData[index]?.jobs ? String(statusData[index].jobs) : '',
        statusData[index]?.amount ? currencyPrecise.format(statusData[index].amount) : '',
        serviceData[index]?.name || '',
        serviceData[index]?.jobs ? String(serviceData[index].jobs) : '',
        serviceData[index]?.amount ? currencyPrecise.format(serviceData[index].amount) : '',
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 33, fontStyle: 'bold' },
        1: { cellWidth: 18, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 33, fontStyle: 'bold' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
    });

    autoTable(doc, {
      startY: lastY() + 6,
      head: [['Top client', 'Jobs', 'Revenue', 'Margin']],
      body: topClients.slice(0, 10).map(row => [
        row.client,
        String(row.jobs),
        currencyPrecise.format(row.revenue),
        currencyPrecise.format(row.margin),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    });

    autoTable(doc, {
      startY: lastY() + 6,
      head: [['Invoice stage', 'Jobs', 'Amount'], ['Professional payable', 'Jobs', 'Amount']],
      body: Array.from({ length: Math.max(invoiceFunnelData.length, payableByProfessionalData.length) }).slice(0, 10).map((_, index) => [
        invoiceFunnelData[index]?.name || '',
        invoiceFunnelData[index]?.jobs ? String(invoiceFunnelData[index].jobs) : '',
        invoiceFunnelData[index]?.amount ? currencyPrecise.format(invoiceFunnelData[index].amount) : '',
        payableByProfessionalData[index]?.professional || '',
        payableByProfessionalData[index]?.jobs ? String(payableByProfessionalData[index].jobs) : '',
        payableByProfessionalData[index]?.amount ? currencyPrecise.format(payableByProfessionalData[index].amount) : '',
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: 'bold' },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 44, fontStyle: 'bold' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
    });

    autoTable(doc, {
      startY: lastY() + 7,
      head: [['Job', 'Status', 'Date', 'Client', 'Service', 'Revenue', 'Margin']],
      body: reportRows.slice(0, 60).map(job => [
        getJobRef(job),
        statusLabel(job.status),
        job.date ? new Date(job.date).toLocaleDateString('en-GB') : '',
        getCompanyName(job),
        isTranslationJob(job) ? 'Translation' : 'Interpreting',
        currencyPrecise.format(getClientCharge(job)),
        currencyPrecise.format(getMargin(job)),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
      didDrawPage: data => {
        if (data.pageNumber > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(selectedPreset, 14, 12);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(reportScope, pageWidth - 14, 12, { align: 'right' });
        }
      },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Lingland confidential - internal report export', 14, pageHeight - 8);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
    }

    doc.save(`Lingland_${selectedPreset.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    recordReportExport('PDF', selectedPreset, reportRows.length);
  };

  const exportPresentation = () => {
    if (!canExportReports) {
      showToast('Only admin users can export report decks.', 'error');
      return;
    }

    const selectedPreset = reportPresets.find(item => item.id === preset)?.label || 'Reports';
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const addSlideHeader = (title: string, subtitle?: string) => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(title, 12, 14);
      if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(subtitle, pageWidth - 12, 14, { align: 'right' });
      }
      doc.setTextColor(15, 23, 42);
    };

    const addFooter = (page: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Lingland confidential - generated ${new Date().toLocaleString('en-GB')}`, 12, pageHeight - 8);
      doc.text(String(page), pageWidth - 12, pageHeight - 8, { align: 'right' });
    };

    addSlideHeader('Lingland Reports', selectedPreset);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text(selectedPreset, 18, 62);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Period: ${period} | Date basis: ${dateBasis} | Service: ${service} | Status: ${status}`, 18, 75);
    doc.text(`Records: ${filteredBookings.length.toLocaleString('en-GB')} filtered / ${reportRows.length.toLocaleString('en-GB')} in drill-down`, 18, 84);
    addFooter(1);

    doc.addPage();
    addSlideHeader('Executive KPIs', selectedPreset);
    [
      ['Revenue', currencyPrecise.format(metrics.revenue), `${filteredBookings.length} filtered jobs`],
      ['Ready to invoice', String(metrics.readyCount), currencyPrecise.format(metrics.readyAmount)],
      ['Unpaid', String(metrics.unpaidCount), currencyPrecise.format(metrics.unpaidAmount)],
      ['Payables', String(metrics.payableCount), currencyPrecise.format(metrics.payableAmount)],
      ['Margin', `${metrics.marginPct.toFixed(1)}%`, currencyPrecise.format(metrics.margin)],
      ['Blockers', String(metrics.blockerCount), `${metrics.conflictCount} issues/conflicts`],
    ].forEach(([label, value, helper], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 18 + (col * 88);
      const y = 44 + (row * 54);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, y, 74, 36, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 5, y + 9);
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(value, x + 5, y + 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(helper, x + 5, y + 31);
    });
    addFooter(2);

    doc.addPage();
    addSlideHeader('Status & Service Mix', selectedPreset);
    autoTable(doc, {
      startY: 34,
      margin: { left: 14, right: 154 },
      head: [['Status', 'Jobs', 'Amount']],
      body: statusData.map(row => [row.name, row.jobs, currencyPrecise.format(row.amount)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    autoTable(doc, {
      startY: 34,
      margin: { left: 154, right: 14 },
      head: [['Service', 'Jobs', 'Amount']],
      body: serviceData.map(row => [row.name, row.jobs, currencyPrecise.format(row.amount)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237] },
    });
    addFooter(3);

    doc.addPage();
    addSlideHeader('Top Clients & Action List', selectedPreset);
    autoTable(doc, {
      startY: 34,
      margin: { left: 14, right: 150 },
      head: [['Client', 'Jobs', 'Revenue', 'Margin']],
      body: topClients.map(row => [row.client, row.jobs, currencyPrecise.format(row.revenue), currencyPrecise.format(row.margin)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105] },
    });
    const actions = [
      metrics.readyCount > 0 ? `${metrics.readyCount} jobs ready for client invoicing.` : 'No invoice-ready jobs in current filter.',
      metrics.unpaidCount > 0 ? `${metrics.unpaidCount} unpaid invoices need receivables review.` : 'No unpaid invoices in current filter.',
      metrics.payableCount > 0 ? `${metrics.payableCount} professional payable records need Accounts review.` : 'No payable exposure in current filter.',
      metrics.blockerCount > 0 ? `${metrics.blockerCount} operational blockers need triage.` : 'No blockers detected in current filter.',
      metrics.conflictCount > 0 ? `${metrics.conflictCount} sync/issues need reconciliation.` : 'No sync conflicts detected in current filter.',
    ];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Recommended actions', 160, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    actions.forEach((action, index) => {
      const y = 52 + (index * 16);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(160, y - 7, 116, 11, 2, 2, 'F');
      doc.text(`${index + 1}. ${action}`, 164, y);
    });
    addFooter(4);

    doc.save(`Lingland_${selectedPreset.replace(/\s+/g, '_')}_Deck_${new Date().toISOString().slice(0, 10)}.pdf`);
    recordReportExport('PRESENTATION', selectedPreset, reportRows.length);
  };

  const setKpiDrilldown = (label: string, predicate: (job: Booking) => boolean) => {
    setDrilldown(current => current?.label === label ? null : { label, predicate });
  };

  const visibleRows = reportRows.slice(0, 80);
  const openJobPreview = (job: Booking) => setSelectedJob(job);
  const closeJobPreview = () => setSelectedJob(null);
  const openJobDetails = (job: Booking) => navigate(`/admin/bookings/${job.id}`, { state: { returnTo: `${location.pathname}${location.search}` } });
  const openJobEdit = (job: Booking) => navigate(`/admin/bookings/edit/${job.id}`, { state: { returnTo: `${location.pathname}${location.search}` } });
  const openClientContext = (job: Booking) => {
    if (job.clientId) {
      navigate(`/admin/clients/${job.clientId}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Reports' } });
      return;
    }
    setClientQuery(getCompanyName(job));
    setDrilldown(null);
  };
  const openInterpreterContext = (job: Booking) => {
    if (!job.interpreterId) return;
    navigate(`/admin/interpreters/${job.interpreterId}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Reports' } });
  };
  const exportDrilldownCsv = () => {
    const headers = ['Job', 'Status', 'Date', 'Time', 'Client', 'Contact', 'Service', 'Professional', 'Revenue', 'Cost', 'Margin'];
    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = reportRows.map(job => [
      getJobRef(job),
      statusLabel(job.status),
      job.date || '',
      job.startTime || '',
      getCompanyName(job),
      job.guestContact?.name || '',
      `${formatLanguagePair(job.languageFrom, job.languageTo)} ${isTranslationJob(job) ? 'Translation' : 'Interpreting'}`,
      job.interpreterName || '',
      getClientCharge(job).toFixed(2),
      getProfessionalCost(job).toFixed(2),
      getMargin(job).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lingland_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const tableColumns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'right';
    className?: string;
    render: (job: Booking) => React.ReactNode;
  }> = [
    {
      key: 'job',
      label: 'Job',
      render: job => (
        <>
          <button type="button" onClick={() => openJobPreview(job)} className="text-left font-black text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400">
            {getJobRef(job)}
          </button>
          {job.interpreterId ? (
            <button type="button" onClick={() => openInterpreterContext(job)} className="mt-0.5 block max-w-[220px] truncate text-left text-xs font-semibold text-slate-500 hover:text-blue-600 hover:underline dark:hover:text-blue-400">
              {job.interpreterName || 'Professional'}
            </button>
          ) : (
            <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">No professional assigned</p>
          )}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: job => <StatusBadge status={job.status} />,
    },
    {
      key: 'date',
      label: preset === 'PAYABLES' ? 'Timesheet basis' : preset === 'SYNC_HEALTH' ? 'Sync basis' : 'Date',
      render: job => (
        <div className="font-semibold text-slate-800 dark:text-slate-100">
          {job.date ? new Date(job.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No date'}
          <p className="text-xs text-blue-600 dark:text-blue-400">{job.startTime || ''}</p>
        </div>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: job => (
        <>
          <button type="button" onClick={() => openClientContext(job)} className="block max-w-[230px] truncate text-left font-semibold text-slate-950 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400">
            {getCompanyName(job)}
          </button>
          <p className="max-w-[230px] truncate text-xs text-slate-500">{job.guestContact?.name || job.costCode || 'No contact/cost code'}</p>
        </>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      render: job => (
        <>
          <p className="max-w-[220px] truncate font-semibold text-slate-950 dark:text-white">{formatLanguagePair(job.languageFrom, job.languageTo)}</p>
          <p className="text-xs text-slate-500">{isTranslationJob(job) ? 'Translation' : 'Interpreting'}</p>
        </>
      ),
    },
    ...(preset === 'DAILY_OPERATIONS' ? [
      {
        key: 'assignment',
        label: 'Assignment',
        render: (job: Booking) => (
          <>
            <p className="max-w-[220px] truncate font-semibold text-slate-950 dark:text-white">{job.interpreterName || 'Unassigned'}</p>
            <p className="text-xs text-slate-500">{job.interpreterId ? 'Professional linked' : 'Needs assignment'}</p>
          </>
        ),
      },
      {
        key: 'location',
        label: 'Location',
        render: (job: Booking) => (
          <>
            <p className="max-w-[210px] truncate font-semibold text-slate-950 dark:text-white">{job.locationType === 'ONLINE' ? 'Remote' : job.postcode || 'On-site'}</p>
            <p className="max-w-[210px] truncate text-xs text-slate-500">{job.locationType === 'ONLINE' ? job.onlineLink || 'No link' : job.address || job.location || 'No address'}</p>
          </>
        ),
      },
    ] : []),
    ...(preset === 'SYNC_HEALTH' ? [
      {
        key: 'source',
        label: 'Source',
        render: (job: Booking) => (
          <>
            <p className="font-semibold text-slate-950 dark:text-white">{job.sourceSystem || 'Platform'}</p>
            <p className="max-w-[210px] truncate text-xs text-slate-500">{job.sourceRecordId || job.legacyAirtableRef || 'No source ref'}</p>
          </>
        ),
      },
      {
        key: 'sync',
        label: 'Sync status',
        render: (job: Booking) => (
          <>
            <p className="font-semibold text-slate-950 dark:text-white">{job.syncStatus || 'No status'}</p>
            <p className="text-xs text-slate-500">{job.lastSyncedAt ? new Date(job.lastSyncedAt).toLocaleDateString('en-GB') : 'Not synced'}</p>
          </>
        ),
      },
    ] : []),
    ...(preset === 'AGED_RECEIVABLES' ? [
      {
        key: 'aging',
        label: 'Aging',
        render: (job: Booking) => <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-700 dark:bg-red-950/30 dark:text-red-300">{getAgingBucket(job)}</span>,
      },
    ] : []),
    ...(preset === 'PAYABLES' ? [
      {
        key: 'payable',
        label: 'Payable state',
        render: (job: Booking) => (
          <>
            <p className="font-semibold text-slate-950 dark:text-white">{job.timesheetVerifiedAt ? 'Verified' : job.timesheetSubmittedAt ? 'Submitted' : 'Pending evidence'}</p>
            <p className="text-xs text-slate-500">{(job as any).interpreterInvoiceNumber || (job as any).interpreterInvoiceReference || 'No payable invoice ref'}</p>
          </>
        ),
      },
    ] : []),
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      render: job => currencyPrecise.format(getClientCharge(job)),
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      render: job => currencyPrecise.format(getProfessionalCost(job)),
    },
    {
      key: 'margin',
      label: 'Margin',
      align: 'right',
      className: 'font-black',
      render: job => <span className={getMargin(job) < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}>{currencyPrecise.format(getMargin(job))}</span>,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 lg:px-6">
        <PageHeader title="Reports" subtitle="Finance, operations and mirror intelligence with export-ready evidence.">
          <Button variant="secondary" icon={RefreshCw} onClick={refresh} isLoading={loading}>Refresh</Button>
          <Button variant="outline" icon={FileText} onClick={exportPresentation} disabled={!canExportReports}>Presentation</Button>
          <Button icon={Download} onClick={exportPdf} disabled={!canExportReports}>Export PDF</Button>
        </PageHeader>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          <AlertCircle size={14} className="text-blue-600 dark:text-blue-400" />
          <span>Exports are restricted to admin users and logged with filters, record count and report type.</span>
          {!canExportReports && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Export disabled for this role</span>}
        </div>

        <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_160px_auto_auto_auto]">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Saved reports</span>
            <select value={selectedReportId} onChange={event => applySavedReport(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Unsaved working report</option>
              <optgroup label="System defaults">
                {defaultSavedReports.map(report => <option key={report.id} value={report.id}>{report.favorite ? '[Fav] ' : ''}{report.name}</option>)}
              </optgroup>
              {savedReports.length > 0 && (
                <optgroup label="My reports">
                  {savedReports.map(report => <option key={report.id} value={report.id}>{report.favorite ? '[Fav] ' : ''}{report.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Report name</span>
            <input value={saveName} onChange={event => setSaveName(event.target.value)} placeholder={selectedReport?.system ? `Copy ${selectedReport.name}` : 'e.g. Accounts monthly finance'} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Visibility</span>
            <select value={reportVisibility} onChange={event => setReportVisibility(event.target.value as SavedReportVisibility)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="PRIVATE">Private</option>
              <option value="TEAM">Team</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button icon={Save} onClick={saveCurrentReport} isLoading={isSavingReport} className="w-full">Save report</Button>
          </div>
          <div className="flex items-end">
            <Button variant={selectedUserReport?.favorite ? 'primary' : 'outline'} icon={Star} onClick={toggleFavoriteReport} disabled={!selectedUserReport || isSavingReport} className="w-full">Favorite</Button>
          </div>
          <div className="flex items-end">
            <Button variant="outline" icon={Trash2} onClick={deleteSavedReport} disabled={!selectedUserReport || isSavingReport} className="w-full">Delete</Button>
          </div>
        </div>

        <div className="mb-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Scheduled report draft</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Saves an internal-only schedule for the selected report. Delivery remains blocked while communication mode is suppressed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${scheduleDeliveryEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                {communicationMode}
              </span>
              <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${selectedSchedule?.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                {selectedSchedule?.active ? 'Configured' : 'Draft only'}
              </span>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[160px_1fr_auto_auto_auto]">
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Frequency</span>
              <select value={scheduleFrequency} onChange={event => setScheduleFrequency(event.target.value as ReportScheduleFrequency)} disabled={!selectedReportId || !canExportReports} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900">
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Internal recipients</span>
              <input value={scheduleRecipients} onChange={event => setScheduleRecipients(event.target.value)} disabled={!selectedReportId || !canExportReports} placeholder="finance@lingland.co.uk, operations@lingland.co.uk" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900" />
            </label>
            <label className="flex h-full items-end gap-2 pb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={scheduleActive} onChange={event => setScheduleActive(event.target.checked)} disabled={!selectedReportId || !canExportReports || !scheduleDeliveryEnabled} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Active
            </label>
            <div className="flex items-end">
              <Button variant="secondary" icon={CalendarDays} onClick={saveSchedule} isLoading={isSavingSchedule} disabled={!selectedReportId || !canExportReports} className="w-full">Save schedule</Button>
            </div>
            <div className="flex items-end">
              <Button variant="outline" icon={Trash2} onClick={deleteSchedule} disabled={!selectedSchedule || isSavingSchedule} className="w-full">Remove</Button>
            </div>
          </div>
          {selectedSchedule && (
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Stored as {selectedSchedule.deliveryMode}. Planned run: {selectedSchedule.nextRunLabel}. Automation worker is not enabled yet.
            </p>
          )}
          {!scheduleDeliveryEnabled && (
            <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">
              Communication is suppressed, so schedules can be saved as drafts only. No report email will be sent.
            </p>
          )}
        </div>

        <div className="mb-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Export history</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Last PDF and presentation exports logged for internal audit.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {exportLogs.length} recent
            </span>
          </div>
          {exportLogs.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
              No report exports recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Report</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Records</th>
                    <th className="px-2 py-2">Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exportLogs.map(log => (
                    <tr key={log.id}>
                      <td className="max-w-[280px] truncate px-2 py-2 font-bold text-slate-900 dark:text-white">{log.reportName}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          {log.exportType}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">{log.recordCount}</td>
                      <td className="px-2 py-2 font-semibold text-slate-500 dark:text-slate-400">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB') : 'Pending timestamp'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(5,minmax(120px,180px))]">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Report</span>
            <select value={preset} onChange={event => { setPreset(event.target.value as ReportPreset); setDrilldown(null); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              {reportPresets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Period</span>
            <select value={period} onChange={event => setPeriod(event.target.value as PeriodFilter)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="THIS_QUARTER">This quarter</option>
              <option value="THIS_YEAR">This year</option>
              <option value="OPEN_FINANCE">Open finance</option>
              <option value="ALL">All records</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Date basis</span>
            <select value={dateBasis} onChange={event => setDateBasis(event.target.value as DateBasis)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="timesheet">Timesheet</option>
              <option value="invoice">Invoice</option>
              <option value="paid">Paid</option>
              <option value="synced">Airtable sync</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Service</span>
            <select value={service} onChange={event => setService(event.target.value as ServiceFilter)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="ALL">All services</option>
              <option value="INTERPRETING">Interpreting</option>
              <option value="TRANSLATION">Translation</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Status</span>
            <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="ALL">All statuses</option>
              {Object.values(BookingStatus).map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Client</span>
            <input value={clientQuery} onChange={event => setClientQuery(event.target.value)} placeholder="Client name" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Filter size={12} /> {filteredBookings.length.toLocaleString('en-GB')} records</span>
          <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{reportPresets.find(item => item.id === preset)?.description}</span>
          {drilldown && (
            <button onClick={() => setDrilldown(null)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
              Drill-down: {drilldown.label} <X size={12} />
            </button>
          )}
        </div>

        <div className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {sanityChecks.map(check => (
            <div
              key={check.id}
              className={`rounded-md border px-3 py-2 ${check.status === 'PASS'
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{check.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${check.status === 'PASS'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                  {check.status}
                </span>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{check.detail}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Revenue" value={currency.format(metrics.revenue)} helper={`${filteredBookings.length} filtered jobs`} icon={PoundSterling} onClick={() => setKpiDrilldown('Revenue jobs', job => getClientCharge(job) > 0)} active={drilldown?.label === 'Revenue jobs'} />
          <KpiCard label="Ready invoice" value={metrics.readyCount} helper={currency.format(metrics.readyAmount)} icon={Receipt} onClick={() => setKpiDrilldown('Ready to invoice', job => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.TIMESHEET_VERIFIED].includes(job.status))} active={drilldown?.label === 'Ready to invoice'} />
          <KpiCard label="Unpaid" value={metrics.unpaidCount} helper={currency.format(metrics.unpaidAmount)} icon={CalendarDays} onClick={() => setKpiDrilldown('Unpaid invoices', job => job.status === BookingStatus.INVOICED || job.paymentStatus === 'INVOICED')} active={drilldown?.label === 'Unpaid invoices'} />
          <KpiCard label="Payables" value={metrics.payableCount} helper={currency.format(metrics.payableAmount)} icon={Users} onClick={() => setKpiDrilldown('Interpreter payables', job => [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(job.status))} active={drilldown?.label === 'Interpreter payables'} />
          <KpiCard label="Margin" value={`${metrics.marginPct.toFixed(1)}%`} helper={currency.format(metrics.margin)} icon={LineChartIcon} onClick={() => setKpiDrilldown('Low margin', job => getClientCharge(job) > 0 && getMargin(job) <= 0)} active={drilldown?.label === 'Low margin'} />
          <KpiCard label="Blockers" value={metrics.blockerCount} helper={`${metrics.conflictCount} issues/conflicts`} icon={AlertCircle} onClick={() => setKpiDrilldown('Operational blockers', job => job.billingIssueFlag || !job.costCode || (!job.interpreterId && !isTranslationJob(job)) || [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.ASSIGNMENT_PENDING].includes(job.status))} active={drilldown?.label === 'Operational blockers'} />
        </div>

        <section className="mb-5 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Read-only operational insights</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Rule-based findings from the active report filters. No autonomous action is taken.</p>
            </div>
            <span className="w-fit rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              Phase 10 pilot
            </span>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2 xl:grid-cols-3">
            {reportInsights.map(insight => {
              const toneClass = insight.tone === 'critical'
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100'
                : insight.tone === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100'
                  : insight.tone === 'positive'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100'
                    : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100';
              const labelClass = insight.tone === 'critical'
                ? 'text-red-700 dark:text-red-300'
                : insight.tone === 'warning'
                  ? 'text-amber-700 dark:text-amber-300'
                  : insight.tone === 'positive'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-blue-700 dark:text-blue-300';
              return (
                <article key={insight.id} className={`rounded-md border p-3 ${toneClass}`}>
                  <span className={`mb-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm dark:bg-slate-950/40 ${labelClass}`}>
                    {insight.category}
                  </span>
                  <div className="mb-2 flex items-start gap-2">
                    <AlertCircle size={16} className={`mt-0.5 shrink-0 ${labelClass}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-black">{insight.title}</p>
                      <p className="mt-1 text-xs font-semibold opacity-80">{insight.body}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setKpiDrilldown(insight.title, insight.predicate)}
                      className={`text-xs font-black uppercase tracking-widest underline-offset-4 hover:underline ${labelClass}`}
                    >
                      {insight.actionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestInsightApproval(insight)}
                      disabled={approvalSavingId === insight.id || !canExportReports}
                      className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/50 dark:text-slate-200 dark:hover:bg-slate-950"
                    >
                      {approvalSavingId === insight.id ? 'Requesting' : 'Request approval'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mb-5 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Human approval queue</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Recommendations can be queued for review. This layer does not apply changes automatically.
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {approvalRequests.filter(item => item.status === 'PENDING').length} pending
            </span>
          </div>
          {approvalRequests.length === 0 ? (
            <p className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
              No report recommendations are waiting for approval.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Recommendation</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Records</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {approvalRequests.map(request => (
                    <tr key={request.id}>
                      <td className="max-w-[360px] px-4 py-3">
                        <p className="truncate font-bold text-slate-900 dark:text-white">{request.insightTitle}</p>
                        <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{request.reportName}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">{request.requestedAction}</td>
                      <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">{request.recordCount}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">
                        {request.createdAt ? new Date(request.createdAt).toLocaleString('en-GB') : 'Pending timestamp'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mb-5 grid gap-4 xl:grid-cols-2">
          <ChartCard title="Revenue & margin trend" subtitle="Weekly buckets using the selected date basis.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={value => currency.format(Number(value))} />
                <Tooltip formatter={(value) => currencyPrecise.format(Number(value))} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="margin" stroke="#059669" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Jobs by status" subtitle="Click a bar to filter the drill-down table.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="jobs" fill="#2563eb" radius={[4, 4, 0, 0]} onClick={(data) => setKpiDrilldown(`Status: ${data.name}`, job => statusLabel(job.status) === data.name)} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Aged receivables" subtitle="Unpaid invoiced jobs by invoice age.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={value => currency.format(Number(value))} />
                <Tooltip formatter={(value, name) => name === 'amount' ? currencyPrecise.format(Number(value)) : value} />
                <Bar
                  dataKey="amount"
                  fill="#dc2626"
                  radius={[4, 4, 0, 0]}
                  onClick={(data) => {
                    const bucket = String((data as any).payload?.bucket || '');
                    setKpiDrilldown(`Aging: ${bucket}`, job => (job.status === BookingStatus.INVOICED || job.paymentStatus === 'INVOICED') && getAgingBucket(job) === bucket);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Service mix" subtitle={`Mirror health: ${metrics.syncRate}% sourced/synced.`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={serviceData} dataKey="jobs" nameKey="name" outerRadius={86} innerRadius={44} onClick={(data) => setKpiDrilldown(`Service: ${data.name}`, job => data.name === 'Translation' ? isTranslationJob(job) : !isTranslationJob(job))}>
                  {serviceData.map(item => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value, name, props) => [`${value} jobs / ${currency.format(props.payload.amount)}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mb-5 grid gap-4 xl:grid-cols-3">
          <ChartCard title="Invoice readiness funnel" subtitle="Timesheet to paid handoff by workflow stage.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invoiceFunnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(value, name, props) => name === 'amount' ? currencyPrecise.format(Number(value)) : `${value} jobs / ${currencyPrecise.format(props.payload.amount)}`} />
                <Bar
                  dataKey="jobs"
                  radius={[4, 4, 0, 0]}
                  onClick={(data) => {
                    const statuses = ((data as any).payload?.statuses || []) as BookingStatus[];
                    const label = String((data as any).payload?.name || 'Invoice stage');
                    setKpiDrilldown(`Invoice funnel: ${label}`, job => statuses.includes(job.status));
                  }}
                >
                  {invoiceFunnelData.map(item => <Cell key={item.name} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Payables by professional" subtitle="Largest interpreter/professional payment exposure.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payableByProfessionalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="professional" fontSize={10} interval={0} angle={-22} textAnchor="end" height={76} />
                <YAxis fontSize={11} tickFormatter={value => currency.format(Number(value))} />
                <Tooltip formatter={(value, name, props) => name === 'amount' ? [`${currencyPrecise.format(Number(value))} / ${props.payload.jobs} jobs`, 'Payable'] : value} />
                <Bar
                  dataKey="amount"
                  fill="#0f766e"
                  radius={[4, 4, 0, 0]}
                  onClick={(data) => {
                    const payload = (data as any).payload;
                    const professional = String(payload?.professional || '');
                    const interpreterId = payload?.interpreterId;
                    setKpiDrilldown(`Payable: ${professional}`, job => interpreterId ? job.interpreterId === interpreterId : getProfessionalName(job) === professional);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Margin by client" subtitle="Revenue-weighted client profitability.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientMarginData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="client" fontSize={10} interval={0} angle={-22} textAnchor="end" height={76} />
                <YAxis fontSize={11} tickFormatter={value => `${Number(value).toFixed(0)}%`} />
                <Tooltip formatter={(value, name, props) => name === 'marginPct' ? [`${Number(value).toFixed(1)}% / ${currencyPrecise.format(props.payload.margin)}`, 'Margin'] : value} />
                <Bar
                  dataKey="marginPct"
                  fill="#9333ea"
                  radius={[4, 4, 0, 0]}
                  onClick={(data) => {
                    const client = String((data as any).payload?.client || '');
                    setKpiDrilldown(`Margin client: ${client}`, job => getCompanyName(job) === client);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Drill-down records</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reportRows.length.toLocaleString('en-GB')} matching jobs. Showing first {visibleRows.length}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" icon={Download} onClick={exportDrilldownCsv} disabled={reportRows.length === 0}>Export CSV</Button>
              <Button variant="secondary" size="sm" icon={BarChart3} onClick={() => navigate('/admin/billing')}>Finance Board</Button>
              <Button variant="outline" size="sm" icon={ArrowUpRight} onClick={() => navigate('/admin/billing/client-invoices')}>Invoices</Button>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(1080, tableColumns.length * 145) }}>
              <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  {tableColumns.map(column => (
                    <th key={column.key} className={`border-b border-slate-200 px-4 py-3 dark:border-slate-800 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(job => (
                  <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    {tableColumns.map(column => (
                      <td key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''} ${column.className || ''}`}>
                        {column.render(job)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={tableColumns.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">No report records match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <Modal
        isOpen={Boolean(selectedJob)}
        onClose={closeJobPreview}
        type="drawer"
        title={selectedJob ? `Job ${getJobRef(selectedJob)}` : 'Job record'}
        footer={
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Button variant="outline" size="sm" onClick={closeJobPreview}>Close</Button>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => selectedJob && openJobEdit(selectedJob)}>Edit</Button>
            <Button size="sm" icon={ArrowUpRight} onClick={() => selectedJob && openJobDetails(selectedJob)}>Full details</Button>
          </div>
        }
      >
        {selectedJob && (
          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current status</p>
                  <button type="button" onClick={() => openClientContext(selectedJob)} className="mt-1 block max-w-full truncate text-left text-lg font-black text-slate-950 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400">
                    {getCompanyName(selectedJob)}
                  </button>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{selectedJob.guestContact?.name || selectedJob.costCode || 'No contact/cost code'}</p>
                </div>
                <StatusBadge status={selectedJob.status} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-white">
                    {selectedJob.date ? new Date(selectedJob.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : 'No date'}
                  </p>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{selectedJob.startTime || 'TBC'} {selectedJob.durationMinutes ? `(${selectedJob.durationMinutes}m)` : ''}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Service</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-white">{formatLanguagePair(selectedJob.languageFrom, selectedJob.languageTo)}</p>
                  <p className="text-sm font-semibold text-slate-500">{isTranslationJob(selectedJob) ? 'Translation' : 'Interpreting'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment and location</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-black text-slate-500">Professional</p>
                  {selectedJob.interpreterId ? (
                    <button type="button" onClick={() => openInterpreterContext(selectedJob)} className="mt-1 block text-left font-semibold text-slate-950 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400">
                      {selectedJob.interpreterName || 'Professional'}
                    </button>
                  ) : (
                    <p className="mt-1 font-semibold text-slate-950 dark:text-white">No professional assigned</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-black text-slate-500">Location</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-white">{selectedJob.locationType === 'ONLINE' ? 'Remote / online' : selectedJob.postcode || 'On-site'}</p>
                  <p className="text-xs text-slate-500">{selectedJob.locationType === 'ONLINE' ? selectedJob.onlineLink || 'No link' : selectedJob.address || selectedJob.location || 'No address'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Finance snapshot</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Revenue</p>
                  <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{currencyPrecise.format(getClientCharge(selectedJob))}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cost</p>
                  <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{currencyPrecise.format(getProfessionalCost(selectedJob))}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Margin</p>
                  <p className={`mt-1 text-sm font-black ${getMargin(selectedJob) < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{currencyPrecise.format(getMargin(selectedJob))}</p>
                </div>
              </div>
            </section>

            {(selectedJob.notes || selectedJob.adminNotes) && (
              <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Notes</p>
                <p className="text-sm leading-6 text-blue-950 dark:text-blue-100">{selectedJob.adminNotes || selectedJob.notes}</p>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
