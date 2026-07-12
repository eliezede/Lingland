import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { InterpreterService } from '../../services/interpreterService';
import { StorageService } from '../../services/storageService';
import { UserService } from '../../services/userService';
import { useSettings } from '../../context/SettingsContext';
import { Interpreter } from '../../types';
import {
  User, Shield, Award, LogOut, Edit2, Save, X,
  Check, Upload, FileText, Info, Calendar, ChevronLeft, ChevronRight, Settings
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/layout/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ImageCropper } from '../../components/ui/ImageCropper';

type ProfileTab = 'PERSONAL' | 'SKILLS' | 'COMPLIANCE' | 'AVAILABILITY';

export const InterpreterProfile = () => {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<Interpreter | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('PERSONAL');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  const [viewDate, setViewDate] = useState(new Date());

  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (user?.profileId) {
      const p = await InterpreterService.getById(user.profileId);
      if (p) {
        setProfile(p);
        setFormData(p);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.profileId) return;

    setIsSaving(true);
    try {
      await InterpreterService.updateProfile(user.profileId, formData);
      showToast('Changes saved successfully', 'success');
      await loadProfile();
      setIsEditing(false);
    } catch (error) {
      showToast('Failed to save changes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    const current = formData.languages || [];
    const updated = current.includes(lang)
      ? current.filter(l => l !== lang)
      : [...current, lang];
    setFormData({ ...formData, languages: updated });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.profileId) return;

    setIsUploading(true);
    try {
      const path = `onboarding/${user.id}/profile_dbs_${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      setFormData(prev => ({ ...prev, dbsDocumentUrl: url }));
      showToast('Document uploaded successfully', 'success');
    } catch (error) {
      showToast('Upload failed', 'error');
    } finally {
      setIsUploading(false);
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
      // Small delay to show uploading state for better UX
      const photoUrl = await UserService.uploadProfilePhoto(user.id, croppedImage, 'INTERPRETER');
      setProfile(prev => prev ? { ...prev, photoUrl } : null);
      setFormData(prev => ({ ...prev, photoUrl }));
      await refreshUser();
      showToast('Profile photo updated', 'success');
    } catch (error) {
      showToast('Failed to update photo', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleGlobalAvailability = async () => {
    if (!profile || !user?.profileId) return;
    const newStatus = !profile.isAvailable;
    try {
      await InterpreterService.updateProfile(user.profileId, { isAvailable: newStatus });
      setProfile({ ...profile, isAvailable: newStatus });
      setFormData(prev => ({ ...prev, isAvailable: newStatus }));
      showToast(newStatus ? "You are now Online" : "You are now Offline", "info");
    } catch (e) {
      showToast("Failed to update status", "error");
    }
  };

  const toggleDateAvailability = (dateStr: string) => {
    const current = formData.unavailableDates || [];
    const updated = current.includes(dateStr)
      ? current.filter(d => d !== dateStr)
      : [...current, dateStr];

    setFormData(prev => ({ ...prev, unavailableDates: updated }));
    InterpreterService.updateProfile(user!.profileId!, { unavailableDates: updated });
  };

  if (!profile) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4 text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest">Decrypting Identity...</span>
      </div>
    </div>
  );

  const TabButton = ({ id, label, icon: Icon }: { id: ProfileTab; label: string; icon: any }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] ${activeTab === id
        ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm'
        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
        }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  const inputClasses = "w-full p-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-xs font-bold text-slate-900 bg-white placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-100";
  const labelClasses = "block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1";

  // Calendar Helpers
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = startDayOfMonth(year, month);
    const today = new Date().toISOString().split('T')[0];

    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`pad-${i}`} className="h-10 border border-slate-50 bg-slate-50/50"></div>);
    }

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().split('T')[0];
      const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
      const isToday = dateStr === today;
      const isUnavailable = formData.unavailableDates?.includes(dateStr);

      days.push(
        <div
          key={dateStr}
          onClick={() => !isPast && toggleDateAvailability(dateStr)}
          className={`h-12 flex flex-col items-center justify-center relative cursor-pointer transition-all active:scale-95 group/day
                ${isPast ? 'bg-slate-50/50 text-slate-300 cursor-not-allowed opacity-50' : 'bg-white hover:bg-blue-50 border-transparent'}
                ${isUnavailable ? 'bg-red-50 text-red-600 font-bold border-red-100 flex-1' : ''}
                `}
        >
          <span className={`text-xs font-black transition-colors ${isUnavailable ? 'text-red-600' : isPast ? 'text-slate-300' : 'text-slate-700 group-hover/day:text-blue-600'
            }`}>
            {d}
          </span>

          {isToday && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-600 rounded-full shadow-sm shadow-blue-600/50"></div>
          )}
          {isUnavailable && (
            <div className="absolute bottom-1.5 inset-x-2 flex justify-center">
              <div className="h-[2px] w-4 bg-red-400 rounded-full"></div>
            </div>
          )}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 animate-in fade-in duration-700">
      <PageHeader
        title="Settings & Profile"
        subtitle="Manage your identity, professional skills, and operational availability."
      >
        <Button onClick={handleLogout} variant="outline" icon={LogOut} size="sm" className="text-red-600 border-red-200 hover:bg-red-50">Sign Out</Button>
      </PageHeader>

      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-8">

        {/* Left Column: Navigation Sidebar */}
        <aside className="w-full lg:w-72 shrink-0 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-6 text-center">
            <div className="relative mb-4 mx-auto w-24 h-24 group">
              <UserAvatar 
                src={profile.photoUrl || user?.photoUrl} 
                name={profile.name} 
                size="2xl" 
                showBorder 
                className={isUploading ? 'opacity-50' : ''}
              />
              
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg border-2 border-white cursor-pointer flex items-center justify-center transition-all hover:scale-110 group-hover:rotate-6">
                <Upload size={14} strokeWidth={2.5} />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} disabled={isUploading} />
              </label>

              <div className={`absolute top-0 right-0 w-4 h-4 rounded-lg border-2 border-white shadow-sm flex items-center justify-center ${profile.isAvailable ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                {profile.isAvailable && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>}
              </div>
            </div>

            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">{profile.name}</h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-0.5">{profile.email}</p>

            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
              <Button
                onClick={toggleGlobalAvailability}
                size="sm"
                icon={profile.isAvailable ? X : Check}
                className={`w-full justify-center transition-all ${profile.isAvailable ? 'bg-slate-900 text-white hover:bg-black' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20 shadow-lg'}`}
              >
                {profile.isAvailable ? 'Go Offline' : 'Set Active'}
              </Button>

              <div className="flex items-center justify-between mt-4">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Auto Allocation</span>
                <button
                  onClick={async () => {
                    const next = !profile.acceptsDirectAssignment;
                    await InterpreterService.updateProfile(user!.profileId!, { acceptsDirectAssignment: next });
                    setProfile({ ...profile, acceptsDirectAssignment: next });
                    showToast(next ? "Direct assignments enabled" : "Direct assignments disabled", "info");
                  }}
                  className={`w-10 h-5 rounded-full relative transition-all duration-300 ${profile.acceptsDirectAssignment ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <div className={`absolute w-3 h-3 rounded-full bg-white top-1 transition-all duration-300 shadow-sm ${profile.acceptsDirectAssignment ? 'left-6' : 'left-1'}`}></div>
                </button>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex flex-col gap-2 bg-white rounded-3xl shadow-sm border border-slate-200 p-3">
            <TabButton id="PERSONAL" label="Personal Details" icon={User} />
            <TabButton id="SKILLS" label="Skills & Mastery" icon={Award} />
            <TabButton id="COMPLIANCE" label="Compliance Log" icon={Shield} />
            <TabButton id="AVAILABILITY" label="Schedule Editor" icon={Calendar} />
          </div>
        </aside>

        {/* Right Column: Content Form */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Mobile Tabs Wrapper */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <TabButton id="PERSONAL" label="Details" icon={User} />
            <TabButton id="SKILLS" label="Skills" icon={Award} />
            <TabButton id="COMPLIANCE" label="Compliance" icon={Shield} />
            <TabButton id="AVAILABILITY" label="Schedule" icon={Calendar} />
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[500px] flex flex-col">

            {/* HEADER */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">{activeTab} PROFILE</h3>
              {activeTab !== 'AVAILABILITY' && (
                !isEditing ? (
                  <Button onClick={() => setIsEditing(true)} size="sm" variant="outline" icon={Edit2} className="text-blue-600 border-blue-200 hover:bg-blue-50 py-1 px-3">
                    Edit mode
                  </Button>
                ) : (
                  <Button onClick={() => setIsEditing(false)} size="sm" variant="ghost" className="text-slate-500 hover:bg-slate-100 py-1 px-3">
                    Cancel
                  </Button>
                )
              )}
            </div>

            <div className="flex-1 p-6 relative">

              {/* ---------------- PERSONAL ---------------- */}
              {activeTab === 'PERSONAL' && (
                <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 grid grid-cols-2 gap-6">
                      <div className="col-span-2">
                        <label className={labelClasses}>Full Professional Name</label>
                        <input
                          type="text" disabled={!isEditing}
                          className={inputClasses}
                          value={formData.name || ''}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Short Name (for emails)</label>
                        <input
                          type="text" disabled={!isEditing}
                          className={inputClasses}
                          placeholder="e.g. Maria"
                          value={formData.shortName || ''}
                          onChange={e => setFormData({ ...formData, shortName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Gender</label>
                        <select
                          disabled={!isEditing}
                          className={inputClasses}
                          value={formData.gender || 'M'}
                          onChange={e => setFormData({ ...formData, gender: e.target.value as any })}
                        >
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other / Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelClasses}>Mobile Phone</label>
                      <input
                        type="tel" disabled={!isEditing}
                        className={inputClasses}
                        value={formData.phone || ''}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Skype ID</label>
                      <input
                        type="text" disabled={!isEditing}
                        className={inputClasses}
                        placeholder="Your Skype username"
                        value={formData.skypeId || ''}
                        onChange={e => setFormData({ ...formData, skypeId: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Postcode</label>
                      <input
                        type="text" disabled={!isEditing}
                        className={inputClasses + ' uppercase'}
                        value={formData.postcode || formData.address?.postcode || ''}
                        onChange={e => setFormData({ ...formData, postcode: e.target.value, address: { ...formData.address!, postcode: e.target.value } })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClasses}>Street Address</label>
                      <input
                        type="text" disabled={!isEditing}
                        className={inputClasses}
                        placeholder="Street, Building"
                        value={formData.address?.street || formData.addressLine1 || ''}
                        onChange={e => setFormData({ ...formData, addressLine1: e.target.value, address: { ...formData.address!, street: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Town / City</label>
                      <input
                        type="text" disabled={!isEditing}
                        className={inputClasses}
                        value={formData.address?.town || ''}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, town: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>County</label>
                      <input
                        type="text" disabled={!isEditing}
                        className={inputClasses}
                        value={formData.address?.county || ''}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, county: e.target.value } })}
                      />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                      <Button type="submit" disabled={isSaving} icon={Save} size="sm" className="bg-slate-900 text-white hover:bg-black uppercase tracking-widest text-[10px] px-8">
                        Save Changes
                      </Button>
                    </div>
                  )}
                </form>
              )}

              {/* ---------------- SKILLS ---------------- */}
              {activeTab === 'SKILLS' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <label className={labelClasses}>Authorized Languages</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from(new Set(settings.masterData.priorityLanguages)).map(lang => (
                      <label key={lang} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${formData.languages?.includes(lang)
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        } ${!isEditing && 'opacity-60 pointer-events-none'}`}>
                        <input
                          type="checkbox" className="hidden"
                          checked={formData.languages?.includes(lang)}
                          onChange={() => toggleLanguage(lang)}
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest">{lang}</span>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.languages?.includes(lang) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-transparent group-hover:bg-slate-100'}`}>
                          <Check size={10} strokeWidth={4} />
                        </div>
                      </label>
                    ))}
                  </div>

                  {isEditing && (
                    <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                      <Button onClick={() => handleSave()} disabled={isSaving} icon={Save} size="sm" className="bg-slate-900 text-white hover:bg-black uppercase tracking-widest text-[10px] px-8">
                        Save Arsenal
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- COMPLIANCE ---------------- */}
              {activeTab === 'COMPLIANCE' && (
                <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl">
                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-4">
                    <Shield size={24} className="text-slate-400 shrink-0" />
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Security Clearance (DBS)</h4>
                      <p className="text-xs font-medium text-slate-500 mt-1">Submit updated records for administration audit. Contact admin if any information is outdated.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClasses}>Clearance Expiry Date</label>
                      <input
                        type="date" disabled={!isEditing}
                        className={inputClasses}
                        value={formData.dbsExpiry || ''}
                        onChange={e => setFormData({ ...formData, dbsExpiry: e.target.value })}
                      />
                    </div>

                    <div className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all min-h-[120px] ${formData.dbsDocumentUrl ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-300 hover:border-blue-400 bg-slate-50'}`}>
                      {formData.dbsDocumentUrl ? (
                        <div className="text-center w-full">
                          <p className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-3 flex items-center justify-center gap-1"><Check size={12} /> Verified Document</p>
                          <div className="flex justify-center gap-2">
                            <a href={formData.dbsDocumentUrl} target="_blank" rel="noreferrer" className="text-xs bg-white border border-slate-200 text-slate-900 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition-all">Inspect</a>
                            {isEditing && (
                              <label className="cursor-pointer">
                                <span className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-black transition-all">Replace</span>
                                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isUploading} />
                              </label>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center cursor-pointer group ${!isEditing && 'pointer-events-none opacity-50'}`}>
                          <Upload size={20} className="text-slate-400 mb-2 group-hover:text-blue-500 transition-colors" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-500 group-hover:text-blue-600 transition-colors">Attach PDF / Scan</span>
                          <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isUploading || !isEditing} />
                        </label>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-20">
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
                          <span className="text-xs font-black uppercase tracking-widest text-blue-700">Uploading...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Read-only Vetting Progress */}
                  {(profile.workChecksCompleted?.length || 0) > 0 && (
                    <div className="pt-6 border-t border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Info size={12} /> Onboarding Progress (read-only)
                      </p>
                      <div className="space-y-2">
                        {['CV', 'Interviewed', 'Passport checked', 'Reference 1', 'Reference 2', 'Right to work UK'].map(check => {
                          const done = (profile.workChecksCompleted || []).includes(check);
                          return (
                            <div key={check} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold ${
                              done ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-50 border-slate-100 text-slate-400'
                            }`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                {done ? <Check size={10} className="text-white" strokeWidth={4} /> : <span className="text-slate-400 text-[8px] font-black">–</span>}
                              </div>
                              {check}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div className="pt-6 mt-2 border-t border-slate-100 flex justify-end">
                      <Button onClick={() => handleSave()} disabled={isSaving} icon={Save} size="sm" className="bg-slate-900 text-white hover:bg-black uppercase tracking-widest text-[10px] px-8">
                        Save Document
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- AVAILABILITY ---------------- */}
              {activeTab === 'AVAILABILITY' && (
                <div className="animate-in fade-in duration-500 max-w-2xl mx-auto">
                  <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl self-start mb-6">
                    <button
                      onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)))}
                      className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition-all shadow-sm shadow-transparent hover:shadow-slate-200"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest px-6 flex-1 text-center text-slate-700">
                      {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)))}
                      className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition-all shadow-sm shadow-transparent hover:shadow-slate-200"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="bg-white py-2 text-center text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                        {day}
                      </div>
                    ))}
                    {renderCalendar()}
                  </div>

                  <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm bg-blue-50/50"></div> Bookable
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm bg-red-400"></div> Unavailable
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
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
