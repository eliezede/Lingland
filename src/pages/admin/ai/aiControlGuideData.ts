export type AIControlGuideTab = 'control' | 'suggestions' | 'executions' | 'runs' | 'audit';

export type AIControlTourStep = {
  id: string;
  target: string;
  tab: AIControlGuideTab;
  title: string;
  description: string;
  detail: string;
};

export const AI_CONTROL_TOUR_STORAGE_KEY = 'lingland.ai-governance-tour.v1';

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
    id: 'audit',
    target: 'audit',
    tab: 'audit',
    title: 'Close the audit loop',
    description: 'Every important decision remains traceable.',
    detail: 'Governance audit records policy changes, reviews, approvals, executions, rollbacks and communication attempts together with role, scope and result.',
  },
];
