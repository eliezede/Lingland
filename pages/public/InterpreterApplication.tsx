import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ApplicationService } from '../../services/applicationService';
import { useSettings } from '../../context/SettingsContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Globe2, ChevronLeft, ChevronRight, CheckCircle2, User, Languages, Award, BookOpen } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

export const InterpreterApplication = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    postcode: '',
    languages: [] as string[],
    qualifications: [] as string[],
    dbsNumber: '',
    experienceSummary: ''
  });

  const nextStep = () => setStep(prev => (prev < 4 ? prev + 1 : prev) as Step);
  const prevStep = () => setStep(prev => (prev > 1 ? prev - 1 : prev) as Step);

  const toggleItem = (listName: 'languages' | 'qualifications', item: string) => {
    const list = [...formData[listName]];
    const index = list.indexOf(item);
    if (index > -1) list.splice(index, 1);
    else list.push(item);
    setFormData({ ...formData, [listName]: list });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await ApplicationService.submit(formData);
      setIsSuccess(true);
    } catch (error) {
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-10 animate-fade-in">
           <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 shadow-inner">
             <CheckCircle2 size={40} />
           </div>
           <h1 className="text-2xl font-black text-gray-900 mb-2">Application Received!</h1>
           <p className="text-gray-500 mb-8 leading-relaxed">
             Thank you for applying, <strong>{formData.name}</strong>. Our onboarding team will review your credentials and contact you within 2-3 business days.
           </p>
           <Link to="/" className="inline-block px-8 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors">
             Back to Homepage
           </Link>
        </Card>
      </div>
    );
  }

  const inputClasses = "w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm text-gray-900";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 md:py-20">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center mb-10">
          <Link to="/" className="flex items-center text-blue-600">
            <Globe2 size={32} className="mr-2" />
            <span className="text-2xl font-black tracking-tight text-gray-900">Lingland Partners</span>
          </Link>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
           {[1, 2, 3, 4].map(s => (
             <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
           ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* STEP 1: Basic Info */}
          {step === 1 && (
            <Card className="animate-fade-in p-8 space-y-6">
              <div className="flex items-center text-blue-600 mb-2">
                <User size={20} className="mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Tell us about yourself</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Full Name *</label>
                  <input type="text" required className={inputClasses} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Professional Email *</label>
                  <input type="email" required className={inputClasses} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="jane@interpreter.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mobile Number *</label>
                  <input type="tel" required className={inputClasses} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="07700..." />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Postcode *</label>
                  <input type="text" required className={inputClasses} value={formData.postcode} onChange={e => setFormData({...formData, postcode: e.target.value})} placeholder="E1 6AN" />
                </div>
              </div>
            </Card>
          )}

          {/* STEP 2: Expertise */}
          {step === 2 && (
            <Card className="animate-fade-in p-8 space-y-6">
              <div className="flex items-center text-blue-600 mb-2">
                <Languages size={20} className="mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Your Languages</h2>
              </div>
              <p className="text-sm text-gray-500">Select the languages you are qualified to interpret professionally from English.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2">
                {settings.masterData.priorityLanguages.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleItem('languages', lang)}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                      formData.languages.includes(lang) 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                        : 'bg-white border-gray-100 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              {formData.languages.length === 0 && <p className="text-[10px] text-red-500 italic font-medium">Please select at least one language.</p>}
            </Card>
          )}

          {/* STEP 3: Qualifications */}
          {step === 3 && (
            <Card className="animate-fade-in p-8 space-y-6">
              <div className="flex items-center text-blue-600 mb-2">
                <Award size={20} className="mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Compliance & Certs</h2>
              </div>
              <div className="space-y-4">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Qualifications Held</label>
                 <div className="flex flex-wrap gap-2">
                    {['DPSI', 'Community Level 3', 'Met Police Test', 'NRPSI Registered', 'BSL Level 6'].map(qual => (
                      <button
                        key={qual}
                        type="button"
                        onClick={() => toggleItem('qualifications', qual)}
                        className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                          formData.qualifications.includes(qual) 
                            ? 'bg-purple-600 border-purple-600 text-white' 
                            : 'bg-white border-gray-200 text-gray-600'
                        }`}
                      >
                        {qual}
                      </button>
                    ))}
                 </div>
                 <div className="pt-4">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Enhanced DBS Number (Optional)</label>
                    <input type="text" className={inputClasses + " mt-1"} value={formData.dbsNumber} onChange={e => setFormData({...formData, dbsNumber: e.target.value})} placeholder="Enter 12-digit number" />
                    <p className="text-[10px] text-gray-400 mt-2 italic">You will be required to upload documents if invited to interview.</p>
                 </div>
              </div>
            </Card>
          )}

          {/* STEP 4: Summary */}
          {step === 4 && (
            <Card className="animate-fade-in p-8 space-y-6">
              <div className="flex items-center text-blue-600 mb-2">
                <BookOpen size={20} className="mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Experience</h2>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Brief Professional Summary *</label>
                <textarea 
                  required
                  rows={5}
                  className={inputClasses}
                  value={formData.experienceSummary}
                  onChange={e => setFormData({...formData, experienceSummary: e.target.value})}
                  placeholder="Tell us about your years of experience, specific domains (Legal, Medical) and why you'd like to work with us."
                />
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                 <p className="text-[10px] text-gray-500 leading-relaxed">
                   By submitting this application, you agree to our <strong>Privacy Policy</strong> and consent to being contacted by our onboarding team regarding your application.
                 </p>
              </div>
            </Card>
          )}

          {/* Navigation Controls */}
          <div className="mt-8 flex justify-between gap-4">
            {step > 1 ? (
              <Button type="button" variant="secondary" icon={ChevronLeft} onClick={prevStep}>Back</Button>
            ) : (
              <Link to="/"><Button type="button" variant="ghost">Cancel</Button></Link>
            )}

            {step < 4 ? (
              <Button 
                type="button" 
                variant="primary" 
                onClick={nextStep} 
                disabled={step === 1 && (!formData.name || !formData.email) || step === 2 && formData.languages.length === 0}
              >
                Next Step <ChevronRight size={18} className="ml-2" />
              </Button>
            ) : (
              <Button type="submit" isLoading={isSubmitting} className="px-10">Submit Application</Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};