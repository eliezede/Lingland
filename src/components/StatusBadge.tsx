
import React from 'react';
import { BookingStatus, JobStatus } from '../types';

// Human-readable display labels for status values
const DISPLAY_LABELS: Record<string, string> = {
  'INCOMING': 'Incoming',
  'OPENED': 'Opened',
  'BOOKED': 'Booked',
  'ADMIN': 'Admin Hold',
  'CANCELLED': 'Cancelled',
  'TIMESHEET_SUBMITTED': 'Timesheet Submitted',
  'READY_FOR_INVOICE': 'Ready to Invoice',
  'INVOICED': 'Invoiced',
  'PAID': 'Paid',
  'PENDING_ASSIGNMENT': 'Pending Assignment',
  'ACTIVE': 'Active',
  'INACTIVE': 'Inactive',
  'SUSPENDED': 'Suspended',
  'BLOCKED': 'Blocked',
  'UNRELIABLE': 'Unreliable',
  'ON_LEAVE': 'On Leave',
  'ONBOARDING': 'Onboarding',
  'APPLICANT': 'Applicant',
  'ONLY_TRANSL': 'Translation Only',
  'VERIFIED': 'Verified',
  'UNPAID': 'Unpaid',
};

export const StatusBadge: React.FC<{ status: BookingStatus | JobStatus | string | null | undefined; size?: 'sm' | 'md' | 'lg' }> = ({ status, size = 'md' }) => {
  const normalizedStatus = String(status ?? 'UNKNOWN');

  const getStyles = () => {
    switch (normalizedStatus) {
      case BookingStatus.INVOICED:
      case 'INVOICED':
      case BookingStatus.PAID:
      case 'PAID':
      case 'VERIFIED':
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50';
      case BookingStatus.BOOKED:
      case 'BOOKED':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50';
      case BookingStatus.INCOMING:
      case 'INCOMING':
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50';
      case 'ONBOARDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50';
      case BookingStatus.OPENED:
      case 'PENDING_ASSIGNMENT':
        return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50';
      case BookingStatus.ADMIN:
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50';
      case BookingStatus.READY_FOR_INVOICE:
      case 'TIMESHEET_SUBMITTED':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50';
      case BookingStatus.CANCELLED:
      case 'CANCELLED':
      case 'SUSPENDED':
      case 'BLOCKED':
      case 'UNRELIABLE':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50';
      case 'APPLICANT':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50';
      case 'ONLY_TRANSL':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800/50';
      case 'ON_LEAVE':
        return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
      case 'UNPAID':
        return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    }
  };

  const displayLabel = DISPLAY_LABELS[normalizedStatus] || normalizedStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border ${getStyles()} uppercase tracking-wider whitespace-nowrap`}>
      {displayLabel}
    </span>
  );
};

