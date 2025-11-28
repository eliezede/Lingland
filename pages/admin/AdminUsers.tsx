
import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/userService';
import { ClientService } from '../../services/clientService';
import { InterpreterService } from '../../services/interpreterService';
import { User, Client, Interpreter, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { 
  Search, Plus, Users, UserCog, Edit2, Link as LinkIcon
} from 'lucide-react';

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);

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
      console.error('Failed to load user data', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
    u.email.toLowerCase().includes(filter.toLowerCase())
  );

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ ...user });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        displayName: '',
        role: UserRole.CLIENT,
        profileId: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        await UserService.update(editingUser.id, formData);
        showToast('User updated successfully', 'success');
      } else {
        await UserService.create(formData as User);
        showToast('User pre-provisioned successfully', 'success');
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
      const c = clients.find(c => c.id === user.profileId);
      return c ? c.companyName : 'Unknown Client';
    }
    if (user.role === UserRole.INTERPRETER) {
      const i = interpreters.find(i => i.id === user.profileId);
      return i ? i.name : 'Unknown Interpreter';
    }
    return null;
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return <Badge variant="danger">ADMIN</Badge>;
      case UserRole.CLIENT: return <Badge variant="info">CLIENT</Badge>;
      case UserRole.INTERPRETER: return <Badge variant="success">INTERPRETER</Badge>;
      default: return <Badge variant="neutral">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm">Manage system access, roles, and profile links.</p>
        </div>
        <Button icon={Plus} onClick={() => handleOpenModal()}>Pre-Provision User</Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search users by name or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState 
          title="No users found" 
          description={filter ? "No users match your search." : "Add a new user to get started."}
          actionLabel="Add User"
          onAction={() => handleOpenModal()}
          icon={Users}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User Info</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Linked Profile</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold mr-3">
                        {u.displayName.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{u.displayName}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getRoleBadge(u.role)}
                  </td>
                  <td className="px-6 py-4">
                    {getProfileName(u) ? (
                      <div className="flex items-center text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded-md w-fit">
                        <LinkIcon size={12} className="mr-1" />
                        {getProfileName(u)}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No Link</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" icon={Edit2} onClick={() => handleOpenModal(u)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Pre-Provision User'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input 
              type="email" 
              required
              disabled={!!editingUser}
              className="w-full p-2.5 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500"
              value={formData.email || ''}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input 
              type="text" 
              className="w-full p-2.5 border border-gray-300 rounded-lg"
              value={formData.displayName || ''}
              onChange={e => setFormData({...formData, displayName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
            <select 
              className="w-full p-2.5 border border-gray-300 rounded-lg"
              value={formData.role}
              onChange={e => {
                setFormData({
                  ...formData, 
                  role: e.target.value as UserRole,
                  profileId: '' // Reset link when role changes
                });
              }}
            >
              <option value={UserRole.ADMIN}>Administrator</option>
              <option value={UserRole.CLIENT}>Client</option>
              <option value={UserRole.INTERPRETER}>Interpreter</option>
            </select>
          </div>

          {/* Dynamic Linker */}
          {formData.role !== UserRole.ADMIN && (
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
               <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                 Link to {formData.role === UserRole.CLIENT ? 'Client Profile' : 'Interpreter Profile'}
               </label>
               <select 
                 className="w-full p-2 border border-gray-300 rounded-md text-sm"
                 value={formData.profileId || ''}
                 onChange={e => setFormData({...formData, profileId: e.target.value})}
               >
                 <option value="">-- Select Profile --</option>
                 {formData.role === UserRole.CLIENT && clients.map(c => (
                   <option key={c.id} value={c.id}>{c.companyName}</option>
                 ))}
                 {formData.role === UserRole.INTERPRETER && interpreters.map(i => (
                   <option key={i.id} value={i.id}>{i.name}</option>
                 ))}
               </select>
               <p className="text-xs text-gray-500 mt-2">
                 Linking ensures this user sees their specific data (bookings, invoices, etc).
               </p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
             <Button type="submit" isLoading={saving}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
