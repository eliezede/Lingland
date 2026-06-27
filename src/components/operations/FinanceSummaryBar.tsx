import React from 'react';

export type FinanceLane = 'clientBilling' | 'interpreterPayables';

interface FinanceSummary {
    totalClientCharge: number;
    readyCount: number;
    readyAmount: number;
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

    return (
        <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-5">
            <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="font-bold uppercase tracking-wide text-slate-400">{isPayables ? 'Payable Jobs' : 'Records'}</p>
                <p className="mt-0.5 text-base font-black text-slate-950 dark:text-white">{recordCount}</p>
            </div>
            <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="font-bold uppercase tracking-wide text-slate-400">{isPayables ? 'Professionals' : 'Client Charge'}</p>
                <p className="mt-0.5 text-base font-black text-slate-950 dark:text-white">
                    {isPayables ? summary.uniqueProfessionalCount : `GBP ${summary.totalClientCharge.toFixed(2)}`}
                </p>
            </div>
            <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="font-bold uppercase tracking-wide text-slate-400">{isPayables ? 'Timesheet Needed' : 'Ready to Invoice'}</p>
                <p className="mt-0.5 text-base font-black text-blue-700 dark:text-blue-300">
                    {isPayables ? summary.timesheetNeededCount : (
                        <>
                            {summary.readyCount} <span className="text-xs text-slate-500">/ GBP {summary.readyAmount.toFixed(2)}</span>
                        </>
                    )}
                </p>
            </div>
            <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="font-bold uppercase tracking-wide text-slate-400">{isPayables ? 'Timesheet Review' : 'Awaiting Payment'}</p>
                <p className="mt-0.5 text-base font-black text-emerald-700 dark:text-emerald-300">
                    {isPayables ? summary.timesheetReviewCount : (
                        <>
                            {summary.awaitingPaymentCount} <span className="text-xs text-slate-500">/ GBP {summary.awaitingPaymentAmount.toFixed(2)}</span>
                        </>
                    )}
                </p>
            </div>
            <div className="px-3 py-2">
                <p className="font-bold uppercase tracking-wide text-slate-400">{isPayables ? 'Ready for Pay Run' : 'Missing PO'}</p>
                <p className={`mt-0.5 text-base font-black ${
                    isPayables
                        ? 'text-slate-950 dark:text-white'
                        : summary.missingCostCodeCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'
                }`}>
                    {isPayables ? summary.readyCount : summary.missingCostCodeCount}
                </p>
            </div>
        </div>
    );
};
