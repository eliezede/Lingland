export type ClientIdentityDecisionType = 'DEFERRED' | 'REJECTED' | 'SPLIT';

export interface ClientIdentityDecisionRecord {
  id: string;
  candidateId: string;
  candidateFingerprint: string;
  kind: 'ORGANIZATION' | 'AGENT';
  decision: ClientIdentityDecisionType;
  candidateLabel: string;
  clientIds: string[];
  partitions: string[][];
  reason: string;
  notes: string;
  revisitAt: string;
  active: boolean;
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

const clean = (value: unknown) => String(value ?? '').trim();
const unique = (values: unknown[]) => Array.from(new Set(values.map(clean).filter(Boolean))).sort((left, right) => left.localeCompare(right));
const pairKey = (left: string, right: string) => [left, right].sort().join('|');

export const normalizeDecisionPartitions = (clientIds: string[], rawPartitions: unknown): string[][] => {
  const expected = unique(clientIds);
  if (!Array.isArray(rawPartitions)) return [];
  const partitions = rawPartitions
    .filter(Array.isArray)
    .map(partition => unique(partition as unknown[]))
    .filter(partition => partition.length > 0)
    .sort((left, right) => left.join('|').localeCompare(right.join('|')));
  const assigned = partitions.flat();
  if (partitions.length < 2 || assigned.length !== expected.length) return [];
  if (new Set(assigned).size !== assigned.length) return [];
  if (assigned.slice().sort().join('|') !== expected.join('|')) return [];
  return partitions;
};

export const buildExcludedOrganizationPairs = (decisions: ClientIdentityDecisionRecord[]) => {
  const excluded = new Set<string>();
  decisions.filter(decision => decision.active && decision.kind === 'ORGANIZATION').forEach(decision => {
    const clientIds = unique(decision.clientIds);
    if (decision.decision === 'REJECTED') {
      for (let left = 0; left < clientIds.length; left += 1) {
        for (let right = left + 1; right < clientIds.length; right += 1) {
          excluded.add(pairKey(clientIds[left], clientIds[right]));
        }
      }
      return;
    }
    if (decision.decision !== 'SPLIT') return;
    const partitions = normalizeDecisionPartitions(clientIds, decision.partitions);
    for (let leftGroup = 0; leftGroup < partitions.length; leftGroup += 1) {
      for (let rightGroup = leftGroup + 1; rightGroup < partitions.length; rightGroup += 1) {
        partitions[leftGroup].forEach(leftId => {
          partitions[rightGroup].forEach(rightId => excluded.add(pairKey(leftId, rightId)));
        });
      }
    }
  });
  return Array.from(excluded).sort((left, right) => left.localeCompare(right));
};
