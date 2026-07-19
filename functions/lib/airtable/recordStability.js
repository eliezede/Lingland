"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeAirtableSnapshots = exports.fingerprintAirtableSnapshot = exports.hashAirtableRecordFields = void 0;
const crypto_1 = require("crypto");
const canonicalize = (value) => {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
            const entry = value[key];
            if (entry !== undefined)
                result[key] = canonicalize(entry);
            return result;
        }, {});
    }
    if (typeof value === 'number' && !Number.isFinite(value))
        return String(value);
    return value;
};
const sha256 = (value) => (0, crypto_1.createHash)('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
const hashAirtableRecordFields = (fields) => sha256(fields);
exports.hashAirtableRecordFields = hashAirtableRecordFields;
const fingerprintAirtableSnapshot = (records) => sha256(records
    .map(record => ({ id: record.id, fieldsHash: (0, exports.hashAirtableRecordFields)(record.fields) }))
    .sort((left, right) => left.id.localeCompare(right.id)));
exports.fingerprintAirtableSnapshot = fingerprintAirtableSnapshot;
const mergeAirtableSnapshots = (...snapshots) => {
    const recordsById = new Map();
    snapshots.forEach(records => records.forEach(record => recordsById.set(record.id, record)));
    return Array.from(recordsById.values()).sort((left, right) => left.id.localeCompare(right.id));
};
exports.mergeAirtableSnapshots = mergeAirtableSnapshots;
//# sourceMappingURL=recordStability.js.map