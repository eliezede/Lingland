import React, { useState } from 'react';
import { ChevronDown, MoreHorizontal, Check } from 'lucide-react';
import { ContextMenu } from './ContextMenu';

interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => React.ReactNode);
    className?: string;
    render?: (item: T) => React.ReactNode;
}

export interface TableGroup<T> {
    key: string;
    items: T[];
}

interface TableProps<T> {
    data?: T[];
    groups?: TableGroup<T>[];
    columns: Column<T>[];
    onRowClick?: (item: T) => void;
    onRowDoubleClick?: (item: T) => void;
    renderContextMenu?: (item: T) => any[]; // Returns items for ContextMenu
    selectable?: boolean;
    selectedIds?: string[];
    onSelectionChange?: (ids: string[]) => void;
    idField?: keyof T;
    isLoading?: boolean;
    emptyMessage?: string;
    defaultGroupsCollapsed?: boolean;
}

export function Table<T extends { [key: string]: any }>({
    data = [],
    groups,
    columns,
    onRowClick,
    onRowDoubleClick,
    renderContextMenu,
    selectable,
    selectedIds = [],
    onSelectionChange,
    idField = 'id' as keyof T,
    isLoading,
    emptyMessage = "No data found",
    defaultGroupsCollapsed = false
}: TableProps<T>) {
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        new Set(defaultGroupsCollapsed && groups ? groups.map(g => g.key) : [])
    );

    const toggleGroup = (key: string) => {
        const next = new Set(collapsedGroups);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        setCollapsedGroups(next);
    };

    const flatData = groups ? groups.flatMap(g => g.items) : data;
    const hasRowActions = Boolean(renderContextMenu);

    const toggleSelectAll = () => {
        if (!onSelectionChange) return;
        if (selectedIds.length === flatData.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(flatData.map(item => String(item[idField])));
        }
    };

    const toggleSelectItem = (id: string) => {
        if (!onSelectionChange) return;
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter(i => i !== id));
        } else {
            onSelectionChange([...selectedIds, id]);
        }
    };

    if (isLoading) {
        return (
            <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="animate-pulse">
                    <div className="h-12 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800" />
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-16 border-b border-slate-100 dark:border-slate-800" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-slate-200 bg-slate-50/95 dark:border-slate-800 dark:bg-slate-900/95">
                            {selectable && (
                                <th className="w-12 px-3 py-3">
                                    <div
                                        onClick={toggleSelectAll}
                                        className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-colors
                      ${selectedIds.length === flatData.length && flatData.length > 0
                                                ? 'bg-blue-600 border-blue-600'
                                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                                            }`}
                                    >
                                        {selectedIds.length === flatData.length && flatData.length > 0 && <Check size={12} className="text-white" />}
                                    </div>
                                </th>
                            )}
                            {columns.map((col, i) => (
                                <th
                                    key={i}
                                    className={`whitespace-nowrap px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                            {hasRowActions && <th className="w-12 px-3 py-3" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(groups ? groups.length === 0 : data.length === 0) ? (
                            <tr>
                                <td colSpan={columns.length + (selectable ? 1 : 0) + (hasRowActions ? 1 : 0)} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            groups ? (
                                groups.map(group => (
                                    <React.Fragment key={group.key}>
                                        <tr 
                                            className="cursor-pointer border-y border-slate-200 bg-slate-100/80 transition-colors hover:bg-slate-200/60 dark:border-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700/50"
                                            onClick={() => toggleGroup(group.key)}
                                        >
                                            <td colSpan={columns.length + (selectable ? 1 : 0) + (hasRowActions ? 1 : 0)} className="px-3 py-2.5">
                                                <div className="flex items-center gap-3">
                                                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${collapsedGroups.has(group.key) ? '-rotate-90' : ''}`} />
                                                    <span className="font-black text-[11px] uppercase tracking-widest text-slate-700 dark:text-slate-300">
                                                        {group.key}
                                                    </span>
                                                    <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-900 text-slate-500 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700">
                                                        {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {!collapsedGroups.has(group.key) && group.items.map((item) => renderRow(item))}
                                    </React.Fragment>
                                ))
                            ) : (
                                data.map((item) => renderRow(item))
                            )
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );

    function renderRow(item: T) {
        const id = String(item[idField]);
        const isSelected = selectedIds.includes(id);
        const isHovered = hoveredRow === id;

        const rowContent = (
            <tr
                onMouseEnter={() => setHoveredRow(id)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onRowClick?.(item)}
                onDoubleClick={() => onRowDoubleClick?.(item)}
                className={`group transition-colors duration-150 ${onRowClick || onRowDoubleClick ? 'cursor-pointer' : ''}
                    ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'}
                    ${isHovered ? 'relative z-10' : ''}
                `}
            >
                {selectable && (
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div
                            onClick={() => toggleSelectItem(id)}
                            className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors
                                ${isSelected
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                                }`}
                        >
                            {isSelected && <Check size={12} className="text-white" />}
                        </div>
                    </td>
                )}
                {columns.map((col, i) => (
                    <td key={i} className={`px-3 py-3.5 text-sm text-slate-700 dark:text-slate-300 ${col.className || ''}`}>
                        {col.render ? col.render(item) : (
                            typeof col.accessor === 'function'
                                ? col.accessor(item)
                                : String(item[col.accessor as keyof T] || '')
                        )}
                    </td>
                ))}
                {hasRowActions && (
                    <td className="px-3 py-3.5 text-right">
                        <div className={`opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 ${isHovered ? 'sm:opacity-100' : ''}`}>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const row = e.currentTarget.closest('tr');
                                    if (row) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const event = new MouseEvent('contextmenu', {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window,
                                            clientX: rect.left,
                                            clientY: rect.bottom
                                        });
                                        row.dispatchEvent(event);
                                    }
                                }}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                aria-label="Open row actions"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </div>
                    </td>
                )}
            </tr>
        );

        if (renderContextMenu) {
            return (
                <ContextMenu key={id} items={renderContextMenu(item)}>
                    {rowContent}
                </ContextMenu>
            );
        }

        return <React.Fragment key={id}>{rowContent}</React.Fragment>;
    }
}
