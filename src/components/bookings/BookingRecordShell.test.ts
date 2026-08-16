import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BookingRecordHeader,
  createBookingDetailNavigationState,
  getBookingNavigationStateForReturn,
  getParentBookingNavigationState,
} from './BookingRecordShell';

describe('booking record navigation', () => {
  it('keeps the record header in normal document flow', () => {
    const markup = renderToStaticMarkup(BookingRecordHeader({
      title: 'Booking record',
      reference: 'LING26.17351 Polish',
      subtitle: 'Homelessness Dept',
      status: 'INVOICING',
      backLabel: 'Filtered Job Centre',
      onBack: () => undefined,
      actions: null,
    }));

    expect(markup).not.toContain('sticky');
    expect(markup).not.toContain('backdrop-blur');
  });

  it('keeps title, essentials and progress inside one record card', () => {
    const markup = renderToStaticMarkup(BookingRecordHeader({
      title: 'Booking record',
      reference: 'LING26.17351 Polish',
      subtitle: 'Homelessness Dept',
      status: 'BOOKED',
      backLabel: 'Job Centre',
      onBack: () => undefined,
      actions: null,
      summary: 'Essential summary',
      progress: 'Workflow progress',
    }));

    expect(markup).toContain('rounded-lg');
    expect(markup.indexOf('Booking record')).toBeLessThan(markup.indexOf('Essential summary'));
    expect(markup.indexOf('Essential summary')).toBeLessThan(markup.indexOf('Workflow progress'));
    expect(markup).not.toContain('sticky');
  });

  it('keeps the exact workspace as the parent of the detail/edit flow', () => {
    const detailState = createBookingDetailNavigationState(
      '/admin/bookings/airtable_rec123',
      {
        returnTo: '/admin/bookings?view=sys-incoming&service=interpreting',
        returnLabel: 'Incoming jobs',
        returnState: { workspaceSnapshot: { searchQuery: 'LING26.17028', currentPage: 4 } },
      },
    );

    expect(detailState).toEqual({
      returnTo: '/admin/bookings/airtable_rec123',
      returnLabel: 'Booking record',
      parentReturnTo: '/admin/bookings?view=sys-incoming&service=interpreting',
      parentReturnLabel: 'Incoming jobs',
      parentReturnState: { workspaceSnapshot: { searchQuery: 'LING26.17028', currentPage: 4 } },
    });
  });

  it('restores the workspace state when edit returns to the detail page', () => {
    const detailState = createBookingDetailNavigationState(
      '/admin/bookings/airtable_rec123',
      {
        returnTo: '/admin/dashboard?queue=overdue',
        returnLabel: 'Operations Command',
      },
    );

    expect(getParentBookingNavigationState(detailState)).toEqual({
      returnTo: '/admin/dashboard?queue=overdue',
      returnLabel: 'Operations Command',
    });
  });

  it('does not invent a parent when detail was opened directly', () => {
    const detailState = createBookingDetailNavigationState('/admin/bookings/airtable_rec123');

    expect(getParentBookingNavigationState(detailState)).toBeUndefined();
  });

  it('returns a direct workspace snapshot when edit was opened from the board', () => {
    const returnState = { workspaceSnapshot: { quickFilter: 'OVERDUE', currentPage: 3 } };

    expect(getBookingNavigationStateForReturn({
      returnTo: '/admin/bookings?view=sys-overdue',
      returnLabel: 'Filtered Job Centre',
      returnState,
    })).toBe(returnState);
  });

  it('wraps the parent workspace snapshot when edit returns through detail', () => {
    const detailState = createBookingDetailNavigationState(
      '/admin/bookings/airtable_rec123',
      {
        returnTo: '/admin/bookings?view=sys-overdue',
        returnLabel: 'Filtered Job Centre',
        returnState: { workspaceSnapshot: { searchQuery: 'T9097' } },
      },
    );

    expect(getBookingNavigationStateForReturn(detailState)).toEqual({
      returnTo: '/admin/bookings?view=sys-overdue',
      returnLabel: 'Filtered Job Centre',
      returnState: { workspaceSnapshot: { searchQuery: 'T9097' } },
    });
  });
});
