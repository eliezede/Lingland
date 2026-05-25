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

export const isInterpreterActiveForWork = (status?: string | null) => status === 'ACTIVE';

export const isInterpreterLocked = (status?: string | null) => status === 'SUSPENDED' || status === 'BLOCKED';

export const requiresInterpreterOnboarding = (status?: string | null) =>
  !isInterpreterActiveForWork(status);

export const getTimesheetInterpreterAmount = (timesheet: Partial<Timesheet>) =>
  Number(timesheet.interpreterAmountCalculated ?? timesheet.totalToPay ?? 0);
