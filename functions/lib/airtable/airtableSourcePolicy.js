"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAirtableSourceExclusion = void 0;
const SOURCE_EXCLUSIONS = [
    {
        sourceTable: 'Web translations',
        sourceRecordId: 'recgjQV5LKVHldhdS',
        reason: 'Historical Airtable form test with placeholder client data.',
    },
];
const exclusionKey = (sourceTable, sourceRecordId) => (`${sourceTable.trim().toLowerCase()}|${sourceRecordId.trim()}`);
const exclusionsByKey = new Map(SOURCE_EXCLUSIONS.map(exclusion => [
    exclusionKey(exclusion.sourceTable, exclusion.sourceRecordId),
    exclusion,
]));
const getAirtableSourceExclusion = (sourceTable, sourceRecordId) => (exclusionsByKey.get(exclusionKey(sourceTable, sourceRecordId)));
exports.getAirtableSourceExclusion = getAirtableSourceExclusion;
//# sourceMappingURL=airtableSourcePolicy.js.map