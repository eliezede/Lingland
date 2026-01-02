import React, { useEffect, useState } from 'react';
import { ApplicationService } from '../../services/applicationService';
import { InterpreterService, UserService } from '../../services/api';
import { InterpreterApplication, ApplicationStatus, UserRole } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { 
  Mail, Phone, MapPin, Award, UserPlus, Info
} from 'lucide-react';

export const AdminApplications = () => {
  const [applications, setApplications] = useState<InterpreterApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  
  const [selectedApp, setSelectedApp] = useState<InterpreterApplication | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await ApplicationService.getAll();
      setApplications(data || []);
    } catch (e) {
      showToast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (app: InterpreterApplication) => {
    if (!window.confirm(`Approve ${app.name}? This will instantly create an Interpreter profile and User account.`)) return;
    
    setProcessingId(app.id);
    try {
      // 1. Create Interpreter Profile
      const newInt = await InterpreterService.create({
        name: app.name,
        email: app.email,
        phone: app.phone,
        languages: app.languages || [],
        regions: [app.postcode],
        qualifications: app.qualifications || [],
        dbsExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ONBOARDING',
        isAvailable: false
      });

      // 2. Create User Login
      await UserService.create({
        displayName: app.name,
        email: app.email,
        role: UserRole.INTERPRETER,
        profileId: newInt.id,
        status: 'ACTIVE'
      });

      // 3. Update Application Status
      await ApplicationService.updateStatus(app.id, ApplicationStatus.APPROVED);
      
      showToast(`${app.name} has been approved and provisioned!`, 'success');
      setSelectedApp(null);
      await loadData(); 
    } catch (e) {
      console.error(e);
      showToast('Error during approval process', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (app: InterpreterApplication) => {
    if (!window.confirm(`Reject application from ${app.name}?`)) return;
    try {
      await ApplicationService.updateStatus(app.id, ApplicationStatus.REJECTED);
      showToast('Application rejected', 'info');
      setSelectedApp(null);
      await loadData();
    } catch (e) {
      showToast('Failed to reject', 'error');
    }
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interpreter Applications</h1>
          <p className="text-gray-500 text-sm">Review credentials and onboard new talent.</p>
        </div>
      </div>

      {loading ? <Spinner size="lg" className="py-12" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(applications || []).filter(a => a.status === ApplicationStatus.PENDING).map(app => (
            <Card key={app.id} className="hover:border-blue-400 cursor-pointer transition-all flex flex-col h-full" onClick={() => setSelectedApp(app)}>
               <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">
                    {safe(app.name).charAt(0).toUpperCase() || '?'}
                  </div>
                  <Badge variant="warning">PENDING</Badge>
               </div>
               <h3 className="font-bold text-gray-900 mb-1">{app.name}</h3>
               <div className="flex items-center text-xs text-gray-500 mb-4">
                  <Mail size={12} className="mr-1" /> {app.email}
               </div>
               
               <div className="flex flex-wrap gap-1 mb-4 flex-1">
                  {(app.languages || []).slice(0, 3).map(l => (
                    <span key={l} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gray-600 uppercase">{l}</span>
                  ))}
                  {(app.languages || []).length > 3 && <span className="text-[10px] text-gray-400">+{(app.languages || []).length - 3} more</span>}
               </div>

               <div className="pt-4 border-t border-gray-100 mt-auto flex justify-between items-center">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Applied: {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : 'TBD'}</span>
                  <button className="text-blue-600 text-xs font-bold uppercase hover:underline">Review &rarr;</button>
               </div>
            </Card>
          ))}
          {(applications || []).filter(a => a.status === ApplicationStatus.PENDING).length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400 italic">No new applications at the moment.</div>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal isOpen={!!selectedApp} onClose={() => setSelectedApp(null)} title="Application Review" maxWidth="lg">
        {selectedApp && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contact Identity</h4>
                   <div className="space-y-3">
                      <div className="flex items-center text-sm font-semibold text-gray-900">
                        <Mail size={16} className="mr-3 text-blue-500" /> 
                        {selectedApp.email}
                      </div>
                      <div className="flex items-center text-sm font-semibold text-gray-900">
                        <Phone size={16} className="mr-3 text-blue-500" /> 
                        {selectedApp.phone}
                      </div>
                      <div className="flex items-center text-sm font-semibold text-gray-900">
                        <MapPin size={16} className="mr-3 text-blue-500" /> 
                        {selectedApp.postcode}
                      </div>
                   </div>
                </div>
                <div className="space-y-4">
                   <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Expertise</h4>
                   <div className="flex flex-wrap gap-2">
                      {(selectedApp.languages || []).map(l => <Badge key={l} variant="info">{l}</Badge>)}
                   </div>
                   <div className="pt-4 space-y-2">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Qualifications</h4>
                      <div className="flex flex-wrap gap-2">
                        {(selectedApp.qualifications || []).map(q => <span key={q} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-md border border-purple-100 flex items-center"><Award size={12} className="mr-1" /> {q}</span>)}
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-2">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Experience Summary</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-200 italic leading-relaxed">
                  "{selectedApp.experienceSummary || 'No summary provided.'}"
                </p>
             </div>

             <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start">
                <div className="bg-blue-100 p-1 rounded-full mr-3 mt-0.5">
                  <Info size={14} className="text-blue-600" />
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  By clicking approve, you confirm that you have manually verified these credentials or will follow up with the interpreter for documentation.
                </p>
             </div>

             <div className="pt-6 border-t border-gray-100 flex justify-end gap-3 items-center">
                <button 
                  type="button"
                  onClick={() => handleReject(selectedApp)} 
                  className="text-red-600 text-sm font-bold hover:underline px-4 py-2"
                >
                  Reject Application
                </button>
                <Button 
                  variant="primary" 
                  icon={UserPlus} 
                  isLoading={processingId === selectedApp.id} 
                  onClick={() => handleApprove(selectedApp)}
                >
                  Approve & Onboard
                </Button>
             </div>
          </div>
        )}
      </Modal>
    </div>
  );
};