import { describe, expect, it } from 'vitest';
import { buildBookingWorkflowSteps, getCurrentBookingWorkflowStep } from './bookingWorkflow';

const baseProgress = {
  requestNeedsAttention: false,
  assignmentComplete: true,
  serviceComplete: false,
  claimComplete: false,
  invoiceComplete: false,
  paidComplete: false,
  serviceLabel: 'Session' as const,
  serviceScheduled: true,
};

describe('booking workflow tracker', () => {
  it('selects the first unfinished operational stage', () => {
    expect(getCurrentBookingWorkflowStep(baseProgress)).toBe('service');
    expect(getCurrentBookingWorkflowStep({ ...baseProgress, assignmentComplete: false })).toBe('assignment');
    expect(getCurrentBookingWorkflowStep({ ...baseProgress, serviceComplete: true })).toBe('claim');
  });

  it('keeps request warnings visible without moving the current stage backwards', () => {
    const steps = buildBookingWorkflowSteps({ ...baseProgress, requestNeedsAttention: true });

    expect(steps.find(step => step.id === 'request')?.state).toBe('attention');
    expect(steps.find(step => step.id === 'service')?.state).toBe('current');
  });

  it('uses delivery terminology for translations', () => {
    const steps = buildBookingWorkflowSteps({ ...baseProgress, serviceLabel: 'Delivery' });
    expect(steps.find(step => step.id === 'service')?.label).toBe('Delivery');
  });

  it('shows payment as the final current stage after invoice issue', () => {
    const steps = buildBookingWorkflowSteps({
      ...baseProgress,
      serviceComplete: true,
      claimComplete: true,
      invoiceComplete: true,
    });

    expect(steps.find(step => step.id === 'paid')?.state).toBe('current');
    expect(steps.find(step => step.id === 'paid')?.statusLabel).toBe('Awaiting payment');
  });
});
