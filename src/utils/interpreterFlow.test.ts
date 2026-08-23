import { describe, expect, it } from 'vitest';
import { buildInterpreterSelfServicePatch } from './interpreterFlow';

describe('interpreter self-service profile patch', () => {
  it('keeps editable profile fields and strips operational fields', () => {
    const patch = buildInterpreterSelfServicePatch({
      name: 'Eli Andrade',
      phone: '07123456789',
      languages: ['English', 'Polish'],
      rates: { stF2F: 999 } as any,
      sourceSystem: 'AIRTABLE' as any,
      status: 'ACTIVE',
    });

    expect(patch).toMatchObject({
      name: 'Eli Andrade',
      phone: '07123456789',
      languages: ['English', 'Polish'],
    });
    expect(patch).not.toHaveProperty('rates');
    expect(patch).not.toHaveProperty('sourceSystem');
    expect(patch).not.toHaveProperty('status');
  });

  it('only includes the onboarding status when explicitly requested', () => {
    expect(buildInterpreterSelfServicePatch({}, { moveToOnboarding: true }).status).toBe('ONBOARDING');
  });
});
