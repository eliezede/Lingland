
import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { SystemSettings, ServiceType } from '../../types';
import { Save, Building2, PoundSterling, Clock, Database, Check } from 'lucide-react';

type Tab = 'GENERAL' | 'FINANCE' | 'OPERATIONS' | 'MASTER_DATA';

export const AdminSettings = () => {
  const { settings, updateSettings, loading } = useSettings();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('GENERAL');
  
  // Local form state
  const [formData, setFormData] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(JSON.parse(JSON.stringify(settings))); // Deep copy
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    
    setSaving(true);
    try {
      await updateSettings(formData);
      showToast('Settings saved successfully', 'success');
    } catch (error) {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !formData) return <div className="p-12 text-center"><Spinner size="lg" /></div>;

  const TabButton = ({ id, label, icon: Icon }: any) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
        activeTab === id 
          ? 'border-blue-600 text-blue-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon size={18} className="mr-2" />
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-500 text-sm">Configure global platform behavior.</p>
        </div>
        <Button onClick={handleSave} isLoading={saving} icon={Save}>
          Save Changes
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs Header */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <TabButton id="GENERAL" label="General" icon={Building2} />
          <TabButton id="FINANCE" label="Finance" icon={PoundSterling} />
          <TabButton id="OPERATIONS" label="Operations" icon={Clock} />
          <TabButton id="MASTER_DATA" label="Master Data" icon={Database} />
        </div>

        {/* Form Content */}
        <div className="p-6 md:p-8">
          <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
            
            {/* --- GENERAL TAB --- */}
            {activeTab === 'GENERAL' && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.general.companyName}
                      onChange={e => setFormData({...formData, general: {...formData.general, companyName: e.target.value}})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                    <input 
                      type="email" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.general.supportEmail}
                      onChange={e => setFormData({...formData, general: {...formData.general, supportEmail: e.target.value}})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label>
                  <textarea 
                    rows={3}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={formData.general.businessAddress}
                    onChange={e => setFormData({...formData, general: {...formData.general, businessAddress: e.target.value}})}
                  />
                  <p className="text-xs text-gray-500 mt-1">This address will appear on all invoices and official emails.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                    <input 
                      type="url" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.general.websiteUrl || ''}
                      onChange={e => setFormData({...formData, general: {...formData.general, websiteUrl: e.target.value}})}
                    />
                  </div>
              </div>
            )}

            {/* --- FINANCE TAB --- */}
            {activeTab === 'FINANCE' && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency Code</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50"
                      value={formData.finance.currency}
                      readOnly // Changing currency usually requires db migration logic
                      title="Contact support to change base currency"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
                    <input 
                      type="number" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.finance.vatRate}
                      onChange={e => setFormData({...formData, finance: {...formData.finance, vatRate: Number(e.target.value)}})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">VAT Registration #</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.finance.vatNumber}
                      onChange={e => setFormData({...formData, finance: {...formData.finance, vatNumber: e.target.value}})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Prefix</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.finance.invoicePrefix}
                      onChange={e => setFormData({...formData, finance: {...formData.finance, invoicePrefix: e.target.value}})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Next Invoice Number</label>
                    <input 
                      type="number" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.finance.nextInvoiceNumber}
                      onChange={e => setFormData({...formData, finance: {...formData.finance, nextInvoiceNumber: Number(e.target.value)}})}
                    />
                  </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Default Invoice Footer</label>
                   <textarea 
                     rows={3}
                     className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                     value={formData.finance.invoiceFooterText}
                     onChange={e => setFormData({...formData, finance: {...formData.finance, invoiceFooterText: e.target.value}})}
                     placeholder="e.g. Bank details and payment terms..."
                   />
                </div>
              </div>
            )}

            {/* --- OPERATIONS TAB --- */}
            {activeTab === 'OPERATIONS' && (
              <div className="space-y-6 animate-fade-in">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Min. Booking Duration (Mins)</label>
                     <input 
                       type="number" 
                       className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                       value={formData.operations.minBookingDurationMinutes}
                       onChange={e => setFormData({...formData, operations: {...formData.operations, minBookingDurationMinutes: Number(e.target.value)}})}
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Time Increment (Mins)</label>
                     <select 
                       className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                       value={formData.operations.timeIncrementMinutes}
                       onChange={e => setFormData({...formData, operations: {...formData.operations, timeIncrementMinutes: Number(e.target.value)}})}
                     >
                        <option value="1">1 Minute</option>
                        <option value="5">5 Minutes</option>
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="60">60 Minutes</option>
                     </select>
                   </div>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Window (Hours)</label>
                    <input 
                      type="number" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.operations.cancellationWindowHours}
                      onChange={e => setFormData({...formData, operations: {...formData.operations, cancellationWindowHours: Number(e.target.value)}})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Bookings cancelled within this window will be chargeable.</p>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Online Platform URL</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      value={formData.operations.defaultOnlinePlatformUrl}
                      onChange={e => setFormData({...formData, operations: {...formData.operations, defaultOnlinePlatformUrl: e.target.value}})}
                      placeholder="e.g. https://meet.google.com"
                    />
                 </div>
              </div>
            )}

            {/* --- MASTER DATA TAB --- */}
            {activeTab === 'MASTER_DATA' && (
              <div className="space-y-6 animate-fade-in">
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-3">Active Service Types</label>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                     {Object.values(ServiceType).map(type => (
                       <label key={type} className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                          <input 
                            type="checkbox" 
                            className="text-blue-600 rounded mr-3 w-5 h-5"
                            checked={formData.masterData.activeServiceTypes.includes(type)}
                            onChange={(e) => {
                              const current = formData.masterData.activeServiceTypes;
                              const updated = e.target.checked 
                                ? [...current, type]
                                : current.filter(t => t !== type);
                              setFormData({...formData, masterData: {...formData.masterData, activeServiceTypes: updated}});
                            }}
                          />
                          <span className="text-sm font-medium text-gray-800">{type}</span>
                       </label>
                     ))}
                   </div>
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Priority Languages (Dropdown order)</label>
                   <textarea 
                     rows={5}
                     className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                     value={formData.masterData.priorityLanguages.join(', ')}
                     onChange={e => setFormData({
                       ...formData, 
                       masterData: {
                         ...formData.masterData, 
                         priorityLanguages: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                       }
                     })}
                   />
                   <p className="text-xs text-gray-500 mt-1">Separate languages with commas. These will appear at the top of selection lists.</p>
                 </div>
              </div>
            )}

          </form>
        </div>
      </div>
    </div>
  );
};
