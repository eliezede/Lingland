import { Interpreter, OnboardingDocStatus, Timesheet } from '../types';

export const createDefaultOnboarding = (): NonNullable<Interpreter['onboarding']> => ({
  dbs: { status: 'MISSING' as OnboardingDocStatus },
  idCheck: { status: 'MISSING' as OnboardingDocStatus },
  certifications: { status: 'MISSING' as OnboardingDocStatus },
  rightToWork: { status: 'MISSING' as OnboardingDocStatus },
  overallStatus: 'DOCUMENTS_PENDING',
});

export const ensureInterpreterOnboarding = (interpreter: Partial<Interpreter>) => ({
  ...createDefaultOnboarding(),
  ...(interpreter.onboarding || {}),
  dbs: { ...createDefaultOnboarding().dbs, ...(interpreter.onboarding?.dbs || {}) },
  idCheck: { ...createDefaultOnboarding().idCheck, ...(interpreter.onboarding?.idCheck || {}) },
  certifications: { ...createDefaultOnboarding().certifications, ...(interpreter.onboarding?.certifications || {}) },
  rightToWork: { ...createDefaultOnboarding().rightToWork, ...(interpreter.onboarding?.rightToWork || {}) },
});

export const isInterpreterActiveForWork = (status?: string | null) => (
  status === 'ACTIVE' || status === 'ONLY_TRANSL'
);

export const isInterpreterAvailableForStaffAssignment = (
  status?: string | null,
  isTranslation = false
) => {
  if (status === 'ACTIVE' || status === 'IMPORTED') return true;
  return isTranslation && status === 'ONLY_TRANSL';
};

export const isInterpreterLocked = (status?: string | null) => status === 'SUSPENDED' || status === 'BLOCKED';

export const requiresInterpreterOnboarding = (status?: string | null) =>
  !isInterpreterActiveForWork(status);

export const getTimesheetInterpreterAmount = (timesheet: Partial<Timesheet>) =>
  Number(timesheet.interpreterAmountCalculated ?? timesheet.totalToPay ?? 0);

const INTERPRETER_SELF_SERVICE_FIELDS = [
  'name', 'shortName', 'photoUrl', 'phone', 'homePhone', 'gender', 'address',
  'addressLine1', 'postcode', 'hasCar', 'skypeId', 'languages',
  'languageProficiencies', 'qualifications', 'regions', 'nrpsi', 'dpsi',
  'experience', 'dbs', 'dbsExpiry', 'dbsDocumentUrl', 'documentUrls',
  'onboarding', 'isAvailable', 'unavailableDates', 'acceptsDirectAssignment',
  'bankDetails',
] as const satisfies ReadonlyArray<keyof Interpreter>;

export const buildInterpreterSelfServicePatch = (
  data: Partial<Interpreter>,
  options: { moveToOnboarding?: boolean } = {}
): Partial<Interpreter> => {
  const patch: Partial<Interpreter> = {};
  INTERPRETER_SELF_SERVICE_FIELDS.forEach((field) => {
    const value = data[field];
    if (value !== undefined) (patch as Record<string, unknown>)[field] = value;
  });
  if (options.moveToOnboarding) patch.status = 'ONBOARDING';
  return patch;
};
