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
});
