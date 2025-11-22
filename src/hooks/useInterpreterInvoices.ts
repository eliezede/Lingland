
import { useState, useEffect } from 'react';
import { BillingService } from '../../services/api';
import { Timesheet, InterpreterInvoice } from '../../types';

export const useInterpreterInvoices = (interpreterId: string | undefined) => {
  const [readyToInvoice, setReadyToInvoice] = useState<Timesheet[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (interpreterId) loadData();
  }, [interpreterId]);

  const loadData = async () => {
    if (!interpreterId) return;
    setLoading(true);
    try {
      const [pending, history] = await Promise.all([
        BillingService.getUninvoicedTimesheetsForInterpreter(interpreterId),
        BillingService.getInterpreterInvoices(interpreterId)
      ]);
      setReadyToInvoice(pending);
      setInvoiceHistory(history);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createInvoice = async (timesheetIds: string[], ref: string) => {
    if (!interpreterId) return;
    
    const amount = readyToInvoice
      .filter(t => timesheetIds.includes(t.id))
      .reduce((sum, t) => sum + (t.totalInterpreterAmount || 0), 0);

    await BillingService.createInterpreterInvoiceUpload(interpreterId, timesheetIds, ref, amount);
    await loadData();
  };

  return { readyToInvoice, invoiceHistory, loading, createInvoice, refresh: loadData };
};
