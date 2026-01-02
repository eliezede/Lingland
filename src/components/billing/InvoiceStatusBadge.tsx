
import React from 'react';
import { InvoiceStatus } from '../../types';

export const InvoiceStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getColors = () => {
    switch (status) {
      case InvoiceStatus.PAID: return 'bg-green-100 text-green-800 border-green-200';
      case InvoiceStatus.SENT: return 'bg-blue-100 text-blue-800 border-blue-200';
      case InvoiceStatus.APPROVED: return 'bg-blue-100 text-blue-800 border-blue-200';
      case InvoiceStatus.DRAFT: return 'bg-gray-100 text-gray-800 border-gray-200';
      case InvoiceStatus.SUBMITTED: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case InvoiceStatus.REJECTED: return 'bg-red-100 text-red-800 border-red-200';
      case InvoiceStatus.CANCELLED: return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getColors()} uppercase tracking-wide`}>
      {status}
    </span>
  );
};
