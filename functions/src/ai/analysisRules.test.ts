import { describe, expect, it } from 'vitest';
import { AIReviewContext, analyseOperationalContext } from './contextBuilder';

const job = (overrides: Partial<AIReviewContext['jobs'][number]> = {}): AIReviewContext['jobs'][number] => ({
  localId: 'job-1',
  opaqueId: 'opaque-job-1',
  entityLabel: 'LING26.17001 Polish',
  status: 'INCOMING',
  date: '2026-07-15',
  startTime: '10:00',
  durationMinutes: 60,
  serviceCategory: 'INTERPRETATION',
  languageFrom: 'English',
  languageTo: 'Polish',
  locationType: 'ONLINE',
  assigned: false,
  syncStatus: 'SYNCED',
  timesheetStatus: 'UNKNOWN',
  clientInvoiceStatus: 'UNKNOWN',
  interpreterInvoiceStatus: 'UNKNOWN',
  hasClientInvoice: false,
  hasInterpreterInvoice: false,
  hasCostCode: true,
  clientAmount: null,
  professionalCost: null,
  ...overrides,
});

const context = (overrides: Partial<AIReviewContext> = {}): AIReviewContext => ({
  scope: 'PLATFORM',
  generatedAt: '2026-07-16T12:00:00.000Z',
  jobs: [],
  clientInvoices: [],
  interpreterInvoices: [],
  syncConflicts: [],
  entityLookup: {},
  providerContext: {},
  dataSummary: { jobs: 0, clientInvoices: 0, interpreterInvoices: 0, syncConflicts: 0 },
  ...overrides,
});

describe('AI deterministic operational analysis', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');

  it('flags an overdue job without a professional', () => {
    const findings = analyseOperationalContext(context({ scope: 'JOBS', jobs: [job()] }), now);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'REVIEW_OVERDUE_JOB', entityId: 'job-1', confidence: 94 }),
    ]));
  });

  it('flags delivered work without a client invoice', () => {
    const findings = analyseOperationalContext(context({
      scope: 'BILLING',
      jobs: [job({ status: 'READY_FOR_INVOICE', assigned: true })],
    }), now);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'REVIEW_BILLING_GAP', entityId: 'job-1' }),
    ]));
  });

  it('flags a possible negative margin without exposing personal fields', () => {
    const findings = analyseOperationalContext(context({
      scope: 'COST',
      jobs: [job({ assigned: true, clientAmount: 80, professionalCost: 95 })],
    }), now);
    const finding = findings.find(item => item.action === 'REVIEW_COST_ANOMALY');
    expect(finding).toBeDefined();
    expect(JSON.stringify(finding)).not.toMatch(/email|phone|patient|address/i);
  });

  it('does not flag healthy paid work as an assignment problem', () => {
    const findings = analyseOperationalContext(context({
      scope: 'JOBS',
      jobs: [job({ status: 'PAID', assigned: true, hasClientInvoice: true })],
    }), now);
    expect(findings).toHaveLength(0);
  });
});
