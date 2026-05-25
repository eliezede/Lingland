import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ApplicationService } from '../../services/applicationService';
import { InterpreterService, UserService } from '../../services/api';
import { InterpreterApplication, ApplicationStatus, UserRole, NotificationType, OnboardingDocStatus } from '../../types';
import { EmailService } from '../../services/emailService';
import { NotificationService } from '../../services/notificationService';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { PageHeader } from '../../components/layout/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  Mail, Phone, Check, UserPlus, Info,
  CheckCircle2, XCircle, Clock, Search, Eye, ArrowUpRight, ShieldCheck, FileText, ExternalLink, AlertCircle
} from 'lucide-react';
import { ensureInterpreterOnboarding } from '../../utils/interpreterFlow';

type TabType = ApplicationStatus | 'ALL' | 'ONBOARDING';
const APPLICATION_TABS: TabType[] = ['ALL', ApplicationStatus.PENDING, 'ONBOARDING', ApplicationStatus.APPROVED, ApplicationStatus.REJECTED];

const getTabFromSearch = (search: string): TabType => {
  const tab = new URLSearchParams(search).get('tab') as TabType | null;
  return tab && APPLICATION_TABS.includes(tab) ? tab : 'ALL';
};

export const AdminApplications = () => {
  const location = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(() => getTabFromSearch(location.search));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedInterp, setSelectedInterp] = useState<any>(null);
  const [isDocDrawerOpen, setIsDocDrawerOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [updatingDoc, setUpdatingDoc] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setActiveTab(getTabFromSearch(location.search));
  }, [location.search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const apps = await ApplicationService.getAll();
      const interps = await InterpreterService.getAll();
      const onboardingInterps = interps.filter(i => ['ONBOARDING', 'IMPORTED', 'APPLICANT'].includes(i.status));
      
      const normalizedApps = apps.map(a => ({ ...a, itemType: 'APPLICATION' }));
      const normalizedInterps = onboardingInterps.map(i => ({ ...i, itemType: 'ONBOARDING_INTERPRETER' }));
      
      setItems([...normalizedApps, ...normalizedInterps]);
    } catch (e) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (app: InterpreterApplication) => {
    const ok = await confirm({
      title: 'Approve Application',
      message: `Approve ${app.name}? This will instantly create an Interpreter profile and User account.`,
      confirmLabel: 'Approve & Provision',
      variant: 'primary'
    });
    if (!ok) return;

    setProcessingId(app.id);
    try {
      const allUsers = await UserService.getAll();
      const existingUser = allUsers.find(u => u.email.toLowerCase() === app.email.toLowerCase());

      if (existingUser) {
        showToast(`User with email ${app.email} already exists.`, 'error');
        return;
      }

      const newInt = await InterpreterService.create({
        name: app.name,
        shortName: app.shortName || app.name.split(' ')[0],
        email: app.email,
        phone: app.phone,
        gender: app.gender,
        address: app.address,
        hasCar: app.hasCar,
        skypeId: app.skypeId,
        languages: app.languages,
        languageProficiencies: app.languageProficiencies,
        regions: [app.address.postcode],
        nrpsi: app.nrpsi,
        dpsi: app.dpsi,
        qualifications: app.qualifications,
        dbsExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ONBOARDING',
        isAvailable: false,
        acceptsDirectAssignment: true,
        organizationId: 'lingland-main',
        onboarding: ensureInterpreterOnboarding({}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any);

      const newUser = await UserService.create({
        displayName: app.name,
        email: app.email,
        role: UserRole.INTERPRETER,
        profileId: newInt.id,
        status: 'IMPORTED'
      });

      await EmailService.sendApplicationEmail(app, 'APPROVED');
      const activationResult = await UserService.sendActivationInvite(app.email, app.name);
      await InterpreterService.updateProfile(newInt.id, { activationEmailSentAt: new Date().toISOString() });

      if (newUser && newUser.id) {
        NotificationService.notify(
          activationResult?.userId || newUser.id,
          'Welcome to Lingland!',
          'Your account has been successfully provisioned. Please complete your onboarding by uploading your compliance documents.',
          NotificationType.SUCCESS,
          '/interpreter/dashboard'
        );
      }

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
    const ok = await confirm({
      title: 'Reject Application',
      message: `Are you sure you want to reject the application from ${app.name}?`,
      confirmLabel: 'Reject Application',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await ApplicationService.updateStatus(app.id, ApplicationStatus.REJECTED);
      showToast('Application rejected', 'info');
      setSelectedApp(null);
      await loadData();
    } catch (e) {
      showToast('Failed to reject', 'error');
    }
  };

  const handleBulkStatus = async (ids: string[], status: ApplicationStatus) => {
    const ok = await confirm({
      title: 'Bulk Action',
      message: `Change status to ${status} for ${ids.length} applications?`,
      confirmLabel: `Mark as ${status}`,
      variant: status === 'APPROVED' ? 'primary' : 'warning'
    });
    if (!ok) return;
    setIsBulkLoading(true);
    let done = 0;
    for (const id of ids) {
      try {
        await ApplicationService.updateStatus(id, status);
        done++;
      } catch { /* silent */ }
    }
    showToast(`${done} items updated`, 'success');
    setSelectedIds([]);
    setIsBulkLoading(false);
    await loadData();
  };

  const handleUpdateDocStatus = async (interp: any, docType: string, newStatus: OnboardingDocStatus) => {
    setUpdatingDoc(docType);
    try {
      const updatedOnboarding = {
        ...interp.onboarding,
        [docType]: {
          ...(interp.onboarding?.[docType] || {}),
          status: newStatus
        }
      };
      
      await InterpreterService.updateProfile(interp.id, {
        onboarding: updatedOnboarding
      });
      
      showToast(`Document ${docType} marked as ${newStatus}`, 'success');
      
      // Update local state
      setItems(prev => prev.map(item => 
        item.id === interp.id ? { ...item, onboarding: updatedOnboarding } : item
      ));
      
      // Update selectedInterp for the drawer
      setSelectedInterp((prev: any) => ({ ...prev, onboarding: updatedOnboarding }));
    } catch (e) {
      showToast('Failed to update status', 'error');
    } finally {
      setUpdatingDoc(null);
    }
  };

  const handleCompleteOnboarding = async (interp: any) => {
    const ok = await confirm({
      title: 'Finalize Onboarding',
      message: `Mark ${interp.name} as ACTIVE? This completes their onboarding and grants full portal access.`,
      confirmLabel: 'Activate Interpreter',
      variant: 'primary'
    });
    if (!ok) return;
    setProcessingId(interp.id);
    try {
      await InterpreterService.updateProfile(interp.id, {
        status: 'ACTIVE',
        isAvailable: true,
        updatedAt: new Date().toISOString(),
        onboarding: {
          ...(interp.onboarding || {}),
          overallStatus: 'COMPLETED'
        }
      });
      showToast('Onboarding completed! Interpreter is now ACTIVE.', 'success');
      setIsDocDrawerOpen(false);
      await loadData();
    } catch (e) {
      showToast('Failed to complete onboarding', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredItems = React.useMemo(() => {
    return items.filter(item => {
      let matchesStatus = false;
      if (activeTab === 'ALL') {
        matchesStatus = true;
      } else if (activeTab === 'ONBOARDING') {
        matchesStatus = item.itemType === 'ONBOARDING_INTERPRETER';
      } else {
        matchesStatus = item.itemType === 'APPLICATION' && item.status === activeTab;
      }

      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesSearch;
    });
  }, [items, activeTab, searchTerm]);

  const columns = React.useMemo(() => [
    {
      header: 'Candidate',
      accessor: (item: any) => (
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-lg ${item.itemType === 'ONBOARDING_INTERPRETER' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-500'} flex items-center justify-center font-bold`}>
            {item.name.charAt(0)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white leading-none">{item.name}</span>
              {item.itemType === 'ONBOARDING_INTERPRETER' && (
                <span className="text-[8px] font-black bg-amber-500 text-white px-1 rounded uppercase tracking-tighter shadow-sm">Onboarding</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-tighter">{item.email}</span>
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: (item: any) => {
        if (item.itemType === 'ONBOARDING_INTERPRETER') {
          const ob = item.onboarding;
          const hasPending = [ob?.dbs, ob?.idCheck, ob?.certifications, ob?.rightToWork].some(d => d?.status === 'IN_REVIEW');
          const isPendingActivation = item.status === 'IMPORTED';
          return (
            <div className="flex flex-col gap-1">
              <Badge variant={hasPending ? 'warning' : isPendingActivation ? 'info' : 'info'}>
                {isPendingActivation ? 'PENDING ACTIVATION' : hasPending ? 'DOCS PENDING' : item.status}
              </Badge>
              {hasPending && <span className="text-[9px] text-amber-600 dark:text-amber-500 font-bold uppercase animate-pulse italic">Action Required</span>}
            </div>
          );
        }
        return <Badge variant={item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' ? 'success' : 'danger'}>{item.status}</Badge>;
      }
    },
    {
      header: 'L1 Primary',
      accessor: (item: any) => (
        <div className="flex items-center space-x-2">
          {(item.languageProficiencies || []).filter((p: any) => p.l1 <= 1).map((p: any) => (
            <span key={p.language} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded text-[10px] font-black uppercase">
              {p.language}
            </span>
          ))}
        </div>
      )
    },
    {
      header: 'Qualifications',
      accessor: (item: any) => (
        <div className="flex flex-col gap-1">
          {item.nrpsi?.registered && <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><Check size={10} className="text-emerald-500" /> NRPSI</span>}
          {item.dpsi && <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><Check size={10} className="text-emerald-500" /> DPSI</span>}
        </div>
      )
    },
    {
      header: 'Action',
      accessor: (item: any) => (
        <div className="flex items-center space-x-2">
          {item.itemType === 'ONBOARDING_INTERPRETER' ? (
            <Button
              size="sm"
              variant="secondary"
              icon={ShieldCheck}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedInterp(item);
                setIsDocDrawerOpen(true);
              }}
            >
              Review Docs
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={ArrowUpRight}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedApp(item);
              }}
            >
              View
            </Button>
          )}
        </div>
      )
    }
  ], []);

  const handleRowClick = (item: any) => {
    if (item.itemType === 'ONBOARDING_INTERPRETER') {
      setSelectedInterp(item);
      setIsDocDrawerOpen(true);
    } else {
      setSelectedApp(item);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors">
      <PageHeader
        title="Onboarding Desk"
        subtitle="Manage new interpreter applications and active onboarding documents."
      >
        <div className="flex items-center bg-white dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-hide transition-colors">
          {APPLICATION_TABS.map(tab => {
            const count = tab === 'ALL' ? items.length : 
                         tab === 'ONBOARDING' ? items.filter(i => i.itemType === 'ONBOARDING_INTERPRETER').length :
                         items.filter(i => i.itemType === 'APPLICATION' && i.status === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeTab === tab
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 group'
                  }`}
              >
                {tab}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PageHeader>

      <div className="flex-1 p-4 lg:p-6 overflow-hidden flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <BulkActionBar
            selectedIds={selectedIds}
            selectedCount={selectedIds.length}
            totalCount={filteredItems.length}
            onClearSelection={() => setSelectedIds([])}
            actions={[
              { label: 'Reject', onClick: () => handleBulkStatus(selectedIds, ApplicationStatus.REJECTED), variant: 'danger', icon: XCircle },
            ]}
          />
        </div>

        <div className="flex-1 bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-colors">
          <Table
            columns={columns}
            data={filteredItems}
            isLoading={loading}
            onRowClick={handleRowClick}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </div>
      </div>

      {/* Application Review Modal */}
      <Modal
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        title="Application Review"
        type="drawer"
      >
        {selectedApp && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors shadow-sm">
              <div className="flex items-center">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-blue-600/20 mr-4">
                  {selectedApp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedApp.name}</h3>
                  <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase font-black tracking-widest">
                    New Application
                  </div>
                </div>
              </div>
              <Badge variant={selectedApp.status === 'PENDING' ? 'warning' : selectedApp.status === 'APPROVED' ? 'success' : 'info'}>
                {selectedApp.status}
              </Badge>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-300 transition-colors">
                  <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-black mb-1">Email</p>
                  {selectedApp.email}
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-300 transition-colors">
                  <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-black mb-1">Phone</p>
                  {selectedApp.phone}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dotted border-slate-200 dark:border-slate-800 transition-colors">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Language Matrix</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedApp.languages?.map((l: string) => (
                    <span key={l} className="px-3 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-400 uppercase transition-colors">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start transition-colors">
                <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 mr-3" />
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed font-bold">
                  Approving this candidate will instantly create their professional profile and login credentials.
                </p>
              </div>

              {selectedApp.status === 'PENDING' && (
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 transition-colors">
                  <Button
                    variant="primary"
                    icon={UserPlus}
                    isLoading={processingId === selectedApp.id}
                    onClick={() => handleApprove(selectedApp)}
                    className="w-full h-12"
                  >
                    Approve & Provision
                  </Button>
                  <button
                    onClick={() => handleReject(selectedApp)}
                    className="w-full py-3 text-red-600 dark:text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all"
                  >
                    Reject Application
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Document Review Drawer */}
      <Modal
        isOpen={isDocDrawerOpen}
        onClose={() => setIsDocDrawerOpen(false)}
        title="Compliance Review Hub"
        type="drawer"
      >
        {selectedInterp && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/20 p-5 rounded-3xl border border-amber-100 dark:border-amber-900/30 shadow-sm shadow-amber-500/5 transition-colors">
              <div className="flex items-center">
                <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-amber-500/20 mr-4">
                  {selectedInterp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{selectedInterp.name}</h3>
                  <div className="flex items-center text-[10px] text-amber-600 dark:text-amber-500 mt-1 uppercase font-black tracking-widest gap-2">
                    <Clock size={12} className="animate-spin-slow" />
                    Onboarding Verification
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Compliance Documents</h4>
              
              {[
                { id: 'dbs', label: 'DBS Certificate', data: selectedInterp.onboarding?.dbs },
                { id: 'idCheck', label: 'ID Verification', data: selectedInterp.onboarding?.idCheck },
                { id: 'certifications', label: 'Certifications', data: selectedInterp.onboarding?.certifications },
                { id: 'rightToWork', label: 'Right to Work', data: selectedInterp.onboarding?.rightToWork }
              ].map(doc => (
                <div key={doc.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:border-blue-200 dark:hover:border-blue-900 transition-colors group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${doc.data?.status === 'VERIFIED' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : doc.data?.status === 'IN_REVIEW' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                        <FileText size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-none mb-1">{doc.label}</p>
                        <Badge variant={doc.data?.status === 'VERIFIED' ? 'success' : doc.data?.status === 'IN_REVIEW' ? 'warning' : 'info'}>
                          {doc.data?.status || 'MISSING'}
                        </Badge>
                      </div>
                    </div>
                    {doc.data?.url && (
                      <a 
                        href={doc.data.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="View Document"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    {doc.data?.shareCode && (
                       <div className="flex flex-col items-end">
                         <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Share Code</span>
                         <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded leading-none">{doc.data.shareCode}</span>
                       </div>
                    )}
                  </div>

                  {doc.data?.status === 'IN_REVIEW' && (
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-50 dark:border-slate-800 transition-colors">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 border-none shadow-emerald-500/20"
                        icon={Check}
                        isLoading={updatingDoc === doc.id}
                        onClick={() => handleUpdateDocStatus(selectedInterp, doc.id, 'VERIFIED')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className="flex-1 h-9 rounded-xl"
                        icon={XCircle}
                        isLoading={updatingDoc === doc.id}
                        onClick={() => handleUpdateDocStatus(selectedInterp, doc.id, 'REJECTED')}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-8 border-t border-slate-100 dark:border-slate-800 transition-colors">
              <div className="p-4 bg-slate-900 dark:bg-slate-950 rounded-2xl shadow-xl shadow-slate-900/20 text-white flex flex-col gap-4 border border-transparent dark:border-slate-800 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm">Onboarding Finalization</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Push this candidate to ACTIVE status once all compliance checks are verified.</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-500 border-none"
                  icon={UserPlus}
                  isLoading={processingId === selectedInterp.id}
                  onClick={() => handleCompleteOnboarding(selectedInterp)}
                  disabled={![
                    selectedInterp.onboarding?.dbs?.status,
                    selectedInterp.onboarding?.idCheck?.status,
                    selectedInterp.onboarding?.certifications?.status,
                    selectedInterp.onboarding?.rightToWork?.status
                  ].every(s => s === 'VERIFIED')}
                >
                  Confirm & Activate Profile
                </Button>
                {![
                    selectedInterp.onboarding?.dbs?.status,
                    selectedInterp.onboarding?.idCheck?.status,
                    selectedInterp.onboarding?.certifications?.status,
                    selectedInterp.onboarding?.rightToWork?.status
                  ].every(s => s === 'VERIFIED') && (
                    <p className="text-[10px] text-center text-amber-500 font-bold flex items-center justify-center gap-1">
                      <AlertCircle size={10} /> All documents must be verified first
                    </p>
                  )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
