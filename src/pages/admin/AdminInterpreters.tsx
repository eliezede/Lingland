import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InterpreterService } from '../../services/interpreterService';
import { BookingService } from '../../services/bookingService';
import { ChatService } from '../../services/chatService';
import { Interpreter, BookingStatus } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { ViewToggle } from '../../components/ui/ViewToggle';
import { PageHeader } from '../../components/layout/PageHeader';
import { Table } from '../../components/ui/Table';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  Search, MapPin, Languages, ShieldCheck, Check, MessageSquare,
  AlertCircle, Trash2, Calendar, Mail, Phone, ExternalLink, UserCircle2, ChevronRight, Users, User, Clock
} from 'lucide-react';

export const AdminInterpreters = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);

  const [textFilter, setTextFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED' | 'IMPORTED'>('ALL');

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedInterpreter, setSelectedInterpreter] = useState<Interpreter | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [interpreterJobs, setInterpreterJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    loadInterpreters();
  }, []);

  const loadInterpreters = async () => {
    setLoading(true);
    try {
      const data = await InterpreterService.getAll();
      setInterpreters(data);
    } catch (error) {
      console.error('Error loading interpreters', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInterpreters = interpreters.filter(i => {
    const matchesText = i.name.toLowerCase().includes(textFilter.toLowerCase()) ||
      i.email.toLowerCase().includes(textFilter.toLowerCase());
    const matchesLang = langFilter ? i.languages.some(l => l.toLowerCase().includes(langFilter.toLowerCase())) : true;
    const matchesStatus = statusFilter === 'ALL' ? true : i.status === statusFilter;
    return matchesText && matchesLang && matchesStatus;
  });

  const handleStartChat = async (e: React.MouseEvent | undefined, interpreterId: string | undefined, interpreterName: string | undefined, interpreterPhoto?: string) => {
    if (e) e.stopPropagation();
    if (!user || !interpreterId) return;

    try {
      const names = {
        [user.id]: user.displayName || 'Admin',
        [interpreterId]: interpreterName || 'Interpreter'
      };

      const photos = {
        [user.id]: user.photoUrl || '',
        [interpreterId]: interpreterPhoto || selectedInterpreter?.photoUrl || ''
      };

      const threadId = await ChatService.getOrCreateThread(
        [user.id, interpreterId],
        names,
        photos
      );

      openThread(threadId);
    } catch (error) {
      console.error("Failed to start chat", error);
    }
  };


  const handleOpenPreview = async (interpreter: Interpreter) => {
    setSelectedInterpreter(interpreter);
    setIsPreviewOpen(true);
    setLoadingJobs(true);
    try {
      const jobs = await BookingService.getByInterpreterId(interpreter.id);
      setInterpreterJobs(jobs);
    } catch (error) {
      console.error("Failed to load interpreter jobs", error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    let done = 0;
    for (const id of selectedIds) {
      try {
        await InterpreterService.updateProfile(id, { status: status as any });
        done++;
      } catch (err) { /* silent */ }
    }
    showToast(`Updated ${done} interpreters to ${status}`, 'success');
    setSelectedIds([]);
    loadInterpreters();
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Bulk Delete Interpreters',
      message: `Are you sure you want to permanently delete ${selectedIds.length} interpreters? This will remove their profile data and account access.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger'
    });
    if (!ok) return;
    let done = 0;
    for (const id of selectedIds) {
      try {
        await InterpreterService.delete(id);
        done++;
      } catch (err) { /* silent */ }
    }
    showToast(`Deleted ${done} interpreters`, 'success');
    setSelectedIds([]);
    loadInterpreters();
  };

  const formatFullAddress = (i: Interpreter) => {
    if (!i.address) return i.regions[0] || 'No address';
    const { street, town, county, postcode } = i.address;
    const parts = [street, town || county, postcode].filter(Boolean);
    return parts.join(', ') || i.regions[0] || 'No address';
  };

  const interpreterColumns = [
    {
      header: 'Interpreter',
      accessor: (i: Interpreter) => (
        <div className="flex items-center gap-3">
          <UserAvatar src={i.photoUrl} name={i.name} size="sm" />
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{i.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{i.email}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Languages & Priority',
      accessor: (i: Interpreter) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {(i.languageProficiencies && i.languageProficiencies.length > 0 ? i.languageProficiencies : i.languages.map(l => ({ language: l, l1: 18 }))).slice(0, 3).map(p => (
            <span key={p.language} className="bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {p.language} <span className="text-indigo-600 dark:text-indigo-400 ml-0.5">P{p.l1}</span>
            </span>
          ))}
          {i.languages.length > 3 && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">+{i.languages.length - 3}</span>}
        </div>
      )
    },
    {
      header: 'Region / Address',
      accessor: (i: Interpreter) => (
        <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 py-1">
          <MapPin size={12} className="mt-0.5 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
              {i.address?.street || 'No street'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
              {i.address?.town || i.address?.county || ''} {i.address?.postcode || ''}
            </span>
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: (i: Interpreter) => (
        <div className="flex flex-col gap-1">
          <Badge variant={i.status === 'ACTIVE' ? 'success' : i.status === 'SUSPENDED' ? 'danger' : i.status === 'IMPORTED' ? 'info' : 'warning'}>
            {i.status}
          </Badge>
          {i.onboarding?.overallStatus === 'IN_REVIEW' && (
            <span className="text-[10px] font-black text-blue-600 flex items-center gap-1 animate-pulse">
              <Clock size={10} /> Docs in Review
            </span>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Interpreters Matrix"
        subtitle="Directory of certified freelancers and agencies."
        stats={{ label: "Active Pool", value: interpreters.length }}
      />

      <div className="bg-white dark:bg-slate-900/50 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row items-center gap-2 transition-colors">
        <div className="flex-1 relative w-full h-10">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search name or email..."
            className="pl-10 pr-4 py-2 bg-transparent text-sm w-full h-full outline-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
          />
        </div>
        <div className="w-full lg:w-64 h-10 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800">
          <input
            type="text"
            placeholder="Filter language..."
            className="px-4 py-2 bg-transparent text-sm w-full h-full outline-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
            value={langFilter}
            onChange={e => setLangFilter(e.target.value)}
          />
        </div>
        <div className="w-full lg:w-48 relative h-10 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800">
          <select
            className="px-4 py-2 bg-transparent text-sm w-full h-full outline-none focus:ring-0 text-slate-900 dark:text-white cursor-pointer appearance-none font-medium"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL" className="dark:bg-slate-900">All Statuses</option>
            <option value="ACTIVE" className="dark:bg-slate-900">Active</option>
            <option value="IMPORTED" className="dark:bg-slate-900">Imported (Airtable)</option>
            <option value="ONBOARDING" className="dark:bg-slate-900">Onboarding</option>
            <option value="SUSPENDED" className="dark:bg-slate-900">Suspended</option>
          </select>
          <ChevronRight className="absolute right-3 top-1/2 -rotate-90 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pl-2 lg:pl-2 w-full lg:w-auto flex justify-end">
          <ViewToggle view={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">Synchronizing base...</p>
        </div>
      ) : filteredInterpreters.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="We couldn't find any interpreter matching your search criteria."
          onAction={() => { setTextFilter(''); setLangFilter(''); setStatusFilter('ALL'); }}
          actionLabel="View All Interpreters"
          icon={UserCircle2}
        />
      ) : (
        <div className="relative">
          {viewMode === 'list' ? (
            <Table
              data={filteredInterpreters}
              columns={interpreterColumns}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onRowClick={handleOpenPreview}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredInterpreters.map(interpreter => (
                <div 
                  key={interpreter.id}
                  onClick={() => handleOpenPreview(interpreter)}
                  className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <UserAvatar src={interpreter.photoUrl} name={interpreter.name} size="md" />
                    <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : interpreter.status === 'SUSPENDED' ? 'danger' : interpreter.status === 'IMPORTED' ? 'info' : 'warning'}>
                      {interpreter.status}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">{interpreter.name}</h3>
                  <p className="text-xs text-slate-500 mb-4">{interpreter.email}</p>
                  
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {interpreter.languages.slice(0, 3).map(l => (
                        <span key={l} className="bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{l}</span>
                      ))}
                      {interpreter.languages.length > 3 && <span className="text-[10px] text-slate-400 font-bold">+{interpreter.languages.length - 3}</span>}
                    </div>
                    
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <MapPin size={12} />
                      <span>{interpreter.regions[0] || 'No region'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <BulkActionBar
            selectedCount={selectedIds.length}
            totalCount={filteredInterpreters.length}
            onClearSelection={() => setSelectedIds([])}
            entityLabel="interpreter"
            actions={[
              { label: 'Activate', icon: Check, onClick: () => handleBulkStatusChange('ACTIVE'), variant: 'success' },
              { label: 'Suspend', icon: AlertCircle, onClick: () => handleBulkStatusChange('SUSPENDED'), variant: 'warning' },
              { label: 'Delete', icon: Trash2, onClick: () => handleBulkDelete(), variant: 'danger' }
            ]}
          />
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Interpreter Profile Overview"
        type="drawer"
      >
        {selectedInterpreter && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-start gap-4">
                  <UserAvatar src={selectedInterpreter.photoUrl} name={selectedInterpreter.name} size="xl" />
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{selectedInterpreter.name}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={selectedInterpreter.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {selectedInterpreter.status}
                      </Badge>
                      <span className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        <Mail size={10} /> {selectedInterpreter.email}
                      </span>
                    </div>
                    {/* Capabilities (Languages) in Head */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedInterpreter.languages.map(l => (
                        <span key={l} className="bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={ExternalLink}
                  onClick={() => navigate(`/admin/interpreters/${selectedInterpreter.id}`)}
                  className="text-[10px] font-black uppercase tracking-widest py-1.5 px-3 h-auto"
                >View Full Profile</Button>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Phone size={12} className="shrink-0" />
                  <span className="text-xs font-medium">{selectedInterpreter.phone || 'No phone'}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                  <MapPin size={12} className="shrink-0 mt-0.5" />
                  <span className="text-xs font-medium leading-relaxed">
                    {[
                      selectedInterpreter.address?.street,
                      selectedInterpreter.address?.town,
                      selectedInterpreter.address?.county,
                      selectedInterpreter.address?.postcode
                    ].filter(Boolean).join(', ') || 'No address registered'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                Recent Assignments
              </h3>
              {loadingJobs ? (
                <div className="py-12 flex items-center justify-center"><Spinner /></div>
              ) : interpreterJobs.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4">
                  <AlertCircle className="text-slate-300 dark:text-slate-600 mb-2" size={24} />
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No assigned jobs</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {interpreterJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800 group hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer" onClick={() => navigate(`/admin/bookings/${job.id}`)}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{job.bookingRef || `#${job.id.slice(-4)}`}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{job.date} • {job.startTime}</span>
                      </div>
                      <Badge variant={job.status === 'COMPLETED' ? 'success' : 'info'} className="text-[10px] py-0 px-1.5 h-5">
                        {job.status}
                      </Badge>
                    </div>
                  ))}
                  {interpreterJobs.length > 5 && (
                    <p className="text-[10px] text-center font-medium text-slate-500 dark:text-slate-500 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md mt-2">+{interpreterJobs.length - 5} More historical records</p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 flex gap-3 border-t border-slate-100">
              <Button
                onClick={(e) => handleStartChat(e, selectedInterpreter.id, selectedInterpreter.name)}
                className="flex-1 rounded-md text-sm font-medium py-2 h-auto"
                icon={MessageSquare}
              >Start Direct Message</Button>
              <Button
                variant="outline"
                onClick={() => setIsPreviewOpen(false)}
                className="flex-[0.4] rounded-md text-sm font-medium py-2 h-auto"
              >Dismiss</Button>
            </div>
          </div>
        )}
      </Modal>

    </div >
  );
};