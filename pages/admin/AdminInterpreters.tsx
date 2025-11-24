import React, { useEffect, useState } from 'react';
import { InterpreterService } from '../../services/api';
import { Interpreter } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { 
  Search, UserCircle2, MapPin, 
  Languages, ShieldCheck, Edit 
} from 'lucide-react';

export const AdminInterpreters = () => {
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [textFilter, setTextFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ONBOARDING'>('ALL');

  // Modal
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

  const handleEdit = (interpreter: Interpreter) => {
    setEditingId(interpreter.id);
    setFormData(interpreter);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    
    setSaving(true);
    try {
      await InterpreterService.updateProfile(editingId, formData);
      await loadInterpreters();
      setIsModalOpen(false);
    } catch (error) {
      alert('Error saving interpreter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interpreters</h1>
          <p className="text-gray-500 text-sm">Directory of freelancers and agencies.</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: <span className="font-bold text-gray-900">{interpreters.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="text" 
             placeholder="Search name or email..." 
             className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={textFilter}
             onChange={e => setTextFilter(e.target.value)}
           />
        </div>
        <div>
           <input 
             type="text" 
             placeholder="Filter language..." 
             className="px-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             value={langFilter}
             onChange={e => setLangFilter(e.target.value)}
           />
        </div>
        <div>
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
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 flex justify-center">
           <Spinner size="lg" />
        </div>
      ) : filteredInterpreters.length === 0 ? (
        <EmptyState 
           title="No interpreters found" 
           description="Try adjusting your search or filters."
           actionLabel="Clear Filters"
           onAction={() => { setTextFilter(''); setLangFilter(''); setStatusFilter('ALL'); }}
           icon={UserCircle2}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {filteredInterpreters.map(interpreter => (
             <div key={interpreter.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-blue-300 transition-colors flex flex-col">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold mr-3">
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

                <div className="space-y-3 mb-4 flex-1">
                   <div className="flex items-start text-sm text-gray-600">
                      <Languages size={16} className="mr-2 mt-0.5 text-gray-400" />
                      <div className="flex flex-wrap gap-1">
                        {interpreter.languages.map(lang => (
                          <span key={lang} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-medium text-gray-700">
                            {lang}
                          </span>
                        ))}
                      </div>
                   </div>
                   <div className="flex items-center text-sm text-gray-600">
                      <MapPin size={16} className="mr-2 text-gray-400" />
                      {interpreter.regions.join(', ') || 'No region set'}
                   </div>
                   <div className="flex items-center text-sm text-gray-600">
                      <ShieldCheck size={16} className="mr-2 text-gray-400" />
                      <span className={new Date(interpreter.dbsExpiry) < new Date() ? 'text-red-600 font-medium' : ''}>
                        DBS: {new Date(interpreter.dbsExpiry).toLocaleDateString()}
                      </span>
                   </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                   <Button variant="ghost" size="sm" icon={Edit} onClick={() => handleEdit(interpreter)}>
                     Edit Profile
                   </Button>
                </div>
             </div>
           ))}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Interpreter Profile"
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
               <input 
                 type="text" 
                 className="w-full p-2 border border-gray-300 rounded-lg"
                 value={formData.name || ''}
                 onChange={e => setFormData({...formData, name: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
               <input 
                 type="text" 
                 className="w-full p-2 border border-gray-300 rounded-lg"
                 value={formData.phone || ''}
                 onChange={e => setFormData({...formData, phone: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
               <select 
                 className="w-full p-2 border border-gray-300 rounded-lg"
                 value={formData.status}
                 onChange={e => setFormData({...formData, status: e.target.value as any})}
               >
                 <option value="ACTIVE">Active</option>
                 <option value="ONBOARDING">Onboarding</option>
                 <option value="SUSPENDED">Suspended</option>
               </select>
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">DBS Expiry</label>
               <input 
                 type="date" 
                 className="w-full p-2 border border-gray-300 rounded-lg"
                 value={formData.dbsExpiry}
                 onChange={e => setFormData({...formData, dbsExpiry: e.target.value})}
               />
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Languages (comma separated)</label>
            <input 
               type="text"
               className="w-full p-2 border border-gray-300 rounded-lg"
               value={formData.languages?.join(', ') || ''}
               onChange={e => setFormData({...formData, languages: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
             <Button type="submit" isLoading={saving}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};