import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/userService';
import { User, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../context/ToastContext';
import { Search, Plus, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react';

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { showToast } = useToast();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await UserService.getAll();
      setUsers(data ?? []);
    } catch (error) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (user: User) => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionInProgress(user.id);
    try {
      await UserService.update(user.id, { status: newStatus });
      showToast('Status updated', 'success');
      await loadData();
    } finally { setActionInProgress(null); }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.displayName} permanently?`)) return;
    setActionInProgress(user.id);
    try {
      await UserService.delete(user.id);
      showToast('User removed', 'success');
      await loadData();
    } finally { setActionInProgress(null); }
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredUsers = (users ?? []).filter(u => {
    const q = safe(filter);
    return safe(u.displayName).includes(q) || safe(u.email).includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">User Accounts</h1>
        <Button icon={Plus}>Add User</Button>
      </div>

      <Card padding="sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" placeholder="Search name or email..." 
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-transparent text-gray-900"
            value={filter} onChange={e => setFilter(e.target.value)}
          />
        </div>
      </Card>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <Card padding="none">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Identity</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map(u => (
                <tr key={u.id} className={u.status === 'SUSPENDED' ? 'bg-red-50/20' : ''}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-gray-900">{u.displayName}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.role === UserRole.ADMIN ? 'danger' : 'info'}>{u.role}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>{u.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => toggleUserStatus(u)} disabled={!!actionInProgress} className="p-2 text-orange-500 hover:bg-orange-50 rounded">
                        {u.status === 'ACTIVE' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
                      </button>
                      <button onClick={() => handleDeleteUser(u)} disabled={!!actionInProgress} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};