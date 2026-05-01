import React, { useState } from 'react';
import { ChevronDown, MoreHorizontal, Check, Settings2 } from 'lucide-react';
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
            <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
        <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                            {selectable && (
                                <th className="w-12 px-6 py-4">
                                    <div
                                        onClick={toggleSelectAll}
                                        className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors
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
                                    className={`px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                            <th className="w-12 px-6 py-4" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(groups ? groups.length === 0 : data.length === 0) ? (
                            <tr>
                                <td colSpan={columns.length + (selectable ? 2 : 1)} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 text-sm italic">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            groups ? (
                                groups.map(group => (
                                    <React.Fragment key={group.key}>
                                        <tr 
                                            className="bg-slate-100/80 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                                            onClick={() => toggleGroup(group.key)}
                                        >
                                            <td colSpan={columns.length + (selectable ? 2 : 1)} className="px-6 py-2.5">
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

            {/* Bulk Action Bar */}
            {selectable && selectedIds.length > 0 && (
                <div className="bg-blue-600 px-6 py-3 flex justify-between items-center animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center space-x-4">
                        <span className="text-white text-sm font-bold">{selectedIds.length} records selected</span>
                        <div className="h-4 w-px bg-blue-500" />
                        <button className="text-white/80 hover:text-white text-sm font-bold transition-colors">Apply bulk action</button>
                    </div>
                    <button
                        onClick={() => onSelectionChange?.([])}
                        className="text-white/60 hover:text-white transition-colors"
                    >
                        Clear selection
                    </button>
                </div>
            )}
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
                className={`group transition-all duration-200 cursor-pointer
                    ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'}
                    ${isHovered ? 'relative z-10' : ''}
                `}
            >
                {selectable && (
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
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
                    <td key={i} className={`px-6 py-4 text-sm text-slate-700 dark:text-slate-300 ${col.className || ''}`}>
                        {col.render ? col.render(item) : (
                            typeof col.accessor === 'function'
                                ? col.accessor(item)
                                : String(item[col.accessor as keyof T] || '')
                        )}
                    </td>
                ))}
                <td className="px-6 py-4 text-right">
                    <div className={`transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
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
                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500"
                        >
                            <MoreHorizontal size={18} />
                        </button>
                    </div>
                </td>
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
