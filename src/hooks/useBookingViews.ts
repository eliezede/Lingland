import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookingView, BookingStatus, BookingWorkspace, ServiceCategory } from '../types';
import { BookingViewService } from '../services/bookingViewService';

const STORAGE_KEY_PREFIX = 'lingland_booking_views_';
const BOOKING_VIEWS_CHANGED_EVENT = 'bookingViewsChanged';

export const OPERATIONS_SYSTEM_VIEWS: BookingView[] = [
    {
        id: 'sys-all',
        name: 'All Bookings',
        icon: 'table',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {},
        sortBy: 'dateDesc'
    },
    {
        id: 'sys-status-date',
        name: 'Jobs by Status & Date',
        icon: 'table',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {},
        sortBy: 'status', // Requires custom client-side sort logic to sort by status then date
        groupBy: 'status'
    },
    {
        id: 'sys-incoming',
        name: 'Incoming',
        icon: 'inbox',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {
            statuses: [BookingStatus.INCOMING, BookingStatus.OPENED, BookingStatus.NEEDS_ASSIGNMENT]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'sys-date-time',
        name: 'Jobs by Date & Time',
        icon: 'table',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {},
        sortBy: 'dateAsc',
        groupBy: 'date'
    },
    {
        id: 'sys-unassigned',
        name: 'Unassigned Jobs',
        icon: 'user-minus',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {
            hasInterpreter: false,
            statuses: [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.ASSIGNMENT_PENDING, BookingStatus.OPENED]
        },
        sortBy: 'dateAsc'
    },
    {
        id: 'sys-waiting-response',
        name: 'Waiting Response',
        icon: 'clock',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {
            statuses: [BookingStatus.ASSIGNMENT_PENDING]
        },
        sortBy: 'dateAsc',
        groupBy: 'interpreter'
    },
    {
        id: 'sys-overdue',
        name: 'Overdue',
        icon: 'alert',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {
            dateRange: 'OVERDUE'
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'sys-interpreting',
        name: 'Interpreting',
        icon: 'headphones',
        isSystem: true,
        isFavorite: true,
        workspace: 'operations',
        filters: {
            serviceCategory: ServiceCategory.INTERPRETATION
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'sys-translations',
        name: 'Translations',
        icon: 'languages',
        isSystem: true,
        isFavorite: false,
        workspace: 'operations',
        filters: {
            serviceCategory: ServiceCategory.TRANSLATION
        },
        sortBy: 'dateAsc',
        groupBy: 'status',
        hiddenColumns: ['location', 'contact', 'duration', 'amount', 'professionalCost', 'margin', 'costCode', 'invoiceRef', 'translationFormat']
    },
    {
        id: 'sys-timesheets',
        name: 'Timesheets',
        icon: 'file-text',
        isSystem: true,
        isFavorite: false,
        workspace: 'operations',
        filters: {
            statuses: [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'sys-translations-due',
        name: 'Translations Delivery Due',
        icon: 'languages',
        isSystem: true,
        isFavorite: false,
        workspace: 'operations',
        filters: {
            serviceCategory: ServiceCategory.TRANSLATION,
            dateRange: 'NEXT_7_DAYS'
        },
        sortBy: 'dateAsc',
        groupBy: 'date',
        hiddenColumns: ['status', 'location', 'contact', 'duration', 'amount', 'professionalCost', 'margin', 'costCode', 'invoiceRef', 'translationFormat']
    },
    {
        id: 'sys-today-tomorrow',
        name: 'Jobs for Today & Tomorrow',
        icon: 'calendar',
        isSystem: true,
        isFavorite: false,
        workspace: 'operations',
        filters: {
            dateRange: 'TODAY_TOMORROW'
        },
        sortBy: 'dateAsc'
    }
];

export const FINANCE_SYSTEM_VIEWS: BookingView[] = [
    {
        id: 'fin-billing-queue',
        name: 'Billing Queue',
        icon: 'receipt',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [
                BookingStatus.SESSION_COMPLETED,
                BookingStatus.TIMESHEET_SUBMITTED,
                BookingStatus.TIMESHEET_VERIFIED,
                BookingStatus.READY_FOR_INVOICE,
                BookingStatus.INVOICING,
                BookingStatus.INVOICED
            ]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'fin-timesheets',
        name: 'Timesheets',
        icon: 'file-text',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'fin-ready-client-invoice',
        name: 'Ready for Client Invoice',
        icon: 'receipt',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING]
        },
        sortBy: 'dateAsc',
        groupBy: 'client'
    },
    {
        id: 'fin-interpreter-invoices',
        name: 'Interpreter Invoice Queue',
        icon: 'users',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING]
        },
        sortBy: 'dateAsc',
        groupBy: 'interpreter'
    },
    {
        id: 'fin-awaiting-payment',
        name: 'Awaiting Payment',
        icon: 'pound',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.INVOICED]
        },
        sortBy: 'dateAsc',
        groupBy: 'client'
    },
    {
        id: 'fin-missing-billing-data',
        name: 'Missing Billing Data',
        icon: 'alert',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {},
        filterRules: [
            { id: 'missing-cost-code', field: 'costCode', operator: 'is', value: '' }
        ],
        sortBy: 'dateAsc',
        groupBy: 'client'
    },
    {
        id: 'fin-profit-review',
        name: 'Profit Review',
        icon: 'pound',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.INVOICED, BookingStatus.PAID]
        },
        sortBy: 'dateDesc',
        groupBy: 'client'
    },
    {
        id: 'fin-paid-jobs',
        name: 'Paid Jobs',
        icon: 'check',
        isSystem: true,
        isFavorite: false,
        workspace: 'finance',
        filters: {
            statuses: [BookingStatus.PAID]
        },
        sortBy: 'dateDesc',
        groupBy: 'client'
    },
    {
        id: 'fin-translation-invoices',
        name: 'Translation Invoices',
        icon: 'languages',
        isSystem: true,
        isFavorite: true,
        workspace: 'finance',
        filters: {
            serviceCategory: ServiceCategory.TRANSLATION,
            statuses: [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.INVOICED]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    },
    {
        id: 'fin-interpreting-invoices',
        name: 'Interpreting Invoices',
        icon: 'headphones',
        isSystem: true,
        isFavorite: false,
        workspace: 'finance',
        filters: {
            serviceCategory: ServiceCategory.INTERPRETATION,
            statuses: [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.INVOICED]
        },
        sortBy: 'dateAsc',
        groupBy: 'status'
    }
];

export const SYSTEM_VIEWS = OPERATIONS_SYSTEM_VIEWS;

const getSystemViews = (workspace: BookingWorkspace) => (
    workspace === 'finance' ? FINANCE_SYSTEM_VIEWS : OPERATIONS_SYSTEM_VIEWS
);

const normalizeViews = (
    sourceViews: BookingView[],
    systemViews: BookingView[],
    workspace: BookingWorkspace,
    userId: string
) => {
    const systemById = new Map(systemViews.map(view => [view.id, view]));
    const seen = new Set<string>();

    const mergedViews = sourceViews
        .map(view => {
            const systemView = systemById.get(view.id);
            seen.add(view.id);

            if (systemView) {
                return {
                    ...systemView,
                    ...view,
                    isSystem: true,
                    viewScope: 'SYSTEM' as const,
                    workspace,
                    groupBy: view.groupBy || systemView.groupBy,
                };
            }

            return {
                ...view,
                isSystem: false,
                viewScope: view.viewScope || 'PERSONAL',
                ownerId: view.ownerId || userId,
                workspace,
            };
        })
        .filter(view => view.workspace === workspace);

    const missingSystemViews = systemViews.filter(view => !seen.has(view.id));
    return [...mergedViews, ...missingSystemViews];
};

export function useBookingViews(userId: string, workspace: BookingWorkspace = 'operations') {
    const systemViews = useMemo(() => getSystemViews(workspace).map(view => ({
        ...view,
        viewScope: 'SYSTEM' as const,
        workspace,
    })), [workspace]);
    const [views, setViews] = useState<BookingView[]>(systemViews);
    const [activeViewId, setActiveViewId] = useState<string>(systemViews[0].id);

    const storageKey = workspace === 'operations'
        ? `${STORAGE_KEY_PREFIX}${userId}`
        : `${STORAGE_KEY_PREFIX}${userId}_${workspace}`;

    const readLocalViews = useCallback(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const storedViews = JSON.parse(stored) as BookingView[];
                return normalizeViews(storedViews, systemViews, workspace, userId);
            }
        } catch (e) {
            console.error('Failed to load views', e);
        }
        return systemViews;
    }, [storageKey, systemViews, workspace, userId]);

    const persistViews = useCallback((updatedViews: BookingView[]) => {
        setViews(updatedViews);
        if (userId) {
            localStorage.setItem(storageKey, JSON.stringify(updatedViews));
            window.dispatchEvent(new CustomEvent(BOOKING_VIEWS_CHANGED_EVENT, { detail: { storageKey } }));
            BookingViewService.saveUserWorkspaceViews(userId, workspace, updatedViews)
                .catch(() => {
                    // Local cache is already updated; the next save will retry Firestore.
                });
        }
    }, [storageKey, userId, workspace]);

    // Load cached views immediately, then hydrate from Firestore when available.
    useEffect(() => {
        if (!userId) {
            setViews(systemViews);
            setActiveViewId(systemViews[0].id);
            return;
        }

        let isMounted = true;
        setViews(readLocalViews());

        BookingViewService.getUserWorkspaceViews(userId, workspace)
            .then(remoteViews => {
                if (!isMounted || !remoteViews) return;
                const normalized = normalizeViews(remoteViews, systemViews, workspace, userId);
                setViews(normalized);
                localStorage.setItem(storageKey, JSON.stringify(normalized));
            })
            .catch(() => {
                // Local cache remains the fallback source.
            });

        const handleViewsChanged = (event: Event) => {
            const customEvent = event as CustomEvent<{ storageKey?: string }>;
            if (!customEvent.detail?.storageKey || customEvent.detail.storageKey === storageKey) {
                setViews(readLocalViews());
            }
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key === storageKey) setViews(readLocalViews());
        };

        window.addEventListener(BOOKING_VIEWS_CHANGED_EVENT, handleViewsChanged);
        window.addEventListener('storage', handleStorage);
        return () => {
            isMounted = false;
            window.removeEventListener(BOOKING_VIEWS_CHANGED_EVENT, handleViewsChanged);
            window.removeEventListener('storage', handleStorage);
        };
    }, [userId, workspace, storageKey, systemViews, readLocalViews]);

    useEffect(() => {
        if (!views.some(view => view.id === activeViewId)) {
            setActiveViewId(systemViews[0].id);
        }
    }, [views, activeViewId, systemViews]);

    const saveCustomView = (view: Omit<BookingView, 'id' | 'isSystem'>) => {
        const newView: BookingView = {
            ...view,
            id: `custom-${Date.now()}`,
            isSystem: false,
            viewScope: view.viewScope || 'PERSONAL',
            ownerId: userId,
            workspace,
        };

        const updatedViews = [...views, newView];
        persistViews(updatedViews);

        setActiveViewId(newView.id);
    };

    const deleteCustomView = (id: string) => {
        const viewToDelete = views.find(v => v.id === id);
        if (!viewToDelete || viewToDelete.isSystem) return;

        const updatedViews = views.filter(v => v.id !== id);
        persistViews(updatedViews);

        if (activeViewId === id) {
            setActiveViewId(systemViews[0].id); // Fallback to default workspace view
        }
    };

    const updateCustomView = (id: string, updates: Partial<BookingView>) => {
        const viewIndex = views.findIndex(v => v.id === id);
        if (viewIndex === -1) return; // Allow editing system views

        const updatedViews = [...views];
        updatedViews[viewIndex] = { ...updatedViews[viewIndex], ...updates };

        persistViews(updatedViews);
    };

    const reorderViews = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        const sourceIndex = views.findIndex(view => view.id === sourceId);
        const targetIndex = views.findIndex(view => view.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const updatedViews = [...views];
        const [movedView] = updatedViews.splice(sourceIndex, 1);
        updatedViews.splice(targetIndex, 0, movedView);
        persistViews(updatedViews);
    };

    const toggleViewFavorite = (id: string) => {
        const updatedViews = views.map(view => (
            view.id === id ? { ...view, isFavorite: !view.isFavorite } : view
        ));
        persistViews(updatedViews);
    };

    const activeView = views.find(v => v.id === activeViewId) || systemViews[0];

    return {
        views,
        activeView,
        activeViewId,
        setActiveViewId,
        saveCustomView,
        deleteCustomView,
        updateCustomView,
        reorderViews,
        toggleViewFavorite,
    };
}
