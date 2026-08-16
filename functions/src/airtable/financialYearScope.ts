import {
  deriveFinancialYearWindow,
  FinancialYearWindow,
  toIsoDay,
} from '../accounting/sourceReconciliationCore';

export type FinancialYearScopeRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export type FinancialYearScopeSelection<T extends FinancialYearScopeRecord> = {
  records: T[];
  excludedRecords: number;
  undatedRecords: number;
  scopeApplied: boolean;
  window: FinancialYearWindow;
  dateFields: string[];
};

const WORKFLOW_DATE_FIELDS = [
  'Booking Date & Time',
  'Booked For',
  'Date & Time',
  'Start Date Time',
  'Appointment',
  'Booking Date',
  'Session Date',
  'Booked Date',
];

const TRANSLATION_DATE_FIELDS = [
  'TR CREATED',
  'Created',
  'COMPLETED',
  'Deadline',
  'Delivery Date',
  'Due Date',
  'TR Deadline',
  'Required by',
];

const INVOICE_DATE_FIELDS = [
  'Invoice Date',
  'Issue Date',
  'Invoiced on',
  'Date Invoiced',
  'Submitted Date',
  'COMPLETED',
  'Paid Date',
  'Payment Date',
  'Date Paid',
];

const TABLE_DATE_FIELDS: Record<string, string[]> = {
  REDBOOK: WORKFLOW_DATE_FIELDS,
  Translations: TRANSLATION_DATE_FIELDS,
  'Web translations': TRANSLATION_DATE_FIELDS,
  Invoices: INVOICE_DATE_FIELDS,
  'INV interp': INVOICE_DATE_FIELDS,
  'TR invoices': INVOICE_DATE_FIELDS,
  'INV TR': INVOICE_DATE_FIELDS,
};

export const financialYearDateFieldsForTable = (tableName: string): string[] => (
  TABLE_DATE_FIELDS[tableName] || []
);

export const scopeAirtableRecordsToFinancialYear = <T extends FinancialYearScopeRecord>(
  records: T[],
  tableName: string,
  referenceDate: unknown,
  startMonth = 4,
  startDay = 1,
): FinancialYearScopeSelection<T> => {
  const window = deriveFinancialYearWindow(referenceDate, startMonth, startDay);
  const dateFields = financialYearDateFieldsForTable(tableName);
  if (!dateFields.length) {
    return {
      records,
      excludedRecords: 0,
      undatedRecords: 0,
      scopeApplied: false,
      window,
      dateFields,
    };
  }

  let undatedRecords = 0;
  const selected = records.filter(record => {
    const recordDay = dateFields
      .map(field => toIsoDay(record.fields[field]))
      .find((candidate): candidate is string => Boolean(candidate))
      || toIsoDay(record.createdTime);
    if (!recordDay) {
      undatedRecords += 1;
      return false;
    }
    return recordDay >= window.start && recordDay <= window.end;
  });

  return {
    records: selected,
    excludedRecords: records.length - selected.length,
    undatedRecords,
    scopeApplied: true,
    window,
    dateFields,
  };
};
