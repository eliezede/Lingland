import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { 
  InterpreterService, 
  StorageService, 
  NotificationService 
} from '../../services/api';
import { 
  Interpreter, 
  LanguageProficiency, 
  NotificationType,
  OnboardingDocStatus 
} from '../../types';
import { Button } from '../../components/ui/Button';
import { 
  User, Languages, Award, ChevronRight, ChevronLeft, 
  Check, Globe2, Plus, Trash2, ShieldCheck, Mail, 
  Phone, Home, Car, MessageSquare, Briefcase, FileText, Info,
  Upload, Clock, CheckCircle2, AlertCircle, X, Camera
} from 'lucide-react';
import { UserService } from '../../services/userService';

type Step = 1 | 2 | 3;

export const InterpreterOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<Partial<Interpreter>>({
    shortName: '',
    gender: 'O',
    phone: '',
    address: {
      street: '',
      town: '',
      county: '',
      postcode: '',
      country: 'United Kingdom'
    },
    hasCar: false,
    skypeId: '',
    languageProficiencies: [
      { language: 'English', l1: 1, translateOrder: 'T1' }
    ],
    qualifications: [],
    nrpsi: { registered: false, number: '' },
    dpsi: false,
    experience: '',
    documentUrls: [],
    onboarding: {
      dbs: { status: 'MISSING' },
      idCheck: { status: 'MISSING' },
      certifications: { status: 'MISSING' },
      rightToWork: { status: 'MISSING' },
      overallStatus: 'DOCUMENTS_PENDING'
    }
  });
  
  const [uploadingStatus, setUploadingStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadProfile = async () => {
      if (user?.profileId) {
        try {
          const profile = await InterpreterService.getById(user.profileId);
          if (profile) {
            // Ensure English is always present and first
            const profs = profile.languageProficiencies || [];
            if (!profs.find(p => p.language === 'English')) {
              profs.unshift({ language: 'English', l1: 1, translateOrder: 'T1' });
            }
            
            // Initialize onboarding object if missing
            const onboardingDefaults = {
              dbs: { status: 'MISSING' as OnboardingDocStatus },
              idCheck: { status: 'MISSING' as OnboardingDocStatus },
              certifications: { status: 'MISSING' as OnboardingDocStatus },
              rightToWork: { status: 'MISSING' as OnboardingDocStatus },
              overallStatus: 'DOCUMENTS_PENDING' as const
            };

            setFormData(prev => ({ 
              ...prev, 
              ...profile, 
              languageProficiencies: profs,
              onboarding: profile.onboarding || onboardingDefaults
            }));
          }
        } catch (error) {
          console.error("Failed to load profile", error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadProfile();
  }, [user]);

  const handleFileUpload = async (stepId: string, file: File) => {
    if (!user?.profileId) return;
    
    setUploadingStatus(prev => ({ ...prev, [stepId]: true }));
    try {
      const url = await StorageService.uploadFile(file, `onboarding/${user.id}/${stepId}`);
      
      const updatedOnboarding = { ...(formData.onboarding || {}) } as any;
      updatedOnboarding[stepId] = {
        ...updatedOnboarding[stepId],
        url,
        status: 'IN_REVIEW' as OnboardingDocStatus
      };

      // Recalculate overall status
      const statuses = [
        updatedOnboarding.dbs.status,
        updatedOnboarding.idCheck.status,
        updatedOnboarding.certifications.status,
        updatedOnboarding.rightToWork.status
      ];
      
      if (statuses.some(s => s === 'IN_REVIEW' || s === 'VERIFIED')) {
        updatedOnboarding.overallStatus = 'IN_REVIEW';
      }

      handleUpdate('onboarding', updatedOnboarding);
      showToast(`${stepId.toUpperCase()} uploaded successfully!`, 'success');

      // Notify Admins
      await NotificationService.notifyAdmins(
        'New Onboarding Document',
        `${formData.name || user.email} uploaded ${stepId.toUpperCase()} for review.`,
        NotificationType.INFO,
        `/admin/interpreters/${user.profileId}`
      );

    } catch (error) {
      showToast(`Failed to upload ${stepId}. Please try again.`, 'error');
    } finally {
      setUploadingStatus(prev => ({ ...prev, [stepId]: false }));
    }
  };


  const nextStep = () => setStep(prev => (prev < 3 ? prev + 1 : prev) as Step);
  const prevStep = () => setStep(prev => (prev > 1 ? prev - 1 : prev) as Step);

  const handleUpdate = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressUpdate = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address!, [field]: value }
    }));
  };

  const addLanguage = () => {
    const profs = [...(formData.languageProficiencies || [])];
    profs.push({ language: '', l1: 1, translateOrder: 'no' });
    handleUpdate('languageProficiencies', profs);
  };

  const removeLanguage = (index: number) => {
    const profs = [...(formData.languageProficiencies || [])];
    if (profs[index].language === 'English') return; // Cannot remove English
    profs.splice(index, 1);
    handleUpdate('languageProficiencies', profs);
  };

  const updateLanguageProficiency = (index: number, field: keyof LanguageProficiency, value: any) => {
    const profs = [...(formData.languageProficiencies || [])];
    if (profs[index].language === 'English' && (field === 'language')) return; 
    
    // Default L1 to 18 (lowest priority)
    profs[index] = { ...profs[index], [field]: value, l1: 18 };
    handleUpdate('languageProficiencies', profs);
  };

  const handleSubmit = async () => {
    if (!user?.profileId) return;
    setIsSubmitting(true);
    try {
      // Logic to sync standard 'languages' array for backward compat
      const simpleLangs = (formData.languageProficiencies || []).map(p => p.language).filter(Boolean);
      
      await InterpreterService.updateProfile(user.profileId, {
        ...formData,
        languages: simpleLangs,
        status: 'ONBOARDING' // Stay in onboarding until admin reviews
      });
      showToast('Onboarding progress saved! An administrator will review your profile.', 'success');
      navigate('/interpreter/dashboard');
    } catch (error) {
      showToast('Failed to save progress. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  const inputClasses = "w-full p-3 border border-slate-200 bg-slate-50 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium";
  const labelClasses = "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Complete Onboarding</h1>
            <p className="text-slate-500 text-sm mt-1">Provide the details required to start receiving session offers.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full border border-blue-100">
            <ShieldCheck size={16} className="text-blue-600" />
            <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Compliance Verification</span>
          </div>
        </div>

        {/* Custom Progress Bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200">
              <div className={`h-full bg-blue-600 transition-all duration-500 ${step >= s ? 'w-full' : 'w-0'}`} />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-8 md:p-12">
            
            {/* STEP 1: Personal & Identification */}
            {step === 1 && (
              <div className="animate-in slide-in-from-right-8 duration-500 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="md:col-span-2 flex items-center gap-3 pb-2 border-b border-slate-50">
                    <User className="text-blue-500" size={20} />
                    <h2 className="text-lg font-bold text-slate-800">Personal Information</h2>
                  </div>
                  
                  <div>
                    <label className={labelClasses}>Full Name (Auto-filled)</label>
                    <input type="text" disabled className={inputClasses + " opacity-60 bg-slate-100"} value={formData.name || ''} />
                  </div>
                  
                  <div>
                    <label className={labelClasses}>Short Name (For Display)</label>
                    <input 
                      type="text" 
                      className={inputClasses} 
                      value={formData.shortName || ''} 
                      onChange={e => handleUpdate('shortName', e.target.value)}
                      placeholder="e.g. Sarah"
                    />
                  </div>

                  <div>
                    <label className={labelClasses}>Gender</label>
                    <select 
                      className={inputClasses} 
                      value={formData.gender} 
                      onChange={e => handleUpdate('gender', e.target.value)}
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other / Prefer not to say</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClasses}>Mobile Phone</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="tel" 
                        className={inputClasses + " pl-10"} 
                        value={formData.phone || ''} 
                        onChange={e => handleUpdate('phone', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 flex items-center gap-3 pt-4 pb-2 border-b border-slate-50">
                    <Home className="text-blue-500" size={20} />
                    <h2 className="text-lg font-bold text-slate-800">Residential Address</h2>
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClasses}>Street Address</label>
                    <input 
                      type="text" 
                      className={inputClasses} 
                      value={formData.address?.street || ''} 
                      onChange={e => handleAddressUpdate('street', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={labelClasses}>Town / City</label>
                    <input 
                      type="text" 
                      className={inputClasses} 
                      value={formData.address?.town || ''} 
                      onChange={e => handleAddressUpdate('town', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={labelClasses}>Postcode</label>
                    <input 
                      type="text" 
                      className={inputClasses} 
                      value={formData.address?.postcode || ''} 
                      onChange={e => handleAddressUpdate('postcode', e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all select-none group">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.hasCar ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
                        {formData.hasCar && <Check size={12} className="text-white" strokeWidth={4} />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={formData.hasCar} 
                        onChange={e => handleUpdate('hasCar', e.target.checked)}
                      />
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Car size={16} />
                        </div>
                        <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">Owns a Car for Travel</span>
                      </div>
                    </label>

                    <div className="relative">
                      <label className={labelClasses}>Skype ID (Virtual Sessions)</label>
                      <div className="relative">
                        <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type="text" 
                          className={inputClasses + " pl-10"} 
                          value={formData.skypeId || ''} 
                          onChange={e => handleUpdate('skypeId', e.target.value)}
                          placeholder="e.g. live:sarah_jones"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Language Selection */}
            {step === 2 && (
              <div className="animate-in slide-in-from-right-8 duration-500 space-y-8">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-50">
                  <Languages className="text-blue-500" size={20} />
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Language Selection</h2>
                    <p className="text-xs text-slate-500">Select all the languages you speak fluently to/from English.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100 shrink-0">
                      <Info size={20} />
                    </div>
                    <div className="text-[11px] text-blue-800 leading-relaxed font-medium">
                      <p className="mb-2"><strong>Expertise Review:</strong> Our team will review your qualifications and assign a call priority level (L1) based on your background.</p>
                      <p><strong>Written Translation:</strong> Select <strong>'T1'</strong> if you also provide written translation services, or <strong>'None'</strong> if you only provide interpreting.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4 px-2 hidden md:grid mb-2">
                    <div className="col-span-12 md:col-span-8 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-5">Language Pair</div>
                    <div className="col-span-12 md:col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Translation</div>
                    <div className="col-span-12 md:col-span-1"></div>
                  </div>

                  <div className="space-y-3">
                    {formData.languageProficiencies?.map((prof, idx) => (
                      <div key={idx} className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-5 rounded-[2rem] border-2 transition-all ${prof.language === 'English' ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 hover:border-blue-100'}`}>
                        <div className="col-span-12 md:col-span-8 self-center">
                          <label className={labelClasses + " md:hidden"}>Language</label>
                          <select 
                            disabled={prof.language === 'English'}
                            className={inputClasses + (prof.language === 'English' ? ' bg-white font-bold text-blue-600' : '')}
                            value={prof.language}
                            onChange={e => updateLanguageProficiency(idx, 'language', e.target.value)}
                          >
                            <option value="">Select Language...</option>
                            <option value="English">English</option>
                            {Array.from(new Set(settings?.masterData?.priorityLanguages || [])).filter(l => l !== 'English').map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="col-span-12 md:col-span-3">
                          <label className={labelClasses + " md:hidden text-center"}>Written Translation?</label>
                          <select 
                            className={inputClasses}
                            value={prof.translateOrder}
                            onChange={e => updateLanguageProficiency(idx, 'translateOrder', e.target.value)}
                          >
                            <option value="no">Interpreting Only</option>
                            <option value="T1">Yes (Translating Too)</option>
                          </select>
                        </div>

                        <div className="col-span-12 md:col-span-1 flex items-center justify-end">
                          {prof.language !== 'English' && (
                            <button 
                              type="button" 
                              onClick={() => removeLanguage(idx)}
                              className="p-3 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    type="button"
                    onClick={addLanguage}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Add Language Pair
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Qualifications & Expertise */}
            {step === 3 && (
              <div className="animate-in slide-in-from-right-8 duration-500 space-y-8">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-50">
                  <Award className="text-blue-500" size={20} />
                  <h2 className="text-lg font-bold text-slate-800">Professional Qualifications</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all select-none group">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.nrpsi?.registered ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                        {formData.nrpsi?.registered && <Check size={12} className="text-white" strokeWidth={4} />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={formData.nrpsi?.registered} 
                        onChange={e => handleUpdate('nrpsi', { ...formData.nrpsi, registered: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">NRPSI Registered</span>
                        <span className="text-[9px] text-slate-400">National Registry of Public Service Interpreters</span>
                      </div>
                    </label>

                    {formData.nrpsi?.registered && (
                      <div className="animate-in slide-in-from-top-2">
                        <label className={labelClasses}>NRPSI Registration Number</label>
                        <input 
                          type="text" 
                          className={inputClasses} 
                          value={formData.nrpsi.number || ''} 
                          onChange={e => handleUpdate('nrpsi', { ...formData.nrpsi, number: e.target.value })}
                          placeholder="Enter your registration number"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all select-none group">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.dpsi ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                        {formData.dpsi && <Check size={12} className="text-white" strokeWidth={4} />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={formData.dpsi} 
                        onChange={e => handleUpdate('dpsi', e.target.checked)}
                      />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">DPSI Qualified</span>
                        <span className="text-[9px] text-slate-400">Diploma in Public Service Interpreting</span>
                      </div>
                    </label>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className={labelClasses}>Professional Experience</label>
                      <textarea 
                        className={inputClasses + " min-h-[140px] leading-relaxed"} 
                        value={formData.experience || ''} 
                        onChange={e => handleUpdate('experience', e.target.value)}
                        placeholder="Briefly describe your years of experience, expertise areas (e.g. Legal, Medical, Community), and any notable assignments..."
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-3 mb-6">
                    <Briefcase className="text-blue-500" size={18} />
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight">Required Documentation</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: 'dbs', title: 'DBS Certificate', icon: ShieldCheck, description: 'Standard or Enhanced DBS' },
                      { id: 'idCheck', title: 'Identity Proof', icon: User, description: 'Passport or Driving License' },
                      { id: 'certifications', title: 'Certifications', icon: Award, description: 'DPSI, NRPSI or Level 3/6' },
                      { id: 'rightToWork', title: 'Right to Work', icon: Globe2, description: 'BRP or Share Code' }
                    ].map((step) => {
                      const doc = (formData.onboarding as any)?.[step.id] || { status: 'MISSING' };
                      const isUploading = uploadingStatus[step.id];

                      return (
                        <div key={step.id} className={`p-6 rounded-[2rem] border-2 transition-all ${doc.status === 'REJECTED' ? 'border-red-100 bg-red-50/30' : 'border-slate-100 bg-slate-50/30'}`}>
                          <div className="flex items-start justify-between mb-4">
                            <div className={`p-3 rounded-2xl ${doc.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-400 shadow-sm'}`}>
                              <step.icon size={24} />
                            </div>
                            {doc.status !== 'MISSING' && (
                              <div className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                                doc.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' :
                                doc.status === 'IN_REVIEW' ? 'bg-blue-100 text-blue-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {doc.status === 'VERIFIED' ? <CheckCircle2 size={10} /> : doc.status === 'IN_REVIEW' ? <Clock size={10} /> : <AlertCircle size={10} />}
                                {doc.status.replace('_', ' ')}
                              </div>
                            )}
                          </div>

                          <h3 className="font-bold text-slate-900 mb-1">{step.id === 'rightToWork' ? 'Right to Work' : step.title}</h3>
                          <p className="text-slate-500 text-[10px] leading-relaxed mb-6">{step.description}</p>

                          {step.id === 'rightToWork' && doc.status !== 'VERIFIED' && (
                            <div className="mb-6 flex flex-col gap-4">
                              <div className="flex p-1 bg-slate-100 rounded-xl">
                                <button 
                                  onClick={() => {
                                    const updated = { ...(formData.onboarding || {}), rightToWork: { ...doc, type: 'BRP' } };
                                    handleUpdate('onboarding', updated);
                                  }}
                                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${doc.type === 'BRP' || !doc.type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                  BRP Upload
                                </button>
                                <button 
                                  onClick={() => {
                                    const updated = { ...(formData.onboarding || {}), rightToWork: { ...doc, type: 'SHARE_CODE' } };
                                    handleUpdate('onboarding', updated);
                                  }}
                                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${doc.type === 'SHARE_CODE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                  Share Code
                                </button>
                              </div>

                              {doc.type === 'SHARE_CODE' ? (
                                <div className="space-y-2">
                                  <input 
                                    type="text"
                                    placeholder="W8Z RBH 4XE"
                                    maxLength={11}
                                    value={doc.shareCode || ''}
                                    onChange={(e) => {
                                      // Format as XXXXXX XXXXX
                                      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                      if (val.length > 3 && val.length <= 6) val = `${val.slice(0, 3)} ${val.slice(3)}`;
                                      else if (val.length > 6) val = `${val.slice(0, 3)} ${val.slice(3, 6)} ${val.slice(6)}`;
                                      
                                      const updated = { 
                                        ...(formData.onboarding || {}), 
                                        rightToWork: { ...doc, shareCode: val, status: val.length >= 11 ? 'IN_REVIEW' : doc.status } 
                                      };
                                      handleUpdate('onboarding', updated);
                                    }}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-300 placeholder:font-normal placeholder:tracking-normal"
                                  />
                                  <p className="text-[9px] text-slate-400 leading-tight">Enter your 9 or 11 character code exactly as shown on the GOV.UK website.</p>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {doc.notes && (
                            <div className="mb-4 p-3 bg-red-100/50 border border-red-200 rounded-xl text-[10px] font-bold text-red-700 flex items-start gap-2">
                              <AlertCircle size={12} className="shrink-0 mt-0.5" />
                              <span>Feedback: {doc.notes}</span>
                            </div>
                          )}

                          <div className="mt-auto">
                            {doc.status === 'VERIFIED' ? (
                              <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] bg-emerald-50 w-fit px-4 py-2 rounded-xl border border-emerald-100 shadow-sm inline-flex">
                                <CheckCircle2 size={12} />
                                {doc.type === 'SHARE_CODE' ? 'Share Code Verified' : 'Document Approved'}
                              </div>
                            ) : (
                              (step.id !== 'rightToWork' || doc.type === 'BRP' || !doc.type) ? (
                                <div className="relative">
                                  <input
                                    type="file"
                                    id={`file-${step.id}`}
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(step.id, e.target.files[0])}
                                    disabled={isUploading || doc.status === 'IN_REVIEW'}
                                  />
                                  <label 
                                    htmlFor={`file-${step.id}`}
                                    className={`
                                      flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-sm
                                      ${isUploading || doc.status === 'IN_REVIEW' 
                                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                        : 'bg-white text-slate-900 border border-slate-200 hover:border-blue-400 hover:text-blue-600'
                                      }
                                    `}
                                  >
                                    {isUploading ? (
                                      <>
                                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        Uploading...
                                      </>
                                    ) : doc.status === 'IN_REVIEW' ? (
                                      <>
                                        <Clock size={12} />
                                        Under Review
                                      </>
                                    ) : (
                                      <>
                                        <Upload size={12} />
                                        {doc.status === 'REJECTED' ? 'Re-upload' : 'Upload'}
                                      </>
                                    )}
                                  </label>
                                </div>
                              ) : (
                                // Share Code Status Display (No upload needed)
                                doc.status === 'IN_REVIEW' && (
                                  <div className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 font-black text-[10px] uppercase tracking-widest shadow-sm">
                                    <Clock size={12} />
                                    Review Pending
                                  </div>
                                )
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-12 flex items-center justify-between border-t border-slate-100 pt-8">
              {step > 1 ? (
                <button 
                  onClick={prevStep} 
                  className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors px-4 py-2"
                >
                  <ChevronLeft size={16} /> Back
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-4">
                {step < 3 ? (
                  <Button 
                    onClick={nextStep} 
                    className="px-8"
                    icon={ChevronRight}
                    iconPosition="right"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSubmit} 
                    isLoading={isSubmitting}
                    className="px-12 bg-slate-900 shadow-xl shadow-slate-900/10 hover:bg-black transition-all hover:scale-[1.02]"
                    icon={Check}
                  >
                    Complete Profile
                  </Button>
                )}
              </div>
            </div>

        </div>
      </div>
    </div>
  </div>
  );
};
