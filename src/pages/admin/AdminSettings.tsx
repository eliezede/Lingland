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
  Check, Globe2, AlertCircle, ShieldCheck, Workflow, MailX
} from 'lucide-react';

type Tab = 'GENERAL' | 'PLATFORM' | 'FINANCE' | 'OPERATIONS' | 'MASTER_DATA';

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
          ? 'border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' 
          : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
      }`}
    >
      <Icon size={18} className="mr-2" />
      {label}
    </button>
  );

  const platformMode = formData.platformMode || {
    operatingMode: 'AIRTABLE_MIRROR',
    communicationMode: 'SUPPRESSED',
    sourceOfTruth: 'AIRTABLE',
    airtableImportMode: 'ON',
    hybridOperationsEnabled: true,
    jobNumbering: {
      prefix: 'LING',
      year: 26,
      nextSequence: 17037,
      displayIncludesLanguage: true
    }
  };

  const updatePlatformMode = (patch: Partial<typeof platformMode>) => {
    setFormData({
      ...formData,
      platformMode: {
        ...platformMode,
        ...patch,
        jobNumbering: {
          ...platformMode.jobNumbering,
          ...(patch.jobNumbering || {})
        }
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Settings</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Global configuration for the Lingland platform.</p>
        </div>
        <Button onClick={handleSave} isLoading={saving} icon={Save} size="lg" className="shadow-lg shadow-blue-100 dark:shadow-none">
          Save Settings
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-100 dark:border-slate-800 overflow-x-auto scrollbar-hide">
          <TabButton id="GENERAL" label="General" icon={Building2} />
          <TabButton id="PLATFORM" label="Platform Mode" icon={Workflow} />
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
                      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Company Name</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.general.companyName}
                        onChange={e => setFormData({...formData, general: {...formData.general, companyName: e.target.value}})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Public Support Email</label>
                      <input 
                        type="email" 
                        className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.general.supportEmail}
                        onChange={e => setFormData({...formData, general: {...formData.general, supportEmail: e.target.value}})}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Website URL</label>
                      <input 
                        type="url" 
                        className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.general.websiteUrl || ''}
                        onChange={e => setFormData({...formData, general: {...formData.general, websiteUrl: e.target.value}})}
                        placeholder="https://lingland.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-600 dark:text-blue-500 uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                        Portal URL (Activation Links)
                      </label>
                      <input 
                        type="url" 
                        className="w-full p-3 border border-blue-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.general.portalUrl || ''}
                        onChange={e => setFormData({...formData, general: {...formData.general, portalUrl: e.target.value}})}
                        placeholder="https://portal.lingland.com"
                      />
                      <p className="text-[10px] text-gray-400 mt-1 italic">Used for password resets and account activation invites.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Platform Logo URL</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.general.logoUrl || ''}
                        onChange={e => setFormData({...formData, general: {...formData.general, logoUrl: e.target.value}})}
                        placeholder="Public URL to logo image"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Business Address</label>
                  <textarea 
                    rows={4}
                    className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                    value={formData.general.businessAddress}
                    onChange={e => setFormData({...formData, general: {...formData.general, businessAddress: e.target.value}})}
                  />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-2 italic flex items-center">
                    <Check size={12} className="mr-1" /> This address appears on official PDF invoices and headers.
                  </p>
                </div>
              </div>
            )}

            {/* --- PLATFORM MODE TAB --- */}
            {activeTab === 'PLATFORM' && (
              <div className="space-y-8 animate-fade-in">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-950 dark:text-white">
                        <MailX size={20} className="text-amber-600" />
                        Test Mode Control
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900 dark:text-amber-100">
                        Use real Airtable/client/interpreter data while keeping external communication suppressed. Admins can operate jobs manually until Lingland is ready to become the live source of truth.
                      </p>
                    </div>
                    <Badge variant={platformMode.communicationMode === 'LIVE' ? 'success' : 'warning'}>
                      {platformMode.communicationMode}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Operating Mode</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      value={platformMode.operatingMode}
                      onChange={e => updatePlatformMode({ operatingMode: e.target.value as any })}
                    >
                      <option value="AIRTABLE_MIRROR">Airtable mirror</option>
                      <option value="HYBRID">Hybrid operations</option>
                      <option value="PLATFORM_LIVE">Platform live</option>
                    </select>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Mirror imports and audits Airtable. Hybrid allows staff and users to operate in parallel. Platform live makes Lingland the primary workflow.</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Communication Mode</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      value={platformMode.communicationMode}
                      onChange={e => updatePlatformMode({ communicationMode: e.target.value as any })}
                    >
                      <option value="SUPPRESSED">Suppressed - no emails sent</option>
                      <option value="INTERNAL_ONLY">Internal only - admins/finance</option>
                      <option value="SELECTIVE_LIVE">Selective live</option>
                      <option value="LIVE">Live - all templates enabled</option>
                    </select>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Suppressed mode writes an audit record instead of adding messages to the Firebase mail queue.</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Source of Truth</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      value={platformMode.sourceOfTruth}
                      onChange={e => updatePlatformMode({ sourceOfTruth: e.target.value as any })}
                    >
                      <option value="AIRTABLE">Airtable</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="PLATFORM">Platform</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Airtable Import Mode</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      value={platformMode.airtableImportMode}
                      onChange={e => updatePlatformMode({ airtableImportMode: e.target.value as any })}
                    >
                      <option value="ON">On - import active</option>
                      <option value="READ_ONLY">Read only - compare/audit</option>
                      <option value="OFF">Off - platform intake only</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-bold text-slate-950 dark:text-white">Job Numbering</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Keeps platform references aligned with Airtable format for audit and transition.</p>
                    </div>
                    <Badge variant="info">
                      {platformMode.jobNumbering.prefix}{platformMode.jobNumbering.year}.{platformMode.jobNumbering.nextSequence} Kurdish
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Prefix</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        value={platformMode.jobNumbering.prefix}
                        onChange={e => updatePlatformMode({ jobNumbering: { prefix: e.target.value.toUpperCase() } as any })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Year</label>
                      <input
                        type="number"
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        value={platformMode.jobNumbering.year}
                        onChange={e => updatePlatformMode({ jobNumbering: { year: Number(e.target.value) } as any })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Next Sequence</label>
                      <input
                        type="number"
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        value={platformMode.jobNumbering.nextSequence}
                        onChange={e => updatePlatformMode({ jobNumbering: { nextSequence: Number(e.target.value) } as any })}
                      />
                    </div>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-slate-300 text-blue-600"
                        checked={platformMode.jobNumbering.displayIncludesLanguage}
                        onChange={e => updatePlatformMode({ jobNumbering: { displayIncludesLanguage: e.target.checked } as any })}
                      />
                      Include language in display ref
                    </label>
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                  <span>
                    <span className="block font-bold text-slate-950 dark:text-white">Hybrid manual operations</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Staff can manually record assignment sent, accepted, timesheet received, invoicing and payment even when users are passive.</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 rounded border-slate-300 text-blue-600"
                    checked={platformMode.hybridOperationsEnabled}
                    onChange={e => updatePlatformMode({ hybridOperationsEnabled: e.target.checked })}
                  />
                </label>
              </div>
            )}

            {/* --- FINANCE TAB --- */}
            {activeTab === 'FINANCE' && (
              <div className="space-y-8 animate-fade-in">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-6 rounded-2xl transition-colors">
                  <h3 className="font-bold text-blue-900 dark:text-blue-400 mb-4 flex items-center shadow-none">
                    <PoundSterling size={18} className="mr-2" />
                    Taxation & Currency
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-blue-700 dark:text-blue-500 uppercase mb-1.5">Currency</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-blue-200 dark:border-slate-800 rounded-xl bg-gray-100 dark:bg-slate-900 font-mono text-gray-700 dark:text-slate-400"
                        value={formData.finance.currency}
                        readOnly
                        title="Currency is locked to base installation."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-700 dark:text-blue-500 uppercase mb-1.5">VAT Rate (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        className="w-full p-3 border border-blue-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.finance.vatRate}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, vatRate: Number(e.target.value)}})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-700 dark:text-blue-500 uppercase mb-1.5">VAT Number</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-blue-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.finance.vatNumber}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, vatNumber: e.target.value}})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-800 dark:text-slate-200">Invoice Numbering</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5">Prefix</label>
                        <input 
                          type="text" 
                          className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                          value={formData.finance.invoicePrefix}
                          onChange={e => setFormData({...formData, finance: {...formData.finance, invoicePrefix: e.target.value}})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5">Next Sequence</label>
                        <input 
                          type="number" 
                          className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                          value={formData.finance.nextInvoiceNumber}
                          onChange={e => setFormData({...formData, finance: {...formData.finance, nextInvoiceNumber: Number(e.target.value)}})}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-800 dark:text-slate-200">Payment Conditions</h3>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5">Default Terms (Days)</label>
                      <input 
                        type="number" 
                        className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
                        value={formData.finance.paymentTermsDays}
                        onChange={e => setFormData({...formData, finance: {...formData.finance, paymentTermsDays: Number(e.target.value)}})}
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Universal Invoice Footer</label>
                   <textarea 
                     rows={4}
                     className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-950 text-gray-900 dark:text-white transition-colors"
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
                   <div className="bg-gray-50 dark:bg-slate-900/50 p-6 rounded-2xl space-y-4 border border-transparent dark:border-slate-800 transition-colors">
                     <h3 className="font-bold text-gray-800 dark:text-slate-200 flex items-center">
                       <Clock size={18} className="mr-2" />
                       Booking Policy
                     </h3>
                     <div>
                       <label className="block text-xs font-bold text-gray-500 dark:text-slate-500 uppercase mb-1.5">Minimum Duration (Mins)</label>
                       <input 
                         type="number" 
                         className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                         value={formData.operations.minBookingDurationMinutes}
                         onChange={e => setFormData({...formData, operations: {...formData.operations, minBookingDurationMinutes: Number(e.target.value)}})}
                       />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-gray-500 dark:text-slate-500 uppercase mb-1.5">Time Increment (Mins)</label>
                       <select 
                         className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white transition-colors"
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

                   <div className="bg-orange-50 dark:bg-orange-950/20 p-6 rounded-2xl space-y-4 border border-orange-100 dark:border-orange-900/30 transition-colors">
                     <h3 className="font-bold text-orange-900 dark:text-orange-400 flex items-center">
                       <ShieldCheck size={18} className="mr-2" />
                       Cancellation & Risk
                     </h3>
                     <div>
                        <label className="block text-xs font-bold text-orange-700 dark:text-orange-500 uppercase mb-1.5">Cancellation Window (Hours)</label>
                        <input 
                          type="number" 
                          className="w-full p-3 border border-orange-200 dark:border-orange-900/30 rounded-xl bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white transition-colors"
                          value={formData.operations.cancellationWindowHours}
                          onChange={e => setFormData({...formData, operations: {...formData.operations, cancellationWindowHours: Number(e.target.value)}})}
                        />
                        <p className="text-[10px] text-orange-600 mt-2 italic font-medium">Bookings cancelled within this time frame will trigger full charge to client and full pay to interpreter.</p>
                     </div>
                   </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1.5 tracking-wider">Default Remote Meeting Platform</label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          className="w-full p-3 border border-gray-300 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-slate-950 transition-colors"
                          value={formData.operations.defaultOnlinePlatformUrl}
                          onChange={e => setFormData({...formData, operations: {...formData.operations, defaultOnlinePlatformUrl: e.target.value}})}
                          placeholder="e.g. https://zoom.us/j/"
                        />
                      </div>
                      <div className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded-xl text-blue-600 dark:text-blue-400">
                        <Globe2 size={24} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">This link will be used as a fallback if no meeting link is provided during booking.</p>
                 </div>
              </div>
            )}

            {/* --- MASTER DATA TAB --- */}
            {activeTab === 'MASTER_DATA' && (
              <div className="space-y-8 animate-fade-in">
                 <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-8 rounded-2xl transition-colors">
                   <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">Supported Service Types</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Enable or disable types of jobs clients can request.</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {/* Fix: Explicitly cast type to string/ServiceType to avoid 'unknown' mapping errors */}
                     {(Object.values(ServiceType) as ServiceType[]).map((type) => (
                       <label key={type} className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                         formData.masterData.activeServiceTypes.includes(type)
                           ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-900/10'
                           : 'border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 hover:border-gray-200 dark:hover:border-slate-700'
                       }`}>
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 text-blue-600 dark:text-blue-500 rounded-lg mr-4 border-gray-300 dark:border-slate-800 bg-white dark:bg-slate-950"
                            checked={formData.masterData.activeServiceTypes.includes(type)}
                            onChange={(e) => {
                              const current = formData.masterData.activeServiceTypes;
                              const updated = e.target.checked 
                                ? [...current, type]
                                : current.filter(t => t !== type);
                              setFormData({...formData, masterData: {...formData.masterData, activeServiceTypes: updated}});
                            }}
                          />
                          <span className={`text-sm font-bold ${formData.masterData.activeServiceTypes.includes(type) ? 'text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-slate-500'}`}>
                            {type}
                          </span>
                       </label>
                     ))}
                   </div>
                 </div>

                 <div>
                   <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">Universal Language List</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Comma-separated list of languages available for booking and interpreter profiles.</p>
                      </div>
                      <Badge variant="info">{formData.masterData.priorityLanguages.length} Languages</Badge>
                   </div>
                   <textarea 
                     rows={8}
                     className="w-full p-4 border border-gray-300 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 dark:text-white leading-relaxed bg-white dark:bg-slate-950 transition-colors"
                     value={formData.masterData.priorityLanguages.join(', ')}
                     onChange={e => setFormData({
                       ...formData, 
                       masterData: {
                         ...formData.masterData, 
                         priorityLanguages: Array.from(new Set(e.target.value.split(',').map(s => s.trim()).filter(Boolean)))
                       }
                     })}
                   />
                   <div className="mt-3 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/30 rounded-xl flex items-start transition-colors">
                     <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-500 mr-3 mt-0.5" />
                     <p className="text-xs text-yellow-800 dark:text-yellow-100 leading-relaxed">
                       <strong>UX Note:</strong> Clients will only see languages that are offered by at least one <strong>ACTIVE</strong> interpreter. 
                       Adding a language here makes it available for interpreters to select in their profile.
                     </p>
                   </div>
                 </div>
              </div>
            )}

            <div className="pt-10 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-4">
               <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Discard Changes</Button>
               <Button type="submit" isLoading={saving} size="lg" icon={Save}>Save Settings</Button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
