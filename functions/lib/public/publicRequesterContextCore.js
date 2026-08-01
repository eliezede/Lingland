"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePublicRequesterSelection = exports.normalizePublicDepartmentName = void 0;
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizePublicDepartmentName = (value) => text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
exports.normalizePublicDepartmentName = normalizePublicDepartmentName;
const validatePublicRequesterSelection = (token, input) => {
    if (token.version !== 1
        || !token.authUid
        || token.authUid !== text(input.authUid)
        || !token.emailHash
        || token.emailHash !== text(input.emailHash)) {
        return { ok: false, code: 'TOKEN_INVALID', message: 'The requester suggestion has expired or does not match this session.' };
    }
    if (!Number.isFinite(token.expiresAtMs) || token.expiresAtMs <= input.nowMs) {
        return { ok: false, code: 'TOKEN_EXPIRED', message: 'The requester suggestion has expired. Check the email again.' };
    }
    const requestedClientId = text(input.clientId);
    const client = token.clients.find(item => text(item.clientId) === requestedClientId);
    if (!requestedClientId || !client) {
        return { ok: false, code: 'CLIENT_NOT_ALLOWED', message: 'Select an organisation linked to this requester email.' };
    }
    const departmentId = text(input.departmentId);
    const proposedDepartmentName = text(input.proposedDepartmentName).slice(0, 160);
    if (departmentId && proposedDepartmentName) {
        return { ok: false, code: 'DEPARTMENT_CONFLICT', message: 'Select an existing department or request a new one, not both.' };
    }
    if (departmentId && !client.allowedDepartmentIds.map(text).includes(departmentId)) {
        return { ok: false, code: 'DEPARTMENT_NOT_ALLOWED', message: 'The selected department is outside this requester scope.' };
    }
    if (proposedDepartmentName && proposedDepartmentName.length < 2) {
        return { ok: false, code: 'DEPARTMENT_NAME_INVALID', message: 'Enter a valid department name.' };
    }
    return { ok: true, client, departmentId, proposedDepartmentName };
};
exports.validatePublicRequesterSelection = validatePublicRequesterSelection;
//# sourceMappingURL=publicRequesterContextCore.js.map