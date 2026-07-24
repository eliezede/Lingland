"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveImportedProfessionalAccountStatus = exports.resolveImportedProfessionalStatus = exports.mergeProfessionalRows = exports.isProfessionalPortalEligible = exports.professionalProfileStatus = exports.selectProfessionalSourceStatus = exports.normalizeProfessionalSourceStatus = void 0;
const identityMatching_1 = require("./identityMatching");
const text = (value) => {
    if (Array.isArray(value))
        return text(value[0]);
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object') {
        const candidate = value;
        return candidate.name === undefined ? '' : text(candidate.name);
    }
    return String(value).trim();
};
const cleanEmail = (value) => text(value).toLowerCase();
const normalizeProfessionalSourceStatus = (value) => {
    const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (normalized === 'active')
        return 'ACTIVE';
    if (normalized === 'inactive')
        return 'INACTIVE';
    if (normalized === 'on leave')
        return 'ON_LEAVE';
    if (normalized === 'unreliable')
        return 'UNRELIABLE';
    if (normalized === 'only transl' || normalized === 'only translation' || normalized === 'translation only') {
        return 'ONLY_TRANSL';
    }
    if (normalized === 'applicant')
        return 'APPLICANT';
    return 'UNSPECIFIED';
};
exports.normalizeProfessionalSourceStatus = normalizeProfessionalSourceStatus;
const STATUS_PRIORITY = {
    ACTIVE: 7,
    ONLY_TRANSL: 6,
    APPLICANT: 5,
    ON_LEAVE: 4,
    INACTIVE: 3,
    UNRELIABLE: 2,
    UNSPECIFIED: 1,
};
const selectProfessionalSourceStatus = (statuses) => ([...statuses].sort((left, right) => STATUS_PRIORITY[right] - STATUS_PRIORITY[left])[0] || 'UNSPECIFIED');
exports.selectProfessionalSourceStatus = selectProfessionalSourceStatus;
const professionalProfileStatus = (sourceStatus) => {
    if (sourceStatus === 'UNSPECIFIED')
        return 'IMPORTED';
    return sourceStatus;
};
exports.professionalProfileStatus = professionalProfileStatus;
const isProfessionalPortalEligible = (sourceStatus) => (sourceStatus === 'ACTIVE' || sourceStatus === 'ONLY_TRANSL');
exports.isProfessionalPortalEligible = isProfessionalPortalEligible;
const identityKeys = (record) => {
    const fields = record.fields || {};
    const name = (0, identityMatching_1.normalizeIdentityName)(text(fields['NAME MASTER']));
    const email = cleanEmail(fields.EMAIL);
    const phone = (0, identityMatching_1.normalizeIdentityPhone)(text(fields.PHONE));
    const keys = [
        email && phone ? `email-phone:${email}|${phone}` : '',
        email && name ? `email-name:${email}|${name}` : '',
        phone && name ? `phone-name:${phone}|${name}` : '',
        !email && !phone && name ? `name-only:${name}` : '',
    ].filter(Boolean);
    return keys.length ? keys : [`source:${record.id}`];
};
const createImport = (record, sourceStatus) => {
    const fields = record.fields || {};
    const name = text(fields['NAME MASTER']);
    const email = cleanEmail(fields.EMAIL);
    const phone = text(fields.PHONE);
    const language = text(fields.LANGUAGE);
    const town = text(fields.TOWN);
    const translateOrder = text(fields['Translate Order']) || 'no';
    return {
        name,
        email,
        phone,
        languages: language ? [language] : [],
        languageProficiencies: language ? [{
                language,
                l1: Number.parseInt(text(fields.L1), 10) || 18,
                translateOrder,
            }] : [],
        address: {
            street: text(fields.STREET),
            town,
            county: text(fields.COUNTY),
            postcode: text(fields.POSTCODE),
            country: text(fields.Country) || 'UK',
        },
        qualifications: text(fields.QUALIFICATIONS) ? [text(fields.QUALIFICATIONS)] : [],
        regions: town ? [town] : [],
        sourceRecordId: record.id,
        airtableRecordIds: [record.id],
        sourceSnapshot: fields,
        sourceStatus,
        sourceStatuses: [sourceStatus],
        profileStatus: (0, exports.professionalProfileStatus)(sourceStatus),
        portalEligible: (0, exports.isProfessionalPortalEligible)(sourceStatus),
        translationOnly: sourceStatus === 'ONLY_TRANSL',
        identityKeys: new Set(identityKeys(record)),
    };
};
const mergeRecord = (target, record, sourceStatus) => {
    const fields = record.fields || {};
    const language = text(fields.LANGUAGE);
    const normalizedLanguage = language.toLowerCase();
    if (language && !target.languages.some(item => item.toLowerCase() === normalizedLanguage)) {
        target.languages.push(language);
        target.languageProficiencies.push({
            language,
            l1: Number.parseInt(text(fields.L1), 10) || 18,
            translateOrder: text(fields['Translate Order']) || 'no',
        });
    }
    target.airtableRecordIds = Array.from(new Set([...target.airtableRecordIds, record.id])).sort();
    target.sourceStatuses = Array.from(new Set([...target.sourceStatuses, sourceStatus]));
    target.sourceStatus = (0, exports.selectProfessionalSourceStatus)(target.sourceStatuses);
    target.profileStatus = (0, exports.professionalProfileStatus)(target.sourceStatus);
    target.portalEligible = (0, exports.isProfessionalPortalEligible)(target.sourceStatus);
    target.translationOnly = target.sourceStatus === 'ONLY_TRANSL';
    identityKeys(record).forEach(key => target.identityKeys.add(key));
    if (!target.email)
        target.email = cleanEmail(fields.EMAIL);
    if (!target.phone)
        target.phone = text(fields.PHONE);
    if (!target.address.street)
        target.address.street = text(fields.STREET);
    if (!target.address.town)
        target.address.town = text(fields.TOWN);
    if (!target.address.county)
        target.address.county = text(fields.COUNTY);
    if (!target.address.postcode)
        target.address.postcode = text(fields.POSTCODE);
    if (!target.address.country)
        target.address.country = text(fields.Country) || 'UK';
    if (!target.regions.length && target.address.town)
        target.regions = [target.address.town];
};
const mergeProfessionalRows = (records) => {
    const groups = [];
    const keyToGroup = new Map();
    const ambiguousSourceRecordIds = [];
    for (const record of records) {
        const fields = record.fields || {};
        const name = text(fields['NAME MASTER']);
        if (!name)
            continue;
        const keys = identityKeys(record);
        const candidateGroups = Array.from(new Set(keys.map(key => keyToGroup.get(key)).filter((value) => value !== undefined)));
        if (candidateGroups.length > 1) {
            ambiguousSourceRecordIds.push(record.id);
        }
        const groupIndex = candidateGroups.length === 1 ? candidateGroups[0] : groups.length;
        const sourceStatus = (0, exports.normalizeProfessionalSourceStatus)(fields['active!']);
        if (groupIndex === groups.length)
            groups.push(createImport(record, sourceStatus));
        else
            mergeRecord(groups[groupIndex], record, sourceStatus);
        keys.forEach(key => {
            if (!keyToGroup.has(key))
                keyToGroup.set(key, groupIndex);
        });
    }
    return {
        imports: groups.map(({ identityKeys: _identityKeys, ...item }) => item),
        ambiguousSourceRecordIds,
    };
};
exports.mergeProfessionalRows = mergeProfessionalRows;
const resolveImportedProfessionalStatus = (incomingStatus, existingStatus) => {
    const normalizedExisting = String(existingStatus || '').trim().toUpperCase();
    if (['BLOCKED', 'SUSPENDED', 'ONBOARDING'].includes(normalizedExisting)) {
        return normalizedExisting;
    }
    return incomingStatus;
};
exports.resolveImportedProfessionalStatus = resolveImportedProfessionalStatus;
const resolveImportedProfessionalAccountStatus = (accountEligible, existingStatus) => {
    if (!accountEligible)
        return 'SUSPENDED';
    const normalizedExisting = String(existingStatus || '').trim().toUpperCase();
    if (['ACTIVE', 'PENDING', 'SUSPENDED', 'IMPORTED'].includes(normalizedExisting)) {
        return normalizedExisting;
    }
    return 'IMPORTED';
};
exports.resolveImportedProfessionalAccountStatus = resolveImportedProfessionalAccountStatus;
//# sourceMappingURL=professionalImportPolicy.js.map