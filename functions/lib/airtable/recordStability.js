"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeAirtableSnapshots = exports.fingerprintAirtableSnapshot = exports.hashAirtableRecordFields = exports.hashStableValue = exports.stabilizeAirtableAttachments = void 0;
const crypto_1 = require("crypto");
const text = (value) => String(value || '').trim();
const stableUrl = (value) => {
    const raw = text(value);
    if (!raw)
        return '';
    try {
        const url = new URL(raw);
        return `${url.origin}${url.pathname}`;
    }
    catch {
        return raw.split(/[?#]/)[0];
    }
};
const stabilizeAirtableAttachments = (attachments) => attachments
    .map(attachment => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        const url = stableUrl(attachment);
        return url ? { url } : null;
    }
    const value = attachment;
    const id = text(value.id);
    const name = text(value.filename) || text(value.name);
    const type = text(value.type);
    const size = Number(value.size);
    const url = id || name ? '' : stableUrl(value.url);
    if (!id && !name && !url)
        return null;
    return {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(type ? { type } : {}),
        ...(Number.isFinite(size) && size > 0 ? { size } : {}),
        ...(url ? { url } : {}),
    };
})
    .filter(Boolean)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
exports.stabilizeAirtableAttachments = stabilizeAirtableAttachments;
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
const hashStableValue = (value) => (0, crypto_1.createHash)('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
exports.hashStableValue = hashStableValue;
const hashAirtableRecordFields = (fields) => (0, exports.hashStableValue)(fields);
exports.hashAirtableRecordFields = hashAirtableRecordFields;
const fingerprintAirtableSnapshot = (records) => (0, exports.hashStableValue)(records
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