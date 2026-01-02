import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { SystemSettings, ServiceType } from '../../types';
import { 
  Save, Building2, PoundSterling, Clock, Database, 
  Check, Globe2, AlertCircle, ShieldCheck 
} from 'lucide-react';

type Tab = 'GENERAL' | 'FINANCE' | 'OPERATIONS' | 'MASTER_DATA';

export const AdminSettings = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, loading } = useSettings();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('GENERAL');
  
  const [formData, setFormData] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(JSON.parse(JSON.stringify(settings)));
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    
    setSaving(true);
    try {
      await updateSettings(formData);
      showToast('System settings updated successfully', 'success');
    } catch (error) {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !formData) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const TabButton = ({ id, label, icon: Icon }: { id: Tab; label: string; icon: any }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex items-center px-6 py-4 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
        activeTab === id 
          ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
          : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
      }`}
    >
      <Icon size={18} className="mr-2" />
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Global configuration for the Lingland platform.</p>
        </div>
        <Button onClick={handleSave} isLoading={saving} icon={Save} size="lg" className="shadow-lg shadow-blue-100">
          Save Settings
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
          <TabButton id="GENERAL" label="General" icon={Building2} />
          <TabButton id="FINANCE" label="Finance & Billing" icon={PoundSterling} />
          <TabButton id="OPERATIONS" label="Operations" icon={Clock} />
          <TabButton id="MASTER_DATA" label="Master Data" icon={Database} />
        </div>

        {/* Tab Content */}
        <div className="p-6 md:p-10">
          <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
            
            {/* --- GENERAL TAB --- */}
            {activeTab === 'GENERAL' && (
              <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Company Name</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        value={formData.general.companyName}
                        onChange={e => setFormData({...formData, general: {...formData.general, companyName: e.target.value}})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Public Support Email</label>
                      <input 
                        type="email" 
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.general.supportEmail}
                        onChange={e => setFormData({...formData, general: {...formData.general, supportEmail: e.target.value}})}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Website URL</label>
                      <input 
                        type="url" 
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.general.websiteUrl || ''}
                        onChange={e => setFormData({...formData, general: {...formData.general, websiteUrl: e.target.value}})}
                        placeholder="https://lingland.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Platform Logo URL</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.general.logoUrl || ''}
                        onChange={e => setFormData({...formData, general: {...formData.general, logoUrl: e.target.value}})}
                        placeholder="Public URL to logo image"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Business Address</label>
                  <textarea 
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white text-gray-900"
                    value={formData.general.businessAddress}
                    onChange={e => setFormData({...formData, general: {...formData.general, businessAddress: e.target.value}})}
                  />
                  <p className="text-xs text-gray-400 mt-2 italic flex items-center">
                    <Check size={12} className="mr-1" /> This address appears on official PDF invoices and headers.
                  </p>
                </div>
              </div>
            )}

            {/* --- FINANCE TAB --- */}
            {activeTab === 'FINANCE' && (
              <div className="space-y-8 animate-fade-in">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center">
                    <PoundSterling size={18} className="mr-2" />
                    Taxation & Currency
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-blue-700 uppercase mb-1.5">Currency</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-blue-200 rounded-xl bg-gray-100 font-mono text-gray-700"
                        value={formData.finance.currency}
                        readOnly
                        title="Currency is locked to base installation."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-700 uppercase mb-1.5">VAT Rate (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        className="w-full p-3 border border-blue-200 rounded-xl bg-white text-gray-900"
                        value={formData.finance.vatRate}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, vatRate: Number(e.target.value)}})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-700 uppercase mb-1.5">VAT Number</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-blue-200 rounded-xl bg-white text-gray-900"
                        value={formData.finance.vatNumber}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, vatNumber: e.target.value}})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-800">Invoice Numbering</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Prefix</label>
                        <input 
                          type="text" 
                          className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          value={formData.finance.invoicePrefix}
                          onChange={e => setFormData({...formData, finance: {...formData.finance, invoicePrefix: e.target.value}})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Next Sequence</label>
                        <input 
                          type="number" 
                          className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          value={formData.finance.nextInvoiceNumber}
                          onChange={e => setFormData({...formData, finance: {...formData.finance, nextInvoiceNumber: Number(e.target.value)}})}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-800">Payment Conditions</h3>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Default Terms (Days)</label>
                      <input 
                        type="number" 
                        className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        value={formData.finance.paymentTermsDays}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, paymentTermsDays: Number(e.target.value)}})}
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Universal Invoice Footer</label>
                   <textarea 
                     rows={4}
                     className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white text-gray-900"
                     value={formData.finance.invoiceFooterText}
                     onChange={e => setFormData({...formData, finance: {...formData.finance, invoiceFooterText: e.target.value}})}
                     placeholder="e.g. Please pay by bank transfer to: Account: 12345678, Sort Code: 00-00-00."
                   />
                </div>
              </div>
            )}

            {/* --- OPERATIONS TAB --- */}
            {activeTab === 'OPERATIONS' && (
              <div className="space-y-8 animate-fade-in">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="bg-gray-50 p-6 rounded-2xl space-y-4">
                     <h3 className="font-bold text-gray-800 flex items-center">
                       <Clock size={18} className="mr-2" />
                       Booking Policy
                     </h3>
                     <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Minimum Duration (Mins)</label>
                       <input 
                         type="number" 
                         className="w-full p-3 border border-gray-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                         value={formData.operations.minBookingDurationMinutes}
                         onChange={e => setFormData({...formData, operations: {...formData.operations, minBookingDurationMinutes: Number(e.target.value)}})}
                       />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Time Increment (Mins)</label>
                       <select 
                         className="w-full p-3 border border-gray-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                         value={formData.operations.timeIncrementMinutes}
                         onChange={e => setFormData({...formData, operations: {...formData.operations, timeIncrementMinutes: Number(e.target.value)}})}
                       >
                          <option value="5">5 Minutes</option>
                          <option value="15">15 Minutes</option>
                          <option value="30">30 Minutes</option>
                          <option value="60">60 Minutes</option>
                       </select>
                     </div>
                   </div>

                   <div className="bg-orange-50 p-6 rounded-2xl space-y-4 border border-orange-100">
                     <h3 className="font-bold text-orange-900 flex items-center">
                       <ShieldCheck size={18} className="mr-2" />
                       Cancellation & Risk
                     </h3>
                     <div>
                        <label className="block text-xs font-bold text-orange-700 uppercase mb-1.5">Cancellation Window (Hours)</label>
                        <input 
                          type="number" 
                          className="w-full p-3 border border-orange-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-orange-500 text-gray-900"
                          value={formData.operations.cancellationWindowHours}
                          onChange={e => setFormData({...formData, operations: {...formData.operations, cancellationWindowHours: Number(e.target.value)}})}
                        />
                        <p className="text-[10px] text-orange-600 mt-2 italic font-medium">Bookings cancelled within this time frame will trigger full charge to client and full pay to interpreter.</p>
                     </div>
                   </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Default Remote Meeting Platform</label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          value={formData.operations.defaultOnlinePlatformUrl}
                          onChange={e => setFormData({...formData, operations: {...formData.operations, defaultOnlinePlatformUrl: e.target.value}})}
                          placeholder="e.g. https://zoom.us/j/"
                        />
                      </div>
                      <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                        <Globe2 size={24} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">This link will be used as a fallback if no meeting link is provided during booking.</p>
                 </div>
              </div>
            )}

            {/* --- MASTER DATA TAB --- */}
            {activeTab === 'MASTER_DATA' && (
              <div className="space-y-8 animate-fade-in">
                 <div className="bg-white border border-gray-200 p-8 rounded-2xl">
                   <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="font-bold text-gray-900">Supported Service Types</h3>
                        <p className="text-xs text-gray-500 mt-1">Enable or disable types of jobs clients can request.</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {/* Fix: Explicitly cast type to string/ServiceType to avoid 'unknown' mapping errors */}
                     {(Object.values(ServiceType) as ServiceType[]).map((type) => (
                       <label key={type} className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                         formData.masterData.activeServiceTypes.includes(type)
                          ? 'border-blue-600 bg-blue-50/30'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                       }`}>
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 text-blue-600 rounded-lg mr-4 border-gray-300"
                            checked={formData.masterData.activeServiceTypes.includes(type)}
                            onChange={(e) => {
                              const current = formData.masterData.activeServiceTypes;
                              const updated = e.target.checked 
                                ? [...current, type]
                                : current.filter(t => t !== type);
                              setFormData({...formData, masterData: {...formData.masterData, activeServiceTypes: updated}});
                            }}
                          />
                          <span className={`text-sm font-bold ${formData.masterData.activeServiceTypes.includes(type) ? 'text-blue-700' : 'text-gray-500'}`}>
                            {type}
                          </span>
                       </label>
                     ))}
                   </div>
                 </div>

                 <div>
                   <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900">Universal Language List</h3>
                        <p className="text-xs text-gray-500 mt-1">Comma-separated list of languages available for booking and interpreter profiles.</p>
                      </div>
                      <Badge variant="info">{formData.masterData.priorityLanguages.length} Languages</Badge>
                   </div>
                   <textarea 
                     rows={8}
                     className="w-full p-4 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 leading-relaxed bg-white"
                     value={formData.masterData.priorityLanguages.join(', ')}
                     onChange={e => setFormData({
                       ...formData, 
                       masterData: {
                         ...formData.masterData, 
                         priorityLanguages: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                       }
                     })}
                   />
                   <div className="mt-3 p-4 bg-yellow-50 border border-yellow-100 rounded-xl flex items-start">
                     <AlertCircle size={16} className="text-yellow-600 mr-3 mt-0.5" />
                     <p className="text-xs text-yellow-800 leading-relaxed">
                       <strong>UX Note:</strong> Clients will only see languages that are offered by at least one <strong>ACTIVE</strong> interpreter. 
                       Adding a language here makes it available for interpreters to select in their profile.
                     </p>
                   </div>
                 </div>
              </div>
            )}

            <div className="pt-10 border-t border-gray-100 flex justify-end gap-4">
               <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Discard Changes</Button>
               <Button type="submit" isLoading={saving} size="lg" icon={Save}>Save Settings</Button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};
