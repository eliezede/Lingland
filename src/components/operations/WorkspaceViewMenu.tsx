import React, { useState } from 'react';
import {
    ChevronDown,
    GripVertical,
    LayoutGrid,
    MoreHorizontal,
    Plus,
    Search,
    Settings,
    Star,
} from 'lucide-react';
import { BookingView } from '../../types';

interface WorkspaceViewMenuProps {
    activeView: BookingView;
    views: BookingView[];
    viewSearchQuery: string;
    isOpen: boolean;
    sectionLabel: string;
    activeCount: number;
    onOpenChange: (value: boolean) => void;
    onSearchChange: (value: string) => void;
    onCreateView: () => void;
    onEditView: (viewId: string) => void;
    onSelectView: (viewId: string) => void;
    onToggleFavorite: (viewId: string) => void;
    onReorderView: (sourceViewId: string, targetViewId: string) => void;
    getViewCount: (view: BookingView) => number;
}

export const WorkspaceViewMenu: React.FC<WorkspaceViewMenuProps> = ({
    activeView,
    views,
    viewSearchQuery,
    isOpen,
    sectionLabel,
    activeCount,
    onOpenChange,
    onSearchChange,
    onCreateView,
    onEditView,
    onSelectView,
    onToggleFavorite,
    onReorderView,
    getViewCount,
}) => {
    const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
    const filteredViews = views.filter(view => view.name.toLowerCase().includes(viewSearchQuery.toLowerCase()));
    const favoriteViews = filteredViews.filter(view => view.isFavorite);
    const personalViews = filteredViews.filter(view => !view.isSystem && (view.viewScope || 'PERSONAL') === 'PERSONAL');
    const workspaceViews = filteredViews.filter(view => view.isSystem || view.viewScope === 'TEAM');

    const renderViewButton = (view: BookingView, options: { keyPrefix: string; showCount?: boolean; draggable?: boolean; closeOnSelect?: boolean }) => {
        const isActive = activeView.id === view.id;
        const isDragging = draggedViewId === view.id;

        return (
            <div
                key={`${options.keyPrefix}-${view.id}`}
                draggable={options.draggable}
                onDragStart={(event) => {
                    if (!options.draggable) return;
                    setDraggedViewId(view.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', view.id);
                }}
                onDragOver={(event) => {
                    if (options.draggable && draggedViewId && draggedViewId !== view.id) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                    }
                }}
                onDrop={(event) => {
                    if (!options.draggable || !draggedViewId) return;
                    event.preventDefault();
                    onReorderView(draggedViewId, view.id);
                    setDraggedViewId(null);
                }}
                onDragEnd={() => setDraggedViewId(null)}
                className={`group flex items-center rounded-md text-sm transition-colors ${
                    isActive
                        ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                } ${isDragging ? 'opacity-40' : ''}`}
            >
                <button
                    type="button"
                    onClick={() => {
                        onSelectView(view.id);
                        if (options.closeOnSelect) onOpenChange(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                >
                    {options.draggable && <GripVertical size={13} className="shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />}
                    <LayoutGrid size={15} className="shrink-0 text-blue-500" />
                    <span className="truncate font-semibold">{view.name}</span>
                </button>
                {options.showCount && (
                    <span className="mx-1 shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500 group-hover:bg-white dark:bg-slate-800">
                        {getViewCount(view)}
                    </span>
                )}
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(view.id);
                    }}
                    className={`rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                        view.isFavorite
                            ? 'text-amber-500 opacity-100'
                            : 'text-slate-300 hover:bg-white hover:text-amber-500 dark:text-slate-600 dark:hover:bg-slate-700'
                    }`}
                    aria-label={view.isFavorite ? `Remove ${view.name} from favorites` : `Add ${view.name} to favorites`}
                    title={view.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star size={13} className={view.isFavorite ? 'fill-current' : ''} />
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onEditView(view.id);
                    }}
                    className="mr-1 rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    aria-label={`Edit ${view.name}`}
                    title="Edit view"
                >
                    <MoreHorizontal size={14} />
                </button>
            </div>
        );
    };

    return (
        <>
            <button
                onClick={() => onOpenChange(!isOpen)}
                className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800 sm:w-auto xl:hidden"
            >
                <LayoutGrid size={17} className="text-blue-500" />
                <span className="max-w-[260px] truncate uppercase tracking-wide">{activeView?.name || 'All Bookings'}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activeCount}</span>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 flex h-[560px] w-[350px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                        <button
                            onClick={onCreateView}
                            className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Plus size={16} /> Create new...
                        </button>
                        <button
                            onClick={() => onEditView(activeView.id)}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="View settings"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                    <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Find a view"
                                value={viewSearchQuery}
                                onChange={(event) => onSearchChange(event.target.value)}
                                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Star size={13} className="fill-amber-500 text-amber-500" /> My favorites
                        </p>
                        <div className="ml-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                            {favoriteViews.map(view => renderViewButton(view, { keyPrefix: 'menu-favorite', showCount: true, closeOnSelect: true }))}
                            {favoriteViews.length === 0 && (
                                <p className="px-2 py-2 text-xs text-slate-400">Star views to keep them here.</p>
                            )}
                        </div>

                        {personalViews.length > 0 && (
                            <>
                                <p className="mb-2 mt-5 flex items-center gap-2 text-xs font-bold text-slate-500"><ChevronDown size={13} /> My personal views</p>
                                <div className="ml-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                                    {personalViews.map(view => renderViewButton(view, { keyPrefix: 'menu-personal', draggable: true, closeOnSelect: true }))}
                                </div>
                            </>
                        )}

                        <p className="mb-2 mt-5 flex items-center gap-2 text-xs font-bold text-slate-500"><ChevronDown size={13} /> {sectionLabel}</p>
                        <div className="ml-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                            {workspaceViews.map(view => renderViewButton(view, { keyPrefix: 'menu-booking', draggable: true, closeOnSelect: true }))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
