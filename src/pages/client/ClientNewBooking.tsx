import React, { useState, useEffect } from 'react';
import { BookingService, StorageService, InterpreterService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ServiceType } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useClientProfile } from '../../hooks/useClientHooks';
import { 
  FileText, User, Calendar, Clock, MapPin, Video, 
  Phone, Mail, Loader2, ArrowRight, X, Info, ShieldCheck,
  Building2, BadgeCheck, Stethoscope, ArrowLeftRight
} from 'lucide-react';

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

const inputClasses = "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400 hover:border-blue-200";

export const ClientNewBooking = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { profile: clientProfile, loading: profileLoading } = useClientProfile(user?.profileId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);
  
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, url: string }[]>([]);

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
    notes: '',
    genderPreference: 'None',
    // Translation fields
    translationFormat: 'Email (PDF)',
    translationFormatOther: '',
    quoteRequested: false,
    deliveryEmail: '',
  });

  const isTranslation = formData.serviceType === ServiceType.TRANSLATION;

  useEffect(() => {
    const fetchLangs = async () => {
      try {
        const interpreters = await InterpreterService.getAll();
        const langs = interpreters
          .filter(i => i.status === 'ACTIVE')
          .flatMap(i => i.languages);
        const uniqueLangs = Array.from(new Set(['English', ...langs])).sort();
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

    setUploading(true);
    const newUploadedFiles = [...uploadedFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const path = `bookings/clients/${user.id}/${Date.now()}_${file.name}`;
        const url = await StorageService.uploadFile(file, path);
        newUploadedFiles.push({ name: file.name, url });
      } catch (error) {
        console.error("Error uploading file:", file.name, error);
        showToast(`Failed to upload ${file.name}`, 'error');
      }
    }

    setUploadedFiles(newUploadedFiles);
    setUploading(false);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const swapLanguages = () => {
    setFormData(prev => ({
      ...prev,
      languageFrom: prev.languageTo,
      languageTo: prev.languageFrom
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profileId) return;

    if (clientProfile?.status === 'SUSPENDED') {
      showToast('Your client account is suspended. Please contact Lingland before creating new bookings.', 'error');
      return;
    }

    if (!formData.languageTo || (isTranslation && !formData.languageFrom)) {
      showToast('Please select the required languages', 'error');
      return;
    }

    if (isTranslation && uploadedFiles.length === 0) {
      showToast('Please upload at least one document for translation', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const baseData = {
        clientId: user.profileId,
        clientName: clientProfile?.companyName || user.displayName,
        requestedByUserId: user.id,
        organizationId: clientProfile?.organizationId || 'lingland-main',
        languageFrom: formData.languageFrom,
        languageTo: formData.languageTo,
        date: formData.date,
        serviceType: formData.serviceType,
        notes: formData.notes,
      };

      let finalData = {};
      if (isTranslation) {
        finalData = {
          ...baseData,
          translationFormat: formData.translationFormat,
          translationFormatOther: formData.translationFormatOther,
          quoteRequested: formData.quoteRequested,
          deliveryEmail: formData.deliveryEmail || user.email,
          sourceFiles: uploadedFiles
        };
      } else {
        finalData = {
          ...baseData,
          startTime: formData.startTime,
          durationMinutes: Number(formData.durationMinutes),
          locationType: formData.locationType,
          address: formData.address,
          postcode: formData.postcode,
          onlineLink: formData.onlineLink,
          genderPreference: formData.genderPreference
        };
      }

      await BookingService.create(finalData as any);
      showToast('Booking Request Created Successfully', 'success');
      navigate('/client/bookings');
    } catch (err) {
      console.error(err);
      showToast('Failed to create booking', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">New Booking Request</h1>
        <p className="text-slate-500 mt-1">Professional language support for your organisation.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Service Type Toggle */}
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-center mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center mr-4">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Service Selection</h3>
              <p className="text-xs text-slate-500">Choose the type of support needed.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button" 
              onClick={() => setFormData({ ...formData, serviceType: ServiceType.FACE_TO_FACE, languageFrom: 'English', languageTo: '' })}
              className={`p-4 rounded-xl border-2 transition-all text-center ${!isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'}`}
            >
              <User size={20} className="mx-auto mb-2" />
              <span className="font-bold text-sm uppercase tracking-wider">Interpreting</span>
            </button>
            <button 
              type="button" 
              onClick={() => setFormData({ ...formData, serviceType: ServiceType.TRANSLATION, languageFrom: '', languageTo: 'English' })}
              className={`p-4 rounded-xl border-2 transition-all text-center ${isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'}`}
            >
              <FileText size={20} className="mx-auto mb-2" />
              <span className="font-bold text-sm uppercase tracking-wider">Translation</span>
            </button>
          </div>
        </div>

        {isTranslation ? (
          /* Translation Section */
          <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative group/langs">
              <InputGroup label="Source Language" required>
                <select 
                  required 
                  disabled={loadingLangs} 
                  className={inputClasses} 
                  value={formData.languageFrom} 
                  onChange={e => {
                    const newLang = e.target.value;
                    setFormData(prev => ({ 
                      ...prev, 
                      languageFrom: newLang,
                      languageTo: newLang !== 'English' ? 'English' : (prev.languageTo === 'English' ? '' : prev.languageTo)
                    }));
                  }}
                >
                  <option value="">Select...</option>
                  {availableLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
              </InputGroup>

              {/* Swap Button (Desktop) */}
              <div className="hidden md:flex absolute left-1/2 top-[34px] -translate-x-1/2 z-10">
                <button
                  type="button"
                  onClick={swapLanguages}
                  className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:shadow-md transition-all flex items-center justify-center group-hover/langs:scale-110"
                  title="Swap Languages"
                >
                  <ArrowLeftRight size={14} />
                </button>
              </div>

              <InputGroup label="Target Language" required>
                <select 
                  required 
                  disabled={loadingLangs} 
                  className={inputClasses} 
                  value={formData.languageTo} 
                  onChange={e => {
                    const newLang = e.target.value;
                    setFormData(prev => ({ 
                      ...prev, 
                      languageTo: newLang,
                      languageFrom: newLang !== 'English' ? 'English' : (prev.languageFrom === 'English' ? '' : prev.languageFrom)
                    }));
                  }}
                >
                  <option value="">Select...</option>
                  {availableLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
              </InputGroup>

              {/* Swap Button (Mobile) */}
              <div className="md:hidden flex justify-center -mt-2 mb-3">
                <button
                  type="button"
                  onClick={swapLanguages}
                  className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100"
                >
                  <ArrowLeftRight size={12} />
                  <span>Swap Languages</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputGroup label="Desired Format" required>
                <select className={inputClasses} value={formData.translationFormat} onChange={e => setFormData({ ...formData, translationFormat: e.target.value })}>
                  <option value="Email (PDF)">Email (PDF)</option>
                  <option value="Word Document">Word Document</option>
                  <option value="Certified Translation">Certified Translation</option>
                  <option value="Other">Other</option>
                </select>
              </InputGroup>
              <InputGroup label="Delivery Date" icon={Calendar} required>
                <input type="date" required className={inputClasses} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </InputGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputGroup label="Delivery Email (Optional)" icon={Mail}>
                <input type="email" placeholder={user?.email || 'e.g. results@org.com'} className={inputClasses} value={formData.deliveryEmail} onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })} />
              </InputGroup>
              <InputGroup label="Rates Preference">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" name="quote" className="mr-2 text-blue-600" checked={!formData.quoteRequested} onChange={() => setFormData({ ...formData, quoteRequested: false })} />
                    <span className="text-sm font-medium">Standard Rates</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" name="quote" className="mr-2 text-blue-600" checked={formData.quoteRequested} onChange={() => setFormData({ ...formData, quoteRequested: true })} />
                    <span className="text-sm font-medium">Quote First</span>
                  </label>
                </div>
              </InputGroup>
            </div>

            <div className="p-8 bg-blue-50 border border-dashed border-blue-200 rounded-2xl text-center">
              <input type="file" id="file-upload" multiple className="hidden" onChange={handleFileChange} disabled={uploading} />
              <FileText className="mx-auto text-blue-400 mb-2" size={32} />
              <p className="text-sm font-bold text-blue-900 mb-1">Source Documents</p>
              <label htmlFor="file-upload" className={`inline-flex items-center px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-all cursor-pointer shadow-sm ${uploading ? 'opacity-50' : ''}`}>
                {uploading ? <Loader2 className="animate-spin mr-2" size={14} /> : 'Select Files'}
              </label>

              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2 text-left bg-white/50 p-4 rounded-xl border border-blue-100">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs font-medium text-slate-700 bg-white p-2 rounded-lg border border-blue-50">
                      <span className="truncate flex-1 mr-2">{file.name}</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <InputGroup label="Translation Notes">
              <textarea className={inputClasses + " h-32 resize-none"} placeholder="Include any specific formatting needs..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </InputGroup>
          </div>
        ) : (
          /* Interpreting Section */
          <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputGroup label="Language Required" required>
                <select required disabled={loadingLangs} className={inputClasses} value={formData.languageTo} onChange={e => setFormData({ ...formData, languageTo: e.target.value })}>
                  <option value="">Select Language...</option>
                  {availableLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
              </InputGroup>
              <InputGroup label="Session Date" icon={Calendar} required>
                <input type="date" required className={inputClasses} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </InputGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputGroup label="Start Time" icon={Clock} required>
                <input type="time" required className={inputClasses} value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
              </InputGroup>
              <InputGroup label="Duration" required>
                <select className={inputClasses} value={formData.durationMinutes} onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}>
                  <option value="60">1 Hour</option>
                  <option value="90">1.5 Hours</option>
                  <option value="120">2 Hours</option>
                  <option value="180">3 Hours</option>
                  <option value="240">4 Hours</option>
                  <option value="480">8 Hours</option>
                </select>
              </InputGroup>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700">Location Type</label>
              <div className="flex space-x-4">
                <button type="button" onClick={() => setFormData({ ...formData, locationType: 'ONSITE' })} className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 transition-all ${formData.locationType === 'ONSITE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}>
                  <MapPin size={18} className="mr-2" /> <span className="font-bold text-xs uppercase tracking-widest">On-site</span>
                </button>
                <button type="button" onClick={() => setFormData({ ...formData, locationType: 'ONLINE' })} className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 transition-all ${formData.locationType === 'ONLINE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}>
                  <Video size={18} className="mr-2" /> <span className="font-bold text-xs uppercase tracking-widest">Virtual</span>
                </button>
              </div>
            </div>

            {formData.locationType === 'ONSITE' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="md:col-span-2">
                  <InputGroup label="Location Address" required>
                    <input type="text" required className={inputClasses} placeholder="Full address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                  </InputGroup>
                </div>
                <InputGroup label="Postcode" required>
                  <input type="text" required className={inputClasses} value={formData.postcode} onChange={e => setFormData({ ...formData, postcode: e.target.value })} />
                </InputGroup>
              </div>
            )}

            {formData.locationType === 'ONLINE' && (
              <InputGroup label="Virtual Meeting Link / Info" required hint="Zoom, Teams, or 'TBC'">
                <input type="text" required className={inputClasses} value={formData.onlineLink} onChange={e => setFormData({ ...formData, onlineLink: e.target.value })} />
              </InputGroup>
            )}

            <InputGroup label="Notes / Special Instructions">
              <textarea className={inputClasses + " h-24 resize-none"} placeholder="e.g. Male interpreter preferred, specific room number..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </InputGroup>
          </div>
        )}

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center text-slate-500 text-xs">
            <ShieldCheck size={16} className="mr-2 text-emerald-500" />
            Secure Request Processing
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting || loadingLangs || uploading || profileLoading || clientProfile?.status === 'SUSPENDED'}
            className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-black hover:scale-[1.02] active:scale-95 transition-all flex items-center disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : <ArrowRight className="mr-2" size={18} />}
            {isSubmitting ? 'Submitting...' : 'Confirm Request'}
          </button>
        </div>
      </form>
    </div>
  );
};
