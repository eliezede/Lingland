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
  Mail, Phone, MapPin, Award, UserPlus, Info, 
  Filter, CheckCircle2, XCircle, Clock, Trash2, Search
} from 'lucide-react';

type TabType = ApplicationStatus | 'ALL';

export const AdminApplications = () => {
  const [applications, setApplications] = useState<InterpreterApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(ApplicationStatus.PENDING);
  const [searchTerm, setSearchTerm] = useState('');
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
      setApplications(data);
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
        languages: app.languages,
        regions: [app.postcode],
        qualifications: app.qualifications,
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

  const filteredApps = applications.filter(app => {
    const matchesStatus = activeTab === 'ALL' ? true : app.status === activeTab;
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          app.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const TabBtn = ({ type, label, icon: Icon }: { type: TabType, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(type)}
      className={`flex items-center px-6 py-3 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
        activeTab === type 
          ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10' 
          : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
    >
      <Icon size={16} className="mr-2" />
      {label}
      <span className="ml-2 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500">
        {applications.filter(a => type === 'ALL' ? true : a.status === type).length}
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Onboarding Desk</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Review credentials and expand the Lingland talent pool.</p>
        </div>
        <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search candidates..."
                className="w-full pl-10 pr-4 py-2 bg-transparent text-sm outline-none text-slate-900 dark:text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-hide">
          <TabBtn type={ApplicationStatus.PENDING} label="Pending" icon={Clock} />
          <TabBtn type={ApplicationStatus.APPROVED} label="Approved" icon={CheckCircle2} />
          <TabBtn type={ApplicationStatus.REJECTED} label="Rejected" icon={XCircle} />
          <TabBtn type="ALL" label="All History" icon={Filter} />
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
          ) : filteredApps.length === 0 ? (
            <div className="py-20 text-center space-y-4">
               <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <Filter size={32} />
               </div>
               <div>
                  <p className="text-slate-900 dark:text-white font-bold">No applications found</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">There are no records matching your current filter.</p>
               </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApps.map(app => (
                <Card 
                  key={app.id} 
                  className={`group relative overflow-hidden flex flex-col h-full border-2 transition-all ${
                    app.status === ApplicationStatus.PENDING ? 'hover:border-blue-500' : 'opacity-80'
                  }`}
                  onClick={() => setSelectedApp(app)}
                >
                   <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner group-hover:scale-110 transition-transform">
                        {app.name.charAt(0)}
                      </div>
                      <Badge variant={
                        app.status === ApplicationStatus.PENDING ? 'warning' : 
                        app.status === ApplicationStatus.APPROVED ? 'success' : 'danger'
                      }>
                        {app.status}
                      </Badge>
                   </div>
                   
                   <h3 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">{app.name}</h3>
                   <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                      <Mail size={12} className="mr-1.5" /> {app.email}
                   </div>
                   
                   <div className="flex flex-wrap gap-1.5 mb-6 flex-1">
                      {app.languages.slice(0, 3).map(l => (
                        <span key={l} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-tighter">
                          {l}
                        </span>
                      ))}
                      {app.languages.length > 3 && <span className="text-[10px] text-slate-400 font-bold">+{app.languages.length - 3}</span>}
                   </div>

                   <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        {new Date(app.submittedAt).toLocaleDateString()}
                      </span>
                      <button className="text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest flex items-center group-hover:translate-x-1 transition-transform">
                        Review <Info size={14} className="ml-1.5" />
                      </button>
                   </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      <Modal isOpen={!!selectedApp} onClose={() => setSelectedApp(null)} title="Application Review" maxWidth="lg">
        {selectedApp && (
          <div className="space-y-8">
             <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center">
                   <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-blue-600/20 mr-4">
                      {selectedApp.name.charAt(0)}
                   </div>
                   <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedApp.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Candidate Submission ID: {selectedApp.id.substring(0,8)}</p>
                   </div>
                </div>
                <Badge variant={selectedApp.status === ApplicationStatus.PENDING ? 'warning' : selectedApp.status === ApplicationStatus.APPROVED ? 'success' : 'danger'}>
                   {selectedApp.status}
                </Badge>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Identity & Location</h4>
                      <div className="space-y-3">
                         <div className="flex items-center text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                           <Mail size={16} className="mr-3 text-blue-500" /> 
                           {selectedApp.email}
                         </div>
                         <div className="flex items-center text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                           <Phone size={16} className="mr-3 text-blue-500" /> 
                           {selectedApp.phone}
                         </div>
                         <div className="flex items-center text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                           <MapPin size={16} className="mr-3 text-blue-500" /> 
                           {selectedApp.postcode}
                         </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-6">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Professional Arsenal</h4>
                      <div className="flex flex-wrap gap-2 mb-4">
                         {selectedApp.languages.map(l => <Badge key={l} variant="info">{l}</Badge>)}
                      </div>
                      <div className="space-y-2">
                         <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Validated Credentials</h4>
                         <div className="flex flex-wrap gap-2">
                           {selectedApp.qualifications.length > 0 ? selectedApp.qualifications.map(q => (
                             <span key={q} className="text-xs font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-3 py-1 rounded-lg border border-purple-100 dark:border-purple-800 flex items-center">
                               <Award size={12} className="mr-1.5" /> {q}
                             </span>
                           )) : <span className="text-xs text-slate-400 italic">No certificates listed</span>}
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Candidate Narrative</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 italic leading-relaxed shadow-inner">
                  "{selectedApp.experienceSummary || 'No summary provided.'}"
                </p>
             </div>

             {selectedApp.status === ApplicationStatus.PENDING && (
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start">
                   <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-xl mr-4 mt-0.5">
                     <Info size={18} className="text-blue-600 dark:text-blue-400" />
                   </div>
                   <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                     Approving this candidate will automatically generate their <strong>professional profile</strong> and <strong>secure login credentials</strong>. They will receive an automated invitation email.
                   </p>
                </div>
             )}

             <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-end gap-3 items-center">
                {selectedApp.status === ApplicationStatus.PENDING ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => handleReject(selectedApp)} 
                      className="w-full sm:w-auto px-6 py-3 text-red-600 dark:text-red-400 text-sm font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors"
                    >
                      Reject Application
                    </button>
                    <Button 
                      variant="primary" 
                      icon={UserPlus} 
                      isLoading={processingId === selectedApp.id} 
                      onClick={() => handleApprove(selectedApp)}
                      className="w-full sm:w-auto h-12 px-8"
                    >
                      Onboard Professional
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setSelectedApp(null)} className="w-full sm:w-auto">
                    Close Review
                  </Button>
                )}
             </div>
          </div>
        )}
      </Modal>
    </div>
  );
};