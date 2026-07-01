import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StaffService } from '../../../services/staffService';
import { Department, JobTitle, SystemModule, LevelPermission } from '../../../types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { 
  Plus, Building2, Briefcase, Trash2, Edit2, ChevronRight, Hash, 
  ShieldCheck, Save, Check, X, Users, UserCog, History
} from 'lucide-react';

export const AdminOrgChart = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'structure' | 'permissions'>('structure');
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [levelPermissions, setLevelPermissions] = useState<LevelPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPermissions, setSavingPermissions] = useState(false);
  
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingJob, setEditingJob] = useState<JobTitle | null>(null);
  
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [jobForm, setJobForm] = useState({ name: '', departmentId: '', level: 1 });
  
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const inputClass = "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
  const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400";

  const loadData = async () => {
    setLoading(true);
    try {
      const [depts, jobs, perms] = await Promise.all([
        StaffService.getDepartments(),
        StaffService.getJobTitles(),
        StaffService.getLevelPermissions()
      ]);
      setDepartments(depts);
      setJobTitles(jobs);
      
      // Initialize levels 1-10 if not present in DB
      const fullPerms = Array.from({ length: 10 }, (_, i) => {
        const lv = i + 1;
        return perms.find(p => p.level === lv) || { level: lv, modules: [] };
      });
      setLevelPermissions(fullPerms);
    } catch (error) {
      showToast('Failed to load organization data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await StaffService.updateDepartment(editingDept.id, deptForm);
        showToast('Department updated', 'success');
      } else {
        await StaffService.createDepartment(deptForm);
        showToast('Department created', 'success');
      }
      setIsDeptModalOpen(false);
      setEditingDept(null);
      setDeptForm({ name: '', description: '' });
      await loadData();
    } catch (err) {
      showToast('Error saving department', 'error');
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingJob) {
        await StaffService.updateJobTitle(editingJob.id, jobForm);
        showToast('Job Title updated', 'success');
      } else {
        await StaffService.createJobTitle(jobForm);
        showToast('Job Title created', 'success');
      }
      setIsJobModalOpen(false);
      setEditingJob(null);
      setJobForm({ name: '', departmentId: '', level: 1 });
      await loadData();
    } catch (err) {
      showToast('Error saving job title', 'error');
    }
  };

  const handleDeleteJob = async (job: JobTitle) => {
    const ok = await confirm({
      title: 'Delete Job Title',
      message: `Are you sure you want to delete ${job.name}? Staff assigned to this role will need to be re-assigned.`,
      variant: 'danger'
    });
    if (ok) {
      await StaffService.deleteJobTitle(job.id);
      showToast('Job Title deleted', 'success');
      await loadData();
    }
  };

  const handleDeleteDept = async (dept: Department) => {
    const ok = await confirm({
      title: 'Delete Department',
      message: `Are you sure you want to delete ${dept.name}? This may affect staff assigned to it.`,
      variant: 'danger'
    });
    if (ok) {
      await StaffService.deleteDepartment(dept.id);
      showToast('Department deleted', 'success');
      await loadData();
    }
  };

  const togglePermission = (level: number, module: SystemModule) => {
    setLevelPermissions(prev => prev.map(p => {
      if (p.level === level) {
        const hasModule = p.modules.includes(module);
        return {
          ...p,
          modules: hasModule 
            ? p.modules.filter(m => m !== module)
            : [...p.modules, module]
        };
      }
      return p;
    }));
  };

  const handleSavePermissions = async () => {
    setSavingPermissions(true);
    try {
      await StaffService.updateLevelPermissions(levelPermissions);
      showToast('Permissions matrix updated', 'success');
    } catch (error) {
      showToast('Error saving permissions', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  const deptColumns = [
    {
      header: 'Department Name',
      accessor: (d: Department) => (
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 text-blue-600">
            <Building2 size={16} />
          </div>
          <span className="font-bold">{d.name}</span>
        </div>
      )
    },
    {
      header: 'Description',
      accessor: (d: Department) => <span className="text-slate-500 text-xs">{d.description || 'No description'}</span>
    },
    {
      header: 'Hiring Level',
      accessor: (d: Department) => {
        const jobsCount = jobTitles.filter(j => j.departmentId === d.id).length;
        return <span className="text-xs font-medium text-slate-400">{jobsCount} Job Titles</span>
      }
    }
  ];

  const jobColumns = [
    {
      header: 'Job Title',
      accessor: (j: JobTitle) => (
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
            <Briefcase size={16} />
          </div>
          <span className="font-bold">{j.name}</span>
        </div>
      )
    },
    {
      header: 'Department',
      accessor: (j: JobTitle) => (
        <div className="flex items-center text-xs text-slate-500">
          <ChevronRight size={12} className="mr-1" />
          {departments.find(d => d.id === j.departmentId)?.name || 'Unknown'}
        </div>
      )
    },
    {
      header: 'Grade / Level',
      accessor: (j: JobTitle) => (
        <div className="flex items-center space-x-1.5">
           <Hash size={12} className="text-slate-400" />
           <span className="text-xs font-black">{j.level || 1}</span>
        </div>
      )
    }
  ];

  const modules = Object.values(SystemModule);
  const levelsWithAccess = levelPermissions.filter(p => p.modules.length > 0).length;
  const emptyDepartments = departments.filter(dept => !jobTitles.some(job => job.departmentId === dept.id)).length;

  return (
    <div className="space-y-4 pb-10">
      <PageHeader title="Organization Chart" subtitle="Manage departments, roles and platform visibility">
        {activeTab === 'structure' ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={Plus} onClick={() => { 
              setEditingJob(null); 
              setJobForm({ name: '', departmentId: '', level: 1 });
              setIsJobModalOpen(true); 
            }}>
              Add Job Title
            </Button>
            <Button size="sm" icon={Building2} onClick={() => { 
              setEditingDept(null); 
              setDeptForm({ name: '', description: '' });
              setIsDeptModalOpen(true); 
            }}>
              Add Department
            </Button>
          </div>
        ) : (
          <Button icon={Save} size="sm" onClick={handleSavePermissions} isLoading={savingPermissions}>Save Matrix</Button>
        )}
      </PageHeader>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Departments</p>
            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{departments.length}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{emptyDepartments} without roles</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Job titles</p>
            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{jobTitles.length}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Linked to staff profiles</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Permission levels</p>
            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{levelsWithAccess}/10</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Configured with module access</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 lg:flex-col lg:items-stretch">
          <Button variant="outline" size="sm" icon={Users} onClick={() => navigate('/admin/administration/staff')}>Staff Directory</Button>
          <Button variant="outline" size="sm" icon={UserCog} onClick={() => navigate('/admin/users')}>Users & Roles</Button>
          <Button variant="outline" size="sm" icon={History} onClick={() => navigate('/admin/system/audit-log')}>Audit Control</Button>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab('structure')}
          className={`px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-all ${activeTab === 'structure' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Org Structure
        </button>
        <button 
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-all ${activeTab === 'permissions' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Level Permissions
        </button>
      </div>

      {activeTab === 'structure' ? (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Departments</h3>
                <span className="text-xs font-bold text-slate-400">{departments.length} records</span>
            </div>
            <Table 
              data={departments} 
              columns={deptColumns} 
              isLoading={loading}
              renderContextMenu={(d) => [
                { label: 'Edit', icon: Edit2, onClick: () => { setEditingDept(d); setDeptForm({ name: d.name, description: d.description || '' }); setIsDeptModalOpen(true); } },
                { label: 'Delete', icon: Trash2, onClick: () => handleDeleteDept(d), variant: 'danger' }
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Job Titles</h3>
                <span className="text-xs font-bold text-slate-400">{jobTitles.length} records</span>
            </div>
            <Table 
              data={jobTitles} 
              columns={jobColumns} 
              isLoading={loading}
              renderContextMenu={(j) => [
                { 
                  label: 'Edit', 
                  icon: Edit2, 
                  onClick: () => { 
                    setEditingJob(j); 
                    setJobForm({ name: j.name, departmentId: j.departmentId, level: j.level || 1 }); 
                    setIsJobModalOpen(true); 
                  } 
                },
                { label: 'Delete', icon: Trash2, onClick: () => handleDeleteJob(j), variant: 'danger' }
              ]}
            />
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">Visibility Matrix</h4>
              <p className="text-xs leading-5 text-blue-700 dark:text-blue-300">Configures visible modules for staff levels 1-10. SuperAdmins bypass these restrictions. Changes here affect staff navigation after their role/profile is linked in Staff Directory.</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400 transition-colors dark:border-slate-800 dark:bg-slate-800">
                    Module Name
                  </th>
                  {Array.from({ length: 10 }, (_, i) => (
                    <th key={i} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-center text-[10px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      L{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((module, mIdx) => (
                  <tr key={module} className={`group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${mIdx !== modules.length - 1 ? 'border-b border-slate-100 dark:border-slate-800/50' : ''}`}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors group-hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:group-hover:bg-slate-800">
                      {module.replace('_', ' ')}
                    </td>
                    {Array.from({ length: 10 }, (_, i) => {
                      const level = i + 1;
                      const isAllowed = levelPermissions.find(p => p.level === level)?.modules.includes(module);
                      return (
                        <td key={level} className="px-3 py-3 text-center">
                          <button 
                            onClick={() => togglePermission(level, module)}
                            title={`${isAllowed ? 'Revoke' : 'Grant'} ${module.replace('_', ' ')} for level ${level}`}
                            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-all ${isAllowed 
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                              : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'}`}
                          >
                            {isAllowed ? <Check size={16} /> : <X size={14} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Dept Modal */}
      <Modal isOpen={isDeptModalOpen} onClose={() => setIsDeptModalOpen(false)} title={editingDept ? "Edit Department" : "New Department"}>
        <form onSubmit={handleSaveDept} className="space-y-4 pt-4">
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Department Name</label>
              <input 
                type="text" required
                className={inputClass}
                placeholder="e.g. Operations, Finance"
                value={deptForm.name}
                onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea 
                className={`${inputClass} min-h-[90px] resize-none`}
                placeholder="What does this department do?"
                value={deptForm.description}
                onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setIsDeptModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" type="submit">{editingDept ? "Save Changes" : "Create Department"}</Button>
          </div>
        </form>
      </Modal>

      {/* Job Modal */}
      <Modal isOpen={isJobModalOpen} onClose={() => { setIsJobModalOpen(false); setEditingJob(null); setJobForm({ name: '', departmentId: '', level: 1 }); }} title={editingJob ? "Edit Job Title" : "New Job Title"}>
        <form onSubmit={handleSaveJob} className="space-y-4 pt-4">
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Job Title</label>
              <input 
                type="text" required
                className={inputClass}
                placeholder="e.g. Senior Manager, Accountant"
                value={jobForm.name}
                onChange={e => setJobForm({ ...jobForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Department</label>
              <select 
                required
                className={inputClass}
                value={jobForm.departmentId}
                onChange={e => setJobForm({ ...jobForm, departmentId: e.target.value })}
              >
                <option value="">Select Department...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Grade / Level (1-10)</label>
              <input 
                type="number" min="1" max="10"
                className={inputClass}
                value={jobForm.level}
                onChange={e => setJobForm({ ...jobForm, level: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => { setIsJobModalOpen(false); setEditingJob(null); }}>Cancel</Button>
            <Button className="flex-1" type="submit">{editingJob ? "Save Changes" : "Create Job Title"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
