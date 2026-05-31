
import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BillingService, BookingService, StorageService } from '../../services/api';
import { Booking, BookingStatus, ServiceCategory, SessionMode } from '../../types';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChevronLeft, Camera, Upload, Check, FileText, Info, AlertCircle, Clock, MapPin, Receipt, ArrowRight, UserCheck } from 'lucide-react';
import { SignaturePad } from '../../components/ui/SignaturePad';

export const InterpreterTimesheetForm = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [job, setJob] = useState<Booking | null>(null);
  const { submitTimesheet } = useInterpreterTimesheets(user?.profileId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    start: '',
    end: '',
    breakMins: 0,
    evidenceUrl: '',
    sessionMode: '' as string,
    travelTime: 0,
    mileage: 0,
    parking: 0,
    transport: 0,
    clientNameSigned: '',
    clientSignatureUrl: '',
    // Translation fields
    wordCount: 0,
    unitPrice: 0,
    units: 'words' as 'words' | 'pages' | 'documents' | 'hours'
  });

  const [uploading, setUploading] = useState(false);
  const routeState = location.state as { returnTo?: string; returnLabel?: string } | null;

  const goBackToContext = () => {
    if (routeState?.returnTo) {
      navigate(routeState.returnTo);
      return;
    }
    navigate('/interpreter/timesheets');
  };

  useEffect(() => {
    if (bookingId) {
      const interpreterId = user?.profileId;
      if (!interpreterId) {
        navigate('/interpreter/timesheets');
        return;
      }
      BookingService.getById(bookingId).then(async b => {
        if (!b) {
          showToast('Job not found', 'error');
          navigate('/interpreter/timesheets');
          return;
        }
        if (b.interpreterId !== interpreterId) {
          showToast('This job is not assigned to your interpreter profile', 'error');
          navigate('/interpreter/timesheets');
          return;
        }
        if (b.status !== BookingStatus.BOOKED) {
          showToast('Timesheets can only be submitted for confirmed jobs', 'error');
          navigate('/interpreter/timesheets');
          return;
        }
        const existingTimesheets = await BillingService.getInterpreterTimesheets(interpreterId);
        if (existingTimesheets.some(ts => ts.bookingId === b.id)) {
          showToast('A timesheet has already been submitted for this job', 'info');
          navigate('/interpreter/timesheets');
          return;
        }
        const scheduledEnd = new Date(`${b.date}T${b.endTime || b.expectedEndTime || b.startTime || '23:59'}`);
        const completed = b.serviceCategory === ServiceCategory.TRANSLATION
          ? new Date(`${b.date}T23:59:00`) <= new Date()
          : scheduledEnd <= new Date();
        if (!completed) {
          showToast('This job is not ready for timesheet submission yet', 'info');
          navigate('/interpreter/jobs');
          return;
        }

        setJob(b || null);
        const mode = b.locationType === 'ONLINE' ? SessionMode.VIDEO : SessionMode.F2F;
        setFormData(prev => ({
          ...prev,
          sessionMode: b.sessionMode || mode,
          start: b.startTime || '',
          end: b.startTime ? calculateDefaultEnd(b.startTime, b.durationMinutes) : ''
        }));
      });
    }
  }, [bookingId, user?.profileId]);

  const calculateDefaultEnd = (start: string, duration: number) => {
    try {
      const [h, m] = start.split(':').map(Number);
      const startMinutes = h * 60 + m;
      const endMinutes = startMinutes + duration;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  const calculatedStats = useMemo(() => {
    if (!formData.start || !formData.end) return { duration: 0, earnings: 0 };
    
    // Duration
    const [sH, sM] = formData.start.split(':').map(Number);
    const [eH, eM] = formData.end.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 1440; // Next day fallback
    
    const billableMins = Math.max(0, diff - formData.breakMins);
    const durationH = billableMins / 60;
    
    // Basic estimate (using fallback rate of £25 if not available on job)
    const sessionEarnings = durationH * ((job as any)?.interpreterRate || 25);
    const travelEarnings = (formData.travelTime / 60) * ((job as any)?.travelRate || 12);
    const mileageEarnings = formData.mileage * ((job as any)?.mileageRate || 0.45);
    
    const total = sessionEarnings + travelEarnings + mileageEarnings + formData.parking + formData.transport;
    
    return {
      duration: billableMins,
      earnings: total
    };
  }, [formData, job]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const path = `timesheets/${bookingId}/${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      setFormData(prev => ({ ...prev, evidenceUrl: url }));
      showToast('File uploaded successfully', 'success');
    } catch (error) {
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSignatureSave = async (dataUrl: string) => {
    // We'll upload this blob when submitting
    setFormData(prev => ({ ...prev, clientSignatureUrl: dataUrl }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!job) return;
    setIsSubmitting(true);

    try {
      // 1. Upload signature if present and not already a URL
      let signatureUrl = formData.clientSignatureUrl;
      if (signatureUrl && signatureUrl.startsWith('data:')) {
        const response = await fetch(signatureUrl);
        const blob = await response.blob();
        const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' });
        const path = `timesheets/signatures/${bookingId}_${Date.now()}.png`;
        signatureUrl = await StorageService.uploadFile(file, path);
      }

      // 2. Construct ISO dates
      const baseDate = job.date;
      const startDate = new Date(`${baseDate}T${formData.start || '00:00'}:00`);
      const endDate = new Date(`${baseDate}T${formData.end || formData.start || '00:00'}:00`);
      if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      // 3. Submit
      const claimedTotal = job.serviceCategory === ServiceCategory.TRANSLATION
        ? formData.wordCount * formData.unitPrice
        : calculatedStats.earnings;

      await submitTimesheet({
        bookingId: job.id,
        clientId: job.clientId,
        actualStart: startISO,
        actualEnd: endISO,
        breakDurationMinutes: formData.breakMins,
        supportingDocumentUrl: formData.evidenceUrl,
        clientSignatureUrl: signatureUrl,
        clientNameSigned: formData.clientNameSigned,
        sessionMode: formData.sessionMode as any,
        travelTimeMinutes: formData.travelTime,
        mileage: formData.mileage,
        parking: formData.parking,
        transport: formData.transport,
        sessionDurationMinutes: calculatedStats.duration,
        totalToPay: claimedTotal,
        // Translation fields
        wordCount: formData.wordCount,
        unitPrice: formData.unitPrice,
        units: formData.units,
        interpreterAmountCalculated: claimedTotal
      });

      showToast("Timesheet submitted successfully!", "success");
      navigate('/interpreter/timesheets');
    } catch (error) {
      console.error(error);
      showToast("Error submitting timesheet", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  if (!job) return <div className="p-8 flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  const isTranslation = job.serviceCategory === ServiceCategory.TRANSLATION;
  const finalEarnings = isTranslation ? formData.wordCount * formData.unitPrice : calculatedStats.earnings;
  const isStep1Valid = isTranslation
    ? formData.wordCount > 0 && formData.unitPrice > 0 
    : formData.start && formData.end;

  return (
    <div className="bg-slate-50 min-h-screen pb-20">
      {/* Header */}
      <div className="px-4 py-6 bg-white border-b border-slate-200 flex items-center sticky top-0 z-20 shadow-sm">
        <button onClick={goBackToContext} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">
            {job.serviceCategory === ServiceCategory.TRANSLATION ? 'Delivery Details' : 'Timesheet Submission'}
          </h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{job.clientName}</p>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex flex-col items-center gap-1.5`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                currentStep === s ? 'bg-blue-600 text-white ring-4 ring-blue-50' : 
                currentStep > s ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {currentStep > s ? <Check size={16} /> : s}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tight ${currentStep === s ? 'text-blue-600' : 'text-slate-400'}`}>
                {s === 1 ? 'Details' : s === 2 ? 'Expenses' : 'Verify'}
              </span>
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${currentStep > s ? 'bg-green-500' : 'bg-slate-100'}`} />}
          </React.Fragment>
        ))}
      </div>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Step 1: Session / Translation Details */}
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
              <div className="flex items-center gap-3 text-slate-900 mb-2">
                <Clock className="text-blue-500" size={20} />
                <h3 className="font-bold">Session Period</h3>
              </div>

              {job.serviceCategory === ServiceCategory.TRANSLATION ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Quantity</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-lg font-semibold"
                        value={formData.wordCount || ''}
                        onChange={e => setFormData({ ...formData, wordCount: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Unit Type</label>
                      <select
                        className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all h-[62px] font-medium"
                        value={formData.units}
                        onChange={e => setFormData({ ...formData, units: e.target.value as any })}
                      >
                        <option value="words">Words</option>
                        <option value="pages">Pages</option>
                        <option value="documents">Docs</option>
                        <option value="hours">Hours</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Unit Price (£)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">£</span>
                      <input
                        type="number" step="0.001"
                        className="w-full p-4 pl-8 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold"
                        value={formData.unitPrice || ''}
                        onChange={e => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Start Time</label>
                      <input
                        type="time"
                        required
                        className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-xl font-bold"
                        value={formData.start}
                        onChange={e => setFormData({ ...formData, start: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">End Time</label>
                      <input
                        type="time"
                        required
                        className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-xl font-bold"
                        value={formData.end}
                        onChange={e => setFormData({ ...formData, end: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Break Duration (Mins)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-semibold"
                        value={formData.breakMins || ''}
                        onChange={e => setFormData({ ...formData, breakMins: parseInt(e.target.value) || 0 })}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold uppercase">min</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Stats Preview */}
            {(job.serviceCategory === ServiceCategory.TRANSLATION || calculatedStats.duration > 0) ? (
              <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-200 flex items-center justify-between text-white">
                <div>
                  <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Estimated Earnings</p>
                  <p className="text-3xl font-black">£{(job.serviceCategory === ServiceCategory.TRANSLATION ? formData.wordCount * formData.unitPrice : calculatedStats.earnings).toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Billable Units</p>
                  <p className="text-xl font-bold">
                    {job.serviceCategory === ServiceCategory.TRANSLATION 
                      ? `${formData.wordCount} ${formData.units}` 
                      : `${Math.floor(calculatedStats.duration / 60)}h ${calculatedStats.duration % 60}m`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-100 rounded-3xl border border-dashed border-slate-300 text-center">
                <p className="text-slate-400 text-sm italic">Enter start and end times to calculate earnings</p>
              </div>
            )}

            <button
              onClick={nextStep}
              disabled={!isStep1Valid}
              className="w-full py-5 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Next Step
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Step 2: Expenses & Evidence */}
        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
              <div className="flex items-center gap-3 text-slate-900 mb-2">
                <Receipt className="text-orange-500" size={20} />
                <h3 className="font-bold">Travel & Expenses</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Travel (Min)</label>
                  <input
                    type="number"
                    className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none font-semibold"
                    value={formData.travelTime || ''}
                    onChange={e => setFormData({ ...formData, travelTime: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Mileage (Mi)</label>
                  <input
                    type="number"
                    className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none font-semibold"
                    value={formData.mileage || ''}
                    onChange={e => setFormData({ ...formData, mileage: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Parking (£)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none font-semibold"
                    value={formData.parking || ''}
                    onChange={e => setFormData({ ...formData, parking: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Public Trans (£)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none font-semibold"
                    value={formData.transport || ''}
                    onChange={e => setFormData({ ...formData, transport: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center gap-3 text-slate-900 mb-2">
                <Camera className="text-emerald-500" size={20} />
                <h3 className="font-bold">Evidence (Optional)</h3>
              </div>
              
              <div className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center relative transition-all ${formData.evidenceUrl ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {uploading ? (
                  <div className="flex flex-col items-center text-blue-600">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                    <span className="text-sm font-bold uppercase tracking-tighter">Uploading...</span>
                  </div>
                ) : formData.evidenceUrl ? (
                  <div className="flex flex-col items-center text-emerald-600">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                       <Check size={24} />
                    </div>
                    <span className="text-sm font-bold">Document Attached</span>
                    <span className="text-[10px] opacity-60 uppercase font-black mt-1">Tap to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-slate-400">
                    <Upload size={28} className="mb-2" />
                    <span className="text-xs font-bold uppercase tracking-tight">Upload ID / Timesheet</span>
                    <span className="text-[10px] opacity-60 mt-1">Image or PDF</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={prevStep}
                className="flex-1 py-5 bg-white text-slate-900 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
              >
                Back
              </button>
              <button
                onClick={nextStep}
                className="flex-[2] py-5 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Verification & Signature */}
        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
             {/* Summary Card */}
             <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-4">
                <div className="flex justify-between items-start">
                   <h3 className="font-bold flex items-center gap-2">
                      <FileText size={18} className="text-blue-400" />
                      Final Summary
                   </h3>
                   <button onClick={() => setCurrentStep(1)} className="text-[10px] font-black uppercase text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md">Edit</button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm divide-x divide-slate-800">
                   <div className="space-y-1">
                      <p className="text-slate-500 text-[10px] font-black uppercase">Schedule</p>
                      <p className="font-medium">{formData.start} - {formData.end}</p>
                      <p className="text-slate-400 text-xs">{formData.breakMins}m break</p>
                   </div>
                   <div className="pl-4 space-y-1">
                      <p className="text-slate-500 text-[10px] font-black uppercase">Total Earnings</p>
                      <p className="text-xl font-black text-emerald-400">£{finalEarnings.toFixed(2)}</p>
                    </div>
                </div>
             </div>

             {/* Signature Section */}
             {!isTranslation && <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                <div className="flex items-center gap-3 text-slate-900 mb-2">
                  <UserCheck className="text-purple-500" size={20} />
                  <h3 className="font-bold">Client Verification</h3>
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Client Representative Name</label>
                   <input
                     type="text"
                     placeholder="Enter name"
                     className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none font-semibold"
                     value={formData.clientNameSigned}
                     onChange={e => setFormData({ ...formData, clientNameSigned: e.target.value })}
                   />
                </div>

                <div className="space-y-2">
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Digital Signature</label>
                   <SignaturePad 
                     onSave={handleSignatureSave} 
                     placeholder="Client must sign here"
                   />
                </div>

                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl text-amber-800 border border-amber-100">
                   <AlertCircle size={20} className="shrink-0 mt-0.5" />
                   <p className="text-xs font-medium leading-relaxed">
                     By signing, the client confirms the duration and expenses listed above are accurate.
                   </p>
                </div>
             </div>}

             <div className="flex gap-4">
              <button
                onClick={prevStep}
                className="flex-1 py-5 bg-white text-slate-900 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || (!isTranslation && (!formData.clientNameSigned || !formData.clientSignatureUrl))}
                className="flex-[2] py-5 bg-blue-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    Complete & Send
                    <Check size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
