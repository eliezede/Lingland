"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickExactLinkedRecordIds = void 0;
const normalizeFieldKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeLinkedValue = (value) => {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return '';
};
const pickExactLinkedRecordIds = (fields, fieldNames) => {
    const requestedFields = new Set(fieldNames.map(normalizeFieldKey));
    const values = Object.entries(fields).flatMap(([fieldName, value]) => {
        if (!requestedFields.has(normalizeFieldKey(fieldName)))
            return [];
        const rawValues = Array.isArray(value) ? value : [value];
        return rawValues.map(normalizeLinkedValue).filter(Boolean);
    });
    return Array.from(new Set(values));
};
exports.pickExactLinkedRecordIds = pickExactLinkedRecordIds;
//# sourceMappingURL=linkedRecordExtraction.js.map