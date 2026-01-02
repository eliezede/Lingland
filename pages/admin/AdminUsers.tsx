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
  Search, Plus, Edit2, Link as LinkIcon, Send, Sparkles, 
  AlertCircle, Info, ShieldOff, ShieldCheck, Trash2, Wand2
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
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
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
      setUsers(usersData);
      setClients(clientsData);
      setInterpreters(interpretersData);
    } catch (error) {
      showToast('Failed to load user data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRepairProfile = async (user: User) => {
    if (!window.confirm(`Deseja criar automaticamente um perfil de ${user.role.toLowerCase()} para ${user.displayName}?`)) return;
    
    setActionInProgress(user.id);
    try {
      let profileId = '';
      if (user.role === UserRole.INTERPRETER) {
        // Fix: Added isAvailable property and cast arrays to string[] to satisfy Interpreter interface
        const newInt = await InterpreterService.create({
          name: user.displayName,
          email: user.email,
          phone: '',
          languages: [] as string[],
          regions: [] as string[],
          qualifications: [] as string[],
          dbsExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'ONBOARDING',
          isAvailable: false
        });
        profileId = newInt.id;
      } else if (user.role === UserRole.CLIENT) {
        const newCli = await ClientService.create({
          companyName: user.displayName,
          email: user.email,
          contactPerson: user.displayName,
          billingAddress: '',
          paymentTermsDays: 30,
          defaultCostCodeType: 'PO'
        });
        profileId = newCli.id;
      }

      if (profileId) {
        await UserService.update(user.id, { profileId });
        showToast('Perfil criado e vinculado com sucesso!', 'success');
        await loadData();
      }
    } catch (e) {
      showToast('Falha ao reparar perfil', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let profileId = formData.profileId;

      // Se for novo ou se estiver editando um usuário sem perfil e a opção auto-provision estiver ligada
      const needsProfile = !formData.profileId;
      if (formData.role !== UserRole.ADMIN && autoCreateProfile && needsProfile) {
        if (formData.role === UserRole.INTERPRETER) {
          // Fix: Added isAvailable property and cast arrays to string[] to satisfy Interpreter interface
          const newInt = await InterpreterService.create({
            name: formData.displayName || '',
            email: formData.email || '',
            phone: '',
            languages: [] as string[],
            regions: [] as string[],
            qualifications: [] as string[],
            dbsExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'ONBOARDING',
            isAvailable: false
          });
          profileId = newInt.id;
        } else if (formData.role === UserRole.CLIENT) {
          const newCli = await ClientService.create({
            companyName: formData.displayName || '',
            email: formData.email || '',
            contactPerson: formData.displayName || '',
            billingAddress: '',
            paymentTermsDays: 30,
            defaultCostCodeType: 'PO'
          });
          profileId = newCli.id;
        }
      }

      const finalUser = { ...formData, profileId } as User;

      if (editingUser) {
        await UserService.update(editingUser.id, finalUser);
        showToast('User updated', 'success');
      } else {
        await UserService.create(finalUser);
        showToast('Account created and profile linked!', 'success');
      }
      
      await loadData();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Failed to save user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (user: User) => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Are you sure you want to ${newStatus === 'ACTIVE' ? 'unblock' : 'block'} this user?`)) return;

    setActionInProgress(user.id);
    try {
      await UserService.update(user.id, { status: newStatus });
      showToast(`Status updated`, 'success');
      await loadData();
    } catch (e) {
      showToast('Failed to change status', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`CRITICAL: Permanently delete access for ${user.displayName}?`)) return;
    setActionInProgress(user.id);
    try {
      await UserService.delete(user.id);
      showToast('User access removed', 'success');
      await loadData();
    } catch (e) {
      showToast('Failed to delete', 'error');
    } finally {
      setActionInProgress(null);
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

  const inputClasses = "w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900";

  return (
    <div className={isEmbedded ? "" : "space-y-6"}>
      {!isEmbedded && (
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 text-sm">Manage authentication, roles, and linked profiles.</p>
          </div>
          <Button icon={Plus} onClick={() => { 
            setEditingUser(null); 
            setFormData({ role: UserRole.INTERPRETER, displayName: '', email: '', status: 'ACTIVE' }); 
            setAutoCreateProfile(true);
            setIsModalOpen(true); 
          }}>
            Add System User
          </Button>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Search by name or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-transparent"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User Identity</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Linked Profile</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.filter(u => u.email.toLowerCase().includes(filter.toLowerCase()) || u.displayName.toLowerCase().includes(filter.toLowerCase())).map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${u.status === 'SUSPENDED' ? 'bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                       <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold mr-3 border ${u.status === 'SUSPENDED' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                         {u.displayName?.charAt(0) || 'U'}
                       </div>
                       <div>
                         <div className="text-sm font-bold text-gray-900">{u.displayName}</div>
                         <div className="text-xs text-gray-500">{u.email}</div>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <Badge variant={u.role === UserRole.ADMIN ? 'danger' : u.role === UserRole.CLIENT ? 'info' : 'success'}>
                       {u.role}
                     </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {getProfileName(u) ? (
                      <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded flex items-center w-fit font-medium border border-blue-100">
                        <LinkIcon size={12} className="mr-1" /> {getProfileName(u)}
                      </span>
                    ) : u.role === UserRole.ADMIN ? (
                      <span className="text-xs text-gray-400">System Admin</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded flex items-center w-fit font-bold border border-orange-200 animate-pulse">
                          <AlertCircle size={12} className="mr-1" /> Profile Missing
                        </span>
                        <button 
                          onClick={() => handleAutoRepairProfile(u)}
                          className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                          title="Auto-create Profile"
                        >
                          <Wand2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => { setEditingUser(u); setFormData({...u}); setAutoCreateProfile(!u.profileId); setIsModalOpen(true); }} 
                        className="text-gray-400 p-2 rounded-lg hover:bg-gray-100 transition-all"
                        title="Edit Details"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => toggleUserStatus(u)}
                        disabled={actionInProgress === u.id}
                        className={`p-2 rounded-lg transition-all ${u.status === 'ACTIVE' ? 'text-orange-500 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={u.status === 'ACTIVE' ? 'Block User' : 'Unblock User'}
                      >
                        {actionInProgress === u.id ? <Spinner size="sm" /> : (u.status === 'ACTIVE' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />)}
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(u)}
                        disabled={actionInProgress === u.id}
                        className="text-gray-400 p-2 rounded-lg hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Delete Permanently"
                      >
                        {actionInProgress === u.id ? <Spinner size="sm" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Provisioning Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingUser ? 'Account Configuration' : 'Provision New System Access'} 
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Email Address</label>
              <input 
                type="email" required 
                disabled={!!editingUser} 
                className={inputClasses + " disabled:bg-gray-100 disabled:text-gray-400"} 
                value={formData.email || ''} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Display Name</label>
                <input 
                  type="text" required 
                  className={inputClasses} 
                  value={formData.displayName || ''} 
                  onChange={e => setFormData({...formData, displayName: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Access Role</label>
                <select 
                  className={inputClasses} 
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole, profileId: ''})}
                >
                  <option value={UserRole.ADMIN}>Administrator</option>
                  <option value={UserRole.CLIENT}>Client Organization</option>
                  <option value={UserRole.INTERPRETER}>Professional Interpreter</option>
                </select>
              </div>
            </div>
          </div>

          {formData.role !== UserRole.ADMIN && (
            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
               <div className="flex items-center justify-between">
                  <div className="flex items-center text-blue-800 font-bold text-xs uppercase tracking-wider">
                    <Sparkles size={14} className="mr-2" />
                    Profile Linkage
                  </div>
                  {(!editingUser || !editingUser.profileId) && (
                    <label className="flex items-center text-[10px] font-extrabold text-blue-600 bg-white px-3 py-1 rounded-full border border-blue-200 cursor-pointer hover:bg-blue-50 transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="mr-2 w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                        checked={autoCreateProfile}
                        onChange={e => setAutoCreateProfile(e.target.checked)}
                      />
                      AUTO-PROVISION PERFIL
                    </label>
                  )}
               </div>

               {(!autoCreateProfile || (editingUser && editingUser.profileId)) ? (
                 <div className="animate-fade-in">
                   <select 
                     className={inputClasses} 
                     value={formData.profileId || ''} 
                     onChange={e => setFormData({...formData, profileId: e.target.value})}
                   >
                     <option value="">-- Link to Existing Profile --</option>
                     {formData.role === UserRole.CLIENT 
                        ? clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>) 
                        : interpreters.map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                     }
                   </select>
                 </div>
               ) : (
                 <div className="flex items-center p-4 bg-white rounded-xl border border-dashed border-blue-300">
                   <div className="bg-blue-100 p-2 rounded-lg mr-3">
                     <Wand2 size={18} className="text-blue-600" />
                   </div>
                   <div>
                     <p className="text-sm font-bold text-blue-900">Atomic Profile Enabled</p>
                     <p className="text-[11px] text-blue-700">A new {formData.role?.toLowerCase()} profile will be created automatically upon save.</p>
                   </div>
                 </div>
               )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
             <Button type="submit" isLoading={saving} className="shadow-lg shadow-blue-100">
               {editingUser ? 'Update Account' : 'Provision User'}
             </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};