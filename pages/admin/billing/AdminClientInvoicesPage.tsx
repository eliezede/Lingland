
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/billingService';
import { ClientInvoice } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';
import { Plus } from 'lucide-react';
import { ClientService } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

export const AdminClientInvoicesPage = () => {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  
  // Generator State
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { showToast } = useToast();

  useEffect(() => {
    loadData();
    ClientService.getAll().then(setClients);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await BillingService.getClientInvoices();
    setInvoices(data);
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      showToast('Generating invoice...', 'info');
      const result = await BillingService.generateClientInvoice(selectedClient, dateRange.start, dateRange.end);
      if (result.success) {
        showToast(`Invoice generated for £${result.total}`, 'success');
        setShowGenerator(false);
        loadData();
      } else {
        showToast(result.message, 'error');
      }
    } catch (e) {
      showToast('Failed to generate invoice', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Client Invoices</h1>
        <button 
          onClick={() => setShowGenerator(!showGenerator)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} className="mr-2" /> Generate Invoice
        </button>
      </div>

      {showGenerator && (
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl space-y-4">
          <h3 className="font-bold text-blue-900">Generate New Invoice</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Client</label>
              <select 
                className="w-full p-2 border rounded-lg text-sm"
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
              >
                <option value="">Select Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Start Date</label>
              <input type="date" className="w-full p-2 border rounded-lg text-sm" onChange={e => setDateRange({...dateRange, start: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">End Date</label>
              <input type="date" className="w-full p-2 border rounded-lg text-sm" onChange={e => setDateRange({...dateRange, end: e.target.value})} />
            </div>
            <div className="flex items-end">
              <button 
                onClick={handleGenerate}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
              >
                Process
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-8">Loading...</div> : (
        <InvoiceTable invoices={invoices} type="CLIENT" />
      )}
    </div>
  );
};
