import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InterpreterService } from '../../services/interpreterService';
import { Interpreter } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
// Added missing Card component import to resolve reference errors
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { 
  Search, UserCircle2, MapPin, 
  Languages, Edit, Check, Plus, 
  LayoutGrid, List, ArrowUpRight
} from 'lucide-react';

type ViewType = 'grid' | 'list';

export const AdminInterpreters = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<ViewType>('grid');
  
  const [textFilter, setTextFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ONBOARDING'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInterpreters();
  }, []);

  const loadInterpreters = async () => {
    setLoading(true);
    try {
      const data = await InterpreterService.getAll();
      setInterpreters(data || []);
    } catch (error) {
      showToast('Failed to load interpreters', 'error');
    } finally {
      setLoading(false);
    }
  };

  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredInterpreters = (interpreters || []).filter(i => {
    const q = safe(textFilter);
    const matchesText = safe(i.name).includes(q) || safe(i.email).includes(q);
    const matchesLang = langFilter 
      ? (i.languages || []).some(l => safe(l).includes(safe(langFilter))) 
      : true;
    const matchesStatus = statusFilter === 'ALL' ? true : i.status === statusFilter;
    return matchesText && matchesLang && matchesStatus;
  });

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      name: '', email: '', phone: '', languages: [], regions: [], 
      qualifications: [], status: 'ONBOARDING', isAvailable: false,
      dbsExpiry: new Date().toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const handleEdit = (e: React.MouseEvent, interpreter: Interpreter) => {
    e.stopPropagation();
    setEditingId(interpreter.id);
    setFormData({ ...interpreter });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await InterpreterService.updateProfile(editingId, formData);
        showToast('Interpreter updated', 'success');
      } else {
        await InterpreterService.create(formData as any);
        showToast('Interpreter created', 'success');
      }
      await loadInterpreters();
      setIsModalOpen(false);
    } catch (error) {
      showToast('Error saving interpreter', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    const current = formData.languages || [];
    const updated = current.includes(lang) ? current.filter(l => l !== lang) : [...current, lang];
    setFormData({ ...formData, languages: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interpreters</h1>
          <p className="text-gray-500 text-sm">Directory of freelancers and agencies.</p>
        </div>
        <Button icon={Plus} onClick={handleCreate}>New Interpreter</Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="text" placeholder="Search name or email..." 
             className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={textFilter} onChange={e => setTextFilter(e.target.value)}
           />
        </div>
        <div className="w-full md:w-48">
           <select 
             className="px-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
           >
             <option value="ALL">All Statuses</option>
             <option value="ACTIVE">Active</option>
             <option value="ONBOARDING">Onboarding</option>
             <option value="SUSPENDED">Suspended</option>
           </select>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
           <button onClick={() => setViewType('grid')} className={`p-1.5 rounded-md ${viewType === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
           <button onClick={() => setViewType('list')} className={`p-1.5 rounded-md ${viewType === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Spinner size="lg" /></div>
      ) : filteredInterpreters.length === 0 ? (
        <EmptyState title="No interpreters found" description="Try adjusting your filters." actionLabel="Clear Filters" onAction={() => { setTextFilter(''); setLangFilter(''); setStatusFilter('ALL'); }} icon={UserCircle2} />
      ) : viewType === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {filteredInterpreters.map(i => (
             <div key={i.id} onClick={() => navigate(`/admin/interpreters/${i.id}`)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold mr-3">{safe(i.name).charAt(0).toUpperCase() || '?'}</div>
                      <div>
                        <h3 className="font-bold text-gray-900">{i.name || 'Unnamed'}</h3>
                        <p className="text-xs text-gray-500">{i.email}</p>
                      </div>
                   </div>
                   <Badge variant={i.status === 'ACTIVE' ? 'success' : 'warning'}>{i.status || 'UNKNOWN'}</Badge>
                </div>
                <div className="space-y-3 mb-4 flex-1 text-sm text-gray-600">
                   <div className="flex items-start">
                      <Languages size={16} className="mr-2 mt-0.5 text-gray-400" />
                      <div className="flex flex-wrap gap-1">
                        {(i.languages || []).slice(0, 3).map(l => <span key={l} className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{l}</span>)}
                      </div>
                   </div>
                   <div className="flex items-center">
                      <MapPin size={16} className="mr-2 text-gray-400" />
                      {(i.regions || []).join(', ') || 'Global'}
                   </div>
                </div>
                <div className="pt-4 border-t border-gray-100 flex justify-end">
                   <Button variant="ghost" size="sm" icon={Edit} onClick={(e) => handleEdit(e, i)}>Edit Profile</Button>
                </div>
             </div>
           ))}
        </div>
      ) : (
        /* Fixed: Card component now correctly imported above */
        <Card padding="none">
           <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                 <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Interpreter</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Languages</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right"></th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                 {filteredInterpreters.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/interpreters/${i.id}`)}>
                       <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{i.name}</td>
                       <td className="px-6 py-4 text-xs">{(i.languages || []).join(', ')}</td>
                       <td className="px-6 py-4 whitespace-nowrap"><Badge variant={i.status === 'ACTIVE' ? 'success' : 'warning'}>{i.status}</Badge></td>
                       <td className="px-6 py-4 text-right"><ArrowUpRight size={18} className="text-gray-400" /></td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Edit Interpreter' : 'New Interpreter'}>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label><input type="text" className="w-full p-2 border rounded-lg" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label><select className="w-full p-2 border rounded-lg" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}><option value="ACTIVE">Active</option><option value="ONBOARDING">Onboarding</option><option value="SUSPENDED">Suspended</option></select></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button><Button type="submit" isLoading={saving}>Save Changes</Button></div>
        </form>
      </Modal>
    </div>
  );
};
