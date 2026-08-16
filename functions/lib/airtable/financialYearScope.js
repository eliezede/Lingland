"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeAirtableRecordsToFinancialYear = exports.financialYearDateFieldsForTable = void 0;
const sourceReconciliationCore_1 = require("../accounting/sourceReconciliationCore");
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
const TABLE_DATE_FIELDS = {
    REDBOOK: WORKFLOW_DATE_FIELDS,
    Translations: TRANSLATION_DATE_FIELDS,
    'Web translations': TRANSLATION_DATE_FIELDS,
    Invoices: INVOICE_DATE_FIELDS,
    'INV interp': INVOICE_DATE_FIELDS,
    'TR invoices': INVOICE_DATE_FIELDS,
    'INV TR': INVOICE_DATE_FIELDS,
};
const financialYearDateFieldsForTable = (tableName) => (TABLE_DATE_FIELDS[tableName] || []);
exports.financialYearDateFieldsForTable = financialYearDateFieldsForTable;
const scopeAirtableRecordsToFinancialYear = (records, tableName, referenceDate, startMonth = 4, startDay = 1) => {
    const window = (0, sourceReconciliationCore_1.deriveFinancialYearWindow)(referenceDate, startMonth, startDay);
    const dateFields = (0, exports.financialYearDateFieldsForTable)(tableName);
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
            .map(field => (0, sourceReconciliationCore_1.toIsoDay)(record.fields[field]))
            .find((candidate) => Boolean(candidate))
            || (0, sourceReconciliationCore_1.toIsoDay)(record.createdTime);
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
exports.scopeAirtableRecordsToFinancialYear = scopeAirtableRecordsToFinancialYear;
//# sourceMappingURL=financialYearScope.js.map