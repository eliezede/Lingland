
import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  UserCheck, 
  Upload, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileSearch
} from 'lucide-react';
import { Interpreter, OnboardingDocStatus, NotificationType } from '../../types';
import { InterpreterService, StorageService, NotificationService } from '../../services/api';
import { Button } from '../ui/Button';
import { Badge, BadgeVariant } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

interface OnboardingWidgetProps {
  interpreter: Interpreter;
  onUpdate: () => void;
}

export const OnboardingWidget: React.FC<OnboardingWidgetProps> = ({ interpreter, onUpdate }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [uploading, setUploading] = useState<string | null>(null);

  const onboarding = interpreter.onboarding || {
    dbs: { status: 'MISSING' },
    idCheck: { status: 'MISSING' },
    certifications: { status: 'MISSING' },
    rightToWork: { status: 'MISSING' },
    overallStatus: 'DOCUMENTS_PENDING'
  };
  const handleShareCodeUpdate = async (shareCode: string) => {
    if (shareCode.length < 11) return;
    
    setUploading('rightToWork');
    try {
      const updatedOnboarding = { ...onboarding };
      updatedOnboarding.rightToWork = {
        ...updatedOnboarding.rightToWork,
        shareCode,
        type: 'SHARE_CODE',
        status: 'IN_REVIEW' as OnboardingDocStatus
      };

      await InterpreterService.updateProfile(interpreter.id, { onboarding: updatedOnboarding });
      
      await NotificationService.notifyAdmins(
        'New Share Code Submitted',
        `${interpreter.name} provided a RTW share code for review.`,
        NotificationType.INFO,
        `/admin/interpreters/${interpreter.id}`
      );

      showToast('Share code submitted successfully!', 'success');
      onUpdate();
    } catch (error) {
      showToast('Failed to submit share code.', 'error');
    } finally {
      setUploading(null);
    }
  };

  const handleTypeChange = async (type: 'BRP' | 'SHARE_CODE') => {
    try {
      const updatedOnboarding = { ...onboarding };
      updatedOnboarding.rightToWork = {
        ...updatedOnboarding.rightToWork,
        type
      };
      await InterpreterService.updateProfile(interpreter.id, { onboarding: updatedOnboarding });
      onUpdate();
    } catch (error) {
      showToast('Failed to change RTW type.', 'error');
    }
  };
  const steps = [
    {
      id: 'dbs',
      title: 'DBS Certificate',
      description: 'Enhanced DBS check (within last 3 years or on update service).',
      icon: ShieldCheck,
      status: onboarding.dbs.status,
      url: onboarding.dbs.url,
      notes: onboarding.dbs.notes
    },
    {
      id: 'idCheck',
      title: 'Identity Verification',
      description: 'Clear copy of your Passport or Biometric Residence Permit.',
      icon: UserCheck,
      status: onboarding.idCheck.status,
      url: onboarding.idCheck.url,
      notes: onboarding.idCheck.notes
    },
    {
      id: 'certifications',
      title: 'Professional Qualifications',
      description: 'DPSI, NRPSI, Community Interpreting or other relevant certs.',
      icon: FileText,
      status: onboarding.certifications.status,
      url: onboarding.certifications.urls?.[0], // Simplification for UI
      notes: onboarding.certifications.notes
    },
    {
      id: 'rightToWork',
      title: 'Right to Work UK',
      description: 'Proof of your eligibility to work in the United Kingdom.',
      icon: FileSearch,
      status: onboarding.rightToWork.status,
      url: onboarding.rightToWork.url,
      notes: onboarding.rightToWork.notes
    }
  ];

  const getStatusBadge = (status: OnboardingDocStatus): { label: string; variant: BadgeVariant; icon: any } => {
    switch (status) {
      case 'VERIFIED': return { label: 'Verified', variant: 'success', icon: CheckCircle2 };
      case 'IN_REVIEW': return { label: 'In Review', variant: 'warning', icon: Clock };
      case 'REJECTED': return { label: 'Action Required', variant: 'danger', icon: AlertCircle };
      default: return { label: 'Pending', variant: 'neutral', icon: Upload };
    }
  };

  const handleFileUpload = async (stepId: string, file: File) => {
    if (!user?.id) {
      showToast('Your authenticated session is required to upload documents.', 'error');
      return;
    }
    setUploading(stepId);
    try {
      const path = `onboarding/${user.id}/${stepId}_${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);

      const updatedOnboarding = { ...onboarding };
      const docKey = stepId as keyof typeof onboarding;
      
      if (stepId === 'certifications') {
        updatedOnboarding.certifications = { 
          urls: [url, ...(onboarding.certifications.urls || [])], 
          status: 'IN_REVIEW' 
        };
      } else {
        (updatedOnboarding[docKey] as any) = { url, status: 'IN_REVIEW' };
      }

      // Check overall status
      const allSubmitted = steps.every(s => s.id === stepId || s.status !== 'MISSING');
      if (allSubmitted) {
        updatedOnboarding.overallStatus = 'IN_REVIEW';
      }

      await InterpreterService.updateProfile(interpreter.id, { onboarding: updatedOnboarding });
      
      // Notify Admin
      await NotificationService.notifyAdmins(
        'New Onboarding Document',
        `${interpreter.name} uploaded ${stepId.toUpperCase()} for review.`,
        NotificationType.INFO,
        `/admin/interpreters/${interpreter.id}`
      );

      showToast('File uploaded successfully! Admin notified.', 'success');
      onUpdate();
    } catch (error) {
      console.error(error);
      showToast('Failed to upload file.', 'error');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Complete Your Onboarding</h2>
            <p className="text-slate-500 text-sm max-w-xl">
              To start receiving assignments, please upload the following documents. Our compliance team will review them within 24-48 hours.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100">
            <div className="text-right">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Progress</div>
              <div className="text-xl font-black text-slate-900 mt-1">{steps.filter(s => s.status === 'VERIFIED').length} / {steps.length}</div>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 flex items-center justify-center relative">
               <div 
                 className="absolute inset-x-0 bottom-0 bg-blue-600 rounded-full transition-all duration-1000" 
                 style={{ height: `${(steps.filter(s => s.status === 'VERIFIED').length / steps.length) * 100}%`, opacity: 0.2 }}
               />
               <ShieldCheck size={20} className="text-blue-600" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((step) => {
            const { label, variant, icon: StatusIcon } = getStatusBadge(step.status);
            const isUploading = uploading === step.id;

            return (
              <Card key={step.id} className={`p-6 border-2 transition-all ${step.status === 'REJECTED' ? 'border-red-100 bg-red-50/30' : 'border-slate-100'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-2xl ${step.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <step.icon size={24} />
                  </div>
                  <Badge variant={variant} className="flex items-center gap-1.5 px-3 py-1">
                    <StatusIcon size={12} />
                    {label}
                  </Badge>
                </div>

                <h3 className="font-black text-slate-900 mb-1">{step.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed mb-6">{step.description}</p>

                {step.notes && (
                  <div className="mb-4 p-3 bg-red-100/50 border border-red-200 rounded-xl text-[11px] font-bold text-red-700 flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>Feedback: {step.notes}</span>
                  </div>
                )}

                <div className="mt-auto">
                  {step.status === 'VERIFIED' ? (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs bg-emerald-50 w-fit px-4 py-2 rounded-xl border border-emerald-100">
                      <CheckCircle2 size={14} />
                      {step.id === 'rightToWork' && onboarding.rightToWork?.type === 'SHARE_CODE' ? 'Share Code Verified' : 'Document Approved'}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {step.id === 'rightToWork' && (
                        <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                          <button 
                            onClick={() => handleTypeChange('BRP')}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${onboarding.rightToWork?.type === 'BRP' || !onboarding.rightToWork?.type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            BRP
                          </button>
                          <button 
                            onClick={() => handleTypeChange('SHARE_CODE')}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${onboarding.rightToWork?.type === 'SHARE_CODE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Share Code
                          </button>
                        </div>
                      )}

                      {step.id === 'rightToWork' && onboarding.rightToWork?.type === 'SHARE_CODE' ? (
                        <div className="space-y-3">
                          <input 
                            type="text"
                            placeholder="W8Z RBH 4XE"
                            maxLength={11}
                            defaultValue={onboarding.rightToWork.shareCode || ''}
                            onBlur={(e) => handleShareCodeUpdate(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner"
                          />
                          {onboarding.rightToWork.status === 'IN_REVIEW' && (
                            <div className="flex items-center gap-2 text-blue-600 font-bold text-[10px] bg-blue-50 px-3 py-2 rounded-xl border border-blue-100">
                              <Clock size={12} />
                              Review Pending
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            id={`file-${step.id}`}
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(step.id, e.target.files[0])}
                            disabled={isUploading || step.status === 'IN_REVIEW'}
                          />
                          <label 
                            htmlFor={`file-${step.id}`}
                            className={`
                              flex items-center justify-center gap-2 w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer
                              ${isUploading || step.status === 'IN_REVIEW' 
                                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                : 'bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-200 hover:-translate-y-0.5'
                              }
                            `}
                          >
                            {isUploading ? (
                              <>
                                <Spinner size="sm" />
                                Uploading...
                              </>
                            ) : step.status === 'IN_REVIEW' ? (
                              <>
                                <Clock size={14} />
                                Awaiting Review
                              </>
                            ) : (
                              <>
                                <Upload size={14} />
                                {step.status === 'REJECTED' ? 'Re-upload Document' : 'Upload Document'}
                              </>
                            )}
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {onboarding.overallStatus === 'IN_REVIEW' && (
          <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-6 animate-pulse">
            <div className="p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
              <Clock size={32} />
            </div>
            <div>
              <h4 className="text-blue-900 font-black text-lg">Documents Under Review</h4>
              <p className="text-blue-700 text-xs font-medium opacity-80">
                You've submitted everything! Our team is currently reviewing your profile. You'll receive an email and notification once you are activated.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
