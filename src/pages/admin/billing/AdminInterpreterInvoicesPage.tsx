import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/billingService';
import { InterpreterInvoice } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';

export const AdminInterpreterInvoicesPage = () => {
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    BillingService.getInterpreterInvoices().then(data => {
      setInvoices(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Interpreter Invoices</h1>
      </div>
      
      {loading ? <div className="text-center py-8">Loading...</div> : (
        <InvoiceTable invoices={invoices} type="INTERPRETER" />
      )}
    </div>
  );
};