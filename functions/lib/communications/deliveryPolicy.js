"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDeliverCommunication = exports.isInternalRecipientType = exports.normalizeCommunicationMode = void 0;
const INTERNAL_RECIPIENTS = new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'STAFF', 'COORDINATOR']);
const normalizeCommunicationMode = (value) => {
    const mode = String(value || '').toUpperCase();
    return ['SUPPRESSED', 'INTERNAL_ONLY', 'SELECTIVE_LIVE', 'LIVE'].includes(mode)
        ? mode
        : 'SUPPRESSED';
};
exports.normalizeCommunicationMode = normalizeCommunicationMode;
const isInternalRecipientType = (recipientType) => (INTERNAL_RECIPIENTS.has(String(recipientType || '').toUpperCase()));
exports.isInternalRecipientType = isInternalRecipientType;
const canDeliverCommunication = (modeValue, recipientType) => {
    const mode = (0, exports.normalizeCommunicationMode)(modeValue);
    if (mode === 'LIVE')
        return true;
    if (mode === 'SUPPRESSED')
        return false;
    return (0, exports.isInternalRecipientType)(recipientType);
};
exports.canDeliverCommunication = canDeliverCommunication;
//# sourceMappingURL=deliveryPolicy.js.map