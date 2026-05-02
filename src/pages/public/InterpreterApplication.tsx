import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ApplicationService } from '../../services/applicationService';
import { StorageService } from '../../services/storageService';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { 
  Globe2, ChevronLeft, ChevronRight, CheckCircle2, User,
  Languages, Award, FileText, Check, ArrowRight,
  Phone, Home, Car, MessageSquare, Plus, Trash2, Mail, ShieldCheck, Info, Camera
} from 'lucide-react';
import { InterpreterApplication, LanguageProficiency } from '../../types';

type Step = 1 | 2 | 3 | 4;

export const InterpreterApplicationPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [activeInfoCard, setActiveInfoCard] = useState<string | null>('what-we-do');
  const [isSuccess, setIsSuccess] = useState(false);
  
  const toggleInfoCard = (id: string) => {
    setActiveInfoCard(activeInfoCard === id ? null : id);
  };

  // Initial Form State matching expanded interface
  const [formData, setFormData] = useState<Omit<InterpreterApplication, 'id' | 'status' | 'submittedAt'>>({
    name: '',
    shortName: '',
    email: '',
    phone: '',
    gender: 'O',
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
    languages: ['English'],
    qualifications: [],
    nrpsi: { registered: false, number: '' },
    dpsi: false,
    dbsNumber: '',
    experienceSummary: '',
    cvUrl: ''
  });

  const nextStep = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep(prev => (prev < 4 ? prev + 1 : prev) as Step);
  };

  const prevStep = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep(prev => (prev > 1 ? prev - 1 : prev) as Step);
  };

  const handleUpdate = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressUpdate = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value }
    }));
  };

  const addLanguage = () => {
    const profs = [...formData.languageProficiencies];
    profs.push({ language: '', l1: 1, translateOrder: 'no' });
    handleUpdate('languageProficiencies', profs);
  };

  const removeLanguage = (index: number) => {
    const profs = [...formData.languageProficiencies];
    if (profs[index].language === 'English') return;
    profs.splice(index, 1);
    handleUpdate('languageProficiencies', profs);
  };

  const updateLanguageProficiency = (index: number, field: keyof LanguageProficiency, value: any) => {
    const profs = [...formData.languageProficiencies];
    if (profs[index].language === 'English' && field === 'language') return;
    
    // Always set L1 to 18 (default low priority for new applicants)
    profs[index] = { ...profs[index], [field]: value, l1: 18 };
    handleUpdate('languageProficiencies', profs);
    
    // Sync legacy languages array
    const simpleLangs = profs.map(p => p.language).filter(Boolean);
    handleUpdate('languages', simpleLangs);
  };

  const toggleQualification = (qual: string) => {
    const list = [...formData.qualifications];
    const index = list.indexOf(qual);
    if (index > -1) list.splice(index, 1);
    else list.push(qual);
    handleUpdate('qualifications', list);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await ApplicationService.submit(formData);
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      showToast("Failed to submit application. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center p-8 md:p-16 bg-white rounded-[3rem] shadow-2xl animate-in zoom-in duration-500 border border-slate-100">
          <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-600 shadow-xl shadow-emerald-100 ring-8 ring-emerald-50">
            <CheckCircle2 size={48} strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Application Sent!</h1>
          <p className="text-lg text-slate-500 mb-10 leading-relaxed font-medium">
            Thanks, <strong>{formData.name.split(' ')[0]}</strong>. We've received your details and will get back to you after review.
          </p>

          <div className="text-left bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                <Info size={20} />
              </div>
              <h3 className="text-lg font-black text-slate-800">What now?</h3>
            </div>
            <div className="space-y-4 text-sm text-slate-600 leading-relaxed font-medium">
              <p>
                If you sent us an application, our admin team will soon get in touch with you.
              </p>
              <p>
                We will send you a full application form, where you will need to complete your professional information and attach a copy of your DBS and Certifications. Once we receive and check this, we will schedule an interview and induct you in the company.
              </p>
            </div>
          </div>

          <Link to="/" className="inline-flex items-center px-10 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-black transition-all shadow-xl shadow-slate-900/20 hover:-translate-y-1">
            Back to Home <ArrowRight size={18} className="ml-2" />
          </Link>
        </div>
      </div>
    );
  }

  const inputClasses = "w-full p-4 border border-slate-200 bg-slate-50 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm font-semibold text-slate-700 placeholder:text-slate-300";
  const labelClasses = "text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1";

  return (
    <div className="min-h-screen bg-[#f8fafc] py-12 px-4 md:py-20 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Brand Header (Simplified for Multi-Column) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
          <Link to="/" className="inline-flex items-center group">
            <div className="w-12 h-12 bg-blue-600 rounded-[1rem] flex items-center justify-center text-white shadow-xl shadow-blue-500/40 group-hover:scale-110 transition-transform">
              <Globe2 size={24} />
            </div>
            <div className="ml-4 text-left">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">Lingland</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Careers & Network</span>
            </div>
          </Link>
          <div className="text-left md:text-right">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">Partner Application</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Join our professional network</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Informational Accordion Sidebar - Moved to Right on Desktop */}
          <div className="lg:col-span-4 space-y-4 order-1 lg:order-2">
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden divide-y divide-slate-50">
              
              {/* Card: What we do */}
              <div className="group">
                <button 
                  onClick={() => toggleInfoCard('what-we-do')}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      <Globe2 size={16} />
                    </div>
                    <span className="text-base font-black text-slate-900 tracking-tight">What we do</span>
                  </div>
                  <ChevronRight size={18} className={`text-slate-300 transition-transform duration-300 ${activeInfoCard === 'what-we-do' ? 'rotate-90' : ''}`} />
                </button>
                {activeInfoCard === 'what-we-do' && (
                  <div className="px-6 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-4 text-sm text-slate-500 leading-relaxed font-medium">
                      <p>Lingland Interpreters and Translators ltd is a major language service provider in the South East of the UK established in 1996. We work with NHS Hospital departments, Social Services, mental health teams, and more.</p>
                      <p>Our interpreters work on a freelance basis. We run a well established client network, manage assignments and provide all expenses, fees, and training.</p>
                      <p className="text-blue-600 font-bold">You get prompt and full payment hassle free straight to your account on a weekly basis.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Card: High Demand */}
              <div className="group">
                <button 
                  onClick={() => toggleInfoCard('demand')}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                      <Languages size={16} />
                    </div>
                    <span className="text-base font-black text-slate-900 tracking-tight">High Demand</span>
                  </div>
                  <ChevronRight size={18} className={`text-slate-300 transition-transform duration-300 ${activeInfoCard === 'demand' ? 'rotate-90' : ''}`} />
                </button>
                {activeInfoCard === 'demand' && (
                  <div className="px-6 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-400">
                      {['Arabic', 'Kurdish', 'Nepali', 'Mandarin', 'Tigrinya', 'Pashto', 'Farsi', 'Ukrainian', 'BSL'].map(l => (
                        <div key={l} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                          {l}
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-slate-400 uppercase tracking-widest font-black">All languages welcome</p>
                  </div>
                )}
              </div>

              {/* Card: What we offer */}
              <div className="group">
                <button 
                  onClick={() => toggleInfoCard('offer')}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                      <Award size={16} />
                    </div>
                    <span className="text-base font-black text-slate-900 tracking-tight">What we offer</span>
                  </div>
                  <ChevronRight size={18} className={`text-slate-300 transition-transform duration-300 ${activeInfoCard === 'offer' ? 'rotate-90' : ''}`} />
                </button>
                {activeInfoCard === 'offer' && (
                  <div className="px-6 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                    <ul className="space-y-3">
                      {[
                        { t: "Living Fees", d: "Fair living fees with premium night/weekend rates." },
                        { t: "Prompt Payment", d: "Fees advanced within the week." },
                        { t: "Flexibility", d: "Choose your own assignments." }
                      ].map((item, i) => (
                        <li key={i} className="flex gap-3">
                          <div className="mt-1 w-3 h-3 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                            <Check size={8} strokeWidth={4} />
                          </div>
                          <div>
                            <span className="block text-slate-800 text-xs font-black uppercase tracking-wider">{item.t}</span>
                            <span className="text-slate-400 text-xs font-medium leading-tight">{item.d}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Card: Rates Policy */}
              <div className="group">
                <button 
                  onClick={() => toggleInfoCard('rates')}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                      <Info size={16} />
                    </div>
                    <span className="text-base font-black text-slate-900 tracking-tight">Rates Policy</span>
                  </div>
                  <ChevronRight size={18} className={`text-slate-300 transition-transform duration-300 ${activeInfoCard === 'rates' ? 'rotate-90' : ''}`} />
                </button>
                {activeInfoCard === 'rates' && (
                  <div className="px-6 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-blue-50/50 p-4 rounded-2xl">
                      <p className="text-sm text-blue-800 leading-relaxed font-medium mb-3">
                        We use unified <strong>Lingland Rates</strong> to ensure consistent budgeting for our clients. 
                      </p>
                      <div className="text-xs text-blue-600 leading-relaxed font-bold">
                        Adhering to standard rates guarantees you <strong>Priority List</strong> status.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Benefits/Trust Badge */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl shadow-slate-900/20 text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 -mr-10 -mt-10 rounded-full blur-3xl transition-all duration-1000"></div>
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-blue-400">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest">Quality Assured</h4>
                  <p className="text-[10px] text-slate-400 tracking-tight">ISO 9001:2015 Certified Agency</p>
                </div>
              </div>
            </div>
          </div>

          {/* Wizard Container - Moved to Left on Desktop */}
          <div className="lg:col-span-8 order-2 lg:order-1">
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          
          {/* Custom Step Tracker */}
          <div className="bg-slate-50/50 px-8 py-10 border-b border-slate-100">
            <div className="flex justify-between items-center relative max-w-2xl mx-auto">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -z-0 rounded-full -translate-y-1/2"></div>
              <div className="absolute top-1/2 left-0 h-1 bg-blue-600 -z-0 rounded-full transition-all duration-700 ease-in-out -translate-y-1/2" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>

              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="relative z-10 flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black transition-all duration-500 border-4 ${step >= s ? 'bg-blue-600 border-white text-white shadow-xl shadow-blue-600/30 scale-110' : 'bg-white border-slate-100 text-slate-300'}`}>
                    {step > s ? <Check size={20} strokeWidth={4} /> : s}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] mt-4 transition-colors duration-500 ${step >= s ? 'text-blue-600' : 'text-slate-300'}`}>
                    {s === 1 ? 'Profile' : s === 2 ? 'Languages' : s === 3 ? 'Expertise' : 'Submit'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-8 md:p-16">

            {/* STEP 1: Personal Profile */}
            {step === 1 && (
              <div className="animate-in slide-in-from-right-12 fade-in duration-700 space-y-10">
                <div className="flex items-center gap-4 pb-6 border-b border-slate-50">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner">
                    <User size={28} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Personal Information</h2>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Please provide your legal details for the application.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className={labelClasses}>Full Legal Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input type="text" required className={inputClasses + " pl-12"} value={formData.name} onChange={e => handleUpdate('name', e.target.value)} placeholder="e.g. John Doe" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClasses}>Gender</label>
                    <select className={inputClasses} value={formData.gender} onChange={e => handleUpdate('gender', e.target.value)}>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other / Prefer not to say</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClasses}>Email Address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input type="email" required className={inputClasses + " pl-12"} value={formData.email} onChange={e => handleUpdate('email', e.target.value)} placeholder="email@example.com" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClasses}>Phone Number</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input type="tel" required className={inputClasses + " pl-12"} value={formData.phone} onChange={e => handleUpdate('phone', e.target.value)} placeholder="+44 ..." />
                    </div>
                  </div>

                  <div className="md:col-span-2 pt-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center">
                        <Home size={18} />
                      </div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Service Area Address</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <label className={labelClasses}>Street Address</label>
                        <input type="text" required className={inputClasses} value={formData.address.street} onChange={e => handleAddressUpdate('street', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClasses}>Postcode</label>
                        <input type="text" required className={inputClasses} value={formData.address.postcode} onChange={e => handleAddressUpdate('postcode', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClasses}>Town / City</label>
                        <input type="text" required className={inputClasses} value={formData.address.town} onChange={e => handleAddressUpdate('town', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClasses}>County</label>
                        <input type="text" required className={inputClasses} value={formData.address.county} onChange={e => handleAddressUpdate('county', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Language Selection */}
            {step === 2 && (
              <div className="animate-in slide-in-from-right-12 fade-in duration-700 space-y-10">
                <div className="flex items-center gap-4 pb-6 border-b border-slate-50">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center shadow-inner">
                    <Languages size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Language Matrix</h2>
                    <p className="text-slate-400 text-sm font-medium">All pairs are assumed to be to/from English.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100 shrink-0">
                      <Info size={20} />
                    </div>
                    <div className="text-[11px] text-blue-800 leading-relaxed font-medium">
                      <p className="mb-2"><strong>Language Selection:</strong> Please select all the languages you speak fluently. Your application will be reviewed and prioritized by our admin team.</p>
                      <p><strong>Written Translation:</strong> Select <strong>'T1'</strong> if you also provide written translation services, or <strong>'None'</strong> if you only provide interpreting.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4 px-2 hidden md:grid mb-2">
                    <div className="col-span-12 md:col-span-8 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-5">Language Pair</div>
                    <div className="col-span-12 md:col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Translation</div>
                    <div className="col-span-12 md:col-span-1"></div>
                  </div>

                  <div className="space-y-3">
                    {formData.languageProficiencies.map((prof, idx) => (
                      <div key={idx} className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-5 rounded-[2rem] border-2 transition-all ${prof.language === 'English' ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 hover:border-blue-100'}`}>
                        <div className="col-span-12 md:col-span-8">
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
                          <select className={inputClasses} value={prof.translateOrder} onChange={e => updateLanguageProficiency(idx, 'translateOrder', e.target.value)}>
                            <option value="no">Interpreting Only</option>
                            <option value="T1">Yes (Translating Too)</option>
                          </select>
                        </div>

                        <div className="col-span-12 md:col-span-1 flex items-center justify-end">
                          {prof.language !== 'English' && (
                            <button type="button" onClick={() => removeLanguage(idx)} className="p-3 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addLanguage} className="w-full py-5 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-black text-xs uppercase tracking-widest hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-3 group">
                    <Plus size={18} className="group-hover:scale-125 transition-transform" />
                    Add Language Pair
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Qualifications & Expertise */}
            {step === 3 && (
              <div className="animate-in slide-in-from-right-12 fade-in duration-700 space-y-10">
                <div className="flex items-center gap-4 pb-6 border-b border-slate-50">
                  <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center shadow-inner">
                    <Award size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Expertise & Quality</h2>
                    <p className="text-slate-400 text-sm font-medium">Verify your professional credentials and experience.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                      <label className={labelClasses}>Professional Status</label>
                      <label className="flex items-center gap-4 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] cursor-pointer hover:bg-white hover:border-blue-200 transition-all select-none group">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${formData.nrpsi.registered ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-600/30' : 'bg-white border-slate-200'}`}>
                          {formData.nrpsi.registered && <Check size={14} className="text-white" strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={formData.nrpsi.registered} onChange={e => handleUpdate('nrpsi', { ...formData.nrpsi, registered: e.target.checked })} />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">NRPSI Registered</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">National Registry of Public Service Interpreters</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-4 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] cursor-pointer hover:bg-white hover:border-blue-200 transition-all select-none group">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${formData.dpsi ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-600/30' : 'bg-white border-slate-200'}`}>
                          {formData.dpsi && <Check size={14} className="text-white" strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={formData.dpsi} onChange={e => handleUpdate('dpsi', e.target.checked)} />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">DPSI Qualified</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Diploma in Public Service Interpreting</span>
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-4">
                      <label className="flex items-center gap-4 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] cursor-pointer hover:bg-white hover:border-blue-200 transition-all select-none group">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${formData.hasCar ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/30' : 'bg-white border-slate-200'}`}>
                          {formData.hasCar && <Check size={14} className="text-white" strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={formData.hasCar} onChange={e => handleUpdate('hasCar', e.target.checked)} />
                        <div className="flex items-center gap-4">
                          <Car size={18} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                          <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">Owns a Car for Travel</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className={labelClasses}>Enhanced DBS Number (If available)</label>
                      <input type="text" className={inputClasses} value={formData.dbsNumber} onChange={e => handleUpdate('dbsNumber', e.target.value)} placeholder="e.g. 0015..." />
                    </div>
                    <div>
                      <label className={labelClasses}>Skype ID (For Remote Work)</label>
                      <div className="relative">
                        <MessageSquare size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input type="text" className={inputClasses + " pl-12"} value={formData.skypeId} onChange={e => handleUpdate('skypeId', e.target.value)} placeholder="e.g. live:sarah_jones" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50">
                  <label className={labelClasses}>Other Select Certifications</label>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {['Met Police Test', 'Community Interpreting L3', 'BSL Level 6', 'Health & Safety', 'Legal Expertise'].map(q => (
                      <button 
                        key={q} 
                        type="button" 
                        onClick={() => toggleQualification(q)}
                        className={`px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${formData.qualifications.includes(q) ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Experience / Summary */}
            {step === 4 && (
              <div className="animate-in slide-in-from-right-12 fade-in duration-700 space-y-10">
                <div className="flex items-center gap-4 pb-6 border-b border-slate-50">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center shadow-inner">
                    <FileText size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Professional Summary</h2>
                    <p className="text-slate-400 text-sm font-medium">Finalize your application and tell us about your background.</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className={labelClasses}>Experience Briefing</label>
                    <textarea 
                      required
                      className={inputClasses + " min-h-[160px] leading-relaxed resize-none"} 
                      value={formData.experienceSummary} 
                      onChange={e => handleUpdate('experienceSummary', e.target.value)} 
                      placeholder="Tell us about your years of experience, specialized sectors (e.g. Legal, Medical), and any notable high-profile assignments..."
                    />
                  </div>

                  <div className="space-y-6">
                    <label className={labelClasses}>Upload Your Curriculum Vitae (CV)</label>
                    <div className={`p-8 border-2 border-dashed rounded-[2.5rem] transition-all group relative ${isUploadingCV ? 'bg-slate-50 border-blue-200 cursor-wait' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-blue-400'}`}>
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.docx"
                        required
                        disabled={isUploadingCV}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-wait"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsUploadingCV(true);
                            try {
                              const path = `applications/${Date.now()}_${file.name}`;
                              const url = await StorageService.uploadFile(file, path);
                              handleUpdate('cvUrl', url);
                              showToast("CV uploaded successfully", "success");
                            } catch (error) {
                              showToast("Failed to upload CV. Please try again.", "error");
                            } finally {
                              setIsUploadingCV(false);
                            }
                          }
                        }}
                      />
                      <div className="text-center flex flex-col items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${formData.cvUrl ? 'bg-emerald-100 text-emerald-600' : isUploadingCV ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-white text-slate-300 shadow-sm border border-slate-100'}`}>
                          {isUploadingCV ? (
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : formData.cvUrl ? (
                            <FileText size={32} />
                          ) : (
                            <ArrowRight size={32} className="rotate-[-45deg]" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            {isUploadingCV ? 'Uploading CV...' : formData.cvUrl ? 'CV Attached Successfully' : 'Drop your CV here or click to browse'}
                          </p>
                          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">
                            {isUploadingCV ? 'Please wait a moment' : 'PDF, DOC, or DOCX (Required)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-10 rounded-[2.5rem] text-white shadow-2xl shadow-slate-900/30 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 -mr-16 -mt-16 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors duration-1000"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <ShieldCheck className="text-blue-400" size={20} />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Application Statement</h4>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed mb-8 italic">
                        By submitting this application, I confirm that all provided information is accurate and that I am legally permitted to work in the United Kingdom as a self-employed professional. I understand that my details will be stored and processed in accordance with GDPR for the purpose of recruitment and potential assignment offers.
                      </p>
                      <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10">
                        <div>
                          <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2">Applicant</span>
                          <span className="text-sm font-bold text-white truncate">{formData.name || '---'}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2">Email</span>
                          <span className="text-sm font-bold text-white truncate">{formData.email || '---'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            <div className="mt-16 pt-10 border-t border-slate-100 flex items-center justify-between">
              {step > 1 ? (
                <button type="button" onClick={prevStep} className="flex items-center gap-3 text-xs font-black text-slate-400 hover:text-slate-700 transition-colors px-6 py-4">
                  <ChevronLeft size={20} /> 
                  <span className="uppercase tracking-widest">Back</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-4">
                {step < 4 ? (
                  <Button 
                    type="button" 
                    onClick={nextStep}
                    disabled={
                      (step === 1 && (!formData.name || !formData.email || !formData.phone)) || 
                      (step === 2 && formData.languageProficiencies.length < 2) ||
                      (step === 4 && (!formData.cvUrl || isUploadingCV))
                    }
                    className="px-10 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all hover:scale-[1.02] disabled:opacity-30 disabled:scale-100"
                    icon={ChevronRight}
                    iconPosition="right"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    isLoading={isSubmitting}
                    disabled={isUploadingCV}
                    className="px-12 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-slate-900/40 hover:bg-black transition-all hover:scale-[1.05] disabled:opacity-30 disabled:scale-100"
                    icon={Check}
                  >
                    Finalize & Submit
                  </Button>
                )}
              </div>
            </div>

          </form>
          </div>
        </div>
      </div>

        <div className="mt-12 text-center lg:pl-[33.333%]">
          <p className="text-slate-400 text-xs font-medium">Already have an account? <Link to="/login" className="text-blue-600 font-bold hover:underline">Partner Login</Link></p>
        </div>
      </div>
    </div>
  );
};