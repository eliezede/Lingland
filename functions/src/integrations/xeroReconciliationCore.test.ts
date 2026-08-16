import { describe, expect, it } from 'vitest';
import { reconcileXeroAccounting } from './xeroReconciliationCore';

const localCustomer = {
  id: 'contact-customer',
  sageAccountRef: 'HAM007',
  name: 'Hampshire County Council / Childrens',
  emails: ['accounts@example.test'],
};

const xeroCustomer = {
  ContactID: 'xero-contact-customer',
  AccountNumber: 'HAM007',
  Name: 'Hampshire County Council - Childrens',
  EmailAddress: 'accounts@example.test',
  ContactStatus: 'ACTIVE',
};

const localSupplier = {
  id: 'contact-supplier',
  sageAccountRef: 'OPENAI',
  name: 'Open AI LLC',
  emails: [],
};

const xeroSupplier = {
  ContactID: 'xero-contact-supplier',
  AccountNumber: 'OPENAI',
  Name: 'Open AI LLC',
  ContactStatus: 'ACTIVE',
};

describe('Xero reconciliation core', () => {
  it('links contacts only by deterministic external account number', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [localCustomer],
      localDocuments: [],
      xeroContacts: [xeroCustomer],
      xeroInvoices: [],
      generatedAt: '2026-08-12T09:00:00.000Z',
    });

    expect(preview.summary.contacts.EXACT).toBe(1);
    expect(preview.items[0]).toEqual(expect.objectContaining({
      status: 'EXACT',
      strategy: 'SAGE_REF_TO_XERO_ACCOUNT_NUMBER',
      xero: expect.objectContaining({ id: 'xero-contact-customer' }),
    }));
  });

  it('uses the canonical Xero account number when Sage has a known supplier alias', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [{
        id: 'contact-vanya',
        sageAccountRef: 'VANYA',
        xeroAccountNumber: 'VAN002',
        name: 'Vanya Petrova',
        emails: [],
      }],
      localDocuments: [],
      xeroContacts: [{
        ContactID: 'xero-contact-vanya',
        AccountNumber: 'VAN002',
        Name: 'Vanya Petrova',
        ContactStatus: 'ACTIVE',
      }],
      xeroInvoices: [],
    });

    expect(preview.summary.contacts.EXACT).toBe(1);
    expect(preview.items[0]).toEqual(expect.objectContaining({
      status: 'EXACT',
      local: expect.objectContaining({ reference: 'VAN002' }),
    }));
  });

  it('keeps name-only contact matches in review', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [{ ...localCustomer, sageAccountRef: 'DIFFERENT', emails: [] }],
      localDocuments: [],
      xeroContacts: [xeroCustomer],
      xeroInvoices: [],
    });

    expect(preview.summary.contacts.REVIEW).toBe(1);
    expect(preview.summary.contacts.MISSING).toBe(0);
  });

  it('reconciles a receivable only when number, type, contact, date and total agree', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [localCustomer],
      localDocuments: [{
        id: 'sales-7582',
        direction: 'RECEIVABLE',
        accountingContactId: localCustomer.id,
        sageAccountRef: 'HAM007',
        documentNumber: '7582',
        contactName: localCustomer.name,
        issueDate: '2026-04-01',
        grossAmount: 3445.38,
      }],
      xeroContacts: [xeroCustomer],
      xeroInvoices: [{
        InvoiceID: 'xero-sales-7582',
        Type: 'ACCREC',
        InvoiceNumber: '7582',
        DateString: '2026-04-01T00:00:00',
        Total: 3445.38,
        AmountPaid: 0,
        AmountDue: 3445.38,
        Status: 'DRAFT',
        Contact: { ContactID: xeroCustomer.ContactID, Name: xeroCustomer.Name },
      }],
      xeroPayments: [],
    });

    expect(preview.summary.receivables.EXACT).toBe(1);
    expect(preview.items.find(item => item.entityType === 'DOCUMENT')).toEqual(expect.objectContaining({
      status: 'EXACT',
      xero: expect.objectContaining({ id: 'xero-sales-7582', status: 'DRAFT' }),
    }));
  });

  it('uses the explicit Xero bill number and carries payment evidence without changing Sage settlement', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [localSupplier],
      localDocuments: [{
        id: 'purchase-65837',
        direction: 'PAYABLE',
        accountingContactId: localSupplier.id,
        sageAccountRef: 'OPENAI',
        documentNumber: 'Open AI',
        externalAccountingNumber: 'SAGE-PI-65837',
        issueDate: '2026-04-02',
        grossAmount: 20,
        settlementStatus: 'FULLY_ALLOCATED',
      }],
      xeroContacts: [xeroSupplier],
      xeroInvoices: [{
        InvoiceID: 'xero-bill-65837',
        Type: 'ACCPAY',
        InvoiceNumber: 'SAGE-PI-65837',
        Date: '/Date(1775088000000+0000)/',
        Total: 20,
        AmountPaid: 20,
        AmountDue: 0,
        Status: 'PAID',
        Contact: { ContactID: xeroSupplier.ContactID, Name: xeroSupplier.Name },
      }],
      xeroPayments: [{
        PaymentID: 'xero-payment-1',
        Invoice: { InvoiceID: 'xero-bill-65837' },
        Amount: 20,
        Status: 'AUTHORISED',
      }],
    });

    const document = preview.items.find(item => item.entityType === 'DOCUMENT');
    expect(preview.summary.payables.EXACT).toBe(1);
    expect(document?.xero).toEqual(expect.objectContaining({
      paymentIds: ['xero-payment-1'],
      paymentTotal: 20,
    }));
    expect(document).not.toHaveProperty('settlementStatus');
  });

  it('blocks an automatic link when the Xero total conflicts', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [localCustomer],
      localDocuments: [{
        id: 'sales-7582',
        direction: 'RECEIVABLE',
        accountingContactId: localCustomer.id,
        sageAccountRef: 'HAM007',
        documentNumber: '7582',
        issueDate: '2026-04-01',
        grossAmount: 3445.38,
      }],
      xeroContacts: [xeroCustomer],
      xeroInvoices: [{
        InvoiceID: 'xero-sales-7582',
        Type: 'ACCREC',
        InvoiceNumber: '7582',
        DateString: '2026-04-01',
        Total: 3000,
        Status: 'DRAFT',
        Contact: { ContactID: xeroCustomer.ContactID },
      }],
    });

    const document = preview.items.find(item => item.entityType === 'DOCUMENT');
    expect(document?.status).toBe('CONFLICT');
    expect(document?.reasons).toContain('TOTAL_MISMATCH');
    expect(preview.summary.exactLinkCount).toBe(1);
  });

  it('offers a payable fingerprint only for manual review when the external bill number is absent', () => {
    const preview = reconcileXeroAccounting({
      localContacts: [localSupplier],
      localDocuments: [{
        id: 'purchase-legacy',
        direction: 'PAYABLE',
        accountingContactId: localSupplier.id,
        sageAccountRef: 'OPENAI',
        documentNumber: 'Open AI',
        issueDate: '2026-04-02',
        grossAmount: 20,
      }],
      xeroContacts: [xeroSupplier],
      xeroInvoices: [{
        InvoiceID: 'xero-bill-65837',
        Type: 'ACCPAY',
        InvoiceNumber: 'SAGE-PI-65837',
        DateString: '2026-04-02',
        Total: 20,
        Status: 'DRAFT',
        Contact: { ContactID: xeroSupplier.ContactID },
      }],
    });

    const document = preview.items.find(item => item.entityType === 'DOCUMENT');
    expect(document?.status).toBe('REVIEW');
    expect(document?.strategy).toBe('UNIQUE_CONTACT_DATE_TOTAL_FALLBACK');
  });
});
