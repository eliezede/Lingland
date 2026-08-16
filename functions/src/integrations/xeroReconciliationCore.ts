import { createHash } from 'node:crypto';

export type XeroReconciliationMatchStatus = 'EXACT' | 'REVIEW' | 'CONFLICT' | 'MISSING';
export type XeroReconciliationEntityType = 'CONTACT' | 'DOCUMENT';

export interface XeroReconciliationItem {
  entityType: XeroReconciliationEntityType;
  localCollection: 'accountingContacts' | 'accountingDocuments';
  localId: string;
  status: XeroReconciliationMatchStatus;
  strategy: string;
  reasons: string[];
  local: {
    reference: string;
    name: string;
    direction?: 'RECEIVABLE' | 'PAYABLE';
    date?: string;
    total?: number;
  };
  xero: null | {
    id: string;
    reference: string;
    name: string;
    status: string;
    date?: string;
    total?: number;
    amountPaid?: number;
    amountDue?: number;
    updatedDateUtc?: string;
    paymentIds?: string[];
    paymentTotal?: number;
  };
}

export interface XeroReconciliationPreview {
  previewHash: string;
  generatedAt: string;
  summary: {
    contacts: Record<XeroReconciliationMatchStatus | 'TOTAL', number>;
    documents: Record<XeroReconciliationMatchStatus | 'TOTAL', number>;
    receivables: Record<XeroReconciliationMatchStatus | 'TOTAL', number>;
    payables: Record<XeroReconciliationMatchStatus | 'TOTAL', number>;
    xero: {
      contacts: number;
      invoices: number;
      payments: number;
      orphanInvoices: number;
      invoiceStatuses: Record<string, number>;
    };
    exactLinkCount: number;
    reviewCount: number;
  };
  items: XeroReconciliationItem[];
}

type LooseRecord = Record<string, unknown>;

interface LocalContact {
  id: string;
  accountRef: string;
  name: string;
  normalizedName: string;
  emails: string[];
}

interface XeroContact {
  id: string;
  accountRef: string;
  name: string;
  normalizedName: string;
  email: string;
  status: string;
  updatedDateUtc: string;
}

interface LocalDocument {
  id: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  accountingContactId: string;
  accountRef: string;
  externalNumber: string;
  displayNumber: string;
  contactName: string;
  date: string;
  total: number;
}

interface XeroInvoice {
  id: string;
  type: 'ACCREC' | 'ACCPAY';
  number: string;
  reference: string;
  date: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  contactId: string;
  contactName: string;
  contactAccountRef: string;
  updatedDateUtc: string;
}

interface XeroPayment {
  id: string;
  invoiceId: string;
  amount: number;
  status: string;
}

const cleanText = (value: unknown, max = 500) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const upper = (value: unknown, max = 500) => cleanText(value, max).toUpperCase();
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};
const normalizeName = (value: unknown) => cleanText(value, 300)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normalizeEmail = (value: unknown) => cleanText(value, 320).toLowerCase();

const dateOnly = (value: unknown): string => {
  const raw = cleanText(value, 100);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const xeroDate = raw.match(/Date\(([-\d]+)/i);
  if (xeroDate) {
    const parsed = new Date(Number(xeroDate[1]));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const object = (value: unknown): LooseRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
);

const strings = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(item => cleanText(item, 320)).filter(Boolean) : []
);

const indexBy = <T>(records: T[], keyFor: (record: T) => string) => {
  const index = new Map<string, T[]>();
  records.forEach(record => {
    const key = keyFor(record);
    if (!key) return;
    index.set(key, [...(index.get(key) || []), record]);
  });
  return index;
};

const normalizeLocalContact = (record: LooseRecord): LocalContact => ({
  id: cleanText(record.id || record.__id, 180),
  accountRef: upper(record.xeroAccountNumber || record.sageAccountRef, 100),
  name: cleanText(record.name, 240),
  normalizedName: normalizeName(record.normalizedName || record.name),
  emails: strings(record.emails).map(normalizeEmail).filter(Boolean),
});

const normalizeXeroContact = (record: LooseRecord): XeroContact => ({
  id: cleanText(record.ContactID || record.contactId || record.id, 180),
  accountRef: upper(record.AccountNumber || record.ContactNumber || record.accountNumber, 100),
  name: cleanText(record.Name || record.name, 240),
  normalizedName: normalizeName(record.Name || record.name),
  email: normalizeEmail(record.EmailAddress || record.emailAddress),
  status: upper(record.ContactStatus || record.status, 40),
  updatedDateUtc: cleanText(record.UpdatedDateUTC || record.updatedDateUtc, 100),
});

const normalizeLocalDocument = (record: LooseRecord): LocalDocument => {
  const direction = upper(record.direction, 20) === 'PAYABLE' || upper(record.documentType, 40).startsWith('PURCHASE')
    ? 'PAYABLE'
    : 'RECEIVABLE';
  const documentNumber = cleanText(record.documentNumber, 140);
  const auditNumber = cleanText(record.sourceAuditNumber || record.sageAuditNumber, 80);
  const externalNumber = cleanText(
    record.externalAccountingNumber
      || record.xeroInvoiceNumber
      || (direction === 'RECEIVABLE' ? documentNumber : (auditNumber ? `SAGE-PI-${auditNumber}` : '')),
    140,
  );
  return {
    id: cleanText(record.id || record.__id, 180),
    direction,
    accountingContactId: cleanText(record.accountingContactId, 180),
    accountRef: upper(record.sageAccountRef, 100),
    externalNumber,
    displayNumber: documentNumber || externalNumber,
    contactName: cleanText(record.contactName, 240),
    date: dateOnly(record.issueDate),
    total: finite(record.grossAmount),
  };
};

const normalizeXeroInvoice = (record: LooseRecord, contactById: Map<string, XeroContact>): XeroInvoice => {
  const contact = object(record.Contact || record.contact);
  const contactId = cleanText(contact.ContactID || contact.contactId, 180);
  const fullContact = contactById.get(contactId);
  const type = upper(record.Type || record.type, 20) === 'ACCPAY' ? 'ACCPAY' : 'ACCREC';
  return {
    id: cleanText(record.InvoiceID || record.invoiceId || record.id, 180),
    type,
    number: cleanText(record.InvoiceNumber || record.invoiceNumber, 140),
    reference: cleanText(record.Reference || record.reference, 240),
    date: dateOnly(record.DateString || record.Date || record.date),
    total: finite(record.Total || record.total),
    amountPaid: finite(record.AmountPaid || record.amountPaid),
    amountDue: finite(record.AmountDue || record.amountDue),
    status: upper(record.Status || record.status, 40),
    contactId,
    contactName: cleanText(contact.Name || contact.name || fullContact?.name, 240),
    contactAccountRef: fullContact?.accountRef || upper(contact.AccountNumber || contact.ContactNumber, 100),
    updatedDateUtc: cleanText(record.UpdatedDateUTC || record.updatedDateUtc, 100),
  };
};

const normalizeXeroPayment = (record: LooseRecord): XeroPayment => {
  const invoice = object(record.Invoice || record.invoice);
  return {
    id: cleanText(record.PaymentID || record.paymentId || record.id, 180),
    invoiceId: cleanText(invoice.InvoiceID || invoice.invoiceId, 180),
    amount: finite(record.Amount || record.amount),
    status: upper(record.Status || record.status, 40),
  };
};

const emptyCounts = (): Record<XeroReconciliationMatchStatus | 'TOTAL', number> => ({
  TOTAL: 0,
  EXACT: 0,
  REVIEW: 0,
  CONFLICT: 0,
  MISSING: 0,
});

const increment = (counts: Record<XeroReconciliationMatchStatus | 'TOTAL', number>, status: XeroReconciliationMatchStatus) => {
  counts.TOTAL += 1;
  counts[status] += 1;
};

const xeroContactSnapshot = (contact: XeroContact): NonNullable<XeroReconciliationItem['xero']> => ({
  id: contact.id,
  reference: contact.accountRef,
  name: contact.name,
  status: contact.status,
  updatedDateUtc: contact.updatedDateUtc,
});

const invoiceSnapshot = (
  invoice: XeroInvoice,
  paymentsByInvoice: Map<string, XeroPayment[]>,
): NonNullable<XeroReconciliationItem['xero']> => {
  const payments = (paymentsByInvoice.get(invoice.id) || []).filter(payment => payment.status !== 'DELETED');
  return {
    id: invoice.id,
    reference: invoice.number,
    name: invoice.contactName,
    status: invoice.status,
    date: invoice.date,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    amountDue: invoice.amountDue,
    updatedDateUtc: invoice.updatedDateUtc,
    paymentIds: payments.map(payment => payment.id),
    paymentTotal: Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100,
  };
};

const matchContacts = (localContacts: LocalContact[], xeroContacts: XeroContact[]) => {
  const byAccountRef = indexBy(xeroContacts, contact => contact.accountRef);
  const byEmail = indexBy(xeroContacts, contact => contact.email);
  const byName = indexBy(xeroContacts, contact => contact.normalizedName);
  const items: XeroReconciliationItem[] = [];

  localContacts.forEach(local => {
    const exact = local.accountRef ? byAccountRef.get(local.accountRef) || [] : [];
    if (exact.length === 1) {
      const candidate = exact[0];
      const reasons = ['ACCOUNT_NUMBER_EXACT'];
      if (local.normalizedName && candidate.normalizedName && local.normalizedName !== candidate.normalizedName) {
        reasons.push('CONTACT_NAME_DIFFERS');
      }
      items.push({
        entityType: 'CONTACT',
        localCollection: 'accountingContacts',
        localId: local.id,
        status: 'EXACT',
        strategy: 'SAGE_REF_TO_XERO_ACCOUNT_NUMBER',
        reasons,
        local: { reference: local.accountRef, name: local.name },
        xero: xeroContactSnapshot(candidate),
      });
      return;
    }
    if (exact.length > 1) {
      items.push({
        entityType: 'CONTACT',
        localCollection: 'accountingContacts',
        localId: local.id,
        status: 'CONFLICT',
        strategy: 'DUPLICATE_XERO_ACCOUNT_NUMBER',
        reasons: ['MULTIPLE_XERO_CONTACTS_SHARE_ACCOUNT_NUMBER'],
        local: { reference: local.accountRef, name: local.name },
        xero: xeroContactSnapshot(exact[0]),
      });
      return;
    }
    const emailCandidates = Array.from(new Map(local.emails.flatMap(email => byEmail.get(email) || []).map(contact => [contact.id, contact])).values());
    const nameCandidates = local.normalizedName ? byName.get(local.normalizedName) || [] : [];
    const candidate = emailCandidates.length === 1 ? emailCandidates[0] : (nameCandidates.length === 1 ? nameCandidates[0] : null);
    items.push({
      entityType: 'CONTACT',
      localCollection: 'accountingContacts',
      localId: local.id,
      status: candidate ? 'REVIEW' : (emailCandidates.length > 1 || nameCandidates.length > 1 ? 'CONFLICT' : 'MISSING'),
      strategy: candidate ? (emailCandidates.length === 1 ? 'EMAIL_FALLBACK' : 'NAME_FALLBACK') : 'NO_DETERMINISTIC_CONTACT_MATCH',
      reasons: candidate
        ? ['ACCOUNT_NUMBER_NOT_MATCHED', emailCandidates.length === 1 ? 'EMAIL_EXACT_REQUIRES_REVIEW' : 'NAME_EXACT_REQUIRES_REVIEW']
        : [emailCandidates.length > 1 || nameCandidates.length > 1 ? 'MULTIPLE_FALLBACK_CANDIDATES' : 'XERO_CONTACT_NOT_FOUND'],
      local: { reference: local.accountRef, name: local.name },
      xero: candidate ? xeroContactSnapshot(candidate) : null,
    });
  });
  return items;
};

const matchDocuments = (
  localDocuments: LocalDocument[],
  xeroInvoices: XeroInvoice[],
  contactItems: XeroReconciliationItem[],
  paymentsByInvoice: Map<string, XeroPayment[]>,
) => {
  const byNumber = indexBy(xeroInvoices, invoice => `${invoice.type}|${upper(invoice.number, 140)}`);
  const byFingerprint = indexBy(xeroInvoices, invoice => (
    `${invoice.type}|${invoice.date}|${invoice.total.toFixed(2)}|${invoice.contactAccountRef}`
  ));
  const exactContactLinks = new Map(
    contactItems
      .filter(item => item.status === 'EXACT' && item.xero)
      .map(item => [item.localId, item.xero!.id]),
  );
  const items: XeroReconciliationItem[] = [];

  localDocuments.forEach(local => {
    const xeroType = local.direction === 'PAYABLE' ? 'ACCPAY' : 'ACCREC';
    const numbered = local.externalNumber ? byNumber.get(`${xeroType}|${upper(local.externalNumber, 140)}`) || [] : [];
    if (numbered.length === 1) {
      const candidate = numbered[0];
      const reasons = ['TYPE_AND_EXTERNAL_NUMBER_EXACT'];
      if (Math.abs(candidate.total - local.total) > 0.01) reasons.push('TOTAL_MISMATCH');
      if (local.date && candidate.date && candidate.date !== local.date) reasons.push('DATE_MISMATCH');
      const expectedXeroContactId = exactContactLinks.get(local.accountingContactId);
      const contactMatches = Boolean(
        (expectedXeroContactId && candidate.contactId === expectedXeroContactId)
        || (local.accountRef && candidate.contactAccountRef === local.accountRef),
      );
      if (!contactMatches) reasons.push('CONTACT_MISMATCH');
      const exact = reasons.length === 1;
      items.push({
        entityType: 'DOCUMENT',
        localCollection: 'accountingDocuments',
        localId: local.id,
        status: exact ? 'EXACT' : 'CONFLICT',
        strategy: exact ? 'NUMBER_TYPE_CONTACT_DATE_TOTAL' : 'NUMBER_MATCH_WITH_DATA_CONFLICT',
        reasons,
        local: { reference: local.externalNumber || local.displayNumber, name: local.contactName, direction: local.direction, date: local.date, total: local.total },
        xero: invoiceSnapshot(candidate, paymentsByInvoice),
      });
      return;
    }
    if (numbered.length > 1) {
      items.push({
        entityType: 'DOCUMENT',
        localCollection: 'accountingDocuments',
        localId: local.id,
        status: 'CONFLICT',
        strategy: 'DUPLICATE_XERO_DOCUMENT_NUMBER',
        reasons: ['MULTIPLE_XERO_DOCUMENTS_SHARE_TYPE_AND_NUMBER'],
        local: { reference: local.externalNumber || local.displayNumber, name: local.contactName, direction: local.direction, date: local.date, total: local.total },
        xero: invoiceSnapshot(numbered[0], paymentsByInvoice),
      });
      return;
    }

    const fingerprint = local.accountRef && local.date
      ? byFingerprint.get(`${xeroType}|${local.date}|${local.total.toFixed(2)}|${local.accountRef}`) || []
      : [];
    const candidate = fingerprint.length === 1 ? fingerprint[0] : null;
    items.push({
      entityType: 'DOCUMENT',
      localCollection: 'accountingDocuments',
      localId: local.id,
      status: candidate ? 'REVIEW' : (fingerprint.length > 1 ? 'CONFLICT' : 'MISSING'),
      strategy: candidate ? 'UNIQUE_CONTACT_DATE_TOTAL_FALLBACK' : 'NO_DETERMINISTIC_DOCUMENT_MATCH',
      reasons: candidate
        ? [local.externalNumber ? 'EXTERNAL_NUMBER_NOT_FOUND' : 'EXTERNAL_NUMBER_MISSING', 'FINGERPRINT_REQUIRES_REVIEW']
        : [fingerprint.length > 1 ? 'MULTIPLE_FINGERPRINT_CANDIDATES' : (local.externalNumber ? 'XERO_DOCUMENT_NOT_FOUND' : 'EXTERNAL_NUMBER_MISSING')],
      local: { reference: local.externalNumber || local.displayNumber, name: local.contactName, direction: local.direction, date: local.date, total: local.total },
      xero: candidate ? invoiceSnapshot(candidate, paymentsByInvoice) : null,
    });
  });
  return items;
};

export const reconcileXeroAccounting = (input: {
  localContacts: LooseRecord[];
  localDocuments: LooseRecord[];
  xeroContacts: LooseRecord[];
  xeroInvoices: LooseRecord[];
  xeroPayments?: LooseRecord[];
  generatedAt?: string;
}): XeroReconciliationPreview => {
  const localContacts = input.localContacts.map(normalizeLocalContact).filter(record => record.id);
  const localDocuments = input.localDocuments.map(normalizeLocalDocument).filter(record => record.id);
  const xeroContacts = input.xeroContacts.map(normalizeXeroContact).filter(record => record.id);
  const xeroContactById = new Map(xeroContacts.map(contact => [contact.id, contact]));
  const xeroInvoices = input.xeroInvoices.map(record => normalizeXeroInvoice(record, xeroContactById)).filter(record => record.id);
  const xeroPayments = (input.xeroPayments || []).map(normalizeXeroPayment).filter(record => record.id);
  const paymentsByInvoice = indexBy(xeroPayments, payment => payment.invoiceId);
  const contactItems = matchContacts(localContacts, xeroContacts);
  const documentItems = matchDocuments(localDocuments, xeroInvoices, contactItems, paymentsByInvoice);
  const items = [...contactItems, ...documentItems];

  const contacts = emptyCounts();
  const documents = emptyCounts();
  const receivables = emptyCounts();
  const payables = emptyCounts();
  items.forEach(item => {
    if (item.entityType === 'CONTACT') increment(contacts, item.status);
    else {
      increment(documents, item.status);
      increment(item.local.direction === 'PAYABLE' ? payables : receivables, item.status);
    }
  });
  const claimedInvoiceIds = new Set(documentItems.flatMap(item => item.xero?.id ? [item.xero.id] : []));
  const invoiceStatuses: Record<string, number> = {};
  xeroInvoices.forEach(invoice => {
    invoiceStatuses[invoice.status || 'UNKNOWN'] = (invoiceStatuses[invoice.status || 'UNKNOWN'] || 0) + 1;
  });
  const generatedAt = input.generatedAt || new Date().toISOString();
  const hashSource = items
    .map(item => [item.entityType, item.localId, item.status, item.xero?.id || '', item.reasons.join(',')].join('|'))
    .sort()
    .join('\n');
  const previewHash = createHash('sha256').update(hashSource).digest('hex');
  const reviewCount = contacts.REVIEW + contacts.CONFLICT + contacts.MISSING
    + documents.REVIEW + documents.CONFLICT + documents.MISSING;

  return {
    previewHash,
    generatedAt,
    summary: {
      contacts,
      documents,
      receivables,
      payables,
      xero: {
        contacts: xeroContacts.length,
        invoices: xeroInvoices.length,
        payments: xeroPayments.length,
        orphanInvoices: xeroInvoices.filter(invoice => !claimedInvoiceIds.has(invoice.id)).length,
        invoiceStatuses,
      },
      exactLinkCount: contacts.EXACT + documents.EXACT,
      reviewCount,
    },
    items,
  };
};
