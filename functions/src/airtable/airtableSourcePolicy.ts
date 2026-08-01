export type AirtableSourceExclusion = {
  sourceTable: string;
  sourceRecordId: string;
  reason: string;
};

const SOURCE_EXCLUSIONS: AirtableSourceExclusion[] = [
  {
    sourceTable: 'Web translations',
    sourceRecordId: 'recgjQV5LKVHldhdS',
    reason: 'Historical Airtable form test with placeholder client data.',
  },
];

const exclusionKey = (sourceTable: string, sourceRecordId: string) => (
  `${sourceTable.trim().toLowerCase()}|${sourceRecordId.trim()}`
);

const exclusionsByKey = new Map(
  SOURCE_EXCLUSIONS.map(exclusion => [
    exclusionKey(exclusion.sourceTable, exclusion.sourceRecordId),
    exclusion,
  ]),
);

export const getAirtableSourceExclusion = (
  sourceTable: string,
  sourceRecordId: string,
): AirtableSourceExclusion | undefined => (
  exclusionsByKey.get(exclusionKey(sourceTable, sourceRecordId))
);
