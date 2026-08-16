"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAccountingJobLink = exports.deriveFinancialYearWindow = exports.intersectCoverageWindows = exports.intersectWithAccountingSnapshot = exports.deriveObservedSourceWindow = exports.toIsoDay = void 0;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UK_DAY_PATTERN = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\D|$)/;
const toIsoDay = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const raw = String(value ?? '').trim();
    if (!raw)
        return null;
    const direct = raw.slice(0, 10);
    if (ISO_DAY_PATTERN.test(direct)) {
        const parsed = new Date(`${direct}T00:00:00.000Z`);
        return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== direct
            ? null
            : direct;
    }
    const ukDate = raw.match(UK_DAY_PATTERN);
    if (ukDate) {
        const [, dayText, monthText, yearText] = ukDate;
        const day = Number(dayText);
        const month = Number(monthText);
        const year = Number(yearText);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year
            && parsed.getUTCMonth() === month - 1
            && parsed.getUTCDate() === day
            ? parsed.toISOString().slice(0, 10)
            : null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
exports.toIsoDay = toIsoDay;
const deriveObservedSourceWindow = (records, dateFields) => {
    const dates = [];
    let missingDateCount = 0;
    records.forEach(record => {
        const date = dateFields
            .map(field => (0, exports.toIsoDay)(record[field]))
            .find((candidate) => Boolean(candidate));
        if (date)
            dates.push(date);
        else
            missingDateCount += 1;
    });
    dates.sort();
    return {
        start: dates[0] || null,
        end: dates[dates.length - 1] || null,
        validDateCount: dates.length,
        missingDateCount,
    };
};
exports.deriveObservedSourceWindow = deriveObservedSourceWindow;
const intersectWithAccountingSnapshot = (airtableWindow, sageSourceAsOf) => {
    const sageEnd = (0, exports.toIsoDay)(sageSourceAsOf);
    if (!airtableWindow.start || !airtableWindow.end || !sageEnd) {
        return { start: null, end: null };
    }
    const end = airtableWindow.end < sageEnd ? airtableWindow.end : sageEnd;
    return airtableWindow.start <= end
        ? { start: airtableWindow.start, end }
        : { start: null, end: null };
};
exports.intersectWithAccountingSnapshot = intersectWithAccountingSnapshot;
const intersectCoverageWindows = (left, right) => {
    if (!left.start || !left.end || !right.start || !right.end) {
        return { start: null, end: null };
    }
    const start = left.start > right.start ? left.start : right.start;
    const end = left.end < right.end ? left.end : right.end;
    return start <= end ? { start, end } : { start: null, end: null };
};
exports.intersectCoverageWindows = intersectCoverageWindows;
const deriveFinancialYearWindow = (referenceDate, startMonth, startDay) => {
    const referenceDay = (0, exports.toIsoDay)(referenceDate);
    if (!referenceDay || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
        throw new Error('A valid reference date and financial year start month are required.');
    }
    const referenceYear = Number(referenceDay.slice(0, 4));
    const candidateStart = new Date(Date.UTC(referenceYear, startMonth - 1, startDay));
    if (!Number.isInteger(startDay)
        || startDay < 1
        || candidateStart.getUTCMonth() !== startMonth - 1
        || candidateStart.getUTCDate() !== startDay) {
        throw new Error('The configured financial year start day is invalid.');
    }
    const candidateIso = candidateStart.toISOString().slice(0, 10);
    const startYear = referenceDay >= candidateIso ? referenceYear : referenceYear - 1;
    const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const nextStart = new Date(Date.UTC(startYear + 1, startMonth - 1, startDay));
    const end = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        label: `${startYear}/${String(startYear + 1).slice(-2)}`,
        startMonth,
        startDay,
    };
};
exports.deriveFinancialYearWindow = deriveFinancialYearWindow;
const classifyAccountingJobLink = (input) => {
    const accountingDate = (0, exports.toIsoDay)(input.accountingDate);
    const sageEnd = (0, exports.toIsoDay)(input.sageSourceAsOf);
    if (!accountingDate || !input.airtableWindow.start || !input.airtableWindow.end || !sageEnd) {
        return 'INVALID_DATE';
    }
    if (accountingDate > sageEnd)
        return 'AFTER_SAGE_SNAPSHOT';
    if (accountingDate < input.airtableWindow.start || accountingDate > input.airtableWindow.end) {
        return 'OUTSIDE_AIRTABLE_COVERAGE';
    }
    return input.hasExactJobReference
        ? 'ELIGIBLE_EXACT_REFERENCE'
        : 'IN_PERIOD_REFERENCE_REQUIRED';
};
exports.classifyAccountingJobLink = classifyAccountingJobLink;
//# sourceMappingURL=sourceReconciliationCore.js.map