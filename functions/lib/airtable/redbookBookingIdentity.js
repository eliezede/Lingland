"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canReuseLegacyBookingIdentity = void 0;
const identityValue = (value) => String(value || '').trim().toLowerCase();
const canReuseLegacyBookingIdentity = (existing, incomingLegacyRef) => {
    if (identityValue(existing.sourceRecordId))
        return false;
    const existingLegacyRef = identityValue(existing.legacyAirtableRef);
    const incomingRef = identityValue(incomingLegacyRef);
    return !incomingRef || !existingLegacyRef || existingLegacyRef === incomingRef;
};
exports.canReuseLegacyBookingIdentity = canReuseLegacyBookingIdentity;
//# sourceMappingURL=redbookBookingIdentity.js.map