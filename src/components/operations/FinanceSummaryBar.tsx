import React from 'react';

export type FinanceLane = 'clientBilling' | 'interpreterPayables';

interface FinanceSummary {
    totalClientCharge: number;
    totalProfessionalCost: number;
    readyCount: number;
    readyAmount: number;
    payRunReadyAmount: number;
    awaitingPaymentCount: number;
    awaitingPaymentAmount: number;
    missingCostCodeCount: number;
    timesheetNeededCount: number;
    timesheetReviewCount: number;
    uniqueProfessionalCount: number;
}

interface FinanceSummaryBarProps {
    lane: FinanceLane;
    recordCount: number;
    summary: FinanceSummary;
}

export const FinanceSummaryBar: React.FC<FinanceSummaryBarProps> = ({ lane, recordCount, summary }) => {
    const isPayables = lane === 'interpreterPayables';
    const topCell = 'col-span-2 min-w-0 border-b border-r border-slate-200 px-2 py-1.5 dark:border-slate-800 sm:col-span-1 sm:border-b-0 sm:px-3 sm:py-2';
    const bottomCell = 'col-span-3 min-w-0 border-r border-slate-200 px-2 py-1.5 dark:border-slate-800 sm:col-span-1 sm:px-3 sm:py-2';
    const labelClass = 'truncate text-[9px] font-bold uppercase text-slate-400 sm:text-[10px]';
    const valueClass = 'mt-0.5 truncate text-sm font-black text-slate-950 dark:text-white sm:text-base';

    return (
        <div className="grid shrink-0 grid-cols-6 border-b border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-5">
            <div className={topCell}>
                <p className={labelClass}>{isPayables ? 'Payable Jobs' : 'Records'}</p>
                <p className={valueClass}>{recordCount}</p>
            </div>
            <div className={topCell}>
                <p className={labelClass}>{isPayables ? 'Timesheet Needed' : 'Ready to Invoice'}</p>
                <p className="mt-0.5 truncate text-sm font-black text-blue-700 dark:text-blue-300 sm:text-base">
                    {isPayables ? summary.timesheetNeededCount : (
                        <>
                            {summary.readyCount} <span className="block truncate text-[10px] text-slate-500 sm:inline sm:text-xs">/ GBP {summary.readyAmount.toFixed(2)}</span>
                        </>
                    )}
                </p>
            </div>
            <div className={topCell}>
                <p className={labelClass}>{isPayables ? 'Timesheet Review' : 'Missing PO'}</p>
                <p className={`mt-0.5 truncate text-sm font-black sm:text-base ${
                    isPayables || summary.missingCostCodeCount === 0
                        ? 'text-slate-950 dark:text-white'
                        : 'text-amber-700 dark:text-amber-300'
                }`}>
                    {isPayables ? summary.timesheetReviewCount : summary.missingCostCodeCount}
                </p>
            </div>
            <div className={bottomCell}>
                <p className={labelClass}>{isPayables ? 'Payable Total' : 'Client Charge'}</p>
                <p className={valueClass}>
                    GBP {(isPayables ? summary.totalProfessionalCost : summary.totalClientCharge).toFixed(2)}
                </p>
            </div>
            <div className={`${bottomCell} border-r-0`}>
                <p className={labelClass}>{isPayables ? 'Ready for Pay Run' : 'Awaiting Payment'}</p>
                <p className="mt-0.5 truncate text-sm font-black text-emerald-700 dark:text-emerald-300 sm:text-base">
                    {isPayables ? (
                        <>
                            {summary.readyCount} <span className="block truncate text-[10px] text-slate-500 sm:inline sm:text-xs">/ GBP {summary.payRunReadyAmount.toFixed(2)}</span>
                        </>
                    ) : (
                        <>
                            {summary.awaitingPaymentCount} <span className="block truncate text-[10px] text-slate-500 sm:inline sm:text-xs">/ GBP {summary.awaitingPaymentAmount.toFixed(2)}</span>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
};
