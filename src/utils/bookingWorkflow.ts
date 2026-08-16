export type BookingWorkflowStepId = 'request' | 'assignment' | 'service' | 'claim' | 'invoice' | 'paid';

export type BookingWorkflowStepState = 'done' | 'attention' | 'current' | 'todo';

export type BookingWorkflowProgress = {
  requestNeedsAttention: boolean;
  assignmentComplete: boolean;
  serviceComplete: boolean;
  claimComplete: boolean;
  invoiceComplete: boolean;
  paidComplete: boolean;
  serviceLabel: 'Session' | 'Delivery';
  serviceScheduled?: boolean;
};
export type BookingWorkflowStep = {
  id: BookingWorkflowStepId;
  label: string;
  state: BookingWorkflowStepState;
  statusLabel: string;
};

export const getCurrentBookingWorkflowStep = (
  progress: BookingWorkflowProgress,
): BookingWorkflowStepId => {
  if (!progress.assignmentComplete) return 'assignment';
  if (!progress.serviceComplete) return 'service';
  if (!progress.claimComplete) return 'claim';
  if (!progress.invoiceComplete) return 'invoice';
  return 'paid';
};

export const buildBookingWorkflowSteps = (
  progress: BookingWorkflowProgress,
): BookingWorkflowStep[] => {
  const currentStep = getCurrentBookingWorkflowStep(progress);
  const stateFor = (id: BookingWorkflowStepId, complete: boolean): BookingWorkflowStepState => {
    if (complete) return 'done';
    return currentStep === id ? 'current' : 'todo';
  };

  return [
    {
      id: 'request',
      label: 'Request',
      state: progress.requestNeedsAttention ? 'attention' : 'done',
      statusLabel: progress.requestNeedsAttention ? 'Needs detail' : 'Captured',
    },
    {
      id: 'assignment',
      label: 'Assignment',
      state: stateFor('assignment', progress.assignmentComplete),
      statusLabel: progress.assignmentComplete ? 'Assigned' : currentStep === 'assignment' ? 'Action required' : 'Pending',
    },
    {
      id: 'service',
      label: progress.serviceLabel,
      state: stateFor('service', progress.serviceComplete),
      statusLabel: progress.serviceComplete
        ? 'Delivered'
        : currentStep === 'service' && progress.serviceScheduled
          ? 'Scheduled'
          : currentStep === 'service'
            ? 'Action required'
            : 'Pending',
    },
    {
      id: 'claim',
      label: 'Claim',
      state: stateFor('claim', progress.claimComplete),
      statusLabel: progress.claimComplete ? 'Recorded' : currentStep === 'claim' ? 'Action required' : 'Pending',
    },
    {
      id: 'invoice',
      label: 'Invoice',
      state: stateFor('invoice', progress.invoiceComplete),
      statusLabel: progress.invoiceComplete ? 'Issued' : currentStep === 'invoice' ? 'Action required' : 'Pending',
    },
    {
      id: 'paid',
      label: 'Paid',
      state: stateFor('paid', progress.paidComplete),
      statusLabel: progress.paidComplete ? 'Received' : currentStep === 'paid' ? 'Awaiting payment' : 'Pending',
    },
  ];
};
