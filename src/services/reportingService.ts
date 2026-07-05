import { Booking, BookingStatus, ServiceCategory } from '../types';

export type DateBasis = 'booked' | 'completed' | 'timesheet' | 'invoice' | 'paid' | 'synced';
export type PeriodFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'OPEN_FINANCE' | 'ALL';
export type ServiceFilter = 'ALL' | 'INTERPRETING' | 'TRANSLATION';
export type ReportPreset = 'FINANCE_OVERVIEW' | 'INVOICE_READINESS' | 'AGED_RECEIVABLES' | 'PAYABLES' | 'DAILY_OPERATIONS' | 'MARGIN' | 'SYNC_HEALTH';
export type ReportInsightTone = 'critical' | 'warning' | 'positive' | 'info';

export interface ReportFilters {
  period: PeriodFilter;
  dateBasis: DateBasis;
  service: ServiceFilter;
  status: string;
  clientQuery: string;
}

export interface ReportMetrics {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  readyCount: number;
  readyAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  payableCount: number;
  payableAmount: number;
  blockerCount: number;
  syncRate: number;
  conflictCount: number;
}

export interface ReportInsight {
  id: string;
  tone: ReportInsightTone;
  category: 'Finance' | 'Operations' | 'Cost' | 'Process' | 'Sync';
  title: string;
  body: string;
  actionLabel: string;
  predicate: (job: Booking) => boolean;
}

export interface StatusReportRow {
  name: string;
  jobs: number;
  amount: number;
}

export interface RevenueTrendRow {
  period: string;
  revenue: number;
  margin: number;
  jobs: number;
}

export interface ServiceMixRow {
  name: string;
  jobs: number;
  amount: number;
  color: string;
}

export interface AgingReportRow {
  bucket: string;
  jobs: number;
  amount: number;
}

export interface TopClientReportRow {
  client: string;
  jobs: number;
  revenue: number;
  margin: number;
}

export interface InvoiceFunnelReportRow {
  name: string;
  jobs: number;
  amount: number;
  statuses: BookingStatus[];
  color: string;
}

export interface PayableByProfessionalReportRow {
  professional: string;
  jobs: number;
  amount: number;
  interpreterId?: string;
}

export interface ClientMarginReportRow {
  client: string;
  jobs: number;
  revenue: number;
  margin: number;
  marginPct: number;
}

export interface ReportSanityCheck {
  id: string;
  label: string;
  status: 'PASS' | 'WARNING';
  detail: string;
}

export interface ReportModel {
  filteredBookings: Booking[];
  metrics: ReportMetrics;
  statusData: StatusReportRow[];
  revenueTrend: RevenueTrendRow[];
  serviceData: ServiceMixRow[];
  agingData: AgingReportRow[];
  topClients: TopClientReportRow[];
  invoiceFunnelData: InvoiceFunnelReportRow[];
  payableByProfessionalData: PayableByProfessionalReportRow[];
  clientMarginData: ClientMarginReportRow[];
  sanityChecks: ReportSanityCheck[];
  insights: ReportInsight[];
}

export const reportPresets: Array<{ id: ReportPreset; label: string; description: string }> = [
  { id: 'FINANCE_OVERVIEW', label: 'Finance Overview', description: 'Revenue, payment and margin control.' },
  { id: 'INVOICE_READINESS', label: 'Invoice Readiness', description: 'Jobs that can move into client billing.' },
  { id: 'AGED_RECEIVABLES', label: 'Aged Receivables', description: 'Unpaid client exposure by age.' },
  { id: 'PAYABLES', label: 'Interpreter Payables', description: 'Professional cost and supplier invoice queue.' },
  { id: 'DAILY_OPERATIONS', label: 'Daily Operations', description: 'Assignment and delivery blockers.' },
  { id: 'MARGIN', label: 'Margin & Profit', description: 'Client/service profitability and zero-margin risks.' },
  { id: 'SYNC_HEALTH', label: 'Mirror Sync Health', description: 'Airtable mirror and reconciliation quality.' },
];

export const financeOpenStatuses = new Set<string>([
  BookingStatus.SESSION_COMPLETED,
  BookingStatus.TIMESHEET_SUBMITTED,
  BookingStatus.TIMESHEET_VERIFIED,
  BookingStatus.READY_FOR_INVOICE,
  BookingStatus.INVOICING,
  BookingStatus.INVOICED,
]);

export const terminalStatuses = new Set<string>([BookingStatus.PAID, BookingStatus.CANCELLED]);

export const isReportPreset = (value: string | null): value is ReportPreset => Boolean(value && reportPresets.some(item => item.id === value));
export const isPeriodFilter = (value: string | null): value is PeriodFilter => ['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'OPEN_FINANCE', 'ALL'].includes(String(value));
export const isDateBasis = (value: string | null): value is DateBasis => ['booked', 'completed', 'timesheet', 'invoice', 'paid', 'synced'].includes(String(value));
export const isServiceFilter = (value: string | null): value is ServiceFilter => ['ALL', 'INTERPRETING', 'TRANSLATION'].includes(String(value));

export const parseDate = (value?: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const getQuarterStart = (date: Date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);

export const getDateRange = (period: PeriodFilter) => {
  const now = new Date();
  if (period === 'THIS_MONTH') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (period === 'LAST_MONTH') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
  if (period === 'THIS_QUARTER') return { from: getQuarterStart(now), to: now };
  if (period === 'THIS_YEAR') return { from: new Date(now.getFullYear(), 0, 1), to: now };
  return { from: null, to: null };
};

export const getReportDate = (job: Booking, basis: DateBasis) => {
  if (basis === 'completed') return parseDate((job as any).translationCompletedAt || (job as any).sessionCompletedAt || job.endTime || job.date);
  if (basis === 'timesheet') return parseDate(job.timesheetVerifiedAt || job.timesheetSubmittedAt || job.date);
  if (basis === 'invoice') return parseDate(job.invoicedAt || (job as any).invoiceDate || job.date);
  if (basis === 'paid') return parseDate(job.paidAt || job.date);
  if (basis === 'synced') return parseDate(job.lastSyncedAt || job.updatedAt || job.date);
  return parseDate(job.date);
};

export const getClientCharge = (job: Booking) => Number(job.totalAmount || (job as any).clientCharge || (job as any).finalQuote || 0);
export const getProfessionalCost = (job: Booking) => Number((job as any).interpreterAmountCalculated || (job as any).professionalCost || (job as any).interpreterCost || 0);
export const getMargin = (job: Booking) => getClientCharge(job) - getProfessionalCost(job);
export const isTranslationJob = (job: Booking) => job.serviceCategory === ServiceCategory.TRANSLATION || String(job.serviceType || '').toLowerCase().includes('translation');
export const getJobRef = (job: Booking) => job.displayRef || job.jobNumber || job.bookingRef || job.legacyAirtableRef || job.id;
export const getCompanyName = (job: Booking) => job.clientName || job.guestContact?.organisation || 'Unknown client';
export const getProfessionalName = (job: Booking) => job.interpreterName || (job as any).professionalName || 'Unassigned professional';

export const getAgingBucket = (job: Booking) => {
  const invoiceDate = parseDate(job.invoicedAt || (job as any).invoiceDate || job.date);
  if (!invoiceDate) return 'No date';
  const days = Math.max(0, Math.floor((startOfDay(new Date()).getTime() - startOfDay(invoiceDate).getTime()) / 86400000));
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
};

export const getWeekKey = (date: Date) => {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

export const buildReportModel = (
  bookings: Booking[],
  filters: ReportFilters,
  formatCurrency: (value: number) => string,
): ReportModel => {
  const { period, dateBasis, service, status, clientQuery } = filters;
  const range = getDateRange(period);
  const filteredBookings = bookings.filter(job => {
    if (period === 'OPEN_FINANCE' && !financeOpenStatuses.has(job.status)) return false;
    if (service === 'INTERPRETING' && isTranslationJob(job)) return false;
    if (service === 'TRANSLATION' && !isTranslationJob(job)) return false;
    if (status !== 'ALL' && job.status !== status) return false;
    if (clientQuery.trim() && !getCompanyName(job).toLowerCase().includes(clientQuery.trim().toLowerCase())) return false;
    if (range.from || range.to) {
      const date = getReportDate(job, dateBasis);
      if (!date) return false;
      if (range.from && date < range.from) return false;
      if (range.to && date > range.to) return false;
    }
    return true;
  });

  const revenue = filteredBookings.reduce((sum, job) => sum + getClientCharge(job), 0);
  const cost = filteredBookings.reduce((sum, job) => sum + getProfessionalCost(job), 0);
  const ready = filteredBookings.filter(job => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.TIMESHEET_VERIFIED].includes(job.status));
  const unpaid = filteredBookings.filter(job => job.status === BookingStatus.INVOICED || job.paymentStatus === 'INVOICED');
  const payables = filteredBookings.filter(job => [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(job.status));
  const blockers = filteredBookings.filter(job => (
    !terminalStatuses.has(job.status) &&
    (job.billingIssueFlag || !job.costCode || (!job.interpreterId && !isTranslationJob(job)) || [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.ASSIGNMENT_PENDING].includes(job.status))
  ));
  const synced = filteredBookings.filter(job => job.sourceSystem === 'AIRTABLE' || job.sourceRecordId);
  const conflicts = filteredBookings.filter(job => job.syncStatus === 'CONFLICT' || job.billingIssueFlag);
  const metrics: ReportMetrics = {
    revenue,
    cost,
    margin: revenue - cost,
    marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    readyCount: ready.length,
    readyAmount: ready.reduce((sum, job) => sum + getClientCharge(job), 0),
    unpaidCount: unpaid.length,
    unpaidAmount: unpaid.reduce((sum, job) => sum + getClientCharge(job), 0),
    payableCount: payables.length,
    payableAmount: payables.reduce((sum, job) => sum + getProfessionalCost(job), 0),
    blockerCount: blockers.length,
    syncRate: filteredBookings.length > 0 ? Math.round((synced.length / filteredBookings.length) * 100) : 0,
    conflictCount: conflicts.length,
  };

  const statusMap = new Map<string, StatusReportRow>();
  filteredBookings.forEach(job => {
    const key = job.status || 'UNKNOWN';
    const current = statusMap.get(key) || { name: statusLabel(key), jobs: 0, amount: 0 };
    current.jobs += 1;
    current.amount += getClientCharge(job);
    statusMap.set(key, current);
  });
  const statusData = Array.from(statusMap.values()).sort((a, b) => b.jobs - a.jobs).slice(0, 9);

  const trendMap = new Map<string, RevenueTrendRow>();
  filteredBookings.forEach(job => {
    const date = getReportDate(job, dateBasis) || parseDate(job.date);
    if (!date) return;
    const key = getWeekKey(date);
    const current = trendMap.get(key) || { period: key, revenue: 0, margin: 0, jobs: 0 };
    current.revenue += getClientCharge(job);
    current.margin += getMargin(job);
    current.jobs += 1;
    trendMap.set(key, current);
  });
  const revenueTrend = Array.from(trendMap.values()).slice(-10);

  const interpreting = filteredBookings.filter(job => !isTranslationJob(job));
  const translations = filteredBookings.filter(isTranslationJob);
  const serviceData: ServiceMixRow[] = [
    { name: 'Interpreting', jobs: interpreting.length, amount: interpreting.reduce((sum, job) => sum + getClientCharge(job), 0), color: '#2563eb' },
    { name: 'Translation', jobs: translations.length, amount: translations.reduce((sum, job) => sum + getClientCharge(job), 0), color: '#7c3aed' },
  ];

  const agingData: AgingReportRow[] = ['0-30', '31-60', '61-90', '90+'].map(bucket => {
    const rows = filteredBookings.filter(job => (job.status === BookingStatus.INVOICED || job.paymentStatus === 'INVOICED') && getAgingBucket(job) === bucket);
    return { bucket, jobs: rows.length, amount: rows.reduce((sum, job) => sum + getClientCharge(job), 0) };
  });

  const clientMap = new Map<string, TopClientReportRow>();
  filteredBookings.forEach(job => {
    const key = getCompanyName(job);
    const current = clientMap.get(key) || { client: key, jobs: 0, revenue: 0, margin: 0 };
    current.jobs += 1;
    current.revenue += getClientCharge(job);
    current.margin += getMargin(job);
    clientMap.set(key, current);
  });
  const topClients = Array.from(clientMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const clientMarginData: ClientMarginReportRow[] = Array.from(clientMap.values())
    .map(row => ({
      ...row,
      marginPct: row.revenue > 0 ? (row.margin / row.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const invoiceFunnelStages: InvoiceFunnelReportRow[] = [
    { name: 'Timesheet', statuses: [BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED], jobs: 0, amount: 0, color: '#7c3aed' },
    { name: 'Ready', statuses: [BookingStatus.READY_FOR_INVOICE], jobs: 0, amount: 0, color: '#2563eb' },
    { name: 'Invoicing', statuses: [BookingStatus.INVOICING], jobs: 0, amount: 0, color: '#0891b2' },
    { name: 'Invoiced', statuses: [BookingStatus.INVOICED], jobs: 0, amount: 0, color: '#f59e0b' },
    { name: 'Paid', statuses: [BookingStatus.PAID], jobs: 0, amount: 0, color: '#059669' },
  ];
  const invoiceFunnelData = invoiceFunnelStages.map(stage => {
    const rows = filteredBookings.filter(job => stage.statuses.includes(job.status));
    return {
      ...stage,
      jobs: rows.length,
      amount: rows.reduce((sum, job) => sum + getClientCharge(job), 0),
    };
  });

  const payableMap = new Map<string, PayableByProfessionalReportRow>();
  payables.forEach(job => {
    const key = job.interpreterId || getProfessionalName(job);
    const current = payableMap.get(key) || {
      professional: getProfessionalName(job),
      interpreterId: job.interpreterId,
      jobs: 0,
      amount: 0,
    };
    current.jobs += 1;
    current.amount += getProfessionalCost(job);
    payableMap.set(key, current);
  });
  const payableByProfessionalData = Array.from(payableMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const statusJobTotal = statusData.reduce((sum, row) => sum + row.jobs, 0);
  const serviceJobTotal = serviceData.reduce((sum, row) => sum + row.jobs, 0);
  const serviceRevenueTotal = serviceData.reduce((sum, row) => sum + row.amount, 0);
  const topClientRevenue = topClients.reduce((sum, row) => sum + row.revenue, 0);
  const sanityChecks: ReportSanityCheck[] = [
    {
      id: 'status-total',
      label: 'Status total',
      status: statusJobTotal === filteredBookings.length || statusData.length >= 9 ? 'PASS' : 'WARNING',
      detail: statusData.length >= 9
        ? `${statusJobTotal} jobs shown across top statuses; long tail hidden for readability.`
        : `${statusJobTotal} status jobs vs ${filteredBookings.length} filtered jobs.`,
    },
    {
      id: 'service-total',
      label: 'Service split',
      status: serviceJobTotal === filteredBookings.length ? 'PASS' : 'WARNING',
      detail: `${serviceJobTotal} service jobs vs ${filteredBookings.length} filtered jobs.`,
    },
    {
      id: 'revenue-balance',
      label: 'Revenue balance',
      status: Math.abs(serviceRevenueTotal - revenue) < 0.01 ? 'PASS' : 'WARNING',
      detail: `${formatCurrency(serviceRevenueTotal)} service revenue vs ${formatCurrency(revenue)} report revenue.`,
    },
    {
      id: 'client-coverage',
      label: 'Top client coverage',
      status: topClientRevenue <= revenue + 0.01 ? 'PASS' : 'WARNING',
      detail: `${formatCurrency(topClientRevenue)} shown in top clients from ${formatCurrency(revenue)} total revenue.`,
    },
  ];

  return {
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
    insights: buildReportInsights(filteredBookings, metrics, topClients, formatCurrency),
  };
};

const buildReportInsights = (
  filteredBookings: Booking[],
  metrics: ReportMetrics,
  topClients: TopClientReportRow[],
  formatCurrency: (value: number) => string,
): ReportInsight[] => {
  const insights: ReportInsight[] = [];
  const readyPredicate = (job: Booking) => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.TIMESHEET_VERIFIED].includes(job.status);
  const unpaidPredicate = (job: Booking) => job.status === BookingStatus.INVOICED || job.paymentStatus === 'INVOICED';
  const payablePredicate = (job: Booking) => [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(job.status);
  const blockerPredicate = (job: Booking) => job.billingIssueFlag || !job.costCode || (!job.interpreterId && !isTranslationJob(job)) || [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.ASSIGNMENT_PENDING].includes(job.status);
  const lowMarginPredicate = (job: Booking) => getClientCharge(job) > 0 && getMargin(job) <= 0;
  const missingCostPredicate = (job: Booking) => getClientCharge(job) > 0 && getProfessionalCost(job) <= 0 && !isTranslationJob(job);
  const missingRevenuePredicate = (job: Booking) => getClientCharge(job) <= 0 && !terminalStatuses.has(job.status);
  const missingTimesheetPredicate = (job: Booking) => job.status === BookingStatus.SESSION_COMPLETED && !job.timesheetSubmittedAt && !job.timesheetVerifiedAt;
  const syncIssuePredicate = (job: Booking) => job.syncStatus === 'CONFLICT' || job.billingIssueFlag || (!job.sourceRecordId && job.sourceSystem === 'AIRTABLE');
  const topClient = topClients[0];
  const topClientShare = topClient && metrics.revenue > 0 ? Math.round((topClient.revenue / metrics.revenue) * 100) : 0;
  const missingCostCount = filteredBookings.filter(missingCostPredicate).length;
  const missingRevenueCount = filteredBookings.filter(missingRevenuePredicate).length;
  const missingTimesheetCount = filteredBookings.filter(missingTimesheetPredicate).length;

  if (metrics.readyCount > 0) {
    insights.push({ id: 'ready-invoice', tone: metrics.readyAmount > 0 ? 'positive' : 'info', category: 'Finance', title: `${metrics.readyCount} jobs can move to client billing`, body: `${formatCurrency(metrics.readyAmount)} is ready under the current filters. This is the cleanest finance action queue.`, actionLabel: 'Review invoice-ready jobs', predicate: readyPredicate });
  }
  if (metrics.unpaidCount > 0) {
    insights.push({ id: 'unpaid', tone: metrics.unpaidAmount > 0 ? 'warning' : 'info', category: 'Finance', title: `${metrics.unpaidCount} unpaid invoices need attention`, body: `${formatCurrency(metrics.unpaidAmount)} remains unpaid. Prioritise aging and payment reconciliation before generating new packs.`, actionLabel: 'Review unpaid invoices', predicate: unpaidPredicate });
  }
  if (metrics.payableCount > 0) {
    insights.push({ id: 'payables', tone: 'info', category: 'Finance', title: `${metrics.payableCount} payable records are exposed`, body: `${formatCurrency(metrics.payableAmount)} in professional costs should be matched against timesheets and interpreter invoices.`, actionLabel: 'Review payables', predicate: payablePredicate });
  }
  if (metrics.blockerCount > 0) {
    insights.push({ id: 'blockers', tone: 'critical', category: 'Operations', title: `${metrics.blockerCount} operational blockers affect this report`, body: 'Missing assignment, cost code, issue flags or open workflow status can delay billing and reconciliation.', actionLabel: 'Open blockers', predicate: blockerPredicate });
  }
  if (filteredBookings.some(lowMarginPredicate)) {
    insights.push({ id: 'low-margin', tone: 'warning', category: 'Cost', title: 'Low or negative margin jobs detected', body: 'Some records have revenue but no positive margin. Check rates, payable cost and imported finance fields.', actionLabel: 'Review margin risks', predicate: lowMarginPredicate });
  }
  if (missingCostCount > 0) {
    insights.push({ id: 'missing-cost', tone: 'warning', category: 'Cost', title: `${missingCostCount} jobs have revenue but no professional cost`, body: 'Margin may be overstated. Confirm interpreter payable rates or imported cost fields before using profitability figures.', actionLabel: 'Review missing costs', predicate: missingCostPredicate });
  }
  if (missingRevenueCount > 0) {
    insights.push({ id: 'missing-revenue', tone: 'critical', category: 'Process', title: `${missingRevenueCount} open jobs have no client revenue`, body: 'These records can block invoicing and distort operational revenue. Check quotes, client charge and imported invoice fields.', actionLabel: 'Review missing revenue', predicate: missingRevenuePredicate });
  }
  if (missingTimesheetCount > 0) {
    insights.push({ id: 'missing-timesheet', tone: 'warning', category: 'Process', title: `${missingTimesheetCount} completed jobs still need timesheet evidence`, body: 'Capture manual or interpreter-submitted timesheets before moving these jobs through finance.', actionLabel: 'Review timesheet gaps', predicate: missingTimesheetPredicate });
  }
  if (metrics.syncRate < 95 && filteredBookings.length > 0) {
    insights.push({ id: 'sync-health', tone: 'warning', category: 'Sync', title: `Mirror confidence is ${metrics.syncRate}%`, body: `${metrics.conflictCount} sync or billing issues are visible. Review Airtable mirror consistency before relying on this pack.`, actionLabel: 'Review sync issues', predicate: syncIssuePredicate });
  }
  if (topClient && topClientShare >= 30) {
    insights.push({ id: 'client-concentration', tone: 'info', category: 'Finance', title: `${topClient.client} represents ${topClientShare}% of filtered revenue`, body: 'Client concentration is useful for account review, but it can distort operational or finance trend interpretation.', actionLabel: 'Open client records', predicate: (job: Booking) => getCompanyName(job) === topClient.client });
  }
  if (insights.length === 0) {
    insights.push({ id: 'healthy', tone: 'positive', category: 'Process', title: 'No immediate report exceptions detected', body: 'The current filters do not show unpaid exposure, blockers, sync issues or negative margin risks.', actionLabel: 'Show all records', predicate: () => true });
  }

  return insights.slice(0, 6);
};
