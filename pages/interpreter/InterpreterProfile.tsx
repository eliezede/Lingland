
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { InterpreterService, StorageService } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { Interpreter } from '../../types';
import { 
  User, Shield, Award, LogOut, Edit2, Save, X, Phone, 
  Languages, Check, Upload, FileText, Info, Calendar, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

type ProfileTab = 'PERSONAL' | 'SKILLS' | 'COMPLIANCE' | 'AVAILABILITY';

export const InterpreterProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  
  const [profile, setProfile] = useState<Interpreter | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('PERSONAL');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  
  // Calendar state
  const [viewDate, setViewDate] = useState(new Date());

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
      const path = `interpreters/${user.profileId}/documents/dbs_${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      setFormData(prev => ({ ...prev, dbsDocumentUrl: url }));
      showToast('Document uploaded successfully', 'success');
    } catch (error) {
      showToast('Upload failed', 'error');
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
    // Auto-save availability changes to keep it fluid
    InterpreterService.updateProfile(user!.profileId!, { unavailableDates: updated });
  };

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading profile...</div>;

  const TabButton = ({ id, label, icon: Icon }: { id: ProfileTab; label: string; icon: any }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex-1 flex flex-col items-center py-3 border-b-2 transition-all ${
        activeTab === id 
          ? 'border-blue-600 text-blue-600' 
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      <Icon size={18} className="mb-1" />
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );

  const inputClasses = "w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 bg-white shadow-sm";
  const labelClasses = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1";

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
    // Padding
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`pad-${i}`} className="h-12 md:h-16 border border-gray-50 bg-gray-50/30"></div>);
    }
    
    // Month days
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toISOString().split('T')[0];
      const isPast = date < new Date(new Date().setHours(0,0,0,0));
      const isToday = dateStr === today;
      const isUnavailable = formData.unavailableDates?.includes(dateStr);
      
      days.push(
        <div 
          key={dateStr}
          onClick={() => !isPast && toggleDateAvailability(dateStr)}
          className={`h-12 md:h-16 border border-gray-100 flex flex-col items-center justify-center relative cursor-pointer transition-all active:scale-95
            ${isPast ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-white hover:bg-blue-50'}
            ${isUnavailable ? 'bg-red-50' : ''}
          `}
        >
          {isToday && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-600 rounded-full"></div>}
          <span className={`text-sm font-bold ${isUnavailable ? 'text-red-600' : isPast ? 'text-gray-300' : 'text-gray-700'}`}>
            {d}
          </span>
          {isUnavailable && <span className="text-[8px] font-black uppercase text-red-400 mt-1">Busy</span>}
        </div>
      );
    }
    
    return days;
  };

  return (
    <div className="space-y-6 pb-24 max-w-2xl mx-auto">
      {/* Availability Switcher */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
         <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${profile.isAvailable ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div>
               <p className="text-sm font-bold text-gray-900">{profile.isAvailable ? 'Profile Online' : 'Profile Offline'}</p>
               <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                 {profile.isAvailable ? 'Visible to new job searches' : 'Hidden from new job matches'}
               </p>
            </div>
         </div>
         <button 
           type="button"
           onClick={toggleGlobalAvailability}
           className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
             profile.isAvailable 
               ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
               : 'bg-green-600 text-white shadow-lg shadow-green-100 hover:bg-green-700'
           }`}
         >
           {profile.isAvailable ? 'Disable Matching' : 'Enable Matching'}
         </button>
      </div>

      <div className="flex justify-between items-center px-1">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">My Profile</h1>
        {activeTab !== 'AVAILABILITY' && (
          !isEditing ? (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} icon={Edit2}>Edit</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} icon={X}>Cancel</Button>
          )
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex bg-gray-50/50 border-b border-gray-100 overflow-x-auto scrollbar-hide">
           <TabButton id="PERSONAL" label="Details" icon={User} />
           <TabButton id="SKILLS" label="Skills" icon={Award} />
           <TabButton id="COMPLIANCE" label="Compliance" icon={Shield} />
           <TabButton id="AVAILABILITY" label="Schedule" icon={Calendar} />
        </div>

        <div className="p-6 md:p-8">
           {/* PERSONAL TAB */}
           {activeTab === 'PERSONAL' && (
             <form onSubmit={handleSave} className="space-y-6 animate-fade-in">
                <div className="flex items-center space-x-6 mb-8">
                   <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 text-2xl font-black border-4 border-white shadow-md">
                     {profile.name.charAt(0)}
                   </div>
                   <div>
                      <h3 className="text-lg font-bold text-gray-900">{profile.name}</h3>
                      <p className="text-sm text-gray-500">{profile.email}</p>
                      <Badge variant={profile.status === 'ACTIVE' ? 'success' : 'warning'} className="mt-2">
                        {profile.status}
                      </Badge>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="md:col-span-2">
                      <label className={labelClasses}>Full Name</label>
                      <input 
                        type="text" disabled={!isEditing}
                        className={inputClasses + " disabled:bg-gray-50 disabled:text-gray-500"}
                        value={formData.name || ''}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className={labelClasses}>Phone Number</label>
                      <input 
                        type="tel" disabled={!isEditing}
                        className={inputClasses + " disabled:bg-gray-50"}
                        value={formData.phone || ''}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className={labelClasses}>Postcode</label>
                      <input 
                        type="text" disabled={!isEditing}
                        className={inputClasses + " disabled:bg-gray-50"}
                        value={formData.postcode || ''}
                        onChange={e => setFormData({...formData, postcode: e.target.value})}
                      />
                   </div>
                   <div className="md:col-span-2">
                      <label className={labelClasses}>Address Line 1</label>
                      <input 
                        type="text" disabled={!isEditing}
                        className={inputClasses + " disabled:bg-gray-50"}
                        value={formData.addressLine1 || ''}
                        onChange={e => setFormData({...formData, addressLine1: e.target.value})}
                      />
                   </div>
                </div>
                {isEditing && (
                   <div className="mt-8 pt-6 border-t">
                      <Button type="submit" isLoading={isSaving} className="w-full h-12" icon={Save}>Save Changes</Button>
                   </div>
                )}
             </form>
           )}

           {/* SKILLS TAB */}
           {activeTab === 'SKILLS' && (
             <div className="space-y-8 animate-fade-in">
                <div className="space-y-4">
                  <h4 className="flex items-center text-sm font-bold text-gray-900 border-b pb-2">
                    <Languages size={18} className="text-blue-500 mr-2" /> 
                    Languages
                  </h4>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    {settings.masterData.priorityLanguages.map(lang => (
                      <label key={lang} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${
                        formData.languages?.includes(lang) 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                          : 'bg-white border-gray-100 text-gray-500 opacity-60 hover:opacity-100'
                      } ${!isEditing && 'pointer-events-none'}`}>
                        <input 
                          type="checkbox" className="hidden"
                          checked={formData.languages?.includes(lang)}
                          onChange={() => toggleLanguage(lang)}
                        />
                        <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center ${
                          formData.languages?.includes(lang) ? 'bg-blue-700 border-blue-400' : 'bg-white border-gray-300'
                        }`}>
                          {formData.languages?.includes(lang) && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-xs font-bold uppercase">{lang}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {isEditing && (
                   <Button onClick={() => handleSave()} isLoading={isSaving} className="w-full h-12" icon={Save}>Save Skills</Button>
                )}
             </div>
           )}

           {/* COMPLIANCE TAB */}
           {activeTab === 'COMPLIANCE' && (
             <div className="space-y-8 animate-fade-in">
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl">
                   <div className="flex items-start mb-4">
                      <div className="bg-orange-100 p-3 rounded-xl text-orange-600 mr-4">
                        <Shield size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-orange-900 uppercase tracking-widest">Enhanced DBS Check</h4>
                        <p className="text-xs text-orange-800/70 mt-1">Status and document verification.</p>
                      </div>
                   </div>

                   <div className="space-y-4 mt-6">
                      <div>
                        <label className={labelClasses}>Expiry Date</label>
                        <input 
                          type="date" disabled={!isEditing}
                          className="w-full p-3 border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white text-gray-900"
                          value={formData.dbsExpiry || ''}
                          onChange={e => setFormData({...formData, dbsExpiry: e.target.value})}
                        />
                      </div>

                      <div className="pt-2">
                        <label className={labelClasses}>Certificate Document</label>
                        <div className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all ${
                          formData.dbsDocumentUrl ? 'border-green-300 bg-green-50/50' : 'border-orange-200 bg-white hover:bg-orange-50'
                        }`}>
                           {formData.dbsDocumentUrl ? (
                             <div className="text-center">
                                <div className="bg-green-100 p-3 rounded-full text-green-600 inline-flex mb-3">
                                   <FileText size={24} />
                                </div>
                                <p className="text-xs font-bold text-green-800">Document Uploaded</p>
                                <a href={formData.dbsDocumentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold uppercase mt-2 block hover:underline">View Certificate</a>
                                {isEditing && (
                                  <label className="mt-4 block cursor-pointer">
                                     <span className="text-[10px] bg-white px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 font-black uppercase hover:bg-gray-50 shadow-sm">Replace</span>
                                     <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isUploading} />
                                  </label>
                                )}
                             </div>
                           ) : (
                             <label className={`flex flex-col items-center cursor-pointer ${!isEditing && 'pointer-events-none opacity-50'}`}>
                                <div className="bg-gray-100 p-3 rounded-full text-gray-400 mb-3">
                                   <Upload size={24} />
                                </div>
                                <p className="text-xs font-bold text-gray-500">Upload PDF/Image</p>
                                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isUploading || !isEditing} />
                             </label>
                           )}
                           {isUploading && (
                             <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                             </div>
                           )}
                        </div>
                      </div>
                   </div>
                </div>
                {isEditing && (
                   <Button onClick={() => handleSave()} isLoading={isSaving} className="w-full h-12" icon={Save}>Save Compliance Data</Button>
                )}
             </div>
           )}

           {/* AVAILABILITY TAB */}
           {activeTab === 'AVAILABILITY' && (
             <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-gray-900">Manage Availability</h3>
                   <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)))}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                      >
                         <ChevronLeft size={18} />
                      </button>
                      <span className="text-sm font-black uppercase tracking-widest px-4 w-40 text-center">
                        {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button 
                        onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)))}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                      >
                         <ChevronRight size={18} />
                      </button>
                   </div>
                </div>

                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-inner mb-4">
                   {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                     <div key={day} className="bg-gray-50 py-2 text-center text-[10px] font-black uppercase text-gray-400">
                        {day}
                     </div>
                   ))}
                   {renderCalendar()}
                </div>

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-3">
                   <div className="flex items-start">
                      <Info size={16} className="text-blue-600 mr-3 mt-0.5" />
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Tap on a date to mark yourself as <strong>Busy (Unavailable)</strong>. System-matched jobs will automatically avoid these dates.
                      </p>
                   </div>
                   <div className="flex items-center space-x-4 pl-7">
                      <div className="flex items-center text-[10px] font-bold text-gray-500">
                         <div className="w-3 h-3 bg-white border border-gray-200 rounded-sm mr-1.5"></div>
                         Available
                      </div>
                      <div className="flex items-center text-[10px] font-bold text-red-600">
                         <div className="w-3 h-3 bg-red-50 border border-red-200 rounded-sm mr-1.5"></div>
                         Unavailable
                      </div>
                      <div className="flex items-center text-[10px] font-bold text-blue-600">
                         <div className="w-3 h-3 bg-white border border-blue-600 rounded-full mr-1.5"></div>
                         Today
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>

      <div className="text-center px-6 mt-12">
        <button 
          type="button"
          onClick={handleLogout}
          className="w-full bg-red-50 text-red-600 font-black py-4 rounded-2xl flex items-center justify-center hover:bg-red-100 transition-colors border border-red-100 uppercase tracking-widest text-xs mb-8"
        >
          <LogOut size={18} className="mr-2" /> Sign Out
        </button>
        <p className="text-[9px] text-gray-400 uppercase font-black tracking-[0.2em] leading-relaxed">
          Lingland internal partner platform v2.1<br/>
          Secure encrypted session • UID: {user?.id}
        </p>
      </div>
    </div>
  );
};
