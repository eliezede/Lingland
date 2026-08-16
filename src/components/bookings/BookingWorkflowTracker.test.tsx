import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookingWorkflowTracker } from './BookingWorkflowTracker';

describe('BookingWorkflowTracker', () => {
  it('exposes every stage as a button and marks the selected stage', () => {
    const markup = renderToStaticMarkup(
      <BookingWorkflowTracker
        steps={[
          { id: 'request', label: 'Request', state: 'attention', statusLabel: 'Needs detail' },
          { id: 'assignment', label: 'Assignment', state: 'done', statusLabel: 'Assigned' },
          { id: 'service', label: 'Session', state: 'current', statusLabel: 'Scheduled' },
          { id: 'claim', label: 'Claim', state: 'todo', statusLabel: 'Pending' },
          { id: 'invoice', label: 'Invoice', state: 'todo', statusLabel: 'Pending' },
          { id: 'paid', label: 'Paid', state: 'todo', statusLabel: 'Pending' },
        ]}
        selectedStepId="service"
        title="Session scheduled"
        detail="Review the session context."
        onSelect={() => undefined}
      />,
    );

    expect(markup.match(/<button/g)).toHaveLength(6);
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('Session stage');
    expect(markup).toContain('Needs detail');
  });
});
