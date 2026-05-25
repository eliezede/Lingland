import React, { useState, useEffect } from 'react';
import { BookingService, ClientService, InterpreterService, StorageService, UserService } from '../../services/api';
import { ServiceType, Booking, Client, UserRole } from '../../types';
import {
  Globe2, CheckCircle2, ArrowRight, FileText, ShieldCheck,
  BadgeCheck, Clock, CreditCard, MapPin, Video, Calendar, User,
  Building2, Mail, Phone, ChevronRight, X, Loader2, MessageSquare,
  HelpCircle, Info, AlertTriangle, Stethoscope, ArrowLeftRight
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { InfoCard } from '../../components/ui/InfoCard';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';

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

export const GuestBookingRequest = () => {
  const [helpModal, setHelpModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode } | null>(null);
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [createdClient, setCreatedClient] = useState<Client | null>(null);

  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, url: string }[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const newUploadedFiles = [...uploadedFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const path = `bookings/guests/temp/${Date.now()}_${file.name}`;
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

  const [formData, setFormData] = useState({
    costCode: '',
    requiresCostCode: 'YES' as 'YES' | 'NO',
    name: '',
    organisation: '',
    email: '',
    phone: '',
    billingEmail: '',
    patientName: '',
    professionalName: '',
    languageFrom: 'English',
    languageTo: '',
    date: '',
    startTime: '',
    durationMinutes: 60,
    serviceType: ServiceType.FACE_TO_FACE,
    locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
    address: '',
    postcode: '',
    onlineLink: '',
    notes: '',
    genderPreference: 'None',
    agreedToTerms: false,
    // Translation fields
    translationFormat: 'Email (PDF)',
    translationFormatOther: '',
    quoteRequested: false,
    deliveryEmail: '',
    gdprConsent: false
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

    const serviceParam = searchParams.get('service');
    if (serviceParam === 'translation') {
      setFormData(prev => ({ ...prev, serviceType: ServiceType.TRANSLATION }));
    }

    window.scrollTo(0, 0);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.languageTo) {
      showToast('Please select a target language', 'error');
      return;
    }
    setLoading(true);
    try {
      const baseBookingData = {
        guestContact: {
          name: formData.name,
          organisation: formData.organisation,
          email: formData.email,
          phone: formData.phone,
          billingEmail: formData.billingEmail || formData.email,
          patientName: formData.patientName,
          professionalName: formData.professionalName
        },
        date: formData.date,
        languageFrom: formData.languageFrom,
        languageTo: formData.languageTo,
        serviceType: formData.serviceType,
        costCode: formData.requiresCostCode === 'YES' ? formData.costCode : 'NOT_APPLICABLE',
        notes: formData.notes,
        gdprConsent: formData.gdprConsent,
        agreedToTerms: formData.agreedToTerms,
        professionalName: formData.professionalName,
        patientName: formData.patientName
      };

      let finalBookingData = {};

      if (isTranslation) {
        if (uploadedFiles.length === 0) {
          showToast('Please upload at least one document for translation', 'error');
          setLoading(false);
          return;
        }

        finalBookingData = {
          ...baseBookingData,
          translationFormat: formData.translationFormat,
          translationFormatOther: formData.translationFormatOther,
          quoteRequested: formData.quoteRequested,
          deliveryEmail: formData.deliveryEmail || formData.email,
          sourceFiles: uploadedFiles
        };
      } else {
        finalBookingData = {
          ...baseBookingData,
          startTime: formData.startTime,
          durationMinutes: Number(formData.durationMinutes),
          locationType: formData.locationType,
          address: formData.address,
          postcode: formData.postcode,
          onlineLink: formData.onlineLink,
          genderPreference: formData.genderPreference
        };
      }

      const booking = await BookingService.createGuestBooking(finalBookingData);

      setCreatedBooking(booking);
      setStep('SUCCESS');
    } catch (err) {
      console.error(err);
      showToast('Failed to submit request. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!createdBooking?.guestContact) return;
    setLoading(true);
    try {
      const cleanEmail = createdBooking.guestContact.email.trim().toLowerCase();
      const linkedClient = createdBooking.clientId ? await ClientService.getById(createdBooking.clientId) : undefined;
      const client = linkedClient || await ClientService.createClientFromGuest({
        ...createdBooking.guestContact,
        email: cleanEmail
      });

      await BookingService.linkClientToBooking(createdBooking.id, client.id);

      const existingUser = await UserService.getByEmail(cleanEmail);
      if (existingUser) {
        if (existingUser.status === 'SUSPENDED') {
          throw new Error('This email is linked to a suspended account.');
        }

        if (!existingUser.profileId || existingUser.profileId !== client.id) {
          await UserService.update(existingUser.id, { profileId: client.id });
        }

        if (existingUser.status !== 'ACTIVE') {
          await UserService.sendActivationInvite(cleanEmail, existingUser.displayName || client.contactPerson);
          showToast('Account linked. Activation email sent.', 'success');
        } else {
          showToast('Booking linked to your existing account.', 'success');
        }
      } else {
        await UserService.create({
          displayName: client.contactPerson || createdBooking.guestContact.name,
          email: cleanEmail,
          role: UserRole.CLIENT,
          status: 'IMPORTED',
          profileId: client.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        await UserService.sendActivationInvite(cleanEmail, client.contactPerson || createdBooking.guestContact.name);
        showToast('Account created. Activation email sent.', 'success');
      }

      setCreatedClient(client);
    } catch (e) {
      console.error(e);
      showToast('Failed to create profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'SUCCESS' && createdBooking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
          <div className="bg-green-50 p-8 text-center border-b border-green-100">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Booking Received!</h2>
            <p className="text-slate-600">
              Reference: <span className="font-mono font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 ml-1">{createdBooking.bookingRef}</span>
            </p>
          </div>

          <div className="p-8">
            <p className="text-center text-slate-500 text-sm mb-8">
              We've sent a confirmation to <strong>{formData.email}</strong>.<br />
              Our team will review your request shortly.
            </p>

            {!createdClient ? (
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
                <h3 className="font-bold text-lg mb-1 relative z-10">Use Lingland often?</h3>
                <p className="text-blue-100 text-sm mb-4 relative z-10">
                  Create a secure account instantly to manage bookings, view invoices, and track spending.
                </p>
                <button
                  onClick={handleCreateClient}
                  disabled={loading}
                  className="w-full bg-white text-blue-600 font-bold py-3 rounded-lg shadow-sm hover:bg-blue-50 transition-colors relative z-10 flex items-center justify-center"
                >
                  {loading ? 'Creating...' : 'Create Account from Booking'} <ArrowRight size={16} className="ml-2" />
                </button>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center animate-fade-in">
                <BadgeCheck size={32} className="text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-emerald-900">Account Created!</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  We sent an activation email to <strong>{createdClient.email}</strong>
                </p>
              </div>
            )}

            <div className="mt-8 text-center">
              <Link to="/" className="text-slate-400 hover:text-slate-600 text-sm font-bold flex items-center justify-center transition-colors">
                <ChevronRight size={14} className="rotate-180 mr-1" /> Back to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Globe2 size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tight">Lingland</span>
          </Link>
          <div className="text-sm font-medium text-slate-500 hidden sm:block">
            Need help? <a href="tel:01489576657" className="text-blue-600 font-bold hover:underline">01489 576657</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{isTranslation ? 'Request a Translation' : 'Book an Interpreter'}</h1>
              <p className="text-lg text-slate-500">{isTranslation ? 'Professional document translation by verified experts.' : 'Secure, professional language support in minutes.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-8 border-b border-slate-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center mr-4">
                    <Globe2 size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900">Requirement Type</h3>
                    <p className="text-xs text-slate-500">What kind of language support do you need?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button" 
                    onClick={() => setFormData({ 
                      ...formData, 
                      serviceType: ServiceType.FACE_TO_FACE,
                      languageFrom: 'English',
                      languageTo: ''
                    })}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      !isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <User size={20} className="mx-auto mb-2" />
                    <span className="font-bold text-sm uppercase tracking-wider">Interpreting</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({ 
                      ...formData, 
                      serviceType: ServiceType.TRANSLATION,
                      languageFrom: '',
                      languageTo: 'English'
                    })}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <FileText size={20} className="mx-auto mb-2" />
                    <span className="font-bold text-sm uppercase tracking-wider">Translation</span>
                  </button>
                </div>
              </div>

              <div className="p-8 border-b border-slate-100 bg-slate-50/30">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Booking Agent Details</h3>
                    <p className="text-xs text-slate-500">Who is making this booking?</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InputGroup label="Booking By" icon={User} required hint="Your full name">
                    <input type="text" required className={inputClasses} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </InputGroup>
                  <InputGroup label="Organisation / Department" icon={Building2} required hint="Example: NHS, Child Services, or Company Name">
                    <input type="text" required className={inputClasses} value={formData.organisation} onChange={e => setFormData({ ...formData, organisation: e.target.value })} />
                  </InputGroup>
                  <InputGroup label="Contact Email" icon={Mail} required hint="Allows multiple emails separated by commas">
                    <input type="text" required className={inputClasses} placeholder="e.g. name@org.com, admin@org.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </InputGroup>
                  <InputGroup label="Contact Phone Number" icon={Phone} required>
                    <input type="tel" required className={inputClasses} value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                  </InputGroup>
                </div>
              </div>

              <div className="p-8 border-b border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4">
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Billing Information</h3>
                      <p className="text-xs text-slate-500">Invoicing details and billing codes.</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setHelpModal({
                      isOpen: true,
                      title: "Billing Codes Guidance",
                      content: (
                        <div className="space-y-4 text-slate-600 text-sm">
                          <p>Please provide the <strong>Cost Code</strong>, <strong>ICS/AIS Number</strong>, <strong>PO Number</strong>, or any similar reference required for booking.</p>
                          <div className="flex items-start p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-sm">
                            <AlertTriangle size={18} className="mr-3 mt-0.5 shrink-0" />
                            <p>Missing references may result in delays in booking confirmation.</p>
                          </div>
                        </div>
                      )
                    })}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  >
                    <HelpCircle size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <InputGroup label="Invoicing Email (if different)" icon={Mail}>
                    <input type="email" placeholder={formData.email.split(',')[0].trim() || 'finance@organisation.com'} className={inputClasses} value={formData.billingEmail} onChange={e => setFormData({ ...formData, billingEmail: e.target.value })} />
                  </InputGroup>

                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700">Billing Code / Purchase Order Required?</label>
                    <div className="flex items-center space-x-6">
                       <label className="flex items-center cursor-pointer group">
                         <input 
                           type="radio" 
                           className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                           checked={formData.requiresCostCode === 'YES'} 
                           onChange={() => setFormData({...formData, requiresCostCode: 'YES'})} 
                         />
                         <span className="ml-2 text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Yes, I require a code</span>
                       </label>
                       <label className="flex items-center cursor-pointer group">
                         <input 
                           type="radio" 
                           className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                           checked={formData.requiresCostCode === 'NO'} 
                           onChange={() => setFormData({...formData, requiresCostCode: 'NO'})} 
                         />
                         <span className="ml-2 text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">No, not applicable</span>
                       </label>
                    </div>
                  </div>
                </div>

                {formData.requiresCostCode === 'YES' && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <InputGroup label="Enter Billing / PO Code" required>
                      <input
                        type="text"
                        required
                        placeholder="e.g. PO-2024-001, CC-HR-99, Mosaic..."
                        className={`${inputClasses} font-mono bg-slate-50 border-slate-300 focus:bg-white`}
                        value={formData.costCode}
                        onChange={e => setFormData({ ...formData, costCode: e.target.value })}
                      />
                    </InputGroup>
                  </div>
                )}
              </div>

              {!isTranslation && (
                <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Requirement Details</h3>
                      <p className="text-xs text-slate-500">Information about the end user and the professional involved.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    <InputGroup label="Client Name / Initials / Patient Number" icon={BadgeCheck} required hint="Essential for tracking service delivery">
                      <input type="text" required className={inputClasses} value={formData.patientName} onChange={e => setFormData({ ...formData, patientName: e.target.value })} />
                    </InputGroup>
                    <InputGroup label="Professional's Name" icon={Stethoscope} hint="Doctor / Solicitor / Caseworker required the interpreter">
                      <input type="text" className={inputClasses} value={formData.professionalName} onChange={e => setFormData({ ...formData, professionalName: e.target.value })} />
                    </InputGroup>
                  </div>
                </div>
              )}

              {isTranslation ? (
                <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Translation Requirements</h3>
                      <p className="text-xs text-slate-500">Document details and delivery preferences.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative group/langs">
                    <InputGroup label="Source Language" required hint="The language of your document">
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
                        <option value="">Select Language...</option>
                        {availableLanguages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
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

                    <InputGroup label="Target Language" required hint="Translate into this language">
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
                        <option value="">Select Language...</option>
                        {availableLanguages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </InputGroup>
                    
                    {/* Swap Button (Mobile) - Centered between stacked fields */}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <InputGroup label="Desired Format" icon={FileText} required>
                      <select 
                        className={inputClasses} 
                        required
                        value={formData.translationFormat}
                        onChange={e => setFormData({ ...formData, translationFormat: e.target.value })}
                      >
                        <option value="Email (PDF)">Email (PDF)</option>
                        <option value="Word Document">Word Document</option>
                        <option value="Certified Translation">Certified Translation</option>
                        <option value="Other">Other</option>
                      </select>
                    </InputGroup>
                    <InputGroup label="Delivery Date" icon={Calendar} required hint="Desired completion date">
                      <input type="date" required className={inputClasses} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    </InputGroup>
                  </div>

                  {formData.translationFormat === 'Other' && (
                    <InputGroup label="Please specify format" required>
                      <input type="text" required className={inputClasses} value={formData.translationFormatOther} onChange={e => setFormData({ ...formData, translationFormatOther: e.target.value })} />
                    </InputGroup>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <InputGroup label="Delivery Email (if different)" icon={Mail}>
                      <input type="email" placeholder={formData.email.split(',')[0].trim() || 'e.g. results@org.com'} className={inputClasses} value={formData.deliveryEmail} onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })} />
                    </InputGroup>
                    <InputGroup label="Rates Choice">
                      <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black text-blue-600 tracking-tighter uppercase">Rates Choice</span>
                          <button 
                            type="button"
                            onClick={() => setHelpModal({
                              isOpen: true,
                              title: "Standard Rates vs Quotes",
                              content: (
                                <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
                                  <p>Once our pre-approved standard rates option is chosen, we can begin processing your document for translation immediately upon receipt.</p>
                                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                    <p className="font-bold text-blue-900 border-b border-blue-200 pb-2 mb-2">Important Notice</p>
                                    <p className="italic">Even if “Standard Rates” is selected, if the document involves a rare language or complex format, we will <strong>ALWAYS</strong> seek your approval first.</p>
                                  </div>
                                  <p>Select <strong>“Quote First”</strong> if you require an exact cost in advance.</p>
                                </div>
                              )
                            })}
                            className="text-blue-500 hover:text-blue-700 p-0.5"
                          >
                            <Info size={14} />
                          </button>
                        </div>
                        <label className="flex items-center cursor-pointer">
                          <input type="radio" name="quote" className="mr-2 text-blue-600" checked={!formData.quoteRequested} onChange={() => setFormData({ ...formData, quoteRequested: false })} />
                          <span className="text-sm text-slate-700 font-medium tracking-tight">Standard Rates</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input type="radio" name="quote" className="mr-2 text-blue-600" checked={formData.quoteRequested} onChange={() => setFormData({ ...formData, quoteRequested: true })} />
                          <span className="text-sm text-slate-700 font-medium tracking-tight">Quote First</span>
                        </label>
                      </div>
                    </InputGroup>
                  </div>

                  <div className="p-8 bg-blue-50 border border-dashed border-blue-200 rounded-2xl text-center relative">
                    <input
                      type="file"
                      id="file-upload"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                    <FileText className="mx-auto text-blue-400 mb-3" size={32} />
                    <p className="text-sm font-bold text-blue-900 mb-1">Upload Source Documents</p>
                    <p className="text-[10px] text-blue-600 uppercase tracking-widest font-black mb-4">Drag & Drop or click to select</p>

                    <label
                      htmlFor="file-upload"
                      className={`inline-flex items-center px-6 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-colors shadow-sm cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {uploading ? (
                        <><Loader2 className="animate-spin mr-2" size={14} /> Uploading...</>
                      ) : (
                        'Select Files'
                      )}
                    </label>

                    {uploadedFiles.length > 0 && (
                      <div className="mt-6 text-left border-t border-blue-100 pt-4">
                        <p className="text-[10px] text-blue-400 uppercase font-black mb-2 px-1">Selected Files ({uploadedFiles.length})</p>
                        <div className="space-y-2">
                          {uploadedFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-blue-100 group shadow-sm">
                              <span className="text-[11px] font-medium text-slate-700 truncate max-w-[200px]">{file.name}</span>
                              <button type="button" onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500 p-1">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <InputGroup label="Translation Notes">
                    <textarea 
                      className={inputClasses + " h-32 resize-none"} 
                      placeholder="e.g. Please preserve the original layout or include a certified stamp..." 
                      value={formData.notes} 
                      onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                    />
                  </InputGroup>
                </div>
              ) : (
                <div className="space-y-0">
                  <div className="p-8 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-4">
                          <Calendar size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Session Details</h3>
                          <p className="text-xs text-slate-500">When and where do you need us?</p>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setHelpModal({
                          isOpen: true,
                          title: "Session Details Help",
                          content: (
                            <div className="space-y-4 text-slate-600 text-sm">
                              <p>Please provide the language, date, and time for your booking. For virtual bookings, kindly indicate your preferred communication method.</p>
                            </div>
                          )
                        })}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                      >
                        <HelpCircle size={20} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                      <InputGroup label="Language Requested" required hint="Specify dialect if necessary">
                        <select
                          required
                          disabled={loadingLangs}
                          className={inputClasses}
                          value={formData.languageTo}
                          onChange={e => setFormData({ ...formData, languageTo: e.target.value })}
                        >
                          <option value="">{loadingLangs ? 'Loading languages...' : 'Select Language...'}</option>
                          {availableLanguages.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                      </InputGroup>
                      <InputGroup label="Booking Date" icon={Calendar} required>
                        <input type="date" required className={inputClasses} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                      </InputGroup>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                      <InputGroup label="Start Time" icon={Clock} required>
                         <input type="time" required className={inputClasses} value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                      </InputGroup>
                      <InputGroup label="Expected Session Duration" required hint="Minimum 1 hour booking charge applies">
                        <select 
                          required 
                          className={inputClasses} 
                          value={formData.durationMinutes} 
                          onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                        >
                          <option value="60">1 Hour</option>
                          <option value="90">1.5 Hours</option>
                          <option value="120">2 Hours</option>
                          <option value="180">3 Hours</option>
                          <option value="240">4 Hours (Half Day)</option>
                          <option value="480">8 Hours (Full Day)</option>
                        </select>
                      </InputGroup>
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-bold text-slate-700 mb-3">Session Type</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.locationType === 'ONSITE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                          <input type="radio" value="ONSITE" checked={formData.locationType === 'ONSITE'} onChange={() => setFormData({ ...formData, locationType: 'ONSITE' })} className="hidden" />
                          <MapPin size={18} className="mr-2" />
                          <span className="font-bold text-xs">Face-to-Face</span>
                        </label>
                        <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.locationType === 'ONLINE' && formData.onlineLink !== 'PHONE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                          <input type="radio" value="ONLINE" checked={formData.locationType === 'ONLINE' && formData.onlineLink !== 'PHONE'} onChange={() => setFormData({ ...formData, locationType: 'ONLINE', onlineLink: formData.onlineLink === 'PHONE' ? '' : formData.onlineLink })} className="hidden" />
                          <Video size={18} className="mr-2" />
                          <span className="font-bold text-xs">Virtual (Teams/Zoom)</span>
                        </label>
                        <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.onlineLink === 'PHONE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                          <input type="radio" checked={formData.onlineLink === 'PHONE'} onChange={() => setFormData({ ...formData, locationType: 'ONLINE', onlineLink: 'PHONE' })} className="hidden" />
                          <Phone size={18} className="mr-2" />
                          <span className="font-bold text-xs">Phone</span>
                        </label>
                      </div>
                    </div>

                    {formData.locationType === 'ONSITE' ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 animate-in fade-in slide-in-from-top-4">
                        <div className="md:col-span-2">
                          <InputGroup label="Location Address" required>
                            <textarea required rows={2} className={inputClasses + " resize-none"} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                          </InputGroup>
                        </div>
                        <InputGroup label="Postcode" required>
                          <input type="text" required className={inputClasses} value={formData.postcode} onChange={e => setFormData({ ...formData, postcode: e.target.value })} />
                        </InputGroup>
                      </div>
                    ) : formData.onlineLink !== 'PHONE' && (
                      <div className="mt-6 animate-in fade-in slide-in-from-top-4">
                        <InputGroup label="Connection Link / Details" required hint="MS Teams Link, Zoom ID, or 'TBC'">
                          <input type="text" required className={inputClasses} value={formData.onlineLink} onChange={e => setFormData({ ...formData, onlineLink: e.target.value })} />
                        </InputGroup>
                      </div>
                    )}
                  </div>

                  <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                          <MessageSquare size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Bespoke Needs</h3>
                          <p className="text-xs text-slate-500">Gender preferences and special instructions.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                       <InputGroup label="Gender Preference" icon={User}>
                         <select className={inputClasses} value={formData.genderPreference} onChange={e => setFormData({...formData, genderPreference: e.target.value})}>
                           <option value="None">None</option>
                           <option value="Male">Male Only</option>
                           <option value="Female">Female Only</option>
                         </select>
                       </InputGroup>
                       <InputGroup label="Special Instructions">
                         <textarea className={inputClasses + " h-32 resize-none"} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="e.g. Arrive 15 mins before..." />
                       </InputGroup>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <label className="flex items-start mb-4 cursor-pointer group">
                  <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 group-hover:border-blue-500 transition-colors" checked={formData.agreedToTerms} onChange={e => setFormData({ ...formData, agreedToTerms: e.target.checked })} />
                  <div className="ml-3">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Service Policies</p>
                    <p className="text-sm text-slate-600 leading-snug">
                      I have read, understood, and agree to the <a href="/#/terms" target="_blank" className="font-bold text-blue-600 hover:underline">Terms and Conditions of Service</a>.
                    </p>
                  </div>
                </label>

                <label className="flex items-start mb-8 cursor-pointer p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-200 hover:bg-slate-50 transition-all group">
                  <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 group-hover:border-blue-500 transition-colors" checked={formData.gdprConsent} onChange={e => setFormData({ ...formData, gdprConsent: e.target.checked })} />
                  <div className="ml-3">
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Privacy & Data Consent</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      I consent to my data being collected and stored for order processing, in accordance with the <a href="https://gdpr-info.eu/" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">GDPR guidelines</a>.
                    </p>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading || availableLanguages.length === 0}
                  className="w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-xl shadow-xl shadow-slate-900/10 hover:bg-black hover:shadow-slate-900/20 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center disabled:opacity-70 disabled:hover:scale-100 disabled:active:scale-100"
                >
                  {loading ? (
                    <><Loader2 className="animate-spin mr-2" size={20} /> Processing...</>
                  ) : (
                    <><ArrowRight size={20} className="mr-2" /> Submit Booking Request</>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-6 hidden lg:block sticky top-28">
            <InfoCard title="Need Help?" icon={HelpCircle} variant="slate">
              <p className="font-bold text-slate-900">Expert support available.</p>
              <div className="space-y-2 mt-2">
                <a href="tel:01489576657" className="flex items-center text-blue-600 font-bold hover:underline">
                  <Phone size={14} className="mr-2" /> 01489 576657
                </a>
                <a href="mailto:info@lingland.net" className="flex items-center text-blue-600 font-bold hover:underline">
                  <Mail size={14} className="mr-2" /> info@lingland.net
                </a>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed font-medium text-slate-500">Our team is ready to help you complete this request quickly and accurately.</p>
            </InfoCard>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 relative overflow-hidden group hover:shadow-lg transition-all">
              <div className="absolute top-0 right-0 p-3 text-slate-100 group-hover:text-blue-50 transition-colors pointer-events-none">
                <Globe2 size={48} />
              </div>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Trusted Partner</p>
              <blockquote className="text-slate-600 text-sm italic mb-4 relative z-10">
                "The interface is so much cleaner now. Making a translation request takes less than a minute."
              </blockquote>
              <div className="flex items-center relative z-10">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs mr-3">LT</div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Linda Thompson</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">HR Director</p>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-900 rounded-2x p-1 shadow-2xl">
              <div className="bg-slate-800 rounded-xl p-4 text-white">
                <p className="text-xs font-bold mb-1 flex items-center">
                  <ShieldCheck size={14} className="mr-2 text-emerald-400" /> Secure Processing
                </p>
                <p className="text-[10px] text-slate-400">All data encrypted and GDPR compliant.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

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
