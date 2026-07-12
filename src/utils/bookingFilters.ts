import { Booking, BookingView, BookingStatus } from '../types';

const hasFinanceException = (booking: Booking) => {
    const clientCharge = Number(booking.clientInvoiceTotal ?? booking.totalAmount ?? booking.finalQuote ?? 0);
    const professionalCost = Number(
        booking.interpreterInvoiceTotal
        ?? booking.interpreterAmountCalculated
        ?? booking.professionalCost
        ?? 0
    );
    const clientReference = booking.clientInvoiceNumber || booking.clientInvoiceReference;
    const professionalReference = booking.interpreterInvoiceNumber || booking.interpreterInvoiceReference;
    const clientInvoiceIssued = [BookingStatus.INVOICED, BookingStatus.PAID].includes(booking.status)
        || Boolean(booking.clientInvoiceId);
    const professionalInvoiceRecorded = Boolean(booking.interpreterInvoiceId || professionalReference);

    return Boolean(
        booking.billingIssueFlag
        || !booking.costCode
        || Math.abs(clientCharge) < 0.005
        || (clientInvoiceIssued && !clientReference)
        || (professionalInvoiceRecorded && Math.abs(professionalCost) < 0.005)
    );
};

/**
 * Filter and sort bookings based on a BookingView configuration.
 */
export const filterBookings = (bookings: Booking[], view: BookingView): Booking[] => {
    let result = [...bookings];

    // 1. Filtering Logic

    // 1.1 Legacy Filter Compatibility (Only if no advanced rules are present, or merge them)
    if (view.filters) {
        const { filters } = view;
        if (filters.statuses && filters.statuses.length > 0) {
            result = result.filter(b => filters.statuses!.includes(b.status));
        }

        if (filters.hasInterpreter !== undefined) {
            result = result.filter(b => filters.hasInterpreter ? !!b.interpreterId : !b.interpreterId);
        }

        if (filters.serviceCategory) {
            result = result.filter(b => b.serviceCategory === filters.serviceCategory);
        }

        if (filters.dateRange) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const next7Days = new Date(today);
            next7Days.setDate(next7Days.getDate() + 7);

            result = result.filter(b => {
                const bookingDate = new Date(b.date);
                bookingDate.setHours(0, 0, 0, 0);

                switch (filters.dateRange) {
                    case 'TODAY':
                        return bookingDate.getTime() === today.getTime();
                    case 'TOMORROW':
                    case 'TODAY_TOMORROW':
                        return bookingDate.getTime() >= today.getTime() && bookingDate.getTime() <= tomorrow.getTime();
                    case 'OVERDUE':
                        return bookingDate.getTime() < today.getTime()
                            && ![BookingStatus.CANCELLED, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status);
                    case 'NEXT_7_DAYS':
                        return bookingDate.getTime() >= today.getTime() && bookingDate.getTime() <= next7Days.getTime();
                    case 'THIS_MONTH':
                        return bookingDate.getMonth() === today.getMonth() && bookingDate.getFullYear() === today.getFullYear();
                    default:
                        return true;
                }
            });
        }
    }

    // 1.2 Advanced Filter Rules
    if (view.filterRules && view.filterRules.length > 0) {
        view.filterRules.forEach(rule => {
            result = result.filter(b => {
                const rawValue = rule.field === 'financeException'
                    ? hasFinanceException(b)
                    : (b as any)[rule.field];

                // Normalization for comparison
                const value = String(rawValue || '').toLowerCase();
                const targetValue = String(rule.value || '').toLowerCase();

                if (rule.field === 'date') {
                    const bookingDateObj = new Date(b.date);
                    bookingDateObj.setHours(0, 0, 0, 0);
                    const bookingTime = bookingDateObj.getTime();

                    if (rule.operator === 'is') {
                        const targetDateObj = new Date(targetValue);
                        targetDateObj.setHours(0, 0, 0, 0);
                        return bookingTime === targetDateObj.getTime();
                    }
                    if (rule.operator === 'isAfter') {
                        const targetDateObj = new Date(targetValue);
                        targetDateObj.setHours(0, 0, 0, 0);
                        return bookingTime > targetDateObj.getTime();
                    }
                    if (rule.operator === 'isBefore') {
                        const targetDateObj = new Date(targetValue);
                        targetDateObj.setHours(0, 0, 0, 0);
                        return bookingTime < targetDateObj.getTime();
                    }
                    if (rule.operator === 'isBetween') {
                        const [start, end] = targetValue.split(',');
                        if (!start || !end) return true;

                        const startDateObj = new Date(start);
                        startDateObj.setHours(0, 0, 0, 0);

                        const endDateObj = new Date(end);
                        endDateObj.setHours(23, 59, 59, 999);

                        return bookingTime >= startDateObj.getTime() && bookingTime <= endDateObj.getTime();
                    }
                    return true;
                }

                switch (rule.operator) {
                    case 'is':
                        return value === targetValue;
                    case 'isNot':
                        return value !== targetValue;
                    case 'contains':
                        return value.includes(targetValue);
                    default:
                        return true;
                }
            });
        });
    }

    // 2. Sorting Logic

    if (view.sortRules && view.sortRules.length > 0) {
        result.sort((a, b) => {
            for (const rule of view.sortRules!) {
                const valA = (a as any)[rule.field];
                const valB = (b as any)[rule.field];

                if (valA === valB) continue;

                const factor = rule.direction === 'asc' ? 1 : -1;

                // Specialized comparisons
                if (rule.field === 'date') {
                    const timeA = new Date(valA).getTime();
                    const timeB = new Date(valB).getTime();
                    if (timeA === timeB) continue;
                    return (timeA - timeB) * factor;
                }

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * factor;
                }

                return String(valA || '').localeCompare(String(valB || '')) * factor;
            }
            return 0;
        });
    } else if (view.sortBy) {
        // Fallback to legacy sortBy
        switch (view.sortBy) {
            case 'dateAsc':
                result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                break;
            case 'dateDesc':
                result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                break;
            case 'status':
                result.sort((a, b) => a.status.localeCompare(b.status));
                break;
            case 'client':
                result.sort((a, b) => a.clientName.localeCompare(b.clientName));
                break;
        }
    }

    return result;
};

/**
 * Group bookings by a specific field.
 */
export const groupBookings = (bookings: Booking[], groupByField: string | undefined): Record<string, Booking[]> => {
    if (!groupByField) return { 'All Jobs': bookings };

    return bookings.reduce((groups, booking) => {
        let groupValue = (booking as any)[groupByField];

        // Handle specialized formatting for certain fields
        if (groupByField === 'date') {
            groupValue = new Date(groupValue).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        }

        const key = String(groupValue || 'Uncategorized');
        if (!groups[key]) groups[key] = [];
        groups[key].push(booking);
        return groups;
    }, {} as Record<string, Booking[]>);
};
