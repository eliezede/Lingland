import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StaffService } from '../../../services/staffService';
import { UserService } from '../../../services/userService';
import { User, Department, JobTitle, UserRole, NotificationType } from '../../../types';
import { NotificationService } from '../../../services/notificationService';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Users, Building2, Briefcase, Mail, Phone, Settings, Shield, Crown, LayoutGrid, List, UserCircle2, Trash2, History } from 'lucide-react';

export const AdminStaff = () => {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [manageForm, setManageForm] = useState({ departmentId: '', jobTitleId: '' });
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', departmentId: '', jobTitleId: '', role: UserRole.ADMIN });
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();
  const { isSuperAdmin, user } = useAuth();
  const { confirm } = useConfirm();
  const inputClass = "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
  const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400";

  const loadData = async () => {
    setLoading(true);
    try {
      const [members, depts, jobs] = await Promise.all([
        StaffService.getStaffMembers(),
        StaffService.getDepartments(),
        StaffService.getJobTitles()
      ]);
      setStaff(members);
      setDepartments(depts);
      setJobTitles(jobs);
    } catch (error) {
      showToast('Failed to load staff directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenManage = (member: User) => {
    setSelectedStaff(member);
    setIsManageModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setSaving(true);
    try {
        const existingProfile = await StaffService.getProfile(selectedStaff.id);
        if (existingProfile) {
            await StaffService.updateProfile(existingProfile.id, manageForm);
        } else {
            await StaffService.createProfile({
                userId: selectedStaff.id,
                departmentId: manageForm.departmentId,
                jobTitleId: manageForm.jobTitleId,
                onboardingCompleted: false,
                preferences: { theme: 'system', language: 'en', notifications: true }
            });
        }

        // RIGOR: Notify user and refresh
        if (selectedStaff.id === user?.id) {
            showToast('Permissions updated. Please refresh to see changes.', 'success');
        } else {
            showToast('Staff assignment updated', 'success');
            // Trigger notification
            await NotificationService.notify(selectedStaff.id, 'Profile Updated', 'Your department or job title has been updated by an administrator.', NotificationType.INFO, '/admin/profile');
        }

        setIsManageModalOpen(false);
        await loadData();
    } catch (err) {
        showToast('Error saving assignment', 'error');
    } finally {
        setSaving(false);
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
        const result = await StaffService.inviteStaffMember(inviteForm);
        showToast(`Invitation sent to ${inviteForm.email}`, 'success');
        setIsInviteModalOpen(false);
        setInviteForm({ name: '', email: '', departmentId: '', jobTitleId: '', role: UserRole.ADMIN });
        await loadData();
    } catch (err: any) {
        showToast(err.message || 'Error inviting staff', 'error');
    } finally {
        setSaving(false);
    }
  };

  const columns = [
    {
      header: 'Member',
      accessor: (user: User) => (
        <div className="flex items-center space-x-3">
          <UserAvatar 
            name={user.displayName} 
            src={user.photoUrl} 
            size="sm"
            className="rounded-lg shadow-sm"
          />
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 dark:text-white capitalize truncate max-w-[150px]">{user.displayName}</span>
            <div className="flex items-center space-x-2">
               {user.role === UserRole.SUPER_ADMIN ? <Crown size={10} className="text-amber-500" /> : <Shield size={10} className="text-blue-500" />}
               <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{user.role}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      header: 'Organization',
      accessor: (user: User) => (
        <div className="space-y-1">
          <div className="flex items-center text-xs text-slate-600">
             <Building2 size={12} className="mr-1.5 text-slate-400" />
             <span className="font-medium truncate max-w-[120px]">Lingland Admin</span>
          </div>
          <div className="flex items-center text-[10px] text-slate-400 italic">
             <Briefcase size={10} className="mr-1.5" />
             <span>Team Member</span>
          </div>
        </div>
      )
    },
    {
      header: 'Contacts',
      accessor: (user: User) => (
        <div className="flex flex-col space-y-1">
            <div className="flex items-center text-xs text-slate-500">
                <Mail size={12} className="mr-1.5" />
                <span className="truncate max-w-[180px]">{user.email}</span>
            </div>
            <div className="flex items-center text-[10px] text-slate-400">
                <Phone size={10} className="mr-1.5" />
                {'UK Mobile'}
            </div>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: (user: User) => (
        <Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'PENDING' ? 'warning' : 'neutral'} className={user.status === 'PENDING' ? 'animate-pulse' : ''}>
          {user.status === 'PENDING' ? 'INVITATION SENT' : user.status}
        </Badge>
      )
    }
  ];

  const StaffCard = ({ member }: { member: User }) => (
    <div 
        onClick={() => handleOpenManage(member)}
        className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-500 hover:bg-blue-50/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-blue-950/20"
    >
        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/40">
                <Settings size={14} />
            </div>
        </div>
        
        <div className="flex flex-col items-center space-y-3 text-center">
            <UserAvatar 
              name={member.displayName} 
              src={member.photoUrl} 
              size="lg"
              className="rounded-lg shadow-inner"
            />
            
            <div>
                <h3 className="mb-1 text-base font-black capitalize tracking-tight text-slate-900 dark:text-white">{member.displayName}</h3>
                <div className="flex items-center justify-center space-x-2">
                    <Badge variant={member.role === UserRole.SUPER_ADMIN ? 'warning' : 'info'} className="text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                        {member.role}
                    </Badge>
                    <Badge variant={member.status === 'ACTIVE' ? 'success' : 'neutral'} className="text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                        {member.status}
                    </Badge>
                </div>
            </div>

            <div className="w-full space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Building2 size={14} className="shrink-0 text-blue-500" />
                    <span className="text-xs font-bold truncate">Lingland Administration</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Mail size={14} className="shrink-0 text-blue-500" />
                    <span className="text-xs font-bold truncate">{member.email}</span>
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader 
        title="Staff Directory" 
        subtitle="Manage internal team members and organizational roles"
      >
        <div className="flex items-center gap-3">
          <Button icon={Users} size="sm" onClick={() => setIsInviteModalOpen(true)}>Invite Member</Button>
          <div className="pointer-events-auto flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button 
                  onClick={() => setViewMode('list')}
                  className={`rounded-md p-1.5 transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                  <List size={18} />
              </button>
              <button 
                  onClick={() => setViewMode('grid')}
                  className={`rounded-md p-1.5 transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                  <LayoutGrid size={18} />
              </button>
          </div>
        </div>
      </PageHeader>
      
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-50 dark:bg-slate-800/50" />)}
        </div>
      ) : viewMode === 'list' ? (
        <Table 
            data={staff} 
            columns={columns} 
            isLoading={loading}
            onRowClick={(member) => handleOpenManage(member)}
            renderContextMenu={(member) => [
                { label: 'Manage Profile', icon: Settings, onClick: () => handleOpenManage(member) },
                { label: 'Open Audit Control', icon: History, onClick: () => navigate('/admin/system/audit-log') },
                ...(isSuperAdmin && member.status === 'PENDING' ? [
                  {
                    label: 'Resend Invite',
                    icon: Mail,
                    onClick: async () => {
                      try {
                        showToast(`Resending invite to ${member.email}...`, 'info');
                        await StaffService.resendInvite(member.id);
                        showToast(`Invitation resent to ${member.email}`, 'success');
                      } catch (err: any) {
                        showToast(err.message || 'Error resending invite', 'error');
                      }
                    }
                  }
                ] : []),
                ...(isSuperAdmin ? [
                  { 
                    label: 'Delete Staff Member', 
                    icon: Trash2, 
                    variant: 'danger' as const,
                    onClick: async () => {
                      const ok = await confirm({
                        title: 'Delete Staff Member',
                        message: `Are you sure you want to permanently delete ${member.displayName}? This will remove their system account and staff profile.`,
                        confirmLabel: 'Delete Permanently',
                        variant: 'danger'
                      });
                      if (ok) {
                        try {
                          await UserService.rigorousDelete(member);
                          showToast('Staff member deleted successfully', 'success');
                          loadData();
                        } catch (err) {
                          showToast('Failed to delete staff member', 'error');
                        }
                      }
                    }
                  }
                ] : [])
            ]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {staff.map(member => <StaffCard key={member.id} member={member} />)}
        </div>
      )}

      <Modal 
        isOpen={isManageModalOpen} 
        onClose={() => setIsManageModalOpen(false)} 
        title={selectedStaff?.role === UserRole.SUPER_ADMIN ? "SuperAdmin Details" : "Staff Profile & Assignment"}
      >
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <UserAvatar 
              name={selectedStaff?.displayName || ''} 
              src={selectedStaff?.photoUrl} 
              size="md"
              className="rounded-xl shadow-sm"
            />
            <div className="flex-1 min-w-0">
                <h4 className="font-black text-blue-900 dark:text-blue-100 truncate">{selectedStaff?.displayName}</h4>
                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-blue-500">{selectedStaff?.email}</p>
            </div>
        </div>

        <form onSubmit={handleSaveAssignment} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Department</label>
              <select 
                required
                className={inputClass}
                value={manageForm.departmentId}
                onChange={e => setManageForm({ ...manageForm, departmentId: e.target.value, jobTitleId: '' })}
              >
                <option value="">Select Department...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Job Title</label>
              <select 
                required
                className={inputClass}
                value={manageForm.jobTitleId}
                onChange={e => setManageForm({ ...manageForm, jobTitleId: e.target.value })}
                disabled={!manageForm.departmentId}
              >
                <option value="">Select Job Title...</option>
                {jobTitles
                    .filter(j => j.departmentId === manageForm.departmentId)
                    .map(j => <option key={j.id} value={j.id}>{j.name}</option>)
                }
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setIsManageModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" type="submit" isLoading={saving}>Save Assignment</Button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={isInviteModalOpen} 
        onClose={() => setIsInviteModalOpen(false)} 
        title="Invite New Staff Member"
      >
        <form onSubmit={handleInviteStaff} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Full Name</label>
              <input 
                required
                type="text"
                placeholder="e.g., John Smith"
                className={inputClass}
                value={inviteForm.name}
                onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input 
                required
                type="email"
                placeholder="john.smith@lingland.com"
                className={inputClass}
                value={inviteForm.email}
                onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Department</label>
                  <select 
                    required
                    className={inputClass}
                    value={inviteForm.departmentId}
                    onChange={e => setInviteForm({ ...inviteForm, departmentId: e.target.value, jobTitleId: '' })}
                  >
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Job Title</label>
                  <select 
                    required
                    className={inputClass}
                    value={inviteForm.jobTitleId}
                    onChange={e => setInviteForm({ ...inviteForm, jobTitleId: e.target.value })}
                    disabled={!inviteForm.departmentId}
                  >
                    <option value="">Select...</option>
                    {jobTitles
                        .filter(j => j.departmentId === inviteForm.departmentId)
                        .map(j => <option key={j.id} value={j.id}>{j.name}</option>)
                    }
                  </select>
                </div>
            </div>
            <div>
              <label className={labelClass}>System Role</label>
              <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: UserRole.ADMIN })}
                    className={`rounded-md border px-4 py-2.5 text-xs font-bold transition-all ${inviteForm.role === UserRole.ADMIN ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}
                  >
                    Admin
                  </button>
                  <button 
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: UserRole.SUPER_ADMIN })}
                    className={`rounded-md border px-4 py-2.5 text-xs font-bold transition-all ${inviteForm.role === UserRole.SUPER_ADMIN ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}
                  >
                    SuperAdmin
                  </button>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" className="flex-1" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" type="submit" isLoading={saving}>Send Secure Invite</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
