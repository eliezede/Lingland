import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { StaffService } from '../../services/staffService';
import { StaffProfile, Department, JobTitle, SystemModule } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../../components/ui/Badge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ImageCropper } from '../../components/ui/ImageCropper';
import { UserService } from '../../services/userService';
import { 
  User, Mail, Phone, Calendar, MapPin, 
  Shield, Briefcase, Building2, Bell, Sun, 
  Moon, Monitor, Save, AlertCircle, Heart,
  ShieldCheck, Database, Upload
} from 'lucide-react';

export const AdminProfile = () => {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [allowedModules, setAllowedModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const { showToast } = useToast();

  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [prof, depts, jobs, perms] = await Promise.all([
        StaffService.getProfile(user.id),
        StaffService.getDepartments(),
        StaffService.getJobTitles(),
        StaffService.getLevelPermissions()
      ]);
      setProfile(prof);
      setDepartments(depts);
      setJobTitles(jobs);
      
      // Find user's allowed modules based on grade
      if (prof?.jobTitleId) {
          const job = jobs.find(j => j.id === prof.jobTitleId);
          if (job?.level) {
              const levelPerm = perms.find(p => p.level === job.level);
              setAllowedModules(levelPerm?.modules || []);
          }
      }
    } catch (error) {
      showToast('Error loading profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user]);

  const handleUpdatePreference = async (key: string, value: any) => {
    if (!profile) return;
    try {
        const newPreferences = { ...profile.preferences, [key]: value };
        await StaffService.updateProfile(profile.id, { preferences: newPreferences });
        setProfile({ ...profile, preferences: newPreferences });
        showToast('Preferences updated', 'success');
    } catch (e) {
        showToast('Failed to save preference', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
        await StaffService.updateProfile(profile.id, profile);
        showToast('Profile saved successfully', 'success');
    } catch (e) {
        showToast('Failed to save profile', 'error');
    } finally {
        setSaving(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedImage: string) => {
    if (!user?.id) return;
    setIsUploading(true);
    try {
      const photoUrl = await UserService.uploadProfilePhoto(user.id, croppedImage, user.role);
      setProfile(prev => prev ? { ...prev, photoUrl } : null);
      await refreshUser();
      showToast('Profile photo updated', 'success');
    } catch (error) {
      showToast('Failed to update photo', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return (
    <div className="p-12 text-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Profile Matrix...</p>
    </div>
  );

  const currentDept = departments.find(d => d.id === profile?.departmentId);
  const currentJob = jobTitles.find(j => j.id === profile?.jobTitleId);
  const panelClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  const inputClass = "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
  const iconInputClass = `${inputClass} pl-10`;
  const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400";

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <PageHeader title="My Profile" subtitle="Manage your professional data and platform preferences" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className={`${panelClass} text-center`}>
             <div className="group relative mx-auto mb-3 h-20 w-20">
                <UserAvatar 
                  src={profile?.photoUrl || user?.photoUrl} 
                  name={user?.displayName || ''} 
                  size="xl" 
                  showBorder 
                  className={isUploading ? 'opacity-50' : ''}
                />
                
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-2 border-white bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 dark:border-slate-900">
                  <Upload size={14} strokeWidth={2.5} className="text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} disabled={isUploading} />
                </label>
             </div>
             <h2 className="truncate text-lg font-black capitalize text-slate-900 dark:text-white">{user?.displayName}</h2>
             <p className="mb-4 truncate text-sm text-slate-500">{user?.email}</p>
             
             <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wide text-slate-400">Department</span>
                    <span className="max-w-[140px] truncate font-bold text-blue-600">{currentDept?.name || 'Unassigned'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wide text-slate-400">Job Title</span>
                    <span className="max-w-[140px] truncate font-bold text-slate-700 dark:text-slate-200">{currentJob?.name || 'Unassigned'}</span>
                </div>
             </div>
          </div>

          <div className={panelClass}>
             <h3 className="mb-4 text-[10px] font-black uppercase tracking-wide text-slate-400">Interface Preferences</h3>
             <div className="space-y-4">
                <div>
                   <label className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-400">Color Mode</label>
                   <div className="grid grid-cols-3 gap-2">
                       {['light', 'dark', 'system'].map((mode) => (
                           <button 
                                key={mode}
                                type="button"
                                onClick={() => handleUpdatePreference('theme', mode)}
                                className={`flex h-16 flex-col items-center justify-center rounded-md border transition-all ${profile?.preferences?.theme === mode ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
                            >
                               {mode === 'light' && <Sun size={16} />}
                               {mode === 'dark' && <Moon size={16} />}
                               {mode === 'system' && <Monitor size={16} />}
                               <span className="text-[10px] capitalize mt-2 font-bold">{mode}</span>
                           </button>
                       ))}
                   </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Notifications</span>
                        <span className="text-[10px] text-slate-400">Desktop & Email alerts</span>
                    </div>
                    <button 
                        type="button"
                        onClick={() => handleUpdatePreference('notifications', !profile?.preferences?.notifications)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${profile?.preferences?.notifications ? 'bg-green-500' : 'bg-slate-300'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${profile?.preferences?.notifications ? 'left-5' : 'left-1'}`} />
                    </button>
                </div>
             </div>
          </div>
        </div>

        <div className="space-y-4">
           <form onSubmit={handleSaveProfile} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
             <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="flex items-center text-sm font-black uppercase tracking-wide text-slate-900 dark:text-white">
                    <User size={18} className="mr-2 text-blue-600" />
                    Employee Record (UK)
                </h3>
                <Button type="submit" icon={Save} isLoading={saving} size="sm">Save</Button>
             </div>

             <div className="space-y-5 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-600/20">
                        <ShieldCheck size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Grade / Level</p>
                        <div className="flex items-center gap-2">
                            <p className="text-base font-black text-slate-900 dark:text-white">Level {currentJob?.level || '1'}</p>
                            <Badge variant="neutral" className="text-[9px]">SYSTEM ACCESS: {allowedModules.length} MODULES</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-600/20">
                        <Database size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Active Permissions</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {allowedModules.map(m => (
                                <Badge key={m} variant="success" className="text-[8px] px-1.5 py-0">
                                    {m.replace('_', ' ')}
                                </Badge>
                            ))}
                            {allowedModules.length === 0 && <span className="text-[10px] text-slate-400">Restricted Access</span>}
                        </div>
                      </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                        <label className={labelClass}>Phone Number</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input 
                                type="tel"
                                className={iconInputClass}
                                placeholder="+44 7xxx xxxxxx"
                                value={profile?.phone || ''}
                                onChange={e => profile && setProfile({ ...profile, phone: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Date of Birth</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input 
                                type="date"
                                className={iconInputClass}
                                value={profile?.dob || ''}
                                onChange={e => profile && setProfile({ ...profile, dob: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>NI Number</label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input 
                                type="text"
                                className={iconInputClass}
                                placeholder="QQ 12 34 56 C"
                                value={profile?.niNumber || ''}
                                onChange={e => profile && setProfile({ ...profile, niNumber: e.target.value.toUpperCase() })}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <h4 className="flex items-center text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                        <MapPin size={14} className="mr-2 text-slate-400" />
                        Home Address
                    </h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                             <input 
                                type="text" placeholder="Street Address"
                                className={inputClass}
                                value={profile?.address?.street || ''}
                                onChange={e => profile && setProfile({ ...profile, address: { ...profile.address!, street: e.target.value } })}
                            />
                        </div>
                        <input 
                            type="text" placeholder="Town/City"
                            className={inputClass}
                            value={profile?.address?.town || ''}
                            onChange={e => profile && setProfile({ ...profile, address: { ...profile.address!, town: e.target.value } })}
                        />
                        <input 
                            type="text" placeholder="Postcode"
                            className={`${inputClass} uppercase`}
                            value={profile?.address?.postcode || ''}
                            onChange={e => profile && setProfile({ ...profile, address: { ...profile.address!, postcode: e.target.value } })}
                        />
                    </div>
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <h4 className="flex items-center text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                        <Heart size={14} className="mr-2 text-red-500" />
                        Emergency Contact
                    </h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input 
                            type="text" placeholder="Full Name"
                            className={inputClass}
                            value={profile?.emergencyContact?.name || ''}
                            onChange={e => profile && setProfile({ ...profile, emergencyContact: { ...profile.emergencyContact!, name: e.target.value } })}
                        />
                        <input 
                            type="text" placeholder="Relationship"
                            className={inputClass}
                            value={profile?.emergencyContact?.relationship || ''}
                            onChange={e => profile && setProfile({ ...profile, emergencyContact: { ...profile.emergencyContact!, relationship: e.target.value } })}
                        />
                        <input 
                            type="tel" placeholder="Phone"
                            className={inputClass}
                            value={profile?.emergencyContact?.phone || ''}
                            onChange={e => profile && setProfile({ ...profile, emergencyContact: { ...profile.emergencyContact!, phone: e.target.value } })}
                        />
                    </div>
                </div>
             </div>
           </form>
        </div>
      </div>

      {selectedImage && (
        <ImageCropper
          image={selectedImage}
          isOpen={showCropper}
          onClose={() => setShowCropper(false)}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};
