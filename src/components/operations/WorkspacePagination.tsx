import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WorkspacePaginationProps {
    totalCount: number;
    pageStartIndex: number;
    pageEndIndex: number;
    currentPage: number;
    totalPages: number;
    pageSize: number;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onPageSizeChange: (pageSize: number) => void;
    entityLabel?: string;
}

export const WorkspacePagination: React.FC<WorkspacePaginationProps> = ({
    totalCount,
    pageStartIndex,
    pageEndIndex,
    currentPage,
    totalPages,
    pageSize,
    onPreviousPage,
    onNextPage,
    onPageSizeChange,
    entityLabel = 'job',
}) => {
    return (
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold">
                    {totalCount === 0
                        ? `0 ${entityLabel}s`
                        : `${pageStartIndex + 1}-${pageEndIndex} of ${totalCount} ${entityLabel}${totalCount === 1 ? '' : 's'}`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onPreviousPage}
                        disabled={currentPage === 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-slate-800"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <span className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold dark:border-slate-800">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={onNextPage}
                        disabled={currentPage === totalPages}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-slate-800"
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} />
                    </button>
                    <select
                        value={pageSize}
                        onChange={(event) => onPageSizeChange(Number(event.target.value))}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none dark:border-slate-800 dark:bg-slate-950"
                        aria-label="Rows per page"
                    >
                        {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}/page</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
};
