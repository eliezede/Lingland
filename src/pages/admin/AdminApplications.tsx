import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
const ONBOARDING_DOCUMENTS = [
  { id: 'dbs', label: 'DBS Certificate' },
  { id: 'idCheck', label: 'ID Verification' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'rightToWork', label: 'Right to Work' },
] as const;

const getTabFromSearch = (search: string): TabType => {
  const tab = new URLSearchParams(search).get('tab') as TabType | null;
  return tab && APPLICATION_TABS.includes(tab) ? tab : 'ALL';
};

const getOnboardingDocs = (item: any) => ONBOARDING_DOCUMENTS.map(doc => item.onboarding?.[doc.id]);

const getVerifiedDocCount = (item: any) => getOnboardingDocs(item).filter(doc => doc?.status === 'VERIFIED').length;

const getReviewDocCount = (item: any) => getOnboardingDocs(item).filter(doc => doc?.status === 'IN_REVIEW').length;

export const AdminApplications = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(() => getTabFromSearch(location.search));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const deskReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Onboarding Desk' };

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

  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    if (tab === 'ALL') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    navigate(query ? `/admin/applications?${query}` : '/admin/applications', { replace: true });
  };

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
      if (!(activationResult as any)?.suppressed) {
        await InterpreterService.updateProfile(newInt.id, { activationEmailSentAt: new Date().toISOString() });
      }

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
      className: 'min-w-[220px]',
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
            {(item.nrpsi?.registered || item.dpsi) && (
              <div className="mt-1 flex items-center gap-1">
                {item.nrpsi?.registered && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">NRPSI</span>}
                {item.dpsi && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">DPSI</span>}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      className: 'w-[130px]',
      accessor: (item: any) => {
        if (item.itemType === 'ONBOARDING_INTERPRETER') {
          const reviewCount = getReviewDocCount(item);
          const isPendingActivation = item.status === 'IMPORTED';
          return (
            <div className="flex flex-col gap-1">
              <Badge variant={reviewCount ? 'warning' : isPendingActivation ? 'info' : 'info'}>
                {isPendingActivation ? 'PENDING ACTIVATION' : reviewCount ? 'DOCS PENDING' : item.status}
              </Badge>
              {reviewCount > 0 && <span className="text-[9px] text-amber-600 dark:text-amber-500 font-bold uppercase animate-pulse italic">{reviewCount} to review</span>}
            </div>
          );
        }
        return <Badge variant={item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' ? 'success' : 'danger'}>{item.status}</Badge>;
      }
    },
    {
      header: 'Languages',
      className: 'min-w-[170px]',
      accessor: (item: any) => (
        <div className="flex max-w-[210px] flex-wrap items-center gap-1.5">
          {(item.languageProficiencies || []).filter((p: any) => p.l1 <= 1).map((p: any) => (
            <span key={p.language} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded text-[10px] font-black uppercase">
              {p.language}
            </span>
          ))}
        </div>
      )
    },
    {
      header: 'Documents',
      className: 'w-[130px]',
      accessor: (item: any) => {
        if (item.itemType !== 'ONBOARDING_INTERPRETER') {
          return <span className="text-xs font-semibold text-slate-400">Application file</span>;
        }
        const verified = getVerifiedDocCount(item);
        const review = getReviewDocCount(item);
        return (
          <div className="min-w-[120px]">
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full bg-emerald-500" style={{ width: `${(verified / 4) * 100}%` }} />
              </div>
              <span className="text-xs font-black text-slate-700 dark:text-slate-200">{verified}/4</span>
            </div>
            <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${review ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
              {review ? `${review} awaiting review` : 'No review queue'}
            </p>
          </div>
        );
      }
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

  const tabCounts = APPLICATION_TABS.reduce((acc, tab) => ({
    ...acc,
    [tab]: tab === 'ALL' ? items.length :
      tab === 'ONBOARDING' ? items.filter(i => i.itemType === 'ONBOARDING_INTERPRETER').length :
        items.filter(i => i.itemType === 'APPLICATION' && i.status === tab).length,
  }), {} as Record<TabType, number>);
  const selectedInterpDocuments = selectedInterp
    ? ONBOARDING_DOCUMENTS.map(doc => ({ ...doc, data: selectedInterp.onboarding?.[doc.id] }))
    : [];
  const selectedInterpVerifiedCount = selectedInterpDocuments.filter(doc => doc.data?.status === 'VERIFIED').length;
  const selectedInterpReviewCount = selectedInterpDocuments.filter(doc => doc.data?.status === 'IN_REVIEW').length;
  const selectedInterpAllDocsVerified = selectedInterpDocuments.length > 0 && selectedInterpDocuments.every(doc => doc.data?.status === 'VERIFIED');

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50 transition-colors dark:bg-slate-950">
      <PageHeader
        title="Onboarding Desk"
        subtitle="Applications, imported professionals and compliance review in one queue."
      />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 lg:px-5 lg:pb-5">
        <div className="sticky top-0 z-10 flex flex-col gap-2 border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
            {APPLICATION_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => selectTab(tab)}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-black uppercase tracking-wide transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {tab}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {tabCounts[tab] || 0}
                </span>
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
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

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center">
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-lg font-black text-white">
                  {selectedApp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{selectedApp.name}</h3>
                  <div className="mt-1 flex items-center text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    New Application
                  </div>
                </div>
              </div>
              <Badge variant={selectedApp.status === 'PENDING' ? 'warning' : selectedApp.status === 'APPROVED' ? 'success' : 'info'}>
                {selectedApp.status}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 text-xs font-bold text-slate-700 sm:grid-cols-2">
                <div className="border border-slate-200 bg-white p-3 text-slate-900 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-black mb-1">Email</p>
                  {selectedApp.email}
                </div>
                <div className="border border-slate-200 bg-white p-3 text-slate-900 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-black mb-1">Phone</p>
                  {selectedApp.phone}
                </div>
              </div>

              <div className="border border-slate-200 bg-slate-50 p-3 transition-colors dark:border-slate-800 dark:bg-slate-900/50">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Language Matrix</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedApp.languages?.map((l: string) => (
                    <span key={l} className="border border-slate-200 bg-white px-2 py-1 font-bold uppercase text-slate-600 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-start border border-blue-100 bg-blue-50 px-3 py-2 transition-colors dark:border-blue-900/30 dark:bg-blue-900/20">
                <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 mr-3" />
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed font-bold">
                  Approving this candidate will instantly create their professional profile and login credentials.
                </p>
              </div>

              {selectedApp.status === 'PENDING' && (
                <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 transition-colors dark:border-slate-800">
                  <Button
                    variant="primary"
                    icon={UserPlus}
                    isLoading={processingId === selectedApp.id}
                    onClick={() => handleApprove(selectedApp)}
                    className="h-10 w-full"
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
          <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between border border-amber-200 bg-amber-50 p-4 transition-colors dark:border-amber-900/30 dark:bg-amber-950/20">
              <div className="flex items-center">
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-md bg-amber-500 text-lg font-black text-white">
                  {selectedInterp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-black leading-tight text-slate-900 dark:text-white">{selectedInterp.name}</h3>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-500">
                    <Clock size={12} className="animate-spin-slow" />
                    Onboarding Verification
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                    {selectedInterpVerifiedCount}/4 verified
                  </p>
                  <p className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400/70">
                    {selectedInterpReviewCount ? `${selectedInterpReviewCount} awaiting review` : 'No review queue'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ArrowUpRight}
                  onClick={() => navigate(`/admin/interpreters/${selectedInterp.id}`, { state: deskReturnState })}
                >
                  Profile
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between pl-1">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Compliance Documents</h4>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full bg-emerald-500" style={{ width: `${(selectedInterpVerifiedCount / 4) * 100}%` }} />
                </div>
              </div>
              
              {selectedInterpDocuments.map(doc => (
                <div key={doc.id} className="border border-slate-200 bg-white p-3 transition-colors hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-md p-2 transition-colors ${doc.data?.status === 'VERIFIED' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : doc.data?.status === 'IN_REVIEW' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
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

            <div className="border-t border-slate-200 pt-5 transition-colors dark:border-slate-800">
              <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 transition-colors dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${selectedInterpAllDocsVerified ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {selectedInterpAllDocsVerified ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white">Onboarding finalization</h5>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Activate this professional only after every compliance document is verified.
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  className="h-10 w-full"
                  icon={UserPlus}
                  isLoading={processingId === selectedInterp.id}
                  onClick={() => handleCompleteOnboarding(selectedInterp)}
                  disabled={!selectedInterpAllDocsVerified}
                >
                  Confirm & Activate Profile
                </Button>
                {!selectedInterpAllDocsVerified && (
                    <p className="flex items-center justify-center gap-1 text-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
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
