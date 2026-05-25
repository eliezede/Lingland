import React from 'react';
import { X, CheckCircle, XCircle, Trash2, UserMinus, UserPlus, ChevronDown } from 'lucide-react';
import { Button } from './Button';

export interface BulkAction {
    label: string;
    icon?: React.ElementType;
    onClick: (ids: string[]) => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    disabled?: boolean;
}

interface BulkActionBarProps {
    selectedIds?: string[];
    selectedCount: number;
    totalCount: number;
    actions: BulkAction[];
    onClearSelection: () => void;
    onSelectAll?: () => void;
    isLoading?: boolean;
    entityLabel?: string;
}

const variantStyles = {
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
};

/**
 * BulkActionBar — Phase 5 Table System
 * Floats above the table when rows are selected.
 * Provides fast batch operations with visual feedback.
 */
export const BulkActionBar: React.FC<BulkActionBarProps> = ({
    selectedIds = [],
    selectedCount,
    totalCount,
    actions,
    onClearSelection,
    onSelectAll,
    isLoading,
    entityLabel = 'item',
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed inset-x-3 bottom-3 z-50 animate-in slide-in-from-bottom-4 duration-200 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-3 text-white shadow-2xl shadow-slate-900/40 backdrop-blur sm:flex-row sm:items-center sm:px-4">
                {/* Selection info */}
                <div className="flex min-w-0 items-center gap-2.5 border-slate-700 sm:border-r sm:pr-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[11px] font-bold">
                        {selectedCount}
                    </div>
                    <span className="truncate text-sm font-semibold text-white/90">
                        {selectedCount} {entityLabel}{selectedCount !== 1 ? 's' : ''} selected
                    </span>
                    {onSelectAll && selectedCount < totalCount && (
                        <button
                            onClick={onSelectAll}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-bold transition-colors underline underline-offset-2"
                        >
                            Select all {totalCount}
                        </button>
                    )}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    {actions.map((action, idx) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={idx}
                                onClick={() => action.onClick(selectedIds)}
                                disabled={action.disabled || isLoading}
                                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[action.variant || 'default']}`}
                            >
                                {Icon && <Icon size={13} />}
                                {action.label}
                            </button>
                        );
                    })}
                </div>

                {/* Clear */}
                <button
                    onClick={onClearSelection}
                    className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white sm:static sm:ml-1"
                    title="Clear selection"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
