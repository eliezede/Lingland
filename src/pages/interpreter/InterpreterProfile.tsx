
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
/* Fixed: Ensuring StorageService is correctly imported from the barrel file */
import { InterpreterService, StorageService } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { Interpreter } from '../../types';
import { 
  User, Shield, Award, LogOut, Edit2, Save, X, Phone, 
  MapPin, Languages, Check, Upload, FileText, AlertTriangle,
  Building, Globe, Info, Sparkles, UserCheck
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
/* Fixed: Added missing Badge component import */
import { Badge } from '../../components/ui/Badge';

type ProfileTab = 'PERSONAL' | 'SKILLS' | 'COMPLIANCE';

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profileId) return;

    setIsSaving(true);
    try {
      await InterpreterService.updateProfile(user.profileId, formData);
      showToast('Profile updated successfully', 'success');
      await loadProfile();
      setIsEditing(false);
    } catch (error) {
      showToast('Failed to update profile', 'error');
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

  const toggleAvailability = async () => {
    if (!profile || !user?.profileId) return;
    const newStatus = !profile.isAvailable;
    try {
      await InterpreterService.updateProfile(user.profileId, { isAvailable: newStatus });
      setProfile({ ...profile, isAvailable: newStatus });
      showToast(newStatus ? "You are now marked as Available" : "You are now marked as Busy", "info");
    } catch (e) {
      showToast("Failed to update status", "error");
    }
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

  return (
    <div className="space-y-6 pb-24 max-w-2xl mx-auto">
      {/* Availability Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
         <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${profile.isAvailable ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div>
               <p className="text-sm font-bold text-gray-900">{profile.isAvailable ? 'Currently Available' : 'Currently Unavailable'}</p>
               <p className="text-[10px] text-gray-500 uppercase tracking-wide">Matches with new offers</p>
            </div>
         </div>
         <button 
           type="button"
           onClick={toggleAvailability}
           className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
             profile.isAvailable 
               ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
               : 'bg-green-600 text-white shadow-lg shadow-green-100 hover:bg-green-700'
           }`}
         >
           {profile.isAvailable ? 'Go Offline' : 'Go Online'}
         </button>
      </div>

      <div className="flex justify-between items-center px-1">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Profile Settings</h1>
        {!isEditing ? (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} icon={Edit2}>Edit</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} icon={X}>Cancel</Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex bg-gray-50/50 border-b border-gray-100">
           <TabButton id="PERSONAL" label="Details" icon={User} />
           <TabButton id="SKILLS" label="Skills" icon={Award} />
           <TabButton id="COMPLIANCE" label="Compliance" icon={Shield} />
        </div>

        <form onSubmit={handleSave} className="p-6 md:p-8">
           {/* PERSONAL TAB */}
           {activeTab === 'PERSONAL' && (
             <div className="space-y-6 animate-fade-in">
                <div className="flex items-center space-x-6 mb-8">
                   <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 text-2xl font-black border-4 border-white shadow-md">
                     {profile.name.charAt(0)}
                   </div>
                   <div>
                      <h3 className="text-lg font-bold text-gray-900">{profile.name}</h3>
                      <p className="text-sm text-gray-500">{profile.email}</p>
                      {/* Fixed: Use imported Badge component */}
                      <Badge variant={profile.status === 'ACTIVE' ? 'success' : 'warning'} className="mt-2">
                        System Status: {profile.status}
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
                   <div className="md:col-span-2">
                      <label className={labelClasses}>City</label>
                      <input 
                        type="text" disabled={!isEditing}
                        className={inputClasses + " disabled:bg-gray-50"}
                        value={formData.city || ''}
                        onChange={e => setFormData({...formData, city: e.target.value})}
                      />
                   </div>
                </div>
             </div>
           )}

           {/* SKILLS TAB */}
           {activeTab === 'SKILLS' && (
             <div className="space-y-8 animate-fade-in">
                <div className="space-y-4">
                  <h4 className="flex items-center text-sm font-bold text-gray-900 border-b pb-2">
                    <Languages size={18} className="text-blue-500 mr-2" /> 
                    Registered Languages
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
                          disabled={!isEditing}
                        />
                        <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center ${
                          formData.languages?.includes(lang) ? 'bg-white/20 border-white/40' : 'bg-gray-100 border-gray-200'
                        }`}>
                          {formData.languages?.includes(lang) && <Check size={12} />}
                        </div>
                        <span className="text-xs font-bold uppercase">{lang}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center text-sm font-bold text-gray-900 border-b pb-2">
                    <Award size={18} className="text-purple-500 mr-2" /> 
                    Professional Qualifications
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {['DPSI', 'Community Level 3', 'Met Police', 'BSL Level 6', 'NRPSI', 'ITI Member'].map(qual => (
                      <button
                        key={qual} type="button" disabled={!isEditing}
                        onClick={() => {
                          const current = formData.qualifications || [];
                          const updated = current.includes(qual) ? current.filter(q => q !== qual) : [...current, qual];
                          setFormData({...formData, qualifications: updated});
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                          formData.qualifications?.includes(qual)
                            ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-100'
                            : 'bg-white border-gray-200 text-gray-400'
                        } disabled:opacity-80`}
                      >
                        {qual}
                      </button>
                    ))}
                  </div>
                </div>
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
                        <h4 className="text-sm font-black text-orange-900 uppercase tracking-widest">Enhanced DBS Status</h4>
                        <p className="text-xs text-orange-800/70 mt-1">Maintenance of current DBS certification is mandatory for all face-to-face assignments.</p>
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
                        <label className={labelClasses}>Certification Document</label>
                        <div className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all ${
                          formData.dbsDocumentUrl ? 'border-green-300 bg-green-50/50' : 'border-orange-200 bg-white hover:bg-orange-50'
                        }`}>
                           {formData.dbsDocumentUrl ? (
                             <div className="text-center">
                                <div className="bg-green-100 p-3 rounded-full text-green-600 inline-flex mb-3">
                                   <FileText size={24} />
                                </div>
                                <p className="text-xs font-bold text-green-800">Document Uploaded</p>
                                <a href={formData.dbsDocumentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold uppercase mt-2 block hover:underline">View Uploaded Certificate</a>
                                {isEditing && (
                                  <label className="mt-4 block cursor-pointer">
                                     <span className="text-[10px] bg-white px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 font-black uppercase hover:bg-gray-50 shadow-sm">Replace File</span>
                                     <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={isUploading} />
                                  </label>
                                )}
                             </div>
                           ) : (
                             <label className={`flex flex-col items-center cursor-pointer ${!isEditing && 'pointer-events-none opacity-50'}`}>
                                <div className="bg-gray-100 p-3 rounded-full text-gray-400 mb-3">
                                   <Upload size={24} />
                                </div>
                                <p className="text-xs font-bold text-gray-500">Click to upload PDF/Image</p>
                                <p className="text-[10px] text-gray-400 mt-1">DBS Certificate copy</p>
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

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start">
                   <Info size={16} className="text-blue-600 mr-3 mt-0.5" />
                   <p className="text-xs text-blue-800 leading-relaxed font-medium">
                     Changes to Compliance data will be reviewed by the admin team. Your account status may temporarily change to "ONBOARDING" while we verify new documents.
                   </p>
                </div>
             </div>
           )}

           {isEditing && (
             <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col space-y-3">
                <Button type="submit" isLoading={isSaving} className="w-full h-14 text-lg shadow-xl shadow-blue-100" icon={Save}>
                  Save All Changes
                </Button>
                <button 
                  type="button" 
                  onClick={() => { setIsEditing(false); setFormData(profile || {}); }}
                  className="text-sm font-bold text-gray-400 hover:text-gray-600 py-2"
                >
                  Discard Changes
                </button>
             </div>
           )}
        </form>
      </div>

      {!isEditing && (
        <button 
          type="button"
          onClick={handleLogout}
          className="w-full bg-red-50 text-red-600 font-black py-5 rounded-2xl flex items-center justify-center hover:bg-red-100 transition-colors border border-red-100 mt-4 uppercase tracking-widest text-xs"
        >
          <LogOut size={18} className="mr-2" /> Sign Out from Platform
        </button>
      )}

      <div className="text-center px-6">
        <p className="text-[9px] text-gray-400 uppercase font-black tracking-[0.2em] leading-relaxed">
          Lingland internal partner platform v2.1<br/>
          Secure encrypted session • UID: {user?.id}
        </p>
      </div>
    </div>
  );
};
