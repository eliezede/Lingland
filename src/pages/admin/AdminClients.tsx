
import React, { useEffect, useState } from 'react';
import { ClientService } from '../../services/clientService';
import { Client } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { Search, Plus, Building2, Mail, Edit2, Trash2, MapPin } from 'lucide-react';

export const AdminClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
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
      setClients((data ?? []).sort((a, b) => (a.companyName ?? "").localeCompare(b.companyName ?? "")));
    } catch (error) {
      showToast('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredClients = (clients ?? []).filter(c => {
    const q = safe(filter);
    return (
      safe(c.companyName).includes(q) ||
      safe(c.contactPerson).includes(q) ||
      safe(c.email).includes(q)
    );
  });

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({ ...client });
    } else {
      setEditingClient(null);
      setFormData({ companyName: '', contactPerson: '', email: '', billingAddress: '', paymentTermsDays: 30, defaultCostCodeType: 'PO' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingClient) {
        await ClientService.update(editingClient.id, formData);
        showToast('Client updated', 'success');
      } else {
        await ClientService.create(formData as Client);
        showToast('Client created', 'success');
      }
      await loadClients();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Error saving client', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button icon={Plus} onClick={() => handleOpenModal()}>New Client</Button>
      </div>

      <div className="bg-white p-4 rounded-xl border flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Search clients..." 
            className="pl-10 pr-4 py-2 border rounded-lg w-full text-sm outline-none focus:ring-2"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : filteredClients.length === 0 ? (
        <EmptyState title="No clients found" description="Adjust your search." onAction={() => setFilter('')} actionLabel="Clear Search" />
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="min-w-full divide-y">
            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left">Organization</th>
                <th className="px-6 py-3 text-left">Contact</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {filteredClients.map(client => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{client.companyName}</td>
                  <td className="px-6 py-4">{client.email}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleOpenModal(client)} className="text-blue-600 p-2"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingClient ? 'Edit Client' : 'New Client'}>
        <form onSubmit={handleSave} className="space-y-4">
           <input type="text" placeholder="Company Name" className="w-full p-2 border rounded" value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} required />
           <input type="email" placeholder="Email" className="w-full p-2 border rounded" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} required />
           <Button type="submit" isLoading={saving}>Save</Button>
        </form>
      </Modal>
    </div>
  );
};
