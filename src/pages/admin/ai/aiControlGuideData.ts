export type AIControlGuideTab = 'control' | 'suggestions' | 'executions' | 'runs' | 'audit';

export type AIControlTourStep = {
  id: string;
  target: string;
  tab: AIControlGuideTab;
  title: string;
  description: string;
  detail: string;
};

export const AI_CONTROL_TOUR_STORAGE_KEY = 'lingland.ai-control-tour.v2';

export const AI_CONTROL_TOUR_STEPS: AIControlTourStep[] = [
  {
    id: 'safety',
    target: 'safety',
    tab: 'control',
    title: 'Confirm the safety state',
    description: 'Start every session here.',
    detail: 'Check the operating mode, provider connection, execution state and external communication policy before running a review.',
  },
  {
    id: 'guardrails',
    target: 'guardrails',
    tab: 'control',
    title: 'Set the operating guardrails',
    description: 'Control what the AI may analyse.',
    detail: 'Choose the mode, simulation boundary, risk approvals, action limits and emergency pause. The server validates every combination again when it is saved and executed.',
  },
  {
    id: 'provider',
    target: 'provider',
    tab: 'control',
    title: 'Verify DeepSeek',
    description: 'The credential stays outside the browser.',
    detail: 'Use Test connection after changing the Secret Manager key. Connected confirms the server can reach the configured provider.',
  },
  {
    id: 'review',
    target: 'review',
    tab: 'control',
    title: 'Run a focused review',
    description: 'Analyse one operational scope at a time.',
    detail: 'Select Jobs, Allocation, Billing, Mirror sync, Cost or Platform. In an execution mode, eligible rule-engine findings can continue through the configured approval policy.',
  },
  {
    id: 'suggestions',
    target: 'suggestions',
    tab: 'suggestions',
    title: 'Review every finding',
    description: 'Evidence comes before action.',
    detail: 'Filter the queue, open a finding and inspect its reason, evidence, data used, confidence and risk. Add structured feedback to improve future reviews.',
  },
  {
    id: 'executions',
    target: 'executions',
    tab: 'executions',
    title: 'Verify every action',
    description: 'Execution is a ledger, not a black box.',
    detail: 'Inspect simulations and live actions, confirm their outcome state, and roll back reversible successful actions when the source record has not drifted.',
  },
  {
    id: 'runs',
    target: 'runs',
    tab: 'runs',
    title: 'Monitor review runs',
    description: 'See what ran and how it finished.',
    detail: 'Runs records the scope, mode, provider state, number of findings and final result. A provider error does not permit fallback execution.',
  },
  {
    id: 'audit',
    target: 'audit',
    tab: 'audit',
    title: 'Close the audit loop',
    description: 'Every important decision remains traceable.',
    detail: 'Audit records settings changes, reviews, approvals, executions, rollbacks and communication attempts together with role, scope and result.',
  },
];
