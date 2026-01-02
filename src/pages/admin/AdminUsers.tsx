
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
  Search, Plus, Edit2, Link as LinkIcon, AlertCircle, ShieldOff, ShieldCheck, Trash2, Wand2
} from 'lucide-react';

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({ role: UserRole.INTERPRETER, status: 'ACTIVE' });
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await UserService.getAll();
      setUsers(data);
    } catch (error) {
      showToast('Failed to load user data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (user: User) => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Are you sure you want to ${newStatus === 'ACTIVE' ? 'unblock' : 'block'} this user?`)) return;

    setActionInProgress(user.id);
    try {
      await UserService.update(user.id, { status: newStatus });
      showToast(`User ${newStatus.toLowerCase()} successfully`, 'success');
      await loadData();
    } catch (e) {
      showToast('Failed to change status', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`CRITICAL: Permanently delete access for ${user.displayName}? This cannot be undone.`)) return;
    setActionInProgress(user.id);
    try {
      await UserService.delete(user.id);
      showToast('User account removed permanently', 'success');
      await loadData();
    } catch (e) {
      showToast('Failed to delete user', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
          <p className="text-gray-500 text-sm">Control system access and permissions.</p>
        </div>
        <Button icon={Plus} onClick={() => { setEditingUser(null); setIsModalOpen(true); }}>Add User</Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Search by name or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.filter(u => u.email.toLowerCase().includes(filter.toLowerCase()) || u.displayName.toLowerCase().includes(filter.toLowerCase())).map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${u.status === 'SUSPENDED' ? 'bg-red-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                       <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold mr-3 text-blue-700">
                         {u.displayName?.charAt(0)}
                       </div>
                       <div>
                         <div className="text-sm font-bold text-gray-900">{u.displayName}</div>
                         <div className="text-xs text-gray-500">{u.email}</div>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <Badge variant={u.role === UserRole.ADMIN ? 'danger' : 'info'}>{u.role}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>{u.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => toggleUserStatus(u)}
                        className={`p-2 rounded-lg ${u.status === 'ACTIVE' ? 'text-orange-500 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={u.status === 'ACTIVE' ? 'Block' : 'Unblock'}
                      >
                        {u.status === 'ACTIVE' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(u)}
                        className="text-gray-400 p-2 rounded-lg hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
