import { describe, expect, it } from 'vitest';
import {
  mergeProfessionalRows,
  normalizeProfessionalSourceStatus,
  resolveImportedProfessionalAccountStatus,
  resolveImportedProfessionalStatus,
} from './professionalImportPolicy';

describe('professional import policy', () => {
  it('preserves every Airtable status used by the professional directory', () => {
    expect(normalizeProfessionalSourceStatus('active')).toBe('ACTIVE');
    expect(normalizeProfessionalSourceStatus('inactive')).toBe('INACTIVE');
    expect(normalizeProfessionalSourceStatus('on leave')).toBe('ON_LEAVE');
    expect(normalizeProfessionalSourceStatus('unreliable')).toBe('UNRELIABLE');
    expect(normalizeProfessionalSourceStatus('only transl')).toBe('ONLY_TRANSL');
    expect(normalizeProfessionalSourceStatus('Applicant')).toBe('APPLICANT');
    expect(normalizeProfessionalSourceStatus('')).toBe('UNSPECIFIED');
  });

  it('merges language rows using strong identity pairs and keeps every source record id', () => {
    const result = mergeProfessionalRows([
      {
        id: 'recPolish',
        fields: {
          'NAME MASTER': 'Example Person',
          EMAIL: 'person@example.com',
          PHONE: '+44 7700 900123',
          LANGUAGE: 'POLISH',
          L1: '2',
          'Translate Order': 'yes',
          'active!': 'active',
        },
      },
      {
        id: 'recRussian',
        fields: {
          'NAME MASTER': 'Example Person ',
          EMAIL: 'PERSON@example.com',
          PHONE: '07700 900123',
          LANGUAGE: 'RUSSIAN',
          L1: '4',
          'Translate Order': 'no',
          'active!': 'active',
        },
      },
    ]);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toMatchObject({
      sourceStatus: 'ACTIVE',
      profileStatus: 'ACTIVE',
      portalEligible: true,
      airtableRecordIds: ['recPolish', 'recRussian'],
      languages: ['POLISH', 'RUSSIAN'],
    });
    expect(result.imports[0].languageProficiencies).toEqual([
      { language: 'POLISH', l1: 2, translateOrder: 'yes' },
      { language: 'RUSSIAN', l1: 4, translateOrder: 'no' },
    ]);
  });

  it('does not merge people who merely share an email address', () => {
    const result = mergeProfessionalRows([
      {
        id: 'recOne',
        fields: {
          'NAME MASTER': 'First Person',
          EMAIL: 'shared@example.com',
          PHONE: '07700 900111',
          'active!': 'inactive',
        },
      },
      {
        id: 'recTwo',
        fields: {
          'NAME MASTER': 'Second Person',
          EMAIL: 'shared@example.com',
          PHONE: '07700 900222',
          'active!': 'inactive',
        },
      },
    ]);

    expect(result.imports).toHaveLength(2);
  });

  it('creates a passive profile identity even when no email is available', () => {
    const result = mergeProfessionalRows([{
      id: 'recPassive',
      fields: {
        'NAME MASTER': 'Historic Professional',
        PHONE: '07700 900333',
        LANGUAGE: 'FRENCH',
        'active!': 'inactive',
      },
    }]);

    expect(result.imports[0]).toMatchObject({
      email: '',
      sourceStatus: 'INACTIVE',
      profileStatus: 'INACTIVE',
      portalEligible: false,
      sourceRecordId: 'recPassive',
    });
  });

  it('uses the most operational source status when duplicate rows disagree', () => {
    const result = mergeProfessionalRows([
      {
        id: 'recOld',
        fields: {
          'NAME MASTER': 'Returning Professional',
          EMAIL: 'returning@example.com',
          PHONE: '07700 900444',
          LANGUAGE: 'FRENCH',
          'active!': 'inactive',
        },
      },
      {
        id: 'recCurrent',
        fields: {
          'NAME MASTER': 'Returning Professional',
          EMAIL: 'returning@example.com',
          PHONE: '07700 900444',
          LANGUAGE: 'SPANISH',
          'active!': 'active',
        },
      },
    ]);

    expect(result.imports[0].sourceStatus).toBe('ACTIVE');
    expect(result.imports[0].profileStatus).toBe('ACTIVE');
    expect(result.imports[0].portalEligible).toBe(true);
  });

  it('flags a row that bridges two otherwise distinct identities', () => {
    const result = mergeProfessionalRows([
      {
        id: 'recIdentityOne',
        fields: {
          'NAME MASTER': 'First Person',
          EMAIL: 'shared@example.com',
          PHONE: '07700 900111',
          'active!': 'active',
        },
      },
      {
        id: 'recIdentityTwo',
        fields: {
          'NAME MASTER': 'Second Person',
          EMAIL: 'shared@example.com',
          PHONE: '07700 900222',
          'active!': 'inactive',
        },
      },
      {
        id: 'recBridgeRow12',
        fields: {
          'NAME MASTER': 'First Person',
          EMAIL: 'shared@example.com',
          PHONE: '07700 900222',
          'active!': 'active',
        },
      },
    ]);

    expect(result.ambiguousSourceRecordIds).toEqual(['recBridgeRow12']);
    expect(result.imports).toHaveLength(3);
  });

  it('preserves platform safety locks over an Airtable work status', () => {
    expect(resolveImportedProfessionalStatus('ACTIVE', 'BLOCKED')).toBe('BLOCKED');
    expect(resolveImportedProfessionalStatus('ACTIVE', 'SUSPENDED')).toBe('SUSPENDED');
    expect(resolveImportedProfessionalStatus('ACTIVE', 'ONBOARDING')).toBe('ONBOARDING');
    expect(resolveImportedProfessionalStatus('INACTIVE', 'ACTIVE')).toBe('INACTIVE');
  });

  it('suspends an existing portal account when the mirrored profile becomes passive', () => {
    expect(resolveImportedProfessionalAccountStatus(false, 'ACTIVE')).toBe('SUSPENDED');
    expect(resolveImportedProfessionalAccountStatus(false, 'IMPORTED')).toBe('SUSPENDED');
    expect(resolveImportedProfessionalAccountStatus(true, 'SUSPENDED')).toBe('SUSPENDED');
    expect(resolveImportedProfessionalAccountStatus(true, '')).toBe('IMPORTED');
  });
});
