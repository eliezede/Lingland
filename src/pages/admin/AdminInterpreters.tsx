import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InterpreterService } from '../../services/interpreterService';
import { Interpreter } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { 
  Search, UserCircle2, MapPin, 
  Languages, ShieldCheck, Edit, Check, Plus, 
  LayoutGrid, List, ArrowUpRight, Mail, Phone
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
      setInterpreters(data);
    } catch (error) {
      console.error('Error loading interpreters', error);
      showToast('Failed to load interpreters', 'error');
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

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      languages: [],
      regions: [],
      qualifications: [],
      status: 'ONBOARDING',
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
        showToast('Interpreter profile updated', 'success');
      } else {
        await InterpreterService.create(formData as Omit<Interpreter, 'id'>);
        showToast('New interpreter profile created', 'success');
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
    const updated = current.includes(lang)
      ? current.filter(l => l !== lang)
      : [...current, lang];
    setFormData({ ...formData, languages: updated });
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interpreters</h1>
          <p className="text-gray-500 text-sm">Directory of freelancers and agencies.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500 mr-2">
            Total: <span className="font-bold text-gray-900">{interpreters.length}</span>
          </div>
          <Button icon={Plus} onClick={handleCreate}>New Interpreter</Button>
        </div>
      </div>

      {/* Filter Bar with View Switcher */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 relative w-full">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="text" 
             placeholder="Search name or email..." 
             className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={textFilter}
             onChange={e => setTextFilter(e.target.value)}
           />
        </div>
        <div className="w-full md:w-48">
           <input 
             type="text" 
             placeholder="Filter language..." 
             className="px-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={langFilter}
             onChange={e => setLangFilter(e.target.value)}
           />
        </div>
        <div className="w-full md:w-48">
           <select 
             className="px-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={statusFilter}
             onChange={e => setStatusFilter(e.target.value as any)}
           >
             <option value="ALL">All Statuses</option>
             <option value="ACTIVE">Active</option>
             <option value="ONBOARDING">Onboarding</option>
             <option value="SUSPENDED">Suspended</option>
           </select>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-lg self-stretch md:self-auto">
           <button 
             onClick={() => setViewType('grid')}
             className={`p-1.5 rounded-md transition-all ${viewType === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
             title="Grid View"
           >
             <LayoutGrid size={18} />
           </button>
           <button 
             onClick={() => setViewType('list')}
             className={`p-1.5 rounded-md transition-all ${viewType === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
             title="List View"
           >
             <List size={18} />
           </button>
        </div>
      </div>

      {/* Content Rendering */}
      {loading ? (
        <div className="py-12 flex justify-center"><Spinner size="lg" /></div>
      ) : filteredInterpreters.length === 0 ? (
        <EmptyState 
           title="No interpreters found" 
           description="Try adjusting your search or filters."
           actionLabel="Clear Filters"
           onAction={() => { setTextFilter(''); setLangFilter(''); setStatusFilter('ALL'); }}
           icon={UserCircle2}
        />
      ) : viewType === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
           {filteredInterpreters.map(interpreter => (
             <div 
                key={interpreter.id} 
                onClick={() => navigate(`/admin/interpreters/${interpreter.id}`)}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all flex flex-col cursor-pointer group relative"
             >
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold mr-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        {interpreter.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{interpreter.name}</h3>
                        <p className="text-xs text-gray-500">{interpreter.email}</p>
                      </div>
                   </div>
                   <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : 'warning'}>
                     {interpreter.status}
                   </Badge>
                </div>

                <div className="space-y-3 mb-4 flex-1 text-sm text-gray-600">
                   <div className="flex items-start">
                      <Languages size={16} className="mr-2 mt-0.5 text-gray-400" />
                      <div className="flex flex-wrap gap-1">
                        {interpreter.languages.slice(0, 3).map(lang => (
                          <span key={lang} className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-600 uppercase">
                            {lang}
                          </span>
                        ))}
                        {interpreter.languages.length > 3 && (
                          <span className="text-[10px] text-gray-400 font-medium">+{interpreter.languages.length - 3} more</span>
                        )}
                      </div>
                   </div>
                   <div className="flex items-center">
                      <MapPin size={16} className="mr-2 text-gray-400" />
                      {interpreter.regions.join(', ') || 'Global'}
                   </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                   <button 
                     onClick={(e) => handleEdit(e, interpreter)}
                     className="text-xs font-bold text-gray-500 hover:text-blue-600 flex items-center transition-colors"
                   >
                     <Edit size={14} className="mr-1" /> Edit Profile
                   </button>
                </div>
             </div>
           ))}
        </div>
      ) : (
        /* List View rendering */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
           <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                 <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Interpreter</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Languages</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">DBS Expiry</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                 {filteredInterpreters.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                       <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center cursor-pointer" onClick={() => navigate(`/admin/interpreters/${i.id}`)}>
                             <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold mr-3 text-xs">
                                {i.name.charAt(0)}
                             </div>
                             <div>
                                <div className="text-sm font-bold text-gray-900">{i.name}</div>
                                <div className="text-xs text-gray-500">{i.email}</div>
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                             {i.languages.slice(0, 4).map(l => (
                                <span key={l} className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase">{l}</span>
                             ))}
                             {i.languages.length > 4 && <span className="text-[9px] text-gray-400">...</span>}
                          </div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={i.status === 'ACTIVE' ? 'success' : 'warning'}>{i.status}</Badge>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-xs font-medium ${new Date(i.dbsExpiry) < new Date() ? 'text-red-600' : 'text-gray-600'}`}>
                             {new Date(i.dbsExpiry).toLocaleDateString()}
                          </div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                          <button 
                            onClick={(e) => handleEdit(e, i)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit Profile"
                          >
                             <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => navigate(`/admin/interpreters/${i.id}`)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="View Details"
                          >
                             <ArrowUpRight size={16} />
                          </button>
                       </td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      )}

      {/* Profile Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Interpreter Profile' : 'Create New Interpreter'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">Full Name *</label>
               <input 
                 type="text" required
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                 value={formData.name || ''}
                 onChange={e => setFormData({...formData, name: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">Email Address *</label>
               <input 
                 type="email" required
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                 value={formData.email || ''}
                 onChange={e => setFormData({...formData, email: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
               <input 
                 type="tel"
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                 value={formData.phone || ''}
                 onChange={e => setFormData({...formData, phone: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">Status</label>
               <select 
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                 value={formData.status}
                 onChange={e => setFormData({...formData, status: e.target.value as any})}
               >
                 <option value="ACTIVE">Active</option>
                 <option value="ONBOARDING">Onboarding</option>
                 <option value="SUSPENDED">Suspended</option>
               </select>
             </div>
             <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">DBS Expiry Date</label>
               <input 
                 type="date"
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                 value={formData.dbsExpiry || ''}
                 onChange={e => setFormData({...formData, dbsExpiry: e.target.value})}
               />
             </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Qualifications & Languages</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 border rounded-lg bg-gray-50">
              {settings.masterData.priorityLanguages.map(lang => (
                <label key={lang} className={`flex items-center p-2 rounded-md border cursor-pointer transition-colors ${
                  formData.languages?.includes(lang) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={formData.languages?.includes(lang)}
                    onChange={() => toggleLanguage(lang)}
                  />
                  <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center ${
                    formData.languages?.includes(lang) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}>
                    {formData.languages?.includes(lang) && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs font-medium">{lang}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-2 italic">Select the languages this interpreter is qualified to provide.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t">
             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
             <Button type="submit" isLoading={saving}>
               {editingId ? 'Save Profile' : 'Create Interpreter'}
             </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};