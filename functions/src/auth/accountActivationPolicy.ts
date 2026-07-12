type InterpreterProfile = Record<string, any>;

const LOCKED_STATUSES = new Set(['SUSPENDED', 'BLOCKED']);
const ACTIVE_WORK_STATUSES = new Set(['ACTIVE', 'ONLY_TRANSL']);

const defaultOnboarding = {
  dbs: { status: 'MISSING' },
  idCheck: { status: 'MISSING' },
  certifications: { status: 'MISSING' },
  rightToWork: { status: 'MISSING' },
  overallStatus: 'DOCUMENTS_PENDING',
};

export const buildInterpreterActivationPatch = (
  profile: InterpreterProfile | undefined,
  now: string
): InterpreterProfile => {
  const status = String(profile?.status || '').toUpperCase();
  const isImportedWorkforce = status === 'IMPORTED' || String(profile?.sourceSystem || '').toUpperCase() === 'AIRTABLE';

  if (LOCKED_STATUSES.has(status)) {
    return { status, isAvailable: false, accountActivatedAt: now, updatedAt: now };
  }

  if (ACTIVE_WORK_STATUSES.has(status)) {
    return { status, accountActivatedAt: now, updatedAt: now };
  }

  if (isImportedWorkforce) {
    return {
      status: profile?.translationOnly === true ? 'ONLY_TRANSL' : 'ACTIVE',
      accountActivatedAt: now,
      updatedAt: now,
    };
  }

  return {
    status: 'ONBOARDING',
    isAvailable: false,
    onboarding: profile?.onboarding || defaultOnboarding,
    accountActivatedAt: now,
    updatedAt: now,
  };
};
