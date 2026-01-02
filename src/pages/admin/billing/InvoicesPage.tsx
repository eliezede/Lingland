
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/billingService';
import { ClientService } from '../../../services/clientService';
import { ClientInvoice, Client } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { PoundSterling, Plus } from 'lucide-react';

export const AdminInvoices = () => {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    BillingService.getClientInvoices().then(setInvoices);
    ClientService.getAll().then(setClients);
  }, []);

  const handleGenerate = async () => {
    if (!selectedClient) return;
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = now.toISOString();
      const newInv = await BillingService.generateClientInvoice(selectedClient, start, end);
      setInvoices([...invoices, newInv]);
      showToast('Invoice Generated Successfully!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Error generating invoice', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">Client Invoicing</h1>
           <p className="text-gray-500">Generate and send invoices to clients.</p>
        </div>
      </div>

      {/* Generator */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 flex items-center gap-4">
        <span className="font-medium text-gray-700">Generate Invoice for:</span>
        <select 
          className="border border-gray-300 rounded-lg p-2 text-sm w-64"
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
        >
          <option value="">Select Client...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <button 
          onClick={handleGenerate}
          disabled={!selectedClient}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center"
        >
          <Plus size={16} className="mr-2" /> Generate
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-500">No invoices found.</td></tr>
            )}
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.invoiceNumber}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{inv.clientName}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(inv.issueDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">£{inv.totalAmount.toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
