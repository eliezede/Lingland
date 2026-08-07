import React, { useState, useEffect } from 'react';
import { BookingService, InterpreterService, StorageService } from '../../services/api';
import type { GuestRequesterContextResult } from '../../services/bookingService';
import { ServiceType, Booking } from '../../types';
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
import { PublicSessionService } from '../../services/publicSessionService';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { LANGUAGES } from '../../constants/languages';

const InputGroup = ({ label, icon: Icon, required = false, hint, children }: any) => {
  const generatedId = React.useId();
  const isDirectControl = React.isValidElement(children)
    && typeof children.type === 'string'
    && ['input', 'select', 'textarea'].includes(children.type);
  const childProps = isDirectControl
    ? (children as React.ReactElement<Record<string, any>>).props
    : null;
  const controlId = childProps?.id || generatedId;
  const hintId = `${controlId}-hint`;
  const control = isDirectControl
    ? React.cloneElement(children as React.ReactElement<Record<string, any>>, {
      id: controlId,
      'aria-label': childProps?.['aria-label'] || label,
      'aria-describedby': hint
        ? [childProps?.['aria-describedby'], hintId].filter(Boolean).join(' ')
        : childProps?.['aria-describedby'],
    })
    : children;

  return (
    <div className="mb-5 min-w-0">
      <label htmlFor={isDirectControl ? controlId : undefined} className="mb-2 flex items-center text-sm font-bold text-slate-700">
        {Icon && <Icon size={16} className="mr-2 text-slate-400" />}
        {label} {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="mt-1.5 text-[10px] font-black uppercase text-slate-400">{hint}</p>}
    </div>
  );
};

const inputClasses = "w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400 hover:border-blue-200";
const isValidRequesterEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(value.trim().toLowerCase());

export const GuestBookingRequest = () => {
  const [helpModal, setHelpModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode } | null>(null);
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get('embed') === '1';
  const embedOption = (name: string, fallback: boolean) => {
    const value = searchParams.get(name);
    if (value === null) return fallback;
    return value === '1' || value.toLowerCase() === 'true';
  };
  const showEmbedBranding = embedOption('brand', false);
  const showEmbedIntro = embedOption('intro', true);
  const showEmbedHelp = embedOption('help', false);
  const compactEmbedLayout = embedOption('compact', true);
  const transparentEmbedBackground = embedOption('transparent', true);
  const requestedService = searchParams.get('service')?.toLowerCase() || '';
  const lockEmbeddedService = isEmbedded
    && embedOption('lockService', false)
    && ['interpreting', 'translation'].includes(requestedService);
  const embedSourceTag = (searchParams.get('source') || (isEmbedded ? 'embed' : 'direct'))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || (isEmbedded ? 'embed' : 'direct');
  const { showToast } = useToast();
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  const [currentFormStep, setCurrentFormStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [requesterLookupState, setRequesterLookupState] = useState<'IDLE' | 'CHECKING' | 'MATCHED' | 'NO_MATCH' | 'AMBIGUOUS' | 'ERROR'>('IDLE');
  const [requesterContext, setRequesterContext] = useState<GuestRequesterContextResult | null>(null);
  const [selectedRequesterClientId, setSelectedRequesterClientId] = useState('');
  const [requesterDepartmentMode, setRequesterDepartmentMode] = useState<'' | 'EXISTING' | 'ORGANISATION_WIDE' | 'NEW'>('');
  const [selectedRequesterDepartmentId, setSelectedRequesterDepartmentId] = useState('');
  const [proposedRequesterDepartmentName, setProposedRequesterDepartmentName] = useState('');

  const [availableLanguages, setAvailableLanguages] = useState<string[]>(LANGUAGES);
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
        const uid = await PublicSessionService.ensure();
        const path = `bookings/guests/${uid}/${crypto.randomUUID()}_${file.name}`;
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
    department: '',
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

  const updateFormField = <Key extends keyof typeof formData>(
    field: Key,
    value: (typeof formData)[Key],
  ) => {
    setFormData(previous => ({ ...previous, [field]: value }));
  };

  const isTranslation = formData.serviceType === ServiceType.TRANSLATION;
  const formSteps = isTranslation
    ? ['Requester', 'Translation details', 'Review & send']
    : ['Requester', 'Requirement', 'Session', 'Review & send'];
  const compactFormStepLabel = (label: string) => {
    if (label === 'Translation details' || label === 'Requirement') return 'Details';
    if (label === 'Review & send') return 'Review';
    return label;
  };
  const totalFormSteps = formSteps.length;
  const currentFormStepLabel = formSteps[currentFormStep - 1];
  const formProgress = Math.round((currentFormStep / totalFormSteps) * 100);
  const requestDateLabel = formData.date
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${formData.date}T12:00:00`))
    : 'Not selected';
  const requesterDepartmentLabel = requesterDepartmentMode === 'NEW'
    ? proposedRequesterDepartmentName.trim()
    : requesterDepartmentMode === 'ORGANISATION_WIDE'
      ? 'Organisation-wide'
      : formData.department || 'Not selected';
  const languageLabel = isTranslation
    ? `${formData.languageFrom || 'Source language'} to ${formData.languageTo || 'target language'}`
    : formData.languageTo ? `English to ${formData.languageTo}` : 'Language not selected';
  const deliveryLabel = isTranslation
    ? `${requestDateLabel} | ${formData.translationFormat}`
    : `${requestDateLabel}${formData.startTime ? ` at ${formData.startTime}` : ''} | ${formData.durationMinutes} min`;
  const locationLabel = isTranslation
    ? `${uploadedFiles.length} document${uploadedFiles.length === 1 ? '' : 's'} attached`
    : formData.onlineLink === 'PHONE'
      ? 'Phone'
      : formData.locationType === 'ONLINE' ? 'Virtual' : formData.postcode || 'Face-to-face';
  const selectedRequesterOrganization = requesterContext?.organizations.find(
    organization => organization.id === selectedRequesterClientId,
  ) || null;

  const goToFormStep = (nextStep: number) => {
    setCurrentFormStep(Math.min(Math.max(nextStep, 1), totalFormSteps));
    window.requestAnimationFrame(() => {
      document.getElementById('booking-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const resetRequesterSelection = () => {
    setRequesterContext(null);
    setSelectedRequesterClientId('');
    setRequesterDepartmentMode('');
    setSelectedRequesterDepartmentId('');
    setProposedRequesterDepartmentName('');
  };

  const handleRequesterEmailChange = (email: string) => {
    const previouslyMatched = requesterLookupState === 'MATCHED';
    resetRequesterSelection();
    setRequesterLookupState('IDLE');
    setFormData(previous => ({
      ...previous,
      email,
      ...(previouslyMatched ? { organisation: '', department: '' } : {}),
    }));
  };

  const selectRequesterOrganization = (
    clientId: string,
    contextResult = requesterContext,
  ) => {
    const organization = contextResult?.organizations.find(item => item.id === clientId);
    setSelectedRequesterClientId(clientId);
    setRequesterDepartmentMode('');
    setSelectedRequesterDepartmentId('');
    setProposedRequesterDepartmentName('');
    setFormData(previous => ({
      ...previous,
      organisation: organization?.name || '',
      department: '',
    }));
  };

  const selectRequesterDepartment = (value: string) => {
    if (value === '__NEW__') {
      setRequesterDepartmentMode('NEW');
      setSelectedRequesterDepartmentId('');
      setFormData(previous => ({ ...previous, department: '' }));
      return;
    }
    if (value === '__ORGANISATION_WIDE__') {
      setRequesterDepartmentMode('ORGANISATION_WIDE');
      setSelectedRequesterDepartmentId('');
      setProposedRequesterDepartmentName('');
      setFormData(previous => ({ ...previous, department: '' }));
      return;
    }
    const department = selectedRequesterOrganization?.departments.find(item => item.id === value);
    setRequesterDepartmentMode(value ? 'EXISTING' : '');
    setSelectedRequesterDepartmentId(value);
    setProposedRequesterDepartmentName('');
    setFormData(previous => ({ ...previous, department: department?.name || '' }));
  };

  useEffect(() => {
    const fetchLangs = async () => {
      try {
        await PublicSessionService.ensure();
        const publicLanguages = await InterpreterService.getPublicLanguages();
        const uniqueLangs = Array.from(new Set([...LANGUAGES, ...publicLanguages])).sort();
        setAvailableLanguages(uniqueLangs);
      } catch {
        setAvailableLanguages(LANGUAGES);
      } finally {
        setLoadingLangs(false);
      }
    };
    fetchLangs();

    const serviceParam = searchParams.get('service')?.toLowerCase();
    if (serviceParam === 'translation') {
      setFormData(prev => ({ ...prev, serviceType: ServiceType.TRANSLATION }));
    } else if (serviceParam === 'interpreting') {
      setFormData(prev => ({ ...prev, serviceType: ServiceType.FACE_TO_FACE, languageFrom: 'English' }));
    }

    window.scrollTo(0, 0);
  }, [searchParams]);

  useEffect(() => {
    if (!isEmbedded || window.parent === window) return;

    const publishHeight = () => {
      window.parent.postMessage({
        type: 'LINGLAND_REQUEST_FORM_RESIZE',
        height: Math.ceil(document.documentElement.scrollHeight),
        formStep: currentFormStep,
        state: step,
      }, '*');
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(document.documentElement);
    window.addEventListener('load', publishHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('load', publishHeight);
    };
  }, [currentFormStep, isEmbedded, step]);

  useEffect(() => {
    if (!isEmbedded || !transparentEmbedBackground) return;
    const htmlBackground = document.documentElement.style.backgroundColor;
    const bodyBackground = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.documentElement.style.backgroundColor = htmlBackground;
      document.body.style.backgroundColor = bodyBackground;
    };
  }, [isEmbedded, transparentEmbedBackground]);

  useEffect(() => {
    const email = formData.email.trim().toLowerCase();
    if (!isValidRequesterEmail(email)) return;
    let cancelled = false;
    setRequesterLookupState('CHECKING');
    const timer = window.setTimeout(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (cancelled) return;
        try {
          const result = await BookingService.lookupGuestRequesterContext(email);
          if (cancelled) return;
          setRequesterContext(result.status === 'MATCHED' ? result : null);
          setRequesterLookupState(result.status);
          if (result.status === 'MATCHED') {
            const onlyOrganization = result.organizations.length === 1 ? result.organizations[0] : null;
            const onlyDepartment = onlyOrganization?.departments.length === 1
              ? onlyOrganization.departments[0]
              : null;
            setSelectedRequesterClientId(onlyOrganization?.id || '');
            setRequesterDepartmentMode(onlyDepartment ? 'EXISTING' : '');
            setSelectedRequesterDepartmentId(onlyDepartment?.id || '');
            setProposedRequesterDepartmentName('');
            setFormData(previous => ({
              ...previous,
              organisation: onlyOrganization?.name || '',
              department: onlyDepartment?.name || '',
            }));
          }
          return;
        } catch (lookupError) {
          if (cancelled) return;
          if (attempt === 0) {
            await new Promise(resolve => window.setTimeout(resolve, 1_000));
            continue;
          }
          console.error('Failed to identify guest requester', lookupError);
          setRequesterContext(null);
          setRequesterLookupState('ERROR');
        }
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [formData.email]);

  const rejectStep = (message: string) => {
    showToast(message, 'error');
    return false;
  };

  const validateFormStep = (stepNumber: number) => {
    if (stepNumber === 1) {
      if (!isValidRequesterEmail(formData.email)) return rejectStep('Enter a valid contact email.');
      if (['IDLE', 'CHECKING'].includes(requesterLookupState)) return rejectStep('Wait for the requester check to finish.');
      if (!formData.name.trim()) return rejectStep('Enter the name of the person making the booking.');
      if (!formData.phone.trim()) return rejectStep('Enter a contact phone number.');
      if (requesterLookupState === 'MATCHED') {
        if (!requesterContext?.contextToken || !selectedRequesterClientId) return rejectStep('Select the organisation making this request.');
        if (!requesterDepartmentMode) return rejectStep('Select a department option for this request.');
        if (requesterDepartmentMode === 'EXISTING' && !selectedRequesterDepartmentId) return rejectStep('Select the department making this request.');
        if (requesterDepartmentMode === 'NEW' && proposedRequesterDepartmentName.trim().length < 2) return rejectStep('Enter the new department name.');
      } else if (!formData.organisation.trim()) {
        return rejectStep('Enter the organisation making this request.');
      }
    }

    if (stepNumber === 2 && isTranslation) {
      if (!formData.languageFrom || !formData.languageTo) return rejectStep('Select the source and target languages.');
      if (!formData.date) return rejectStep('Select the requested delivery date.');
      if (formData.translationFormat === 'Other' && !formData.translationFormatOther.trim()) return rejectStep('Specify the required document format.');
      if (uploading) return rejectStep('Wait for the document upload to finish.');
      if (uploadedFiles.length === 0) return rejectStep('Upload at least one document for translation.');
    }

    if (stepNumber === 2 && !isTranslation && !formData.patientName.trim()) {
      return rejectStep('Enter the client name, initials or patient number.');
    }

    if (stepNumber === 3 && !isTranslation) {
      if (!formData.languageTo) return rejectStep('Select the requested language.');
      if (!formData.date) return rejectStep('Select the booking date.');
      if (!formData.startTime) return rejectStep('Select the session start time.');
      if (formData.locationType === 'ONSITE' && (!formData.address.trim() || !formData.postcode.trim())) {
        return rejectStep('Enter the full location and postcode.');
      }
      if (formData.locationType === 'ONLINE' && formData.onlineLink !== 'PHONE' && !formData.onlineLink.trim()) {
        return rejectStep('Enter the connection details or use TBC.');
      }
    }

    if (stepNumber === totalFormSteps && formData.requiresCostCode === 'YES' && !formData.costCode.trim()) {
      return rejectStep('Enter the billing or purchase order code.');
    }

    return true;
  };

  const handleContinue = () => {
    if (!validateFormStep(currentFormStep)) return;
    goToFormStep(currentFormStep + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (let stepNumber = 1; stepNumber <= totalFormSteps; stepNumber += 1) {
      if (!validateFormStep(stepNumber)) {
        goToFormStep(stepNumber);
        return;
      }
    }
    if (!formData.agreedToTerms || !formData.gdprConsent) return rejectStep('Accept the service terms and privacy consent before sending.');
    setLoading(true);
    try {
      const baseBookingData = {
        guestContact: {
          name: formData.name,
          organisation: formData.organisation,
          department: requesterDepartmentMode === 'NEW'
            ? proposedRequesterDepartmentName.trim()
            : selectedRequesterOrganization?.departments.find(department => department.id === selectedRequesterDepartmentId)?.name
              || formData.department,
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
        patientName: formData.patientName,
        requesterContext: requesterLookupState === 'MATCHED' && requesterContext?.contextToken
          ? {
            contextToken: requesterContext.contextToken,
            clientId: selectedRequesterClientId,
            departmentId: requesterDepartmentMode === 'EXISTING' ? selectedRequesterDepartmentId : '',
            proposedDepartmentName: requesterDepartmentMode === 'NEW' ? proposedRequesterDepartmentName.trim() : '',
          }
          : undefined,
        publicIntakeContext: {
          channel: isEmbedded ? 'EMBED' : 'DIRECT',
          sourceTag: embedSourceTag,
          referrerHost: (() => {
            try {
              return document.referrer ? new URL(document.referrer).hostname : '';
            } catch {
              return '';
            }
          })(),
        },
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
      const message = err instanceof Error && err.message
        ? err.message.replace(/^Firebase:\s*/i, '').replace(/^\[[^\]]+\]\s*/, '')
        : 'Failed to submit request. Please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'SUCCESS' && createdBooking) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isEmbedded && transparentEmbedBackground ? 'bg-transparent' : 'bg-slate-50'}`}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
          <div className="bg-green-50 p-8 text-center border-b border-green-100">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="mb-2 text-2xl font-black text-slate-900">Booking Received!</h2>
            <p className="text-slate-600">
              Reference: <span className="font-mono font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 ml-1">{createdBooking.bookingRef}</span>
            </p>
          </div>

          <div className="p-8">
            <p className="text-center text-slate-500 text-sm mb-8">
              Your request was recorded for <strong>{formData.email}</strong>.<br />
              Our team will review it shortly.
            </p>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
              <BadgeCheck size={28} className="mx-auto mb-2 text-blue-600" />
              <h3 className="font-bold text-blue-950">Request safely recorded</h3>
              <p className="mt-1 text-sm text-blue-800">
                Portal access is activated by Lingland staff after the organisation and booking contact are verified.
              </p>
            </div>

            {!isEmbedded && <div className="mt-8 text-center">
              <Link to="/" className="text-slate-400 hover:text-slate-600 text-sm font-bold flex items-center justify-center transition-colors">
                <ChevronRight size={14} className="rotate-180 mr-1" /> Back to Homepage
              </Link>
            </div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans ${isEmbedded && transparentEmbedBackground ? 'bg-transparent' : 'bg-slate-50'} ${isEmbedded && compactEmbedLayout ? 'request-form-compact' : ''}`}>
      {!isEmbedded && <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="group flex items-center">
            <BrandLogo variant="wordmark" size="sm" className="max-w-[190px] transition-transform group-hover:scale-[1.02] sm:max-w-[220px]" />
          </Link>
          <div className="text-sm font-medium text-slate-500 hidden sm:block">
            Need help? <a href="tel:01489576657" className="text-blue-600 font-bold hover:underline">01489 576657</a>
          </div>
        </div>
      </header>}

      {isEmbedded && showEmbedBranding && (
        <div className="mx-auto flex max-w-5xl items-center border-b border-slate-200 bg-white px-4 py-3">
          <BrandLogo variant="wordmark" size="sm" className="max-w-[210px]" />
        </div>
      )}

      <main className={`mx-auto px-4 lg:px-8 ${isEmbedded ? 'max-w-5xl py-3 sm:py-5' : 'max-w-7xl py-8 md:py-12'}`}>
        <div className={`grid grid-cols-1 items-start ${!isEmbedded || showEmbedHelp ? 'gap-8 lg:grid-cols-3 lg:gap-12' : ''}`}>
          <div className={`min-w-0 ${isEmbedded && compactEmbedLayout ? 'space-y-4' : 'space-y-8'} ${!isEmbedded || showEmbedHelp ? 'lg:col-span-2' : ''}`}>
            {(!isEmbedded || showEmbedIntro) && <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl md:text-4xl">{isTranslation ? 'Request a Translation' : 'Book an Interpreter'}</h1>
              <p className="text-lg text-slate-500">{isTranslation ? 'Professional document translation by verified experts.' : 'Secure, professional language support in minutes.'}</p>
            </div>}

            <form id="booking-request-form" onSubmit={handleSubmit} className="scroll-mt-24 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="request-form-step-header border-b border-slate-200 bg-white px-6 py-5 md:px-8">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-blue-600">Step {currentFormStep} of {totalFormSteps}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{currentFormStepLabel}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-500">{formProgress}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label="Booking request progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={formProgress}
                >
                  <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${formProgress}%` }} />
                </div>
                <ol className={`mt-4 grid gap-2 text-xs font-medium text-slate-500 ${isTranslation ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {formSteps.map((label, index) => (
                    <li key={label} className={`min-w-0 text-center sm:text-left ${index + 1 === currentFormStep ? 'font-bold text-blue-700' : index + 1 < currentFormStep ? 'text-emerald-700' : ''}`}>
                      <span className="sm:hidden">{compactFormStepLabel(label)}</span>
                      <span className="hidden sm:inline">{index + 1 < currentFormStep ? 'Done: ' : ''}{label}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {currentFormStep === 1 && (
                <>
              <div className="request-form-section border-b border-slate-100 p-5 sm:p-8">
                {lockEmbeddedService ? (
                  <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-blue-950">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-blue-600">
                      {isTranslation ? <FileText size={18} /> : <User size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{isTranslation ? 'Translation request' : 'Interpreting request'}</p>
                      <p className="text-xs text-blue-700">This form is configured for {isTranslation ? 'translation' : 'interpreting'} services.</p>
                    </div>
                  </div>
                ) : <>
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
                    onClick={() => setFormData(previous => ({
                      ...previous,
                      serviceType: ServiceType.FACE_TO_FACE,
                      languageFrom: 'English',
                      languageTo: ''
                    }))}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      !isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <User size={20} className="mx-auto mb-2" />
                    <span className="text-sm font-bold uppercase">Interpreting</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormData(previous => ({
                      ...previous,
                      serviceType: ServiceType.TRANSLATION,
                      languageFrom: '',
                      languageTo: 'English'
                    }))}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      isTranslation ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <FileText size={20} className="mx-auto mb-2" />
                    <span className="text-sm font-bold uppercase">Translation</span>
                  </button>
                </div>
                </>}
              </div>

              <div className="request-form-section border-b border-slate-100 bg-slate-50/30 p-5 sm:p-8">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Booking Agent Details</h3>
                    <p className="text-xs text-slate-500">Who is making this booking?</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <InputGroup label="Contact Email" icon={Mail} required hint="Use the email normally used to place requests">
                      <div className="relative">
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          aria-label="Contact email"
                          className={`${inputClasses} pr-11`}
                          placeholder="name@organisation.com"
                          value={formData.email}
                          onChange={event => handleRequesterEmailChange(event.target.value)}
                        />
                        {requesterLookupState === 'CHECKING' && <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-600" />}
                        {requesterLookupState === 'MATCHED' && <CheckCircle2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600" />}
                      </div>
                    </InputGroup>
                    {requesterLookupState === 'CHECKING' && (
                      <p className="-mt-3 mb-5 text-xs text-slate-500" aria-live="polite">Checking saved requester details...</p>
                    )}
                    {requesterLookupState === 'MATCHED' && (
                      <div className="mb-5 flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        <BadgeCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                        <div>
                          <p className="font-bold">Existing requester details found</p>
                          <p className="mt-0.5 text-xs text-emerald-800">Confirm the organisation and department for this request.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <InputGroup label="Booking By" icon={User} required hint="Your full name">
                    <input type="text" required autoComplete="name" className={inputClasses} value={formData.name} onChange={event => updateFormField('name', event.currentTarget.value)} />
                  </InputGroup>
                  <InputGroup label="Contact Phone Number" icon={Phone} required>
                    <input type="tel" required autoComplete="tel" className={inputClasses} value={formData.phone} onChange={event => updateFormField('phone', event.currentTarget.value)} />
                  </InputGroup>

                  {requesterLookupState === 'MATCHED' && requesterContext ? (
                    <>
                      <InputGroup label="Organisation" icon={Building2} required>
                        <select aria-label="Requester organisation" required className={inputClasses} value={selectedRequesterClientId} onChange={event => selectRequesterOrganization(event.target.value)}>
                          <option value="">Select organisation...</option>
                          {requesterContext.organizations.map(organization => (
                            <option key={organization.id} value={organization.id}>{organization.name}</option>
                          ))}
                        </select>
                      </InputGroup>
                      <InputGroup label="Department" icon={Building2} required>
                        <select
                          aria-label="Requester department"
                          required
                          disabled={!selectedRequesterOrganization}
                          className={inputClasses}
                          value={requesterDepartmentMode === 'EXISTING'
                            ? selectedRequesterDepartmentId
                            : requesterDepartmentMode === 'NEW' ? '__NEW__'
                              : requesterDepartmentMode === 'ORGANISATION_WIDE' ? '__ORGANISATION_WIDE__' : ''}
                          onChange={event => selectRequesterDepartment(event.target.value)}
                        >
                          <option value="">Select department option...</option>
                          {selectedRequesterOrganization?.departments.map(department => (
                            <option key={department.id} value={department.id}>{department.name}</option>
                          ))}
                          <option value="__ORGANISATION_WIDE__">Organisation-wide / not applicable</option>
                          <option value="__NEW__">Department not listed...</option>
                        </select>
                      </InputGroup>
                      {requesterDepartmentMode === 'NEW' && (
                        <div className="md:col-span-2">
                          <InputGroup label="New Department Name" icon={Building2} required hint="This will be reviewed before being added to the client account">
                            <input
                              type="text"
                              aria-label="New department name"
                              required
                              className={inputClasses}
                              value={proposedRequesterDepartmentName}
                              onChange={event => setProposedRequesterDepartmentName(event.target.value)}
                            />
                          </InputGroup>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <InputGroup label="Organisation" icon={Building2} required hint="Company, NHS trust, council, school or other client">
                        <input type="text" required className={inputClasses} value={formData.organisation} onChange={event => updateFormField('organisation', event.currentTarget.value)} />
                      </InputGroup>
                      <InputGroup label="Department" icon={Building2} hint="Leave blank only when the request is organisation-wide">
                        <input type="text" className={inputClasses} value={formData.department} onChange={event => updateFormField('department', event.currentTarget.value)} />
                      </InputGroup>
                    </>
                  )}
                </div>
              </div>
                </>
              )}

              {currentFormStep === totalFormSteps && (
                <div className="border-b border-slate-200 bg-slate-50 px-6 py-7 md:px-8">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Review your request</h3>
                      <p className="mt-1 text-sm text-slate-500">Check the details below, add the billing reference and send it to Lingland.</p>
                    </div>
                    <BadgeCheck size={22} className="shrink-0 text-emerald-600" />
                  </div>
                  <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2">
                    {[
                      ['Service', isTranslation ? 'Translation' : 'Interpreting'],
                      ['Languages', languageLabel],
                      ['Date & delivery', deliveryLabel],
                      ['Location / files', locationLabel],
                      ['Organisation', formData.organisation || 'Not selected'],
                      ['Department', requesterDepartmentLabel],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 bg-white px-4 py-3">
                        <dt className="text-xs font-medium text-slate-500">{label}</dt>
                        <dd className="mt-1 truncate text-sm font-bold text-slate-900" title={value}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {currentFormStep === totalFormSteps && (
              <div className="request-form-section border-b border-slate-100 p-5 sm:p-8">
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
                    <input type="email" placeholder={formData.email.split(',')[0].trim() || 'finance@organisation.com'} className={inputClasses} value={formData.billingEmail} onChange={event => updateFormField('billingEmail', event.currentTarget.value)} />
                  </InputGroup>

                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700">Billing Code / Purchase Order Required?</label>
                    <div className="flex items-center space-x-6">
                       <label className="flex items-center cursor-pointer group">
                         <input 
                           type="radio" 
                           className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                           checked={formData.requiresCostCode === 'YES'} 
                           onChange={() => updateFormField('requiresCostCode', 'YES')}
                         />
                         <span className="ml-2 text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Yes, I require a code</span>
                       </label>
                       <label className="flex items-center cursor-pointer group">
                         <input 
                           type="radio" 
                           className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                           checked={formData.requiresCostCode === 'NO'} 
                           onChange={() => updateFormField('requiresCostCode', 'NO')}
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
                        onChange={event => updateFormField('costCode', event.currentTarget.value)}
                      />
                    </InputGroup>
                  </div>
                )}
              </div>
              )}

              {currentFormStep === 2 && !isTranslation && (
                <div className="request-form-section border-b border-slate-100 bg-slate-50/50 p-5 sm:p-8">
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
                      <input type="text" required className={inputClasses} value={formData.patientName} onChange={event => updateFormField('patientName', event.currentTarget.value)} />
                    </InputGroup>
                    <InputGroup label="Professional's Name" icon={Stethoscope} hint="Doctor / Solicitor / Caseworker required the interpreter">
                      <input type="text" className={inputClasses} value={formData.professionalName} onChange={event => updateFormField('professionalName', event.currentTarget.value)} />
                    </InputGroup>
                  </div>
                </div>
              )}

              {currentFormStep === 2 && isTranslation && (
                <div className="request-form-section min-w-0 space-y-8 p-5 animate-in fade-in slide-in-from-bottom-4 sm:p-8">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
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
                        className="flex items-center space-x-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase text-blue-600"
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
                        onChange={event => updateFormField('translationFormat', event.currentTarget.value)}
                      >
                        <option value="Email (PDF)">Email (PDF)</option>
                        <option value="Word Document">Word Document</option>
                        <option value="Certified Translation">Certified Translation</option>
                        <option value="Other">Other</option>
                      </select>
                    </InputGroup>
                    <InputGroup label="Delivery Date" icon={Calendar} required hint="Desired completion date">
                      <input type="date" required className={inputClasses} value={formData.date} onInput={event => updateFormField('date', event.currentTarget.value)} />
                    </InputGroup>
                  </div>

                  {formData.translationFormat === 'Other' && (
                    <InputGroup label="Please specify format" required>
                      <input type="text" required className={inputClasses} value={formData.translationFormatOther} onChange={event => updateFormField('translationFormatOther', event.currentTarget.value)} />
                    </InputGroup>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <InputGroup label="Delivery Email (if different)" icon={Mail}>
                      <input type="email" placeholder={formData.email.split(',')[0].trim() || 'e.g. results@org.com'} className={inputClasses} value={formData.deliveryEmail} onChange={event => updateFormField('deliveryEmail', event.currentTarget.value)} />
                    </InputGroup>
                    <InputGroup label="Pricing">
                      <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="mb-1 flex justify-end">
                          <button 
                            type="button"
                            aria-label="About translation pricing"
                            title="About translation pricing"
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
                          <input type="radio" name="quote" className="mr-2 text-blue-600" checked={!formData.quoteRequested} onChange={() => updateFormField('quoteRequested', false)} />
                          <span className="text-sm font-medium text-slate-700">Standard Rates</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input type="radio" name="quote" className="mr-2 text-blue-600" checked={formData.quoteRequested} onChange={() => updateFormField('quoteRequested', true)} />
                          <span className="text-sm font-medium text-slate-700">Quote First</span>
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
                    <p className="mb-4 text-[10px] font-black uppercase text-blue-600">Drag & Drop or click to select</p>

                    <label
                      htmlFor="file-upload"
                      className={`inline-flex cursor-pointer items-center rounded-lg border border-blue-200 bg-white px-6 py-2 text-xs font-black uppercase text-blue-600 shadow-sm transition-colors hover:bg-blue-100 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                      onChange={event => updateFormField('notes', event.currentTarget.value)}
                    />
                  </InputGroup>
                </div>
              )}

              {currentFormStep === 3 && !isTranslation && (
                <div className="space-y-0">
                  <div className="request-form-section border-b border-slate-100 p-5 sm:p-8">
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
                          onChange={event => updateFormField('languageTo', event.currentTarget.value)}
                        >
                          <option value="">{loadingLangs ? 'Loading languages...' : 'Select Language...'}</option>
                          {availableLanguages.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                      </InputGroup>
                      <InputGroup label="Booking Date" icon={Calendar} required>
                        <input type="date" required className={inputClasses} value={formData.date} onInput={event => updateFormField('date', event.currentTarget.value)} />
                      </InputGroup>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                      <InputGroup label="Start Time" icon={Clock} required>
                         <input type="time" required className={inputClasses} value={formData.startTime} onInput={event => updateFormField('startTime', event.currentTarget.value)} />
                      </InputGroup>
                      <InputGroup label="Expected Session Duration" required hint="Minimum 1 hour booking charge applies">
                        <select 
                          required 
                          className={inputClasses} 
                          value={formData.durationMinutes} 
                          onChange={event => updateFormField('durationMinutes', Number(event.currentTarget.value))}
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
                          <input type="radio" value="ONSITE" checked={formData.locationType === 'ONSITE'} onChange={() => updateFormField('locationType', 'ONSITE')} className="hidden" />
                          <MapPin size={18} className="mr-2" />
                          <span className="font-bold text-xs">Face-to-Face</span>
                        </label>
                        <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.locationType === 'ONLINE' && formData.onlineLink !== 'PHONE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                          <input type="radio" value="ONLINE" checked={formData.locationType === 'ONLINE' && formData.onlineLink !== 'PHONE'} onChange={() => setFormData(previous => ({ ...previous, locationType: 'ONLINE', onlineLink: previous.onlineLink === 'PHONE' ? '' : previous.onlineLink }))} className="hidden" />
                          <Video size={18} className="mr-2" />
                          <span className="font-bold text-xs">Virtual (Teams/Zoom)</span>
                        </label>
                        <label className={`flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.onlineLink === 'PHONE' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}>
                          <input type="radio" checked={formData.onlineLink === 'PHONE'} onChange={() => setFormData(previous => ({ ...previous, locationType: 'ONLINE', onlineLink: 'PHONE' }))} className="hidden" />
                          <Phone size={18} className="mr-2" />
                          <span className="font-bold text-xs">Phone</span>
                        </label>
                      </div>
                    </div>

                    {formData.locationType === 'ONSITE' ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 animate-in fade-in slide-in-from-top-4">
                        <div className="md:col-span-2">
                          <InputGroup label="Location Address" required>
                            <textarea required rows={2} className={inputClasses + " resize-none"} value={formData.address} onChange={event => updateFormField('address', event.currentTarget.value)} />
                          </InputGroup>
                        </div>
                        <InputGroup label="Postcode" required>
                          <input type="text" required className={inputClasses} value={formData.postcode} onChange={event => updateFormField('postcode', event.currentTarget.value)} />
                        </InputGroup>
                      </div>
                    ) : formData.onlineLink !== 'PHONE' && (
                      <div className="mt-6 animate-in fade-in slide-in-from-top-4">
                        <InputGroup label="Connection Link / Details" required hint="MS Teams Link, Zoom ID, or 'TBC'">
                          <input type="text" required className={inputClasses} value={formData.onlineLink} onChange={event => updateFormField('onlineLink', event.currentTarget.value)} />
                        </InputGroup>
                      </div>
                    )}
                  </div>

                  <div className="request-form-section border-b border-slate-100 bg-slate-50/50 p-5 sm:p-8">
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
                         <select className={inputClasses} value={formData.genderPreference} onChange={event => updateFormField('genderPreference', event.currentTarget.value)}>
                           <option value="None">None</option>
                           <option value="Male">Male Only</option>
                           <option value="Female">Female Only</option>
                         </select>
                       </InputGroup>
                       <InputGroup label="Special Instructions">
                         <textarea className={inputClasses + " h-32 resize-none"} value={formData.notes} onChange={event => updateFormField('notes', event.currentTarget.value)} placeholder="e.g. Arrive 15 mins before..." />
                       </InputGroup>
                    </div>
                  </div>
                </div>
              )}

              {currentFormStep < totalFormSteps && (
                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8">
                  {currentFormStep > 1 ? (
                    <button
                      type="button"
                      onClick={() => goToFormStep(currentFormStep - 1)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <ChevronRight size={18} className="mr-2 rotate-180" /> Back
                    </button>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={requesterLookupState === 'CHECKING' || uploading}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    Continue to {formSteps[currentFormStep]} <ArrowRight size={18} className="ml-2" />
                  </button>
                </div>
              )}

              {currentFormStep === totalFormSteps && (
              <div className="request-form-section border-t border-slate-100 bg-slate-50 p-5 sm:p-8">
                <label className="flex items-start mb-4 cursor-pointer group">
                  <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 group-hover:border-blue-500 transition-colors" checked={formData.agreedToTerms} onChange={event => updateFormField('agreedToTerms', event.currentTarget.checked)} />
                  <div className="ml-3">
                    <p className="mb-1 text-[10px] font-black uppercase text-blue-600">Service Policies</p>
                    <p className="text-sm text-slate-600 leading-snug">
                      I have read, understood, and agree to the <a href="/#/terms" target="_blank" className="font-bold text-blue-600 hover:underline">Terms and Conditions of Service</a>.
                    </p>
                  </div>
                </label>

                <label className="flex items-start mb-8 cursor-pointer p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-200 hover:bg-slate-50 transition-all group">
                  <input type="checkbox" required className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 group-hover:border-blue-500 transition-colors" checked={formData.gdprConsent} onChange={event => updateFormField('gdprConsent', event.currentTarget.checked)} />
                  <div className="ml-3">
                    <p className="mb-1 text-[10px] font-black uppercase text-slate-700">Privacy & Data Consent</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      I consent to my data being collected and stored for order processing, in accordance with the <a href="https://gdpr-info.eu/" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">GDPR guidelines</a>.
                    </p>
                  </div>
                </label>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => goToFormStep(currentFormStep - 1)}
                    className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-auto"
                  >
                    <ChevronRight size={18} className="mr-2 rotate-180" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || requesterLookupState === 'CHECKING' || availableLanguages.length === 0}
                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-slate-900 px-6 text-base font-bold text-white shadow-lg shadow-slate-900/10 hover:bg-black disabled:opacity-70"
                  >
                    {loading ? (
                      <><Loader2 className="animate-spin mr-2" size={20} /> Sending request...</>
                    ) : (
                      <><ArrowRight size={20} className="mr-2" /> Send {isTranslation ? 'translation' : 'interpreting'} request</>
                    )}
                  </button>
                </div>
              </div>
              )}
            </form>
          </div>

          {(!isEmbedded || showEmbedHelp) && <div className={`space-y-6 hidden lg:block sticky ${isEmbedded ? 'top-4' : 'top-28'}`}>
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

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-blue-600">Your request</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{isTranslation ? 'Translation' : 'Interpreting'}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{formProgress}%</span>
              </div>
              <dl className="divide-y divide-slate-100 text-sm">
                {[
                  ['Languages', languageLabel],
                  ['Date', requestDateLabel],
                  [isTranslation ? 'Documents' : 'Delivery', locationLabel],
                  ['Organisation', formData.organisation || 'Not selected'],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="truncate text-right font-bold text-slate-900" title={value}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            
            <div className="bg-slate-900 rounded-xl p-1 shadow-2xl">
              <div className="bg-slate-800 rounded-xl p-4 text-white">
                <p className="text-xs font-bold mb-1 flex items-center">
                  <ShieldCheck size={14} className="mr-2 text-emerald-400" /> Secure Processing
                </p>
                <p className="text-[10px] text-slate-400">All data encrypted and GDPR compliant.</p>
              </div>
            </div>
          </div>}
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
