import { describe, expect, it } from 'vitest';
import {
  AIRTABLE_SYNC_MAPPING_VERSION,
  AIRTABLE_WRITE_APPROVAL_TTL_MS,
  SyncWriteApprovalRun,
  validateSyncWriteApproval,
} from './syncWriteApproval';

const now = Date.parse('2026-07-22T12:00:00.000Z');
const request = {
  userId: 'admin-1',
  modules: ['translations'],
  syncStrategy: 'FULL_AUDIT',
  limitRecords: 5000,
  mappingVersion: AIRTABLE_SYNC_MAPPING_VERSION,
};

const cleanRun = (overrides: Partial<SyncWriteApprovalRun> = {}): SyncWriteApprovalRun => ({
  kind: 'AIRTABLE_SYNC_CENTER',
  dryRun: true,
  success: true,
  mappingVersion: AIRTABLE_SYNC_MAPPING_VERSION,
  syncStrategy: 'FULL_AUDIT',
  limitRecords: 5000,
  modules: ['translations'],
  userId: 'admin-1',
  finishedAt: new Date(now - 60_000).toISOString(),
  stats: { created: 1, updated: 10, skipped: 0, conflict: 2, error: 0 },
  writeApproval: { ready: true, blockerCount: 0, blockedModules: [] },
  ...overrides,
});

describe('Airtable write approval', () => {
  it('accepts a recent clean dry run with the exact write scope', () => {
    expect(validateSyncWriteApproval(cleanRun(), request, now)).toEqual({ ok: true });
  });

  it.each([
    ['mapping version', { mappingVersion: 'airtable-sync-center-v1' }, 'MAPPING_VERSION_CHANGED'],
    ['actor', { userId: 'admin-2' }, 'ACTOR_CHANGED'],
    ['strategy', { syncStrategy: 'OPEN_WORKFLOW' }, 'STRATEGY_CHANGED'],
    ['record limit', { limitRecords: 100 }, 'LIMIT_CHANGED'],
    ['module scope', { modules: ['translations', 'translationClientInvoices'] }, 'MODULE_SCOPE_CHANGED'],
  ])('rejects a changed %s', (_label, overrides, reason) => {
    expect(validateSyncWriteApproval(cleanRun(overrides), request, now)).toEqual({ ok: false, reason });
  });

  it('rejects a dry run after the approval window expires', () => {
    const run = cleanRun({ finishedAt: new Date(now - AIRTABLE_WRITE_APPROVAL_TTL_MS - 1).toISOString() });
    expect(validateSyncWriteApproval(run, request, now)).toEqual({ ok: false, reason: 'DRY_RUN_EXPIRED' });
  });

  it('rejects dry runs with errors or failed execution', () => {
    expect(validateSyncWriteApproval(cleanRun({ stats: { error: 1 } }), request, now))
      .toEqual({ ok: false, reason: 'DRY_RUN_NOT_CLEAN' });
    expect(validateSyncWriteApproval(cleanRun({ success: false }), request, now))
      .toEqual({ ok: false, reason: 'DRY_RUN_NOT_CLEAN' });
  });

  it('rejects a successful dry run with identity or workflow write blockers', () => {
    expect(validateSyncWriteApproval(cleanRun({
      writeApproval: {
        ready: false,
        blockerCount: 3,
        blockedModules: [{ module: 'clients', blockerCount: 3 }],
      },
    }), request, now)).toEqual({ ok: false, reason: 'DRY_RUN_HAS_WRITE_BLOCKERS' });
  });

  it('rejects a reservation that has already been used', () => {
    expect(validateSyncWriteApproval(cleanRun({ writeApprovalStatus: 'RESERVED' }), request, now))
      .toEqual({ ok: false, reason: 'DRY_RUN_ALREADY_USED' });
  });
});
