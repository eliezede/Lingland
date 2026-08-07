import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Laptop,
  Link2,
  MonitorSmartphone,
  RefreshCw,
  Save,
  Settings2,
  Smartphone,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import {
  buildRequestFormEmbedCode,
  buildRequestFormEmbedUrl,
  normalizeRequestFormEmbedSettings,
  validateRequestFormEmbedSettings,
} from '../../../features/requestEmbed/requestEmbedConfig';
import type { RequestFormEmbedServiceScope, RequestFormEmbedSettings } from '../../../types';

const fieldClass = 'mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white';

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const SwitchRow: React.FC<SwitchRowProps> = ({ label, description, checked, onChange }) => (
  <div className="flex items-start justify-between gap-4 border-t border-slate-100 py-3 first:border-t-0 dark:border-slate-800">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'}`}
    >
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

const serviceOptions: Array<{ value: RequestFormEmbedServiceScope; label: string; detail: string; icon: React.ElementType }> = [
  { value: 'ALL', label: 'Both services', detail: 'Visitor chooses', icon: MonitorSmartphone },
  { value: 'INTERPRETING', label: 'Interpreting', detail: 'Interpreter requests', icon: Users },
  { value: 'TRANSLATION', label: 'Translation', detail: 'Document requests', icon: FileText },
];

export const RequestFormEmbed = () => {
  const { settings, updateSettings, loading } = useSettings();
  const { showToast } = useToast();
  const savedConfig = useMemo(() => normalizeRequestFormEmbedSettings(settings.requestFormEmbed), [settings.requestFormEmbed]);
  const [draft, setDraft] = useState<RequestFormEmbedSettings>(savedConfig);
  const [generatedConfig, setGeneratedConfig] = useState<RequestFormEmbedSettings>(savedConfig);
  const [previewDevice, setPreviewDevice] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  const [outputMode, setOutputMode] = useState<'URL' | 'CODE'>('CODE');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(savedConfig);
    setGeneratedConfig(savedConfig);
  }, [savedConfig]);

  const normalizedDraft = useMemo(() => normalizeRequestFormEmbedSettings(draft), [draft]);
  const validationErrors = useMemo(() => validateRequestFormEmbedSettings(normalizedDraft), [normalizedDraft]);
  const isDirty = JSON.stringify(normalizedDraft) !== JSON.stringify(savedConfig);
  const generatedStale = JSON.stringify(normalizedDraft) !== JSON.stringify(generatedConfig);
  const previewUrl = useMemo(() => buildRequestFormEmbedUrl(normalizedDraft), [normalizedDraft]);
  const generatedUrl = useMemo(() => buildRequestFormEmbedUrl(generatedConfig), [generatedConfig]);
  const generatedCode = useMemo(() => buildRequestFormEmbedCode(generatedConfig), [generatedConfig]);

  const updateDraft = <Key extends keyof RequestFormEmbedSettings>(key: Key, value: RequestFormEmbedSettings[Key]) => {
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  const saveConfiguration = async () => {
    if (validationErrors.length) {
      showToast(validationErrors[0], 'error');
      return;
    }
    setSaving(true);
    try {
      await updateSettings({ requestFormEmbed: normalizedDraft });
      setGeneratedConfig(normalizedDraft);
      showToast('Request form embed configuration saved.', 'success');
    } catch (error) {
      console.error('Failed to save embed configuration', error);
      showToast('Could not save the embed configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateCode = () => {
    if (validationErrors.length) {
      showToast(validationErrors[0], 'error');
      return;
    }
    setGeneratedConfig(normalizedDraft);
    showToast('Embed output regenerated from the current configuration.', 'success');
  };

  const copyOutput = async () => {
    const value = outputMode === 'CODE' ? generatedCode : generatedUrl;
    try {
      await navigator.clipboard.writeText(value);
      showToast(outputMode === 'CODE' ? 'Wix embed code copied.' : 'Form URL copied.', 'success');
    } catch {
      showToast('Copy failed. Select the output and copy it manually.', 'error');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Request Form Embed"
        subtitle="Configure how the public request form appears inside Lingland's Wix website, preview the result, then generate the installation output."
      >
        <Button
          variant="outline"
          size="sm"
          icon={ExternalLink}
          onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
        >
          Open preview
        </Button>
        <Button size="sm" icon={Save} onClick={saveConfiguration} isLoading={saving} disabled={loading || !isDirty || validationErrors.length > 0}>
          Save configuration
        </Button>
      </PageHeader>

      <section className="flex flex-col gap-3 border-y border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <Code2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Wix request intake</p>
              <Badge variant={validationErrors.length ? 'danger' : isDirty ? 'warning' : 'success'}>
                {validationErrors.length ? 'Needs correction' : isDirty ? 'Unsaved changes' : 'Configuration saved'}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{previewUrl}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">No Wix credentials are stored by Lingland.</p>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Settings2 size={17} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Form content</h2>
              </div>
            </div>
            <div className="p-4">
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-wider text-slate-400">Service scope</legend>
                <div className="mt-2 grid gap-2">
                  {serviceOptions.map(option => {
                    const Icon = option.icon;
                    const selected = draft.serviceScope === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDraft(previous => ({
                          ...previous,
                          serviceScope: option.value,
                          lockService: option.value === 'ALL' ? false : previous.lockService,
                        }))}
                        className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-left transition-colors ${selected ? 'border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-500/10 dark:text-blue-100' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                      >
                        <Icon size={18} className={selected ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400'} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{option.detail}</span>
                        </span>
                        {selected && <CheckCircle2 size={17} className="text-blue-600 dark:text-blue-300" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {draft.serviceScope !== 'ALL' && (
                <SwitchRow
                  label="Lock selected service"
                  description="Remove the service switcher so visitors stay in this workflow."
                  checked={draft.lockService}
                  onChange={checked => updateDraft('lockService', checked)}
                />
              )}
              <SwitchRow label="Show Lingland identity" description="Display a compact logo above the form when the Wix page has no brand header." checked={draft.showBranding} onChange={checked => updateDraft('showBranding', checked)} />
              <SwitchRow label="Show form introduction" description="Keep the request title and short supporting sentence." checked={draft.showIntro} onChange={checked => updateDraft('showIntro', checked)} />
              <SwitchRow label="Show help panel" description="Add contact information and the live request summary on wide screens." checked={draft.showHelpPanel} onChange={checked => updateDraft('showHelpPanel', checked)} />
              <SwitchRow label="Compact spacing" description="Reduce surrounding whitespace for an embedded workflow." checked={draft.compactLayout} onChange={checked => updateDraft('compactLayout', checked)} />
              <SwitchRow label="Transparent background" description="Let the Wix page background surround the form naturally." checked={draft.transparentBackground} onChange={checked => updateDraft('transparentBackground', checked)} />
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Host and frame</h2>
            </div>
            <div className="space-y-4 p-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Form host
                <input className={fieldClass} type="url" value={draft.formBaseUrl} onChange={event => updateDraft('formBaseUrl', event.target.value)} placeholder="https://portal.example.com" />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Accessible frame title
                <input className={fieldClass} value={draft.frameTitle} onChange={event => updateDraft('frameTitle', event.target.value)} maxLength={120} />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Source tag
                <input className={fieldClass} value={draft.sourceTag} onChange={event => updateDraft('sourceTag', event.target.value)} maxLength={40} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Desktop height
                  <input className={fieldClass} type="number" min={640} max={1800} step={20} value={draft.desktopHeight} onChange={event => updateDraft('desktopHeight', Number(event.target.value))} />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mobile height
                  <input className={fieldClass} type="number" min={640} max={1800} step={20} value={draft.mobileHeight} onChange={event => updateDraft('mobileHeight', Number(event.target.value))} />
                </label>
              </div>
              {validationErrors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-500/10 dark:text-red-200">
                  {validationErrors.map(error => <p key={error}>{error}</p>)}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Eye size={17} className="text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Live preview</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Uses the current controls, including unsaved changes.</p>
              </div>
            </div>
            <div className="inline-flex h-9 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950" aria-label="Preview device">
              <button type="button" title="Desktop preview" aria-pressed={previewDevice === 'DESKTOP'} onClick={() => setPreviewDevice('DESKTOP')} className={`flex h-7 w-9 items-center justify-center rounded ${previewDevice === 'DESKTOP' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500'}`}><Laptop size={16} /></button>
              <button type="button" title="Mobile preview" aria-pressed={previewDevice === 'MOBILE'} onClick={() => setPreviewDevice('MOBILE')} className={`flex h-7 w-9 items-center justify-center rounded ${previewDevice === 'MOBILE' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500'}`}><Smartphone size={16} /></button>
            </div>
          </div>
          <div className="overflow-auto bg-slate-100 p-3 dark:bg-slate-950 sm:p-5">
            <div className={`mx-auto overflow-hidden border border-slate-300 bg-white shadow-sm transition-[width] dark:border-slate-700 ${previewDevice === 'MOBILE' ? 'w-[390px] max-w-full' : 'w-full max-w-[1100px]'}`}>
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="Request form configuration preview"
                className="block w-full border-0 bg-white"
                style={{ height: previewDevice === 'MOBILE' ? 720 : 760 }}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Generated output</h2>
              {generatedStale && <Badge variant="warning">Configuration changed</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Regenerate after changing the configuration, then copy the option required by Wix.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={generateCode} disabled={validationErrors.length > 0}>Generate code</Button>
            <Button size="sm" icon={Clipboard} onClick={copyOutput}>Copy {outputMode === 'CODE' ? 'code' : 'URL'}</Button>
          </div>
        </div>
        <div className="border-b border-slate-200 px-4 pt-3 dark:border-slate-800">
          <div className="flex gap-5" role="tablist" aria-label="Generated output type">
            <button type="button" role="tab" aria-selected={outputMode === 'CODE'} onClick={() => setOutputMode('CODE')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${outputMode === 'CODE' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500'}`}>HTML embed code</button>
            <button type="button" role="tab" aria-selected={outputMode === 'URL'} onClick={() => setOutputMode('URL')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${outputMode === 'URL' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500'}`}>Website address</button>
          </div>
        </div>
        <div className="p-4">
          <textarea
            readOnly
            aria-label={outputMode === 'CODE' ? 'Generated Wix embed code' : 'Generated request form URL'}
            value={outputMode === 'CODE' ? generatedCode : generatedUrl}
            className={`w-full resize-y rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none dark:border-slate-700 ${outputMode === 'CODE' ? 'min-h-72' : 'min-h-24'}`}
          />
        </div>
      </section>

      <section className="border-y border-blue-200 bg-blue-50 px-4 py-4 text-blue-950 dark:border-blue-900/60 dark:bg-blue-500/10 dark:text-blue-100">
        <div className="flex gap-3">
          <Info size={19} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Install in Wix</h2>
            <ol className="mt-2 grid gap-2 text-sm leading-6 lg:grid-cols-3">
              <li><strong>1.</strong> Add Elements &gt; Embed Code &gt; Embed HTML and paste the generated code.</li>
              <li><strong>2.</strong> Set the Wix element to full content width and use the configured desktop/mobile heights.</li>
              <li><strong>3.</strong> Publish and submit a test request before linking the page from the main navigation.</li>
            </ol>
            <p className="mt-2 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200"><Link2 size={14} /> For Wix "Embed a Site", select Website address above and paste only the generated URL.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
