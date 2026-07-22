export type TranslationEvidenceRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type TranslationClientEvidence = {
  translationRecordId: string;
  invoiceRecordIds: string[];
  invoiceNumbers: string[];
  accountRefs: string[];
  agencyNames: string[];
  requestedByNames: string[];
  emails: string[];
  accountRefAmbiguous: boolean;
  accountRefSource: 'INVOICE_NUMBER' | 'SHARED_EMAIL' | 'EXACT_AGENCY' | '';
};

export type TranslationClientIdentity = {
  companyName: string;
  normalizedCompanyName: string;
  bookingAgent: string;
  email: string;
  phone: string;
  billingAddress: string;
  uniqueClientKey: string;
  sageAccountRef: string;
  invoiceContact: string;
  invoiceEmail: string;
  invoicePhone: string;
  departmentName: string;
  locationName: string;
  clientStatus: string;
  clientTrade: string;
};

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    return text(candidate.id || candidate.name || candidate.value);
  }
  return '';
};

const values = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    const normalized = text(value);
    return normalized ? [normalized] : [];
  }
  return value.flatMap(item => values(item));
};

const normalizeFieldName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const collectFieldValues = (fields: Record<string, unknown>, names: string[]): string[] => {
  const requested = names.map(normalizeFieldName);
  const collected: string[] = [];
  Object.entries(fields).forEach(([fieldName, value]) => {
    const normalized = normalizeFieldName(fieldName);
    if (requested.some(name => normalized === name || normalized.startsWith(name) || normalized.endsWith(name))) {
      collected.push(...values(value));
    }
  });
  return unique(collected);
};

const unique = (input: string[]) => Array.from(new Set(input.map(value => value.trim()).filter(Boolean)));

export const normalizeTranslationClientName = (value: string): string => value
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\b(ltd|limited|plc|nhs|trust|cic|llp|department|dept|service|services)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const accountRefFromTranslationInvoice = (invoiceNumber: string): string => {
  const normalized = invoiceNumber.trim().toUpperCase();
  if (!normalized || /^REC[A-Z0-9]+$/.test(normalized)) return '';
  const match = normalized.match(/^([A-Z][A-Z0-9]{2,})(?=[.\s/_-]|$)/);
  if (!match) return '';
  const candidate = match[1];
  return ['AIRTABLE', 'INVOICE', 'TRANSLATION'].includes(candidate) ? '' : candidate;
};

export const buildTranslationClientEvidence = (
  records: TranslationEvidenceRecord[],
): Map<string, TranslationClientEvidence> => {
  const evidence = new Map<string, TranslationClientEvidence>();

  records.forEach(record => {
    const linkedTranslationIds = collectFieldValues(record.fields, [
      'Translations',
      'TR ID',
    ]).filter(value => /^rec[a-z0-9]+$/i.test(value));
    if (linkedTranslationIds.length === 0) return;

    const invoiceNumbers = collectFieldValues(record.fields, [
      'TR Invoice Nbr',
      'Invoice Number',
      'Invoice No',
      'Invoice Reference',
      'Reference',
      'Name',
    ]).filter(value => !/^rec[a-z0-9]+$/i.test(value));
    const accountRefs = unique(invoiceNumbers.map(accountRefFromTranslationInvoice));
    const agencyNames = collectFieldValues(record.fields, ['TR Agency']);
    const requestedByNames = collectFieldValues(record.fields, ['TR Requested By']);
    const emails = collectFieldValues(record.fields, ['TR client email']).map(value => value.toLowerCase());

    linkedTranslationIds.forEach(translationRecordId => {
      const current = evidence.get(translationRecordId) || {
        translationRecordId,
        invoiceRecordIds: [],
        invoiceNumbers: [],
        accountRefs: [],
        agencyNames: [],
        requestedByNames: [],
        emails: [],
        accountRefAmbiguous: false,
        accountRefSource: '',
      };
      const mergedAccountRefs = unique([...current.accountRefs, ...accountRefs]);
      evidence.set(translationRecordId, {
        translationRecordId,
        invoiceRecordIds: unique([...current.invoiceRecordIds, record.id]),
        invoiceNumbers: unique([...current.invoiceNumbers, ...invoiceNumbers]),
        accountRefs: mergedAccountRefs,
        agencyNames: unique([...current.agencyNames, ...agencyNames]),
        requestedByNames: unique([...current.requestedByNames, ...requestedByNames]),
        emails: unique([...current.emails, ...emails]),
        accountRefAmbiguous: mergedAccountRefs.length > 1,
        accountRefSource: mergedAccountRefs.length === 1 ? 'INVOICE_NUMBER' : '',
      });
    });
  });

  const refsByEmail = new Map<string, Set<string>>();
  const refsByAgency = new Map<string, Set<string>>();
  const addRefs = (index: Map<string, Set<string>>, key: string, refs: string[]) => {
    if (!key) return;
    const current = index.get(key) || new Set<string>();
    refs.forEach(ref => current.add(ref));
    index.set(key, current);
  };
  evidence.forEach(item => {
    if (item.accountRefs.length !== 1 || item.accountRefAmbiguous) return;
    item.emails.forEach(email => addRefs(refsByEmail, email.toLowerCase(), item.accountRefs));
    item.agencyNames.forEach(agency => addRefs(refsByAgency, normalizeTranslationClientName(agency), item.accountRefs));
  });
  evidence.forEach((item, translationRecordId) => {
    if (item.accountRefs.length > 0) return;
    const emailRefs = unique(item.emails.flatMap(email => Array.from(refsByEmail.get(email.toLowerCase()) || [])));
    const agencyRefs = unique(item.agencyNames.flatMap(agency => (
      Array.from(refsByAgency.get(normalizeTranslationClientName(agency)) || [])
    )));
    const inferredRefs = emailRefs.length === 1 ? emailRefs : agencyRefs.length === 1 ? agencyRefs : [];
    const competingRefs = unique([...emailRefs, ...agencyRefs]);
    evidence.set(translationRecordId, {
      ...item,
      accountRefs: inferredRefs,
      accountRefAmbiguous: competingRefs.length > 1 && inferredRefs.length === 0,
      accountRefSource: emailRefs.length === 1
        ? 'SHARED_EMAIL'
        : agencyRefs.length === 1
          ? 'EXACT_AGENCY'
          : '',
    });
  });

  return evidence;
};

export const enrichTranslationClientIdentity = (
  identity: TranslationClientIdentity,
  evidence?: TranslationClientEvidence,
): TranslationClientIdentity => {
  if (!evidence) return identity;
  const accountRef = evidence.accountRefs.length === 1 ? evidence.accountRefs[0] : '';
  const companyName = identity.companyName === 'Airtable Client'
    ? evidence.agencyNames[0] || identity.companyName
    : identity.companyName;
  const email = identity.email || evidence.emails[0] || '';
  return {
    ...identity,
    companyName,
    normalizedCompanyName: normalizeTranslationClientName(companyName),
    bookingAgent: identity.bookingAgent || evidence.requestedByNames[0] || '',
    email,
    uniqueClientKey: identity.uniqueClientKey || accountRef,
    sageAccountRef: identity.sageAccountRef || accountRef,
    invoiceEmail: identity.invoiceEmail || email,
  };
};
