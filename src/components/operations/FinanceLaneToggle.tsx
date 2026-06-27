import React from 'react';
import { FinanceLane } from './FinanceSummaryBar';

interface FinanceLaneToggleProps {
    lane: FinanceLane;
    onLaneChange: (lane: FinanceLane) => void;
}

const laneOptions: Array<[FinanceLane, string]> = [
    ['clientBilling', 'Client Billing'],
    ['interpreterPayables', 'Interpreter Payables'],
];

export const FinanceLaneToggle: React.FC<FinanceLaneToggleProps> = ({ lane, onLaneChange }) => {
    return (
        <div className="mr-1 inline-flex h-8 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            {laneOptions.map(([laneId, label]) => (
                <button
                    key={laneId}
                    type="button"
                    onClick={() => onLaneChange(laneId)}
                    className={`rounded px-2.5 text-xs font-bold transition-colors ${
                        lane === laneId
                            ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
};
