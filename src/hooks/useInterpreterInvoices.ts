import { useState, useEffect } from 'react';
import { BillingService } from '../services/api';
import { Timesheet, InterpreterInvoice } from '../types';
import { getTimesheetInterpreterAmount } from '../utils/interpreterFlow';

export const useInterpreterInvoices = (interpreterId: string | undefined) => {
  const [readyToInvoice, setReadyToInvoice] = useState<Timesheet[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interpreterId) {
      void loadData();
    } else {
      setReadyToInvoice([]);
      setInvoiceHistory([]);
      setLoading(false);
    }
  }, [interpreterId]);

  const loadData = async () => {
    if (!interpreterId) return;
    setLoading(true);
    setError(null);
    try {
      const [pending, history] = await Promise.all([
        BillingService.getUninvoicedTimesheetsForInterpreter(interpreterId),
        BillingService.getInterpreterInvoices(interpreterId)
      ]);
      setReadyToInvoice(pending);
      setInvoiceHistory(history);
    } catch (e) {
      console.error(e);
      setError('Payment data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const createInvoice = async (timesheetIds: string[], ref: string, uploadedPdfUrl?: string) => {
    if (!interpreterId) return;
    
    const amount = readyToInvoice
      .filter(t => timesheetIds.includes(t.id))
      .reduce((sum, t) => sum + getTimesheetInterpreterAmount(t), 0);

    await BillingService.createInterpreterInvoiceUpload(interpreterId, timesheetIds, ref, amount, uploadedPdfUrl);
    await loadData();
  };

  return { readyToInvoice, invoiceHistory, loading, error, createInvoice, refresh: loadData };
};
