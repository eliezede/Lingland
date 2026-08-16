import { describe, expect, it } from 'vitest';
import { mapAirtableSessionType } from './sessionTypeMapping';

describe('Airtable session type mapping', () => {
  it('maps telephone aliases to the platform service and billing mode', () => {
    expect(mapAirtableSessionType('Over the Phone', 'ONLINE')).toEqual({
      serviceType: 'Telephone',
      sessionMode: 'Over the Phone',
    });
  });

  it('maps video aliases to the platform service and billing mode', () => {
    expect(mapAirtableSessionType('MS Teams video', 'ONLINE')).toEqual({
      serviceType: 'Video Call',
      sessionMode: 'Videocall',
    });
  });

  it('maps face-to-face aliases to the platform service and billing mode', () => {
    expect(mapAirtableSessionType('On-site', 'ONSITE')).toEqual({
      serviceType: 'Face-to-Face',
      sessionMode: 'Face-to-Face',
    });
  });

  it('preserves an unfamiliar source value for auditability', () => {
    expect(mapAirtableSessionType('Hybrid pilot', 'ONLINE')).toEqual({
      serviceType: 'Hybrid pilot',
      sessionMode: 'Videocall',
    });
  });
});
