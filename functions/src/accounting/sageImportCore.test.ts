import { describe, expect, it } from 'vitest';
import {
  hashSageBatch,
  normalizeSageImportRecord,
  stableSageId,
  validateSageImportManifest,
} from './sageImportCore';

const hash = 'a'.repeat(64);

describe('sageImportCore', () => {
  it('normalizes a Sage customer into an unresolved Xero-first contact', () => {
    const contact = normalizeSageImportRecord('contacts', {
      id: 'sage_contact_customer_abc',
      contactType: 'CUSTOMER',
      sageAccountRef: ' ham018 ',
      name: 'HCC Adopt South',
      emails: ['FINANCE@EXAMPLE.TEST'],
      sourceRecordId: 'record-1',
      sourceRecordHash: hash,
      sourceTable: 'SALES.DTA',
    }, 'sage_2026_08_07');

    expect(contact.sageAccountRef).toBe('HAM018');
    expect(contact.xeroAccountNumber).toBe('HAM018');
    expect(contact.emails).toEqual(['finance@example.test']);
    expect(contact.platformLinkStatus).toBe('UNRESOLVED');
    expect(contact.xeroSyncStatus).toBe('NOT_SYNCED');
  });

  it('preserves the canonical Xero account number alongside the Sage source alias', () => {
    const contact = normalizeSageImportRecord('contacts', {
      id: 'sage_contact_supplier_vanya',
      contactType: 'SUPPLIER',
      sageAccountRef: 'VANYA',
      xeroAccountNumber: 'VAN002',
      name: 'Vanya Petrova',
      sourceRecordId: 'record-vanya',
      sourceRecordHash: hash,
      sourceTable: 'PURCHASE.DTA',
    }, 'sage_2026_08_07');

    expect(contact.sageAccountRef).toBe('VANYA');
    expect(contact.xeroAccountNumber).toBe('VAN002');
  });

  it('keeps settlement and Xero migration states separate', () => {
    const document = normalizeSageImportRecord('salesDocuments', {
      id: 'sage_sales_invoice_abc',
      documentType: 'SALES_INVOICE',
      documentNumber: '328',
      sageAccountRef: 'HAM018',
      netAmount: 0,
      taxAmount: 0,
      grossAmount: 0,
      settlementStatus: 'REVIEW_UNMATCHED',
      migrationDisposition: 'QUARANTINED',
      sourceRecordId: 'record-328',
      sourceRecordHash: hash,
      sourceTable: 'INVOICE.DTA',
    }, 'sage_2026_08_07');

    expect(document.settlementStatus).toBe('REVIEW_UNMATCHED');
    expect(document.migrationDisposition).toBe('QUARANTINED');
    expect(document.xeroSyncStatus).toBe('NOT_SYNCED');
  });

  it('preserves the external Xero bill number independently from the supplier reference', () => {
    const document = normalizeSageImportRecord('purchaseDocuments', {
      id: 'sage_purchase_document_abc',
      documentType: 'PURCHASE_BILL',
      documentNumber: 'Open AI',
      externalAccountingNumber: 'SAGE-PI-65837',
      sourceAuditNumber: '65837',
      sageAccountRef: 'OPENAI',
      grossAmount: 20,
      sourceRecordId: 'record-65837',
      sourceRecordHash: hash,
      sourceTable: 'HEADER.DTA',
    }, 'sage_2026_08_07');

    expect(document.documentNumber).toBe('Open AI');
    expect(document.externalAccountingNumber).toBe('SAGE-PI-65837');
    expect(document.sourceAuditNumber).toBe('65837');
  });

  it('validates manifest modules and stable hashes', () => {
    const manifest = validateSageImportManifest({
      schemaVersion: 'lingland.sage-xero.v1',
      datasetId: 'sage_2026_08_07',
      manifestHash: hash,
      generatedAt: '2026-08-09T10:00:00Z',
      sourceAsOf: '2026-08-07',
      expectedModuleCounts: { contacts: 652, salesDocuments: 8077 },
      validationSummary: { passed: true, checkCount: 22, failedCheckCount: 0 },
      scope: { kind: 'CURRENT_FINANCIAL_YEAR_CONTROLLED', fromDate: '2026-04-01', toDate: '2026-08-07' },
    });
    expect(manifest.expectedModuleCounts.contacts).toBe(652);
    expect(manifest.scope?.toDate).toBe('2026-08-07');
    expect(stableSageId('sage_contact', 'HAM018')).toMatch(/^sage_contact_[a-f0-9]{24}$/);
    expect(hashSageBatch([])).toHaveLength(64);
  });
});
