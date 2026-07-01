import React, { useEffect, useState } from 'react';
import { UserService } from '../../services/userService';
import { User, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { Table } from '../../components/ui/Table';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { PageHeader } from '../../components/layout/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import {
  Search, Plus, ShieldOff, ShieldCheck, Trash2,
  Shield, Crown, Calendar,
  CheckCircle2, AlertCircle, User as UserIcon
} from 'lucide-react';

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedUserForRole, setSelectedUserForRole] = useState<User | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRoleSelection, setNewRoleSelection] = useState<UserRole | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isSuperAdmin } = useAuth();

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

  const handleBulkStatusChange = async (status: 'ACTIVE' | 'SUSPENDED') => {
    setActionInProgress('bulk-status');
    let successCount = 0;
    await Promise.allSettled(selectedIds.map(async (id) => {
      try {
        await UserService.update(id, { status });
        successCount++;
      } catch (err) { /* silent */ }
    }));
    showToast(`${successCount} users ${status === 'ACTIVE' ? 'activated' : 'suspended'}`, 'success');
    setSelectedIds([]);
    await loadData();
    setActionInProgress(null);
  };

   const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Bulk Delete Users',
      message: `Are you sure you want to permanently delete ${selectedIds.length} users? This action cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger'
    });
    if (!ok) return;
    setActionInProgress('bulk-delete');
    let successCount = 0;
    await Promise.allSettled(selectedIds.map(async (id) => {
      try {
        const userToDelete = users.find(u => u.id === id);
        if (userToDelete) {
          await UserService.rigorousDelete(userToDelete);
          successCount++;
        }
      } catch (err) { /* silent */ }
    }));
    showToast(`${successCount} users deleted`, 'success');
    setSelectedIds([]);
    await loadData();
    setActionInProgress(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    showToast('Staff invitations must be sent from the Staff Directory page (Administration > Staff).', 'info');
    setIsInviteModalOpen(false);
  };

  const handleRoleChange = async () => {
    if (!selectedUserForRole || !newRoleSelection) return;
    setActionInProgress('role-change');
    try {
      await UserService.update(selectedUserForRole.id, { role: newRoleSelection });
      showToast(`User role updated to ${newRoleSelection}`, 'success');
      setIsRoleModalOpen(false);
      setSelectedUserForRole(null);
      await loadData();
    } catch (err) {
      showToast('Failed to update role', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const openRoleModal = (user: User) => {
    setSelectedUserForRole(user);
    setNewRoleSelection(user.role);
    setIsRoleModalOpen(true);
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredUsers = (users ?? []).filter(u => {
    const q = safe(searchFilter);
    const matchesSearch = safe(u.displayName).includes(q) || safe(u.email).includes(q);
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN: return <Crown className="text-amber-500" size={14} />;
      case UserRole.ADMIN: return <Shield className="text-blue-500" size={14} />;
      default: return <UserIcon className="text-slate-400" size={14} />;
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN: return 'danger';
      case UserRole.ADMIN: return 'info';
      case UserRole.CLIENT: return 'success';
      case UserRole.INTERPRETER: return 'warning';
      default: return 'neutral';
    }
  };

  const columns = [
    {
      header: 'User',
      accessor: (user: User) => (
        <div className="flex items-center space-x-3">
          <UserAvatar 
            name={user.displayName} 
            src={user.photoUrl} 
            size="sm"
            className="rounded-lg shadow-sm"
          />
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 dark:text-white capitalize">{user.displayName}</span>
            <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{user.email}</span>
          </div>
        </div>
      )
    },
    {
      header: 'Role',
      accessor: (user: User) => (
        <Badge variant={getRoleBadgeVariant(user.role)}>
          <div className="flex items-center space-x-1">
            {getRoleIcon(user.role)}
            <span>{user.role}</span>
          </div>
        </Badge>
      )
    },
    {
      header: 'Status',
      accessor: (user: User) => (
        <Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'PENDING' ? 'warning' : 'danger'}>
          {user.status}
        </Badge>
      )
    },
    {
      header: 'Join Date',
      accessor: (user: User) => (
        <div className="flex items-center text-xs text-slate-500">
          <Calendar size={12} className="mr-1.5" />
          {'N/A'}
        </div>
      )
    }
  ];

  const renderContextMenu = (user: User) => [
    {
      label: 'Manage Role',
      icon: Shield,
      onClick: () => openRoleModal(user)
    },
    {
      label: user.status === 'ACTIVE' ? 'Suspend' : 'Activate',
      icon: user.status === 'ACTIVE' ? ShieldOff : ShieldCheck,
      onClick: async () => {
        const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        await UserService.update(user.id, { status: newStatus });
        showToast(`User ${newStatus.toLowerCase()}`, 'success');
        loadData();
      }
    },
    {
      label: 'Delete User',
      icon: Trash2,
       onClick: async () => {
        const ok = await confirm({
          title: 'Delete User',
          message: `Are you sure you want to delete ${user.displayName}? This action cannot be undone.`,
          confirmLabel: 'Delete User',
          variant: 'danger'
        });
        if (ok) {
          await UserService.rigorousDelete(user);
          showToast('User and associated profiles deleted', 'success');
          loadData();
        }
      },
      variant: 'danger' as const
    }
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Users & Roles" subtitle="Registry for platform accounts, access status and role control">
        <Button icon={Plus} onClick={() => setIsInviteModalOpen(true)} size="sm">Add account</Button>
      </PageHeader>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search user, email..."
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="ALL">All Roles</option>
            <option value={UserRole.SUPER_ADMIN}>Super Admins</option>
            <option value={UserRole.ADMIN}>Admins</option>
            <option value={UserRole.CLIENT}>Clients</option>
            <option value={UserRole.INTERPRETER}>Interpreters</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          <span>{filteredUsers.length}</span>
          <span>shown</span>
          <span className="text-slate-300">/</span>
          <span>{users.length}</span>
          <span>total</span>
        </div>
      </div>
      </div>

      <div className="space-y-4">
        <Table
          data={filteredUsers}
          columns={columns}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          renderContextMenu={renderContextMenu}
          isLoading={loading}
          emptyMessage="No users matching your criteria."
        />

        <BulkActionBar
          selectedIds={selectedIds}
          selectedCount={selectedIds.length}
          totalCount={filteredUsers.length}
          onClearSelection={() => setSelectedIds([])}
          actions={[
            {
              label: 'Activate',
              icon: ShieldCheck,
              onClick: () => handleBulkStatusChange('ACTIVE'),
              variant: 'success'
            },
            {
              label: 'Suspend',
              icon: ShieldOff,
              onClick: () => handleBulkStatusChange('SUSPENDED'),
              variant: 'warning'
            },
            {
              label: 'Delete',
              icon: Trash2,
              onClick: handleBulkDelete,
              variant: 'danger'
            }
          ]}
        />
      </div>

      {/* Account creation guidance */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Add Account"
      >
        <form onSubmit={handleInvite} className="space-y-4 pt-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">Account creation is routed by workflow.</p>
                <p className="mt-1 text-sm leading-5 text-amber-900 dark:text-amber-100">
                  Staff invitations are created from Staff Directory. Client and interpreter accounts are created through activation, migration or onboarding so user access stays linked to the correct profile.
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setIsInviteModalOpen(false)}>Close</Button>
            <Button className="flex-1" type="button" onClick={() => { setIsInviteModalOpen(false); window.location.hash = '#/admin/administration/staff'; }}>
              Open Staff Directory
            </Button>
          </div>
        </form>
      </Modal>

      {/* Role Modal */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title="Change User Role"
      >
        <div className="space-y-4 pt-4">
          <p className="text-sm text-slate-600">Changing role for <strong>{selectedUserForRole?.displayName}</strong></p>
          <div className="grid grid-cols-1 gap-2">
            {[UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLIENT, UserRole.INTERPRETER].map(r => (
              <button
                key={r}
                onClick={() => setNewRoleSelection(r)}
                disabled={r === UserRole.SUPER_ADMIN && !isSuperAdmin}
                className={`rounded-lg border p-3 text-left transition-all ${newRoleSelection === r ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-100 hover:border-slate-200 disabled:opacity-50 dark:border-slate-800 dark:hover:border-slate-700'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getRoleIcon(r)}
                    <span className="font-bold text-sm">{r}</span>
                  </div>
                  {newRoleSelection === r && <CheckCircle2 size={16} className="text-blue-500" />}
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setIsRoleModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleRoleChange} isLoading={!!actionInProgress}>Update Role</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
