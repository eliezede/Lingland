import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/userService';
import { ClientService } from '../../services/clientService';
import { InterpreterService } from '../../services/interpreterService';
import { User, Client, Interpreter, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
// Added missing Card import
import { Card } from '../../components/ui/Card';
import { useToast } from '../../context/ToastContext';
import { 
  Search, Plus, Edit2, Link as LinkIcon, ShieldOff, ShieldCheck, Trash2, Wand2, AlertCircle
} from 'lucide-react';

interface AdminUsersProps {
  isEmbedded?: boolean;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ isEmbedded = false }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({ role: UserRole.INTERPRETER, status: 'ACTIVE' });
  const [autoCreateProfile, setAutoCreateProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, clientsData, interpretersData] = await Promise.all([
        UserService.getAll(),
        ClientService.getAll(),
        InterpreterService.getAll()
      ]);
      setUsers(usersData || []);
      setClients(clientsData || []);
      setInterpreters(interpretersData || []);
    } catch (error) {
      showToast('Failed to load user data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        await UserService.update(editingUser.id, formData);
        showToast('User updated', 'success');
      } else {
        await UserService.create(formData as any);
        showToast('User provisioned', 'success');
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Failed to save user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getProfileName = (user: User) => {
    if (!user.profileId) return null;
    if (user.role === UserRole.CLIENT) {
      return clients.find(c => c.id === user.profileId)?.companyName || 'Unknown Organization';
    }
    if (user.role === UserRole.INTERPRETER) {
      return interpreters.find(i => i.id === user.profileId)?.name || 'Unknown Interpreter';
    }
    return null;
  };

  const filteredUsers = (users || []).filter(u => {
    const q = safe(filter);
    return safe(u.email).includes(q) || safe(u.displayName).includes(q);
  });

  return (
    <div className={isEmbedded ? "" : "space-y-6"}>
      {!isEmbedded && (
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <Button icon={Plus} onClick={() => { setEditingUser(null); setFormData({ role: UserRole.INTERPRETER, status: 'ACTIVE' }); setIsModalOpen(true); }}>Add User</Button>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Search by name or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <Card padding="none">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User Identity</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Linked Profile</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                       <div className={`w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold mr-3`}>{safe(u.displayName).charAt(0).toUpperCase() || 'U'}</div>
                       <div>
                         <div className="text-sm font-bold text-gray-900">{u.displayName || 'Unnamed'}</div>
                         <div className="text-xs text-gray-500">{u.email}</div>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4"><Badge variant={u.role === UserRole.ADMIN ? 'danger' : 'info'}>{u.role}</Badge></td>
                  <td className="px-6 py-4">
                    {getProfileName(u) ? (
                      <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded flex items-center border border-blue-100 w-fit"><LinkIcon size={12} className="mr-1" /> {getProfileName(u)}</span>
                    ) : <span className="text-xs text-gray-400">No profile linked</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setEditingUser(u); setFormData({...u}); setIsModalOpen(true); }} className="text-gray-400 hover:text-blue-600 p-1"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Edit User' : 'New User'}>
        <form onSubmit={handleSave} className="space-y-4">
           <div><label className="block text-xs font-bold text-gray-500 mb-1">Email</label><input type="email" required className="w-full p-2 border rounded-lg" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
           <div><label className="block text-xs font-bold text-gray-500 mb-1">Name</label><input type="text" required className="w-full p-2 border rounded-lg" value={formData.displayName || ''} onChange={e => setFormData({...formData, displayName: e.target.value})} /></div>
           <div className="flex justify-end gap-3 pt-4 border-t"><Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button><Button type="submit" isLoading={saving}>Save User</Button></div>
        </form>
      </Modal>
    </div>
  );
};