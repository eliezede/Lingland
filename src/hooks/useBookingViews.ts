import { useState, useEffect } from 'react';
import { BookingView, BookingStatus } from '../types';

const STORAGE_KEY_PREFIX = 'lingland_booking_views_';

export const SYSTEM_VIEWS: BookingView[] = [
    {
        id: 'sys-all',
        name: 'All Bookings',
        icon: 'table',
        isSystem: true,
        filters: {},
        sortBy: 'dateDesc'
    },
    {
        id: 'sys-status-date',
        name: 'Jobs by Status & Date',
        icon: 'table',
        isSystem: true,
        filters: {},
        sortBy: 'status', // Requires custom client-side sort logic to sort by status then date
        groupBy: 'status'
    },
    {
        id: 'sys-date-time',
        name: 'Jobs by Date & Time',
        icon: 'table',
        isSystem: true,
        filters: {},
        sortBy: 'dateAsc',
        groupBy: 'date'
    },
    {
        id: 'sys-unassigned',
        name: 'Unassigned Jobs',
        icon: 'user-minus',
        isSystem: true,
        filters: {
            hasInterpreter: false,
            statuses: [BookingStatus.INCOMING, BookingStatus.OPENED]
        },
        sortBy: 'dateAsc'
    },
    {
        id: 'sys-today-tomorrow',
        name: 'Jobs for Today & Tomorrow',
        icon: 'calendar',
        isSystem: true,
        filters: {
            dateRange: 'TOMORROW' // We'll interpret this as Today + Tomorrow in the filter logic
        },
        sortBy: 'dateAsc'
    }
];

export function useBookingViews(userId: string) {
    const [views, setViews] = useState<BookingView[]>(SYSTEM_VIEWS);
    const [activeViewId, setActiveViewId] = useState<string>(SYSTEM_VIEWS[0].id);

    const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

    // Load custom views on mount
    useEffect(() => {
        if (!userId) return;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const storedViews = JSON.parse(stored) as BookingView[];
                const mergedSystemViews = SYSTEM_VIEWS.map(sv => {
                    const existing = storedViews.find(v => v.id === sv.id);
                    if (existing) {
                        return {
                            ...sv,
                            ...existing,
                            groupBy: existing.groupBy || sv.groupBy // Apply default system groupBy if user hasn't explicitly set one
                        };
                    }
                    return sv;
                });
                const customViews = storedViews.filter(v => !v.isSystem);
                setViews([...mergedSystemViews, ...customViews]);
            } else {
                setViews(SYSTEM_VIEWS);
            }
        } catch (e) {
            console.error('Failed to load views', e);
            setViews(SYSTEM_VIEWS);
        }
    }, [userId, storageKey]);

    const saveCustomView = (view: Omit<BookingView, 'id' | 'isSystem'>) => {
        const newView: BookingView = {
            ...view,
            id: `custom-${Date.now()}`,
            isSystem: false,
        };

        const updatedViews = [...views, newView];
        setViews(updatedViews);
        localStorage.setItem(storageKey, JSON.stringify(updatedViews));

        setActiveViewId(newView.id);
    };

    const deleteCustomView = (id: string) => {
        const viewToDelete = views.find(v => v.id === id);
        if (!viewToDelete || viewToDelete.isSystem) return;

        const updatedViews = views.filter(v => v.id !== id);
        setViews(updatedViews);
        localStorage.setItem(storageKey, JSON.stringify(updatedViews));

        if (activeViewId === id) {
            setActiveViewId(SYSTEM_VIEWS[0].id); // Fallback to All Bookings
        }
    };

    const updateCustomView = (id: string, updates: Partial<BookingView>) => {
        const viewIndex = views.findIndex(v => v.id === id);
        if (viewIndex === -1) return; // Allow editing system views

        const updatedViews = [...views];
        updatedViews[viewIndex] = { ...updatedViews[viewIndex], ...updates };

        setViews(updatedViews);
        localStorage.setItem(storageKey, JSON.stringify(updatedViews));
    };

    const activeView = views.find(v => v.id === activeViewId) || SYSTEM_VIEWS[0];

    return {
        views,
        activeView,
        activeViewId,
        setActiveViewId,
        saveCustomView,
        deleteCustomView,
        updateCustomView,
    };
}
