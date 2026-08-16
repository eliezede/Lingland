"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAirtableSessionType = exports.AIRTABLE_SESSION_TYPE_MAPPING_VERSION = void 0;
exports.AIRTABLE_SESSION_TYPE_MAPPING_VERSION = 'airtable-session-type-v1';
const mapAirtableSessionType = (sourceValue, locationType) => {
    const raw = String(sourceValue || '').trim();
    const normalized = raw.toLowerCase();
    if (/telephone|\bphone\b|\bopi\b|audio/.test(normalized)) {
        return { serviceType: 'Telephone', sessionMode: 'Over the Phone' };
    }
    if (/video|videocall|\bvri\b|virtual|remote|online|zoom|teams/.test(normalized)) {
        return { serviceType: 'Video Call', sessionMode: 'Videocall' };
    }
    if (/face[\s-]*to[\s-]*face|\bf2f\b|on[\s-]*site|in[\s-]*person/.test(normalized)) {
        return { serviceType: 'Face-to-Face', sessionMode: 'Face-to-Face' };
    }
    if (raw) {
        return {
            serviceType: raw,
            sessionMode: locationType === 'ONLINE' ? 'Videocall' : 'Face-to-Face',
        };
    }
    return locationType === 'ONLINE'
        ? { serviceType: 'Video Call', sessionMode: 'Videocall' }
        : { serviceType: 'Face-to-Face', sessionMode: 'Face-to-Face' };
};
exports.mapAirtableSessionType = mapAirtableSessionType;
//# sourceMappingURL=sessionTypeMapping.js.map