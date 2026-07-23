export type ClientCrmReviewScope = {
  sourceTable: string;
  groupKey: string;
};

export const clientCrmReviewKey = (sourceTable: string, groupKey: string) => (
  `${sourceTable}|${groupKey}`
);

export const deduplicateClientCrmReviewScopes = <T extends ClientCrmReviewScope>(candidates: T[]): T[] => {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = clientCrmReviewKey(candidate.sourceTable, candidate.groupKey);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
