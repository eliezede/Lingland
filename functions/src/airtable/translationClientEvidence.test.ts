import { describe, expect, it } from 'vitest';
import {
  accountRefFromTranslationInvoice,
  buildTranslationClientEvidence,
  enrichTranslationClientIdentity,
  TranslationClientIdentity,
} from './translationClientEvidence';

const emptyIdentity = (overrides: Partial<TranslationClientIdentity> = {}): TranslationClientIdentity => ({
  companyName: 'Airtable Client',
  normalizedCompanyName: 'airtable client',
  bookingAgent: '',
  email: '',
  phone: '',
  billingAddress: '',
  uniqueClientKey: '',
  sageAccountRef: '',
  invoiceContact: '',
  invoiceEmail: '',
  invoicePhone: '',
  departmentName: '',
  locationName: '',
  clientStatus: '',
  clientTrade: '',
  ...overrides,
});

describe('translation client evidence', () => {
  it('extracts the Sage account reference from legacy translation invoice numbers', () => {
    expect(accountRefFromTranslationInvoice('HAM018.6313')).toBe('HAM018');
    expect(accountRefFromTranslationInvoice('ham007 August')).toBe('HAM007');
    expect(accountRefFromTranslationInvoice('rec7g3i6mEB4wrYMO')).toBe('');
    expect(accountRefFromTranslationInvoice('Loss')).toBe('');
  });

  it('indexes invoice evidence by linked translation record', () => {
    const result = buildTranslationClientEvidence([{
      id: 'recInvoice',
      fields: {
        'TR Invoice Nbr': 'WES008.9001',
        '\ud83d\udcc4 Translations': ['recTranslation'],
        'TR Agency (from \ud83d\udcc4 Translations)': ['Wessex Solicitors'],
        'TR Requested By (from \ud83d\udcc4 Translations)': ['Erica'],
        'TR client email (from \ud83d\udcc4 Translations)': ['Erica@WessexSolicitors.co.uk'],
      },
    }]).get('recTranslation');

    expect(result).toMatchObject({
      invoiceRecordIds: ['recInvoice'],
      invoiceNumbers: ['WES008.9001'],
      accountRefs: ['WES008'],
      candidateAccountRefs: ['WES008'],
      agencyNames: ['Wessex Solicitors'],
      requestedByNames: ['Erica'],
      emails: ['erica@wessexsolicitors.co.uk'],
      accountRefAmbiguous: false,
      accountRefSource: 'INVOICE_NUMBER',
    });
  });

  it('enriches a placeholder booking identity with deterministic invoice evidence', () => {
    const evidence = buildTranslationClientEvidence([{
      id: 'recInvoice',
      fields: {
        'TR Invoice Nbr': 'CHU001.3847',
        Translations: ['recTranslation'],
        'TR Agency': ['Churchers Solicitors'],
        'TR Requested By': ['Booking Team'],
        'TR client email': ['bookings@churchers.co.uk'],
      },
    }]).get('recTranslation');

    expect(enrichTranslationClientIdentity(emptyIdentity(), evidence)).toMatchObject({
      companyName: 'Churchers Solicitors',
      normalizedCompanyName: 'churchers solicitors',
      bookingAgent: 'Booking Team',
      email: 'bookings@churchers.co.uk',
      uniqueClientKey: 'CHU001',
      sageAccountRef: 'CHU001',
      invoiceEmail: 'bookings@churchers.co.uk',
    });
  });

  it('never chooses an account reference when linked invoices disagree', () => {
    const evidence = buildTranslationClientEvidence([
      { id: 'invoice-a', fields: { 'TR Invoice Nbr': 'HAM007.1', Translations: ['recTranslation'] } },
      { id: 'invoice-b', fields: { 'TR Invoice Nbr': 'HAM018.2', Translations: ['recTranslation'] } },
    ]).get('recTranslation');

    const result = enrichTranslationClientIdentity(emptyIdentity(), evidence);
    expect(evidence?.accountRefAmbiguous).toBe(true);
    expect(evidence?.candidateAccountRefs).toEqual(['HAM007', 'HAM018']);
    expect(result.uniqueClientKey).toBe('');
    expect(result.sageAccountRef).toBe('');
  });

  it('inherits a unique account reference from another invoice with the same requester email', () => {
    const evidence = buildTranslationClientEvidence([
      {
        id: 'invoice-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM018.6313',
          Translations: ['recTranslationNumbered'],
          'TR Agency': ['Adopt South'],
          'TR client email': ['adoptsouth.admin@hants.gov.uk'],
        },
      },
      {
        id: 'invoice-unumbered',
        fields: {
          Translations: ['recTranslationUnumbered'],
          'TR Agency': ['HCC'],
          'TR client email': ['adoptsouth.admin@hants.gov.uk'],
        },
      },
    ]).get('recTranslationUnumbered');

    expect(evidence).toMatchObject({
      accountRefs: ['HAM018'],
      accountRefSource: 'SHARED_EMAIL',
      accountRefAmbiguous: false,
    });
  });

  it('does not infer from an agency label used by multiple account references', () => {
    const evidence = buildTranslationClientEvidence([
      { id: 'a', fields: { 'TR Invoice Nbr': 'HAM007.1', Translations: ['recOne'], 'TR Agency': ['HCC'] } },
      { id: 'b', fields: { 'TR Invoice Nbr': 'HAM018.2', Translations: ['recTwo'], 'TR Agency': ['HCC'] } },
      { id: 'c', fields: { Translations: ['recThree'], 'TR Agency': ['HCC'] } },
    ]).get('recThree');

    expect(evidence).toMatchObject({
      accountRefs: [],
      candidateAccountRefs: ['HAM007', 'HAM018'],
      accountRefSource: '',
      accountRefAmbiguous: true,
    });
  });

  it('uses a dominant agency account only when historical support is strong', () => {
    const dominantHistory = Array.from({ length: 6 }, (_, index) => ({
      id: `ham007-${index}`,
      fields: {
        'TR Invoice Nbr': `HAM007.${index}`,
        Translations: [`recHcc${index}`],
        'TR Agency': ['HCC'],
      },
    }));
    const evidence = buildTranslationClientEvidence([
      ...dominantHistory,
      {
        id: 'ham018',
        fields: {
          'TR Invoice Nbr': 'HAM018.1',
          Translations: ['recOtherHcc'],
          'TR Agency': ['HCC'],
        },
      },
      {
        id: 'unnumbered',
        fields: {
          Translations: ['recTarget'],
          'TR Agency': ['HCC'],
        },
      },
    ]).get('recTarget');

    expect(evidence).toMatchObject({
      accountRefs: ['HAM007'],
      candidateAccountRefs: ['HAM007', 'HAM018'],
      accountRefSource: 'DOMINANT_AGENCY',
      accountRefAmbiguous: false,
    });
  });

  it('prefers an exact department history over an email shared with its parent organisation', () => {
    const evidence = buildTranslationClientEvidence([
      {
        id: 'emtas-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM016.7936',
          Translations: ['recEmtasNumbered'],
          'TR Agency': ['EMTAS - Hampshire County Council'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'hcc-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM007.JULY',
          Translations: ['recHccNumbered'],
          'TR Agency': ['HCC'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'emtas-unumbered',
        fields: {
          Translations: ['recEmtasUnumbered'],
          'TR Agency': ['EMTAS - Hampshire County Council'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
    ]).get('recEmtasUnumbered');

    expect(evidence).toMatchObject({
      accountRefs: ['HAM016'],
      candidateAccountRefs: ['HAM016', 'HAM007'],
      accountRefSource: 'EXACT_AGENCY',
      accountRefAmbiguous: false,
    });
  });

  it('matches the same department when Airtable reverses or expands the agency label', () => {
    const evidence = buildTranslationClientEvidence([
      {
        id: 'emtas-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM016.3251',
          Translations: ['recEmtasNumbered'],
          'TR Agency': ['Ethnic Minority Traveller Achievement Service (EMTAS) - HCC'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'hcc-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM007.JULY',
          Translations: ['recHccNumbered'],
          'TR Agency': ['HCC'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'emtas-unumbered',
        fields: {
          Translations: ['recEmtasUnumbered'],
          'TR Agency': ['Hampshire County Council - EMTAS'],
          'TR client email': ['alison.dunphy@hants.gov.uk'],
        },
      },
    ]).get('recEmtasUnumbered');

    expect(evidence).toMatchObject({
      accountRefs: ['HAM016'],
      candidateAccountRefs: ['HAM016', 'HAM007'],
      accountRefSource: 'EXACT_AGENCY',
      accountRefAmbiguous: false,
    });
  });

  it('does not treat linked professional lookups as translation ownership', () => {
    const evidence = buildTranslationClientEvidence([
      {
        id: 'emtas-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM016.7936',
          Translations: ['recEmtasNumbered'],
          'TR Agency (from Translations)': ['EMTAS - Hampshire County Council'],
          'TR client email (from Translations)': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'hcc-numbered',
        fields: {
          'TR Invoice Nbr': 'HAM007.JULY',
          Translations: ['recHccNumbered'],
          'Assign to (from Translations)': ['recSharedProfessional'],
          'TR Agency (from Translations)': ['HCC'],
          'TR client email (from Translations)': ['hcc.team@hants.gov.uk'],
        },
      },
      {
        id: 'emtas-unumbered-shared-professional',
        fields: {
          Translations: ['recEmtasUnumberedOne'],
          'Assign to (from Translations)': ['recSharedProfessional'],
          'TR Agency (from Translations)': ['EMTAS - Hampshire County Council'],
          'TR client email (from Translations)': ['alison.dunphy@hants.gov.uk'],
        },
      },
      {
        id: 'emtas-unumbered-target',
        fields: {
          Translations: ['recEmtasUnumberedTwo'],
          'TR Agency (from Translations)': ['Hampshire County Council - EMTAS'],
          'TR client email (from Translations)': ['alison.dunphy@hants.gov.uk'],
        },
      },
    ]);

    expect(evidence.has('recSharedProfessional')).toBe(false);
    expect(evidence.get('recEmtasUnumberedTwo')).toMatchObject({
      accountRefs: ['HAM016'],
      agencyCandidateAccountRefs: ['HAM016'],
      emailCandidateAccountRefs: ['HAM016'],
      accountRefSource: 'EXACT_AGENCY',
      accountRefAmbiguous: false,
    });
  });

  it('ignores a loss marker when inferring the Wessex account reference', () => {
    const evidence = buildTranslationClientEvidence([
      {
        id: 'wessex-numbered',
        fields: {
          'TR Invoice Nbr': 'WES008.7457',
          Translations: ['recWessexNumbered'],
          'TR Agency': ['Wessex Solicitors'],
          'TR client email': ['erica@wessexsolicitors.co.uk'],
        },
      },
      {
        id: 'wessex-loss',
        fields: {
          'TR Invoice Nbr': 'Loss',
          Translations: ['recWessexLoss'],
          'TR Agency': ['Wessex Solicitors'],
          'TR client email': ['erica@wessexsolicitors.co.uk'],
        },
      },
      {
        id: 'wessex-unumbered',
        fields: {
          Translations: ['recWessexUnumbered'],
          'TR Agency': ['Wessex Solicitors'],
          'TR client email': ['erica@wessexsolicitors.co.uk'],
        },
      },
    ]).get('recWessexUnumbered');

    expect(evidence).toMatchObject({
      accountRefs: ['WES008'],
      candidateAccountRefs: ['WES008'],
      accountRefSource: 'EXACT_AGENCY',
      accountRefAmbiguous: false,
    });
  });
});
