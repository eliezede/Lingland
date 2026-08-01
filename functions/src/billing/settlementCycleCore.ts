export type SettlementServiceCategory = 'INTERPRETATION' | 'TRANSLATION';
export type SettlementCycleStatus = 'PREPARING' | 'OPEN' | 'REVIEW' | 'APPROVED' | 'POSTED' | 'CLOSED';
export type SettlementItemStatus = 'READY' | 'INVOICED' | 'PAID' | 'EXCEPTION';

export interface SettlementCycleItemInput {
  bookingId: string;
  interpreterId: string;
  interpreterName: string;
  amount: number;
  status: SettlementItemStatus;
}

const PERIOD_KEY = /^(20\d{2})-(0[1-9]|1[0-2])$/;

export const normalizeSettlementPeriod = (value: unknown): string => {
  const period = String(value || '').trim();
  if (!PERIOD_KEY.test(period)) throw new Error('Settlement period must use YYYY-MM');
  return period;
};

export const normalizeSettlementService = (value: unknown): SettlementServiceCategory => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['INTERPRETATION', 'INTERPRETING'].includes(normalized)) return 'INTERPRETATION';
  if (['TRANSLATION', 'TRANSLATIONS'].includes(normalized)) return 'TRANSLATION';
  throw new Error('Settlement service must be INTERPRETATION or TRANSLATION');
};

export const settlementCycleId = (periodKey: string, service: SettlementServiceCategory): string => (
  `${normalizeSettlementPeriod(periodKey)}_${service.toLowerCase()}`
);

export const londonPeriodKey = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
};

export const settlementPeriodBounds = (periodKey: string) => {
  const normalized = normalizeSettlementPeriod(periodKey);
  const [year, month] = normalized.split('-').map(Number);
  const monthIndex = month - 1;
  return {
    periodStart: `${normalized}-01`,
    periodEnd: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10),
    queryStart: new Date(Date.UTC(year, monthIndex, 0)).toISOString(),
    queryEnd: new Date(Date.UTC(year, monthIndex + 1, 2)).toISOString(),
  };
};

const TRANSITIONS: Record<SettlementCycleStatus, SettlementCycleStatus[]> = {
  PREPARING: ['OPEN'],
  OPEN: ['REVIEW'],
  REVIEW: ['OPEN', 'APPROVED'],
  APPROVED: ['REVIEW', 'POSTED'],
  POSTED: ['CLOSED'],
  CLOSED: [],
};

export const canTransitionSettlementCycle = (
  from: SettlementCycleStatus,
  to: SettlementCycleStatus,
): boolean => TRANSITIONS[from]?.includes(to) || false;

export const summarizeSettlementItems = (items: SettlementCycleItemInput[]) => {
  const bookingIds = new Set(items.map(item => item.bookingId).filter(Boolean));
  const professionals = new Set(items.map(item => item.interpreterId).filter(id => id && id !== 'unassigned'));
  return {
    jobCount: bookingIds.size,
    professionalCount: professionals.size,
    readyCount: items.filter(item => item.status === 'READY').length,
    invoicedCount: items.filter(item => item.status === 'INVOICED').length,
    paidCount: items.filter(item => item.status === 'PAID').length,
    exceptionCount: items.filter(item => item.status === 'EXCEPTION').length,
    totalAmount: Number(items.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0).toFixed(2)),
    readyAmount: Number(items.filter(item => item.status === 'READY').reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0).toFixed(2)),
  };
};
