import React, { useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    GripVertical,
    LayoutGrid,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Star,
} from 'lucide-react';
import { BookingView } from '../../types';

interface WorkspaceViewSidebarProps {
    activeView: BookingView;
    views: BookingView[];
    viewSearchQuery: string;
    isCollapsed: boolean;
    sectionLabel: string;
    onSearchChange: (value: string) => void;
    onCollapsedChange: (value: boolean) => void;
    onCreateView: () => void;
    onEditView: (viewId: string) => void;
    onSelectView: (viewId: string) => void;
    onToggleFavorite: (viewId: string) => void;
    onReorderView: (sourceViewId: string, targetViewId: string) => void;
    getViewCount: (view: BookingView) => number;
    fallbackViewName?: string;
}

export const WorkspaceViewSidebar: React.FC<WorkspaceViewSidebarProps> = ({
    activeView,
    views,
    viewSearchQuery,
    isCollapsed,
    sectionLabel,
    onSearchChange,
    onCollapsedChange,
    onCreateView,
    onEditView,
    onSelectView,
    onToggleFavorite,
    onReorderView,
    getViewCount,
    fallbackViewName = 'All Jobs',
}) => {
    const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
    const filteredViews = views.filter(view => view.name.toLowerCase().includes(viewSearchQuery.toLowerCase()));
    const favoriteViews = filteredViews.filter(view => view.isFavorite);
    const personalViews = filteredViews.filter(view => !view.isSystem && (view.viewScope || 'PERSONAL') === 'PERSONAL');
    const workspaceViews = filteredViews.filter(view => view.isSystem || view.viewScope === 'TEAM');

    const renderViewButton = (view: BookingView, options: { keyPrefix: string; showCount?: boolean; draggable?: boolean }) => {
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
                    onClick={() => onSelectView(view.id)}
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
        <aside className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 xl:flex ${isCollapsed ? 'w-12' : 'w-72'}`}>
            <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
                <div className={`flex min-w-0 items-center gap-2 ${isCollapsed ? 'hidden' : ''}`}>
                    <LayoutGrid size={16} className="shrink-0 text-blue-500" />
                    <span className="truncate text-sm font-semibold text-slate-950 dark:text-white">{activeView?.name || fallbackViewName}</span>
                </div>
                <div className={`flex items-center ${isCollapsed ? 'mx-auto' : 'gap-1'}`}>
                    {!isCollapsed && (
                        <button
                            onClick={onCreateView}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Create view"
                        >
                            <Plus size={15} />
                        </button>
                    )}
                    {!isCollapsed && (
                        <button
                            onClick={() => onEditView(activeView.id)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Edit active view"
                            title="Edit active view"
                        >
                            <Pencil size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => onCollapsedChange(!isCollapsed)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label={isCollapsed ? 'Expand views sidebar' : 'Collapse views sidebar'}
                        title={isCollapsed ? 'Expand views' : 'Collapse views'}
                    >
                        {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                    </button>
                </div>
            </div>
            {isCollapsed ? (
                <div className="flex flex-1 flex-col items-center gap-2 py-3">
                    <LayoutGrid size={17} className="text-blue-500" />
                    <button
                        onClick={() => onCollapsedChange(false)}
                        className="rounded-md px-1 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 [writing-mode:vertical-rl] hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        title={activeView?.name || 'Views'}
                    >
                        Views
                    </button>
                </div>
            ) : (
                <>
                    <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Find a view"
                                value={viewSearchQuery}
                                onChange={(event) => onSearchChange(event.target.value)}
                                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Favorites</p>
                        <div className="space-y-1">
                            {favoriteViews.map(view => renderViewButton(view, { keyPrefix: 'favorite', showCount: true }))}
                            {favoriteViews.length === 0 && (
                                <p className="px-2 py-2 text-xs text-slate-400">Star views to keep them here.</p>
                            )}
                        </div>
                        {personalViews.length > 0 && (
                            <>
                                <div className="mb-2 mt-5 flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">My personal views</p>
                                    <span className="text-[10px] font-semibold text-slate-400">Drag to reorder</span>
                                </div>
                                <div className="space-y-1">
                                    {personalViews.map(view => renderViewButton(view, { keyPrefix: 'personal', draggable: true }))}
                                </div>
                            </>
                        )}
                        <div className="mb-2 mt-5 flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{sectionLabel}</p>
                            <span className="text-[10px] font-semibold text-slate-400">Drag to reorder</span>
                        </div>
                        <div className="space-y-1">
                            {workspaceViews.map(view => renderViewButton(view, { keyPrefix: 'sidebar', draggable: true }))}
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
};
