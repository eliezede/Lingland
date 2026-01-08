import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  InterpreterService, BookingService, BillingService, ChatService 
} from '../../../services/api';
import { 
  Interpreter, Booking, InterpreterInvoice, BookingStatus 
} from '../../../types';
import { Spinner } from '../../../components/ui/Spinner';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { 
  ChevronLeft, Mail, Phone, MapPin, Languages, 
  Award, ShieldCheck, ArrowUpRight, FileText, UserCircle2, Edit, Check, MessageSquare
} from 'lucide-react';

type Tab = 'JOBS' | 'FINANCE' | 'COMPLIANCE';

export const AdminInterpreterDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { showToast } = useToast();
  const { settings } = useSettings();
  
  const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('JOBS');

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  const [saving, setSaving] = useState(false);
  const [processingChat, setProcessingChat] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (interpreterId: string) => {
    setLoading(true);
    try {
      const [profile, schedule, financialHistory, offers] = await Promise.all([
        InterpreterService.getById(interpreterId),
        BookingService.getInterpreterSchedule(interpreterId),
        BillingService.getInterpreterInvoices(),
        BookingService.getInterpreterOffers(interpreterId)
      ]);

      setInterpreter(profile || null);

      const offeredBookings = offers
        .filter(o => o.bookingSnapshot && Object.keys(o.bookingSnapshot).length > 0)
        .map(o => ({ 
          ...o.bookingSnapshot, 
          id: o.bookingId,
          status: BookingStatus.OFFERED
        } as Booking));
      
      const mergedJobs = [...schedule];
      offeredBookings.forEach(ob => {
        if (!mergedJobs.find(j => j.id === ob.id)) {
          mergedJobs.push(ob);
        }
      });

      setJobs(mergedJobs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setInvoices(financialHistory.filter(inv => inv.interpreterId === interpreterId));
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!interpreter || !user) return;
    setProcessingChat(true);
    try {
      const names = {
        [user.id]: user.displayName || 'Admin',
        [interpreter.id]: interpreter.name
      };
      const threadId = await ChatService.getOrCreateThread([user.id, interpreter.id], names);
      openThread(threadId);
    } finally {
      setProcessingChat(false);
    }
  };

  const handleEdit = () => {
    if (interpreter) {
      setFormData({ ...interpreter });
      setIsEditModalOpen(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !formData) return;
    
    setSaving(true);
    try {
      await InterpreterService.updateProfile(id, formData);
      showToast('Profile updated successfully', 'success');
      await loadData(id);
      setIsEditModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    const current = formData.languages || [];
    const updated = current.includes(lang)
      ? current.filter(l => l !== lang)
      : [...current, lang];
    setFormData({ ...formData, languages: updated });
  };

  if (loading) return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  if (!interpreter) return <div className="p-12 text-center text-red-500 font-bold">Intérprete não encontrado.</div>;

  const earningsTotal = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
  const upcomingJobs = jobs.filter(j => new Date(j.date) >= new Date() && (j.status === BookingStatus.CONFIRMED || j.status === BookingStatus.OFFERED)).length;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center">
          <button onClick={() => navigate('/admin/interpreters')} className="mr-4 p-2 rounded-xl hover:bg-gray-200 transition-colors text-gray-500">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center">
            <div className="w-16 h-16 rounded-[1.5rem] bg-purple-100 text-purple-700 flex items-center justify-center text-2xl font-black mr-4 border-4 border-white shadow-sm">
              {interpreter.name.charAt(0)}
            </div>
            <div>
               <div className="flex items-center gap-3">
                 <h1 className="text-2xl font-black text-slate-900 tracking-tight">{interpreter.name}</h1>
                 <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : 'warning'}>{interpreter.status}</Badge>
               </div>
               <p className="text-gray-500 text-sm font-medium">ID: {interpreter.id.toUpperCase()}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" icon={MessageSquare} isLoading={processingChat} onClick={handleStartChat}>Mensagem</Button>
           <Button variant="primary" icon={Edit} onClick={handleEdit}>Editar Perfil</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Total de Jobs</p>
           <p className="text-3xl font-black text-slate-900">{jobs.length}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Ganhos Totais</p>
           <p className="text-3xl font-black text-slate-900">£{earningsTotal.toFixed(2)}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6 border-blue-100 bg-blue-50/30">
           <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-1">Agenda Aberta</p>
           <p className="text-3xl font-black text-blue-600">{upcomingJobs}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Avaliação</p>
           <p className="text-3xl font-black text-slate-900">4.9 ★</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card className="space-y-6">
            <h3 className="font-black text-slate-900 flex items-center uppercase text-xs tracking-widest">
              <UserCircle2 size={16} className="mr-2 text-slate-400" />
              Perfil Profissional
            </h3>
            
            <div className="space-y-5">
               <div>
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contatos</label>
                 <div className="mt-2 space-y-2">
                    <div className="flex items-center text-sm font-bold text-slate-700">
                       <Mail size={14} className="mr-2 text-slate-400" /> {interpreter.email}
                    </div>
                    <div className="flex items-center text-sm font-bold text-slate-700">
                       <Phone size={14} className="mr-2 text-slate-400" /> {interpreter.phone}
                    </div>
                 </div>
               </div>

               <div>
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Idiomas</label>
                 <div className="mt-2 flex flex-wrap gap-2">
                    {interpreter.languages.map(lang => (
                      <span key={lang} className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black text-slate-600 uppercase">
                         {lang}
                      </span>
                    ))}
                 </div>
               </div>

               <div>
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Qualificações</label>
                 <div className="mt-2 space-y-2">
                    {interpreter.qualifications.map(qual => (
                      <div key={qual} className="text-xs font-bold text-slate-700 flex items-center">
                         <Award size={14} className="mr-2 text-yellow-600" /> {qual}
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          </Card>

          <Card className="bg-orange-50 border-orange-100">
             <h3 className="font-black text-orange-900 flex items-center mb-4 uppercase text-xs tracking-widest">
              <ShieldCheck size={16} className="mr-2 text-orange-500" />
              Compliance
            </h3>
            <div className="space-y-4">
               <div>
                  <p className="text-[10px] text-orange-700 uppercase font-black tracking-tighter">Vencimento DBS</p>
                  <p className={`text-sm font-black mt-1 ${new Date(interpreter.dbsExpiry) < new Date() ? 'text-red-600' : 'text-slate-900'}`}>
                    {new Date(interpreter.dbsExpiry).toLocaleDateString()}
                    {new Date(interpreter.dbsExpiry) < new Date() && ' (EXPIRADO)'}
                  </p>
               </div>
               <div className="pt-2 border-t border-orange-100 flex justify-between items-center text-[10px] text-orange-700 font-black">
                  <span>Certificado ID: ...8921</span>
                  <button className="text-blue-600 hover:underline">Ver Doc</button>
               </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="flex border-b border-slate-200 bg-slate-50/50">
                <button 
                  onClick={() => setActiveTab('JOBS')}
                  className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'JOBS' ? 'border-b-4 border-blue-600 text-blue-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Jobs ({jobs.length})
                </button>
                <button 
                  onClick={() => setActiveTab('FINANCE')}
                  className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'FINANCE' ? 'border-b-4 border-blue-600 text-blue-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Financeiro ({invoices.length})
                </button>
             </div>

             <div className="p-0">
                {activeTab === 'JOBS' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                       <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-right"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {jobs.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">Nenhum job atribuído.</td></tr>
                          ) : (
                            jobs.map(job => (
                              <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="px-6 py-4">
                                    <div className="text-sm font-black text-slate-900">{new Date(job.date).toLocaleDateString()}</div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">{job.startTime}</div>
                                 </td>
                                 <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-slate-700">{job.clientName}</div>
                                    <div className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">{job.languageTo}</div>
                                 </td>
                                 <td className="px-6 py-4">
                                    <StatusBadge status={job.status} />
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                    <button onClick={() => navigate(`/admin/bookings/${job.id}`)} className="p-2 text-slate-400 hover:text-blue-600 transition-all"><ArrowUpRight size={18} /></button>
                                 </td>
                              </tr>
                            ))
                          )}
                       </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'FINANCE' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                       <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ref</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-right"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {invoices.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">Sem histórico financeiro.</td></tr>
                          ) : (
                            invoices.map(inv => (
                              <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="px-6 py-4">
                                    <div className="text-sm font-black text-slate-900 flex items-center">
                                       <FileText size={14} className="mr-2 text-slate-300" />
                                       {inv.externalInvoiceReference || inv.id.substring(0,8)}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">{new Date(inv.issueDate).toLocaleDateString()}</div>
                                 </td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-900">£{inv.totalAmount.toFixed(2)}</td>
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <InvoiceStatusBadge status={inv.status} />
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                    <button onClick={() => navigate(`/admin/billing/interpreter-invoices/${inv.id}`)} className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800">Gerenciar</button>
                                 </td>
                              </tr>
                            ))
                          )}
                       </tbody>
                    </table>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Perfil" maxWidth="lg">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nome Completo</label>
               <input type="text" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
             </div>
             <div>
               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Status</label>
               <select className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                 <option value="ACTIVE">Active</option>
                 <option value="ONBOARDING">Onboarding</option>
                 <option value="SUSPENDED">Suspended</option>
               </select>
             </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
             <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
             <Button type="submit" isLoading={saving}>Salvar Perfil</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};