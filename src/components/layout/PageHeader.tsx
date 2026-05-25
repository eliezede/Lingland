import React from 'react';
interface PageHeaderProps {
    title: string;
    subtitle?: string;
    stats?: {
        label: string;
        value: string | number;
    };
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, stats, children }) => {
    return (
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200/70 pb-4 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">{title}</h1>
                {subtitle && <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                {children && (
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
                        {children}
                    </div>
                )}

                {stats && (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400">{stats.label}</span>
                            <span className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{stats.value}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
