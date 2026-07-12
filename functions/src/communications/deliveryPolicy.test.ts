import { describe, expect, it } from 'vitest';
import { canDeliverCommunication, normalizeCommunicationMode } from './deliveryPolicy';

describe('communication delivery policy', () => {
  it('defaults unknown or missing configuration to suppressed', () => {
    expect(normalizeCommunicationMode(undefined)).toBe('SUPPRESSED');
    expect(normalizeCommunicationMode('unexpected')).toBe('SUPPRESSED');
  });

  it('blocks every recipient in suppressed mode', () => {
    expect(canDeliverCommunication('SUPPRESSED', 'ADMIN')).toBe(false);
    expect(canDeliverCommunication('SUPPRESSED', 'INTERPRETER')).toBe(false);
    expect(canDeliverCommunication('SUPPRESSED', 'CLIENT')).toBe(false);
  });

  it('allows only internal recipients in internal modes', () => {
    expect(canDeliverCommunication('INTERNAL_ONLY', 'STAFF')).toBe(true);
    expect(canDeliverCommunication('SELECTIVE_LIVE', 'FINANCE')).toBe(true);
    expect(canDeliverCommunication('INTERNAL_ONLY', 'INTERPRETER')).toBe(false);
  });

  it('allows all recipients only in live mode', () => {
    expect(canDeliverCommunication('LIVE', 'CLIENT')).toBe(true);
    expect(canDeliverCommunication('LIVE', 'INTERPRETER')).toBe(true);
  });
});
