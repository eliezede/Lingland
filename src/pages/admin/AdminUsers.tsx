import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/userService';
import { ClientService } from '../../services/clientService';
import { InterpreterService } from '../../services/interpreterService';
import { User, Client, Interpreter, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { 
  Search, Plus, Edit2, Link as LinkIcon, Send, Trash2, Ban, UserCheck
} from 'lucide-react';

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      setUsers(usersData);
      setClients(clientsData);
      setInterpreters(interpretersData);
    } catch (error) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (u: User) => {
    setSendingInvite(u.id);
    try {
      await UserService.sendActivationEmail(u.email, u.displayName);
      showToast(`Convite enviado com sucesso para ${u.email}`, 'success');
    } catch (e: any) {
      showToast('Erro ao enviar e-mail. Verifique se o usuário já existe no Firebase Auth.', 'error');
    } finally {
      setSendingInvite(null);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const actionText = newStatus === 'SUSPENDED' ? 'bloquear' : 'ativar';
    if (!window.confirm(`Deseja realmente ${actionText} este usuário?`)) return;

    try {
      await UserService.update(user.id, { status: newStatus });
      showToast(`Usuário ${newStatus === 'SUSPENDED' ? 'bloqueado' : 'ativado'} com sucesso`, 'success');
      await loadData();
    } catch (e) {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('TEM CERTEZA? Esta ação eliminará o acesso do usuário permanentemente.')) return;
    setDeletingId(id);
    try {
      await UserService.delete(id);
      showToast('Usuário eliminado', 'success');
      setIsModalOpen(false);
      await loadData();
    } catch (e) {
      showToast('Erro ao eliminar', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        await UserService.update(editingUser.id, formData);
        showToast('Updated successfully', 'success');
      } else {
        await UserService.create({ ...formData, status: 'ACTIVE' } as User);
        showToast('Created successfully', 'success');
      }
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getProfileName = (user: User) => {
    if (!user.profileId) return null;
    if (user.role === UserRole.CLIENT) {
      return clients.find(c => c.id === user.profileId)?.companyName || 'Unknown Client';
    }
    if (user.role === UserRole.INTERPRETER) {
      return interpreters.find(i => i.id === user.profileId)?.name || 'Unknown Interpreter';
    }
    return null;
  };

  const inputClasses = "w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm">Control access and roles.</p>
        </div>
        <Button icon={Plus} onClick={() => { setEditingUser(null); setFormData({ role: UserRole.CLIENT, status: 'ACTIVE' }); setIsModalOpen(true); }}>
          New User
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Filter users..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role / Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Linked Profile</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.filter(u => u.email.toLowerCase().includes(filter.toLowerCase())).map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${u.status === 'SUSPENDED' ? 'bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-gray-900">{u.displayName}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 space-x-2">
                    <Badge variant={u.role === UserRole.ADMIN ? 'danger' : 'info'}>{u.role}</Badge>
                    {u.status === 'SUSPENDED' && <Badge variant="danger">SUSPENDED</Badge>}
                  </td>
                  <td className="px-6 py-4">
                    {getProfileName(u) ? (
                      <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded flex items-center w-fit font-medium">
                        <LinkIcon size={12} className="mr-1" /> {getProfileName(u)}
                      </span>
                    ) : <span className="text-xs text-gray-400 italic">Unlinked</span>}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => handleSendInvite(u)} 
                      disabled={sendingInvite === u.id}
                      className="text-blue-600 hover:text-blue-900 p-1.5 rounded-lg hover:bg-blue-50 transition-colors" 
                      title="Enviar Convite"
                    >
                      {sendingInvite === u.id ? <Spinner size="sm" /> : <Send size={18} />}
                    </button>
                    <button onClick={() => handleToggleStatus(u)} className={`p-1.5 rounded-lg transition-colors ${u.status === 'SUSPENDED' ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'}`} title={u.status === 'SUSPENDED' ? 'Ativar' : 'Bloquear'}>
                      {u.status === 'SUSPENDED' ? <UserCheck size={18} /> : <Ban size={18} />}
                    </button>
                    <button onClick={() => { setEditingUser(u); setFormData({...u}); setIsModalOpen(true); }} className="text-blue-600 hover:text-blue-900 p-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id} className="text-red-600 hover:text-red-900 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      {deletingId === u.id ? <Spinner size="sm" /> : <Trash2 size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Edit User' : 'New User'} maxWidth="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
            <input type="email" required disabled={!!editingUser} className={inputClasses + " disabled:bg-gray-100"} value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name</label>
            <input type="text" required className={inputClasses} value={formData.displayName || ''} onChange={e => setFormData({...formData, displayName: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
              <select className={inputClasses} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole, profileId: ''})}>
                <option value={UserRole.ADMIN}>Admin</option>
                <option value={UserRole.CLIENT}>Client</option>
                <option value={UserRole.INTERPRETER}>Interpreter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Access Status</label>
              <select className={inputClasses} value={formData.status || 'ACTIVE'} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                <option value="ACTIVE">Active (Access Granted)</option>
                <option value="SUSPENDED">Suspended (Blocked)</option>
              </select>
            </div>
          </div>

          {formData.role !== UserRole.ADMIN && (
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
               <label className="block text-xs font-bold text-blue-700 uppercase mb-2">Link to {formData.role} Profile</label>
               <select required className={inputClasses} value={formData.profileId || ''} onChange={e => setFormData({...formData, profileId: e.target.value})}>
                 <option value="">-- Select --</option>
                 {formData.role === UserRole.CLIENT ? clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>) : interpreters.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
               </select>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-gray-100">
             {editingUser ? (
               <button type="button" onClick={() => handleDelete(editingUser.id)} className="text-red-600 hover:text-red-800 text-xs font-bold flex items-center">
                 <Trash2 size={14} className="mr-1" /> ELIMINAR USUÁRIO
               </button>
             ) : <div />}
             <div className="flex space-x-3">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" isLoading={saving}>Save Changes</Button>
             </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};