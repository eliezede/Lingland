import React, { useState, useEffect } from 'react';
import { useClientProfile, useCreateClientBooking } from '../../../hooks/useClientHooks';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { ServiceType, BookingStatus } from '../../../types';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ChevronLeft, Phone, Mail, HelpCircle, Info, AlertTriangle, 
  CreditCard, Calendar, Clock, MessageSquare, MapPin, Video,
  CheckCircle2, ArrowRight, ShieldCheck, BadgeCheck, FileText,
  User, Building2, Stethoscope, Loader2, Globe2, X
} from 'lucide-react';
import { InterpreterService, StorageService } from '../../../services/api';
import { InfoCard } from '../../../components/ui/InfoCard';
import { Modal } from '../../../components/ui/Modal';

const InputGroup = ({ label, icon: Icon, required = false, hint, children }: any) => (
  <div className="mb-5">
    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center">
      {Icon && <Icon size={16} className="mr-2 text-slate-400" />}
      {label} {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1.5 text-[10px] text-slate-400 uppercase font-black tracking-widest">{hint}</p>}
  </div>
);

export const ClientNewBooking = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { createBooking } = useCreateClientBooking();
  const { profile: clientProfile, loading: profileLoading } = useClientProfile(user?.profileId);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);
  const [helpModal, setHelpModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode } | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  
  const [formData, setFormData] = useState({
    serviceType: ServiceType.FACE_TO_FACE,
    languageFrom: 'English',
    languageTo: '',
    date: '',
    startTime: '',
    durationMinutes: 60,
    locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
    address: '',
    postcode: '',
    onlineLink: '',
    costCode: '',
    requiresCostCode: 'YES' as 'YES' | 'NO',
    caseType: '',
    patientName: '',
    professionalName: '',
    genderPreference: 'None' as 'Male' | 'Female' | 'None',
    notes: '',
    // Translation-specific fields
    translationFormat: 'Email (PDF)',
    translationFormatOther: '',
    quoteRequested: false,
    sourceFiles: [] as { name: string; url: string }[],
    deliveryEmail: '',
    agreedToTerms: false,
    gdprConsent: false
  });

  const isTranslation = formData.serviceType === ServiceType.TRANSLATION;

  useEffect(() => {
    const fetchLangs = async () => {
      try {
        const interpreters = await InterpreterService.getAll();
        const activeInts = interpreters.filter(i => i.status === 'ACTIVE');
        const allLangs = activeInts.flatMap(i => i.languages);
        const uniqueLangs = Array.from(new Set(allLangs)).sort();
        setAvailableLanguages(uniqueLangs);
      } catch (e) {
        console.error("Failed to load languages");
      } finally {
        setLoadingLangs(false);
      }
    };
    fetchLangs();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user?.id) return;

    setUploadingFiles(true);
    const uploaded = [...formData.sourceFiles];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const path = `bookings/clients/${user.id}/${Date.now()}_${file.name}`;
        const url = await StorageService.uploadFile(file, path);
        uploaded.push({ name: file.name, url });
      } catch (error) {
        console.error('Failed to upload source file', error);
        showToast(`Failed to upload ${file.name}`, 'error');
      }
    }
    setFormData(prev => ({ ...prev, sourceFiles: uploaded }));
    setUploadingFiles(false);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      sourceFiles: prev.sourceFiles.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profileId) return;
    if (clientProfile?.status === 'SUSPENDED') {
      showToast('Your client account is suspended. Please contact Lingland before creating new bookings.', 'error');
      return;
    }
    if (!formData.languageTo) {
      showToast('Please select a target language', 'error');
      return;
    }
    if (isTranslation && !formData.languageFrom) {
      showToast('Please select a source language', 'error');
      return;
    }
    if (isTranslation && formData.sourceFiles.length === 0) {
      showToast('Please upload at least one document for translation', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let expectedEndTime = '';
      if (!isTranslation && formData.startTime) {
        const start = new Date(`2000-01-01T${formData.startTime}`);
        const end = new Date(start.getTime() + formData.durationMinutes * 60000);
        expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }

      const submissionData = {
        ...formData,
        costCode: formData.requiresCostCode === 'YES' ? formData.costCode : 'NOT_APPLICABLE',
        expectedEndTime,
        clientId: user.profileId,
        clientName: clientProfile?.companyName || user.displayName,
        requestedByUserId: user.id,
        organizationId: clientProfile?.organizationId || 'lingland-main',
        deliveryEmail: formData.deliveryEmail || user.email,
        status: BookingStatus.INCOMING
      };

      await createBooking(submissionData as any);
      showToast('Booking Request Created Successfully', 'success');
      navigate('/client/bookings');
    } catch (err) {
      console.error(err);
      showToast('Failed to create booking', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400 hover:border-blue-200";

  return (
    <div className="max-w-7xl mx-auto pb-12 px-4">
      <div className="flex items-center mb-8 pt-6">
        <Link to="/client/bookings" className="mr-4 p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 shadow-sm transition-all group">
          <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">New Booking Request</h1>
          <p className="text-slate-500 text-sm">{isTranslation ? 'Professional document translation request.' : 'Schedule language support with a certified interpreter.'}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          <div className="p-8 border-b border-slate-100">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center mr-4">
                <Globe2 size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">Service Selection</h3>
                <p className="text-xs text-slate-500">Choose the type of support required.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Requirement Type</label>
                <select 
                  className={inputClasses}
                  value={formData.serviceType}
                  onChange={e => {
                    const newType = e.target.value as ServiceType;
                    const isTrans = newType === ServiceType.TRANSLATION;
                    setFormData({
                      ...formData, 
                      serviceType: newType,
                      languageFrom: isTrans ? '' : 'English',
                      languageTo: isTrans ? 'English' : ''
                    });
                  }}
                >
                  {Object.values(ServiceType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <InputGroup label={isTranslation ? "Source Lang" : "From"} required>
                    {isTranslation ? (
                      <select 
                        required
                        disabled={loadingLangs}
                        className={inputClasses}
                        value={formData.languageFrom}
                        onChange={e => setFormData({...formData, languageFrom: e.target.value})}
                      >
                        <option value="">{loadingLangs ? '...' : 'Select...'}</option>
                        {availableLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                      </select>
                    ) : (
                      <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center justify-between cursor-not-allowed">
                        English <ShieldCheck size={14} className="text-blue-500" />
                      </div>
                    )}
                 </InputGroup>
                 <InputGroup label={isTranslation ? "Target Lang" : "To"} required>
                    {isTranslation ? (
                       <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center justify-between cursor-not-allowed">
                         English <ShieldCheck size={14} className="text-blue-500" />
                       </div>
                    ) : (
                      <select 
                        required
                        disabled={loadingLangs}
                        className={inputClasses}
                        value={formData.languageTo}
                        onChange={e => setFormData({...formData, languageTo: e.target.value})}
                      >
                        <option value="">{loadingLangs ? '...' : 'Select...'}</option>
                        {availableLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                      </select>
                    )}
                 </InputGroup>
               </div>
            </div>
          </div>

          <div className="p-8 border-b border-slate-100 bg-slate-50/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Billing Information</h3>
                  <p className="text-xs text-slate-500">Invoicing details and mandatory codes.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setHelpModal({
                  isOpen: true,
                  title: "Billing Codes Guidance",
                  content: (
                    <div className="space-y-4 text-slate-600 text-sm">
                      <p>Please provide the <strong>Cost Code</strong>, <strong>ICS/AIS Number</strong>, <strong>PO Number</strong>, or any similar reference required for billing.</p>
                      <div className="flex items-start p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800">
                        <AlertTriangle size={18} className="mr-3 mt-0.5 shrink-0" />
                        <p>Incomplete billing information can lead to administrative delays.</p>
                      </div>
                    </div>
                  )
                })}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              >
                <HelpCircle size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">Billing Code / Purchase Order Required?</label>
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center cursor-pointer group">
                      <input 
                        type="radio" 
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                        checked={formData.requiresCostCode === 'YES'} 
                        onChange={() => setFormData({...formData, requiresCostCode: 'YES'})} 
                      />
                      <span className="ml-2 text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Yes, required</span>
                    </label>
                    <label className="flex items-center cursor-pointer group">
                      <input 
                        type="radio" 
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                        checked={formData.requiresCostCode === 'NO'} 
                        onChange={() => setFormData({...formData, requiresCostCode: 'NO'})} 
                      />
                      <span className="ml-2 text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Not applicable</span>
                    </label>
                  </div>
               </div>

               {formData.requiresCostCode === 'YES' && (
                 <div className="animate-in fade-in slide-in-from-right-2">
                    <InputGroup label="Enter Code" required hint="Example: PO-1234, CC-HR-99">
                       <input 
                         type="text"
                         required
                         className={inputClasses + " font-mono bg-white border-blue-200 focus:ring-blue-500 shadow-sm shadow-blue-500/5"}
                         value={formData.costCode}
                         onChange={e => setFormData({...formData, costCode: e.target.value})}
                       />
                    </InputGroup>
                 </div>
               )}
            </div>
          </div>

          <div className="p-8 border-b border-slate-100">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                <User size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">Patient & Professional Details</h3>
                <p className="text-xs text-slate-500">Tracking information for session fulfillment.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputGroup label="Client Name / Initials / Patient Number" icon={BadgeCheck} required hint="Essential for identification">
                <input type="text" required className={inputClasses} value={formData.patientName} onChange={e => setFormData({ ...formData, patientName: e.target.value })} />
              </InputGroup>
              <InputGroup label="Professional's Name" icon={Stethoscope} hint="Doctor / Solicitor / Social Worker involved">
                <input type="text" className={inputClasses} value={formData.professionalName} onChange={e => setFormData({ ...formData, professionalName: e.target.value })} />
              </InputGroup>
            </div>
          </div>

          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-4">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Timeline & Sessions</h3>
                  <p className="text-xs text-slate-500">{isTranslation ? 'Deadlines and delivery options.' : 'Booking date and duration.'}</p>
                </div>
              </div>
              {!isTranslation && (
                <button 
                  type="button"
                  onClick={() => setHelpModal({
                    isOpen: true,
                    title: "Session Logistics",
                    content: (
                      <div className="space-y-4 text-slate-600 text-sm">
                        <p>Provide the date and start time. For virtual sessions, indicate the platform (Zoom/Teams). Minimum 1 hour charge applies to all bookings.</p>
                      </div>
                    )
                  })}
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                >
                  <HelpCircle size={20} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
               <InputGroup label={isTranslation ? "Desired Delivery Date" : "Booking Date"} icon={Calendar} required>
                  <input 
                    type="date"
                    required
                    className={inputClasses}
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
               </InputGroup>

               {!isTranslation && (
                 <div className="grid grid-cols-2 gap-4">
                    <InputGroup label="Start Time" icon={Clock} required>
                      <input 
                        type="time"
                        required
                        className={inputClasses}
                        value={formData.startTime}
                        onChange={e => setFormData({...formData, startTime: e.target.value})}
                      />
                    </InputGroup>
                    <InputGroup label="Duration" required>
                      <select 
                        required 
                        className={inputClasses} 
                        value={formData.durationMinutes} 
                        onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                      >
                        <option value="60">1 Hour</option>
                        <option value="90">1.5 HR</option>
                        <option value="120">2 HR</option>
                        <option value="180">3 HR</option>
                        <option value="240">4 HR</option>
                      </select>
                    </InputGroup>
                 </div>
               )}

               {isTranslation && (
                 <InputGroup label="Alternative Delivery Email" icon={Mail}>
                    <input
                      type="email"
                      className={inputClasses}
                      placeholder="Account email used by default..."
                      value={formData.deliveryEmail}
                      onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })}
                    />
                 </InputGroup>
               )}
            </div>

            {isTranslation ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-top-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <InputGroup label="Document Format" icon={FileText} required>
                      <select 
                        className={inputClasses} 
                        value={formData.translationFormat}
                        onChange={e => setFormData({ ...formData, translationFormat: e.target.value })}
                      >
                        <option value="Email (PDF)">Email (PDF)</option>
                        <option value="Word Document">Word Document</option>
                        <option value="Certified Translation">Certified</option>
                        <option value="Other">Other</option>
                      </select>
                   </InputGroup>
                   <InputGroup label="Billing Preference">
                      <div className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, quoteRequested: false })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all ${!formData.quoteRequested ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 font-bold'}`}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, quoteRequested: true })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all ${formData.quoteRequested ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 font-bold'}`}
                        >
                          Quote
                        </button>
                        <button 
                          type="button"
                          onClick={() => setHelpModal({
                            isOpen: true,
                            title: "Standard Rates vs Quotes",
                            content: (
                              <div className="space-y-4 text-xs leading-relaxed text-slate-600">
                                <p><strong>Standard Rates:</strong> We begin work immediately. Fully transparent pricing applies.</p>
                                <p><strong>Quotes:</strong> We will provide an exact cost before starting. Necessary for specific accounting requirements.</p>
                                <p className="p-3 bg-blue-50 text-blue-800 rounded-lg italic">Rare languages or uncommon formats ALWAYS trigger a quote request for your approval.</p>
                              </div>
                            )
                          })}
                          className="text-slate-300 hover:text-blue-500"
                        >
                          <Info size={16} />
                        </button>
                      </div>
                   </InputGroup>
                </div>

                <div className="relative group">
                   <div className="p-8 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50 text-center group-hover:bg-blue-50/30 group-hover:border-blue-200 transition-all">
                      <FileText className="mx-auto text-slate-300 group-hover:text-blue-400 mb-3 transition-colors" size={40} />
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">Source Files</h4>
                      <p className="text-[10px] text-slate-400 font-bold mb-4">Please upload the documents for translation</p>
                      <input id="client-source-files" type="file" multiple className="hidden" onChange={handleFileChange} disabled={uploadingFiles} />
                      <label htmlFor="client-source-files" className={`inline-flex px-6 py-2 bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm cursor-pointer ${uploadingFiles ? 'opacity-50' : ''}`}>
                        {uploadingFiles ? 'Uploading...' : 'Select Documents'}
                      </label>
                      {formData.sourceFiles.length > 0 && (
                        <div className="mt-5 space-y-2 text-left">
                          {formData.sourceFiles.map((file, idx) => (
                            <div key={`${file.url}-${idx}`} className="flex items-center justify-between rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                              <span className="truncate pr-3">{file.name}</span>
                              <button type="button" onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-top-4">
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-3">Session Environment</label>
                   <div className="grid grid-cols-2 gap-4">
                    <label className={`
                      flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${formData.locationType === 'ONSITE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'}
                    `}>
                      <input type="radio" className="hidden" checked={formData.locationType === 'ONSITE'} onChange={() => setFormData({...formData, locationType: 'ONSITE'})} />
                      <MapPin size={18} className="mr-2" />
                      <span className="font-bold text-xs uppercase tracking-widest">Face-to-Face</span>
                    </label>
                    <label className={`
                      flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${formData.locationType === 'ONLINE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'}
                    `}>
                      <input type="radio" className="hidden" checked={formData.locationType === 'ONLINE'} onChange={() => setFormData({...formData, locationType: 'ONLINE'})} />
                      <Video size={18} className="mr-2" />
                      <span className="font-bold text-xs uppercase tracking-widest">Virtual / Phone</span>
                    </label>
                   </div>
                </div>

                {formData.locationType === 'ONSITE' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-jade-in">
                    <div className="md:col-span-2">
                       <InputGroup label="Full Address" required hint="Include Building, Ward, or Room Number">
                          <input type="text" required placeholder="e.g. Royal Hospital, Ward 4, Room 12" className={inputClasses} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                       </InputGroup>
                    </div>
                    <InputGroup label="Postcode" required>
                       <input type="text" required placeholder="e.g. SO31 7GW" className={inputClasses} value={formData.postcode} onChange={e => setFormData({...formData, postcode: e.target.value})} />
                    </InputGroup>
                  </div>
                ) : (
                   <div className="animate-fade-in">
                      <InputGroup label="Platform Details" required hint="MS Teams, Zoom, or Phone Number">
                        <input type="text" placeholder="e.g. Teams Link or Dial-in Number" className={inputClasses} value={formData.onlineLink} onChange={e => setFormData({...formData, onlineLink: e.target.value})} />
                      </InputGroup>
                   </div>
                )}
              </div>
            )}
          </div>

          <div className="p-8 border-t border-slate-100 bg-slate-50/50">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Bespoke Requirements</h3>
                    <p className="text-xs text-slate-500">Cultural needs and special instructions.</p>
                  </div>
                </div>
                {!isTranslation && (
                  <button 
                    type="button"
                    onClick={() => setHelpModal({
                      isOpen: true,
                      title: "Bespoke Requests",
                      content: (
                        <div className="space-y-4 text-slate-600 text-sm">
                          <p>Specify gender preferences, arrival protocols, or password requirements here.</p>
                        </div>
                      )
                    })}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                  >
                    <HelpCircle size={20} />
                  </button>
                )}
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <InputGroup label="Case Category" icon={BadgeCheck}>
                  <select className={inputClasses} value={formData.caseType} onChange={e => setFormData({...formData, caseType: e.target.value})}>
                    <option value="">Select...</option>
                    <option value="Medical">Medical</option>
                    <option value="Legal">Legal</option>
                    <option value="Social Services">Social Services</option>
                    <option value="Education">Education</option>
                    <option value="Business">Business</option>
                  </select>
                </InputGroup>
                {!isTranslation && (
                  <InputGroup label="Gender Preference" icon={User}>
                    <select className={inputClasses} value={formData.genderPreference} onChange={e => setFormData({...formData, genderPreference: e.target.value as any})}>
                      <option value="None">None</option>
                      <option value="Male">Male Only</option>
                      <option value="Female">Female Only</option>
                    </select>
                  </InputGroup>
                )}
             </div>

             <InputGroup label="Special Instructions / Notes">
                <textarea 
                  className={inputClasses + " h-32 resize-none"} 
                  placeholder="Provide any additional details..." 
                  value={formData.notes} 
                  onChange={e => setFormData({...formData, notes: e.target.value})} 
                />
             </InputGroup>
          </div>

          <div className="p-8 bg-slate-100/50 border-t border-slate-200">
            <div className="max-w-xl space-y-4">
              <label className="flex items-start cursor-pointer group">
                <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" checked={formData.agreedToTerms} onChange={e => setFormData({ ...formData, agreedToTerms: e.target.checked })} />
                <div className="ml-3">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Service Terms</p>
                  <p className="text-sm text-slate-700 leading-snug">
                    I agree to the <a href="/#/terms" target="_blank" className="font-bold text-blue-600 hover:underline">Terms and Conditions of Service</a>.
                  </p>
                </div>
              </label>

              <label className="flex items-start cursor-pointer group">
                <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" checked={formData.gdprConsent} onChange={e => setFormData({ ...formData, gdprConsent: e.target.checked })} />
                <div className="ml-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Data Privacy</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    I consent to processing my data per the <a href="https://gdpr-info.eu/" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">GDPR guidelines</a>.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end space-x-4 mt-8 pt-8 border-t border-slate-200">
              <button 
                type="button"
                onClick={() => navigate('/client/bookings')}
                className="px-8 py-3 text-slate-500 font-bold hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting || uploadingFiles || profileLoading || availableLanguages.length === 0 || clientProfile?.status === 'SUSPENDED'}
                className="px-10 py-4 bg-slate-900 text-white font-bold text-lg rounded-xl shadow-xl shadow-slate-900/10 hover:bg-black hover:scale-[1.01] active:scale-95 transition-all flex items-center disabled:opacity-50"
              >
                {isSubmitting ? (
                   <><Loader2 className="animate-spin mr-2" size={20} /> Processing...</>
                ) : (
                  <><ArrowRight size={20} className="mr-2" /> Submit Request</>
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-6 hidden lg:block sticky top-28">
          <InfoCard title="Need Help?" icon={HelpCircle} variant="slate">
            <p className="font-bold text-slate-900 mb-3">Priority Support</p>
            <div className="space-y-3">
               <div className="flex items-center text-sm font-bold text-blue-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                  <Phone size={14} className="mr-2" /> 01489 576657
               </div>
               <div className="flex items-center text-sm font-bold text-blue-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                  <Mail size={14} className="mr-2" /> info@lingland.net
               </div>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed font-medium text-slate-500">As a registered client, your requests are prioritized by our logistics team.</p>
          </InfoCard>

          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/30 transition-all duration-700"></div>
             <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Security Notice</p>
             <div className="flex items-center mb-4">
               <ShieldCheck size={24} className="text-emerald-400 mr-3" />
               <p className="text-sm font-bold">Encrypted Submission</p>
             </div>
             <p className="text-xs text-slate-400 leading-relaxed">
               This request is processed over a secure connection. All shared documents are encrypted and handled per our rigid confidentiality standards.
             </p>
          </div>

          <div className="p-1 rounded-3xl bg-gradient-to-br from-slate-200 to-slate-100 hover:from-blue-200 hover:to-indigo-200 transition-all duration-500 shadow-sm">
             <div className="bg-white rounded-[1.4rem] p-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Lingland Premium</p>
                <div className="flex items-center space-x-1 mb-4">
                   {[1,2,3,4,5].map(i => <Info key={i} size={12} className="text-amber-400 fill-amber-400" />)}
                </div>
                <blockquote className="text-slate-600 text-xs italic leading-relaxed mb-4">
                   "Managing our complex case requirements has never been easier. The system is intuitive and extremely fast."
                </blockquote>
                <p className="text-[10px] font-black text-slate-900 tracking-tighter">CASE MANAGEMENT DEPT</p>
             </div>
          </div>
        </div>
      </div>

      {helpModal && (
        <Modal
          isOpen={helpModal.isOpen}
          onClose={() => setHelpModal(null)}
          title={helpModal.title}
        >
          {helpModal.content}
        </Modal>
      )}
    </div>
  );
};
