import React, { useEffect, useState } from 'react';
import { ClientService } from '../../services/clientService';
import { Client } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { 
  Search, Plus, Building2, Mail, Edit2, Trash2, MapPin
} from 'lucide-react';

export const AdminClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
  // Action States
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await ClientService.getAll();
      // Sort alphabetically by Company Name
      const sortedData = (data || []).sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
      setClients(sortedData);
    } catch (error) {
      console.error('Failed to load clients', error);
      showToast('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Safe String Helper Pattern
  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredClients = (clients || []).filter(c => {
    const q = safe(filter);
    return safe(c.companyName).includes(q) ||
           safe(c.contactPerson).includes(q) ||
           safe(c.email).includes(q);
  });

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({ ...client });
    } else {
      setEditingClient(null);
      setFormData({
        companyName: '',
        contactPerson: '',
        email: '',
        billingAddress: '',
        paymentTermsDays: 30,
        defaultCostCodeType: 'PO'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingClient) {
        await ClientService.update(editingClient.id, formData);
        showToast('Client updated successfully', 'success');
      } else {
        await ClientService.create(formData as Client);
        showToast('Client created successfully', 'success');
      }
      await loadClients();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Failed to save client', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this client? This action cannot be undone and may affect associated bookings.')) {
      setDeletingId(id);
      try {
        await ClientService.delete(id);
        showToast('Client deleted successfully', 'success');
        await loadClients();
      } catch (error) {
        showToast('Failed to delete client', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 text-sm">Manage client accounts, billing details, and agreements.</p>
        </div>
        <Button icon={Plus} onClick={() => handleOpenModal()}>New Client</Button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search clients by name, company or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : filteredClients.length === 0 ? (
        <EmptyState 
          title="No clients found" 
          description={filter ? "No clients match your search criteria." : "Get started by adding your first client."}
          actionLabel={filter ? "Clear Search" : "Add Client"}
          onAction={filter ? () => setFilter('') : () => handleOpenModal()}
          icon={Building2}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Organization</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Contact Info</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Billing Setup</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Terms</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
                          {safe(client.companyName).charAt(0).toUpperCase() || 'C'}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{client.companyName}</div>
                          <div className="text-xs text-gray-400">ID: {client.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{client.contactPerson}</div>
                      <div className="text-xs text-gray-500 flex items-center mt-0.5">
                        <Mail size={12} className="mr-1" /> {client.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start text-xs text-gray-500">
                        <MapPin size={12} className="mr-1 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2 max-w-xs" title={client.billingAddress}>
                          {client.billingAddress || 'No address set'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 ml-4">
                        Ref: {client.defaultCostCodeType}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="neutral">{client.paymentTermsDays} Days</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenModal(client)}
                          className="text-blue-600 hover:text-blue-900 p-2 rounded hover:bg-blue-50 transition-colors"
                          title="Edit Client"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(client.id)}
                          className="text-red-600 hover:text-red-900 p-2 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete Client"
                          disabled={deletingId === client.id}
                        >
                          {deletingId === client.id ? <Spinner size="sm" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? 'Edit Client' : 'New Client'}
        maxWidth="lg"
      >
        <form id="clientForm" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input 
                type="text" required
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={formData.companyName || ''}
                onChange={e => setFormData({...formData, companyName: e.target.value})}
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
              <input 
                type="text" required
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={formData.contactPerson || ''}
                onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <input 
                type="email" required
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={formData.email || ''}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms (Days)</label>
              <input 
                type="number"
                min="0"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={formData.paymentTermsDays || 30}
                onChange={e => setFormData({...formData, paymentTermsDays: parseInt(e.target.value)})}
              />
            </div>
            <div className="md:col-span-2">
               <label className="block text-sm font-medium text-gray-700 mb-1">Default Reference Type</label>
               <select 
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                 value={formData.defaultCostCodeType || 'PO'}
                 onChange={e => setFormData({...formData, defaultCostCodeType: e.target.value as any})}
               >
                 <option value="PO">Purchase Order (PO)</option>
                 <option value="Cost Code">Cost Code</option>
                 <option value="ICS">ICS / Other</option>
               </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
            <textarea 
              rows={3}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={formData.billingAddress || ''}
              onChange={e => setFormData({...formData, billingAddress: e.target.value})}
              placeholder="Full billing address..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>
              {editingClient ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};