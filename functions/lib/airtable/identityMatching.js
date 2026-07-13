"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUniquePhoneCandidate = exports.normalizeIdentityPhone = exports.normalizeIdentityName = void 0;
const normalizeIdentityName = (value) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
exports.normalizeIdentityName = normalizeIdentityName;
const normalizeIdentityPhone = (value) => {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.startsWith('0044'))
        digits = digits.slice(4);
    else if (digits.startsWith('44'))
        digits = digits.slice(2);
    if (!digits.startsWith('0') && digits.length === 10)
        digits = `0${digits}`;
    return digits;
};
exports.normalizeIdentityPhone = normalizeIdentityPhone;
const findUniquePhoneCandidate = (items, phone) => {
    const normalized = (0, exports.normalizeIdentityPhone)(phone);
    if (!normalized)
        return null;
    const matches = items.filter(item => ((0, exports.normalizeIdentityPhone)(String(item.normalizedPhone || item.phone || '')) === normalized));
    return matches.length === 1 ? matches[0] : null;
};
exports.findUniquePhoneCandidate = findUniquePhoneCandidate;
//# sourceMappingURL=identityMatching.js.map