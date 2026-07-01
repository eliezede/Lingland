import React, { useState, useEffect } from 'react';
import { Mail, Edit2, Save, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../context/ToastContext';
import { EmailTemplate } from '../../../types';
import { EmailService } from '../../../services/emailService';

export const AdminEmailTemplates: React.FC = () => {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({'BOOKINGS': true});
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
    const [testRecipient, setTestRecipient] = useState('');
    const [sendingTest, setSendingTest] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        setLoading(true);
        const data = await EmailService.getTemplates();
        setTemplates(data);
        setLoading(false);
    };

    const handleEdit = (template: EmailTemplate) => {
        setEditingTemplate({ ...template });
    };

    const handleSave = async () => {
        if (!editingTemplate) return;
        try {
            await EmailService.saveTemplate(editingTemplate);
            showToast('Template saved successfully', 'success');
            setEditingTemplate(null);
            fetchTemplates();
        } catch (error) {
            showToast('Failed to save template', 'error');
        }
    };

    const handleSendTest = async () => {
        if (!editingTemplate || !testRecipient) {
            showToast('Please enter a recipient email', 'info');
            return;
        }
        setSendingTest(true);
        try {
            await EmailService.sendTestEmail(editingTemplate, testRecipient);
            showToast('Test email queued. Check "mail" logs.', 'success');
        } catch (error) {
            showToast('Failed to send test email', 'error');
        } finally {
            setSendingTest(false);
        }
    };

    const insertVariable = (variable: string) => {
        if (!editingTemplate) return;

        // Simplistic insertion at the end, but in a real app, this would use cursor position
        const inputElement = document.getElementById('bodyTextarea') as HTMLTextAreaElement;
        if (inputElement) {
            const start = inputElement.selectionStart;
            const end = inputElement.selectionEnd;
            const currentBody = editingTemplate.body;
            const newBody = currentBody.substring(0, start) + variable + currentBody.substring(end);
            setEditingTemplate({ ...editingTemplate, body: newBody });

            // Reset cursor focus
            setTimeout(() => {
                inputElement.focus();
                inputElement.setSelectionRange(start + variable.length, start + variable.length);
            }, 0);
        } else {
            setEditingTemplate({ ...editingTemplate, body: editingTemplate.body + ' ' + variable });
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12"><Spinner /></div>;
    }

    const controlClass = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Communications</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Email Templates</h1>
                    <p className="mt-1 text-sm text-slate-500">Operational registry for account, booking and finance messages.</p>
                </div>
                <Badge variant="neutral">{templates.length} templates</Badge>
            </div>

            <div className="space-y-3">
                {Object.entries(
                    templates.reduce((acc, template) => {
                        const cat = template.category || 'UNCATEGORIZED';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(template);
                        return acc;
                    }, {} as Record<string, EmailTemplate[]>)
                ).map(([category, catTemplates]) => {
                    const isExpanded = expandedCategories[category];
                    return (
                        <div key={category} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <button 
                                onClick={() => setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }))}
                                className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"
                            >
                                <div className="flex items-center gap-3">
                                    <Mail size={16} className="text-blue-600" />
                                    <h2 className="text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                                        {category.toLowerCase()} templates
                                    </h2>
                                    <Badge variant="neutral">{catTemplates.length}</Badge>
                                </div>
                                <div className="text-slate-400">
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </div>
                            </button>
                            
                            {isExpanded && (
                                <div className="overflow-x-auto bg-white dark:bg-slate-900">
                                    <table className="w-full min-w-[880px] divide-y divide-slate-200 dark:divide-slate-800">
                                        <thead className="bg-white dark:bg-slate-900">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Template</th>
                                                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Trigger</th>
                                                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Recipient</th>
                                                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Subject</th>
                                                <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">State</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {catTemplates.map(template => (
                                            <tr
                                                key={template.id}
                                                onDoubleClick={() => handleEdit(template)}
                                                className="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                                            >
                                                <td className="px-4 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(template)}
                                                        className="group flex min-w-0 items-center gap-3 text-left"
                                                    >
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                                            <Mail size={16} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-black text-slate-950 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{template.name}</div>
                                                            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{template.id}</div>
                                                        </div>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{template.triggerStatus}</td>
                                                <td className="px-4 py-3">
                                                    <Badge variant={template.recipientType === 'CLIENT' ? 'info' : template.recipientType === 'INTERPRETER' ? 'warning' : 'neutral'}>
                                                        {template.recipientType}
                                                    </Badge>
                                                </td>
                                                <td className="max-w-[360px] px-4 py-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                                                    <span className="block truncate">{template.subject}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {template.isActive ? (
                                                        <Badge variant="success">Active</Badge>
                                                    ) : (
                                                        <Badge variant="neutral">Disabled</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {editingTemplate && (
                <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
                    <div className="flex h-full w-full max-w-2xl animate-slide-in-right flex-col bg-white shadow-2xl dark:bg-slate-900">
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white">
                                <Edit2 size={20} className="text-blue-500" />
                                Edit Template
                            </h2>
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto p-5">
                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                                    Template Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editingTemplate.name}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                    className={controlClass}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                                        Category <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={editingTemplate.category || 'BOOKINGS'}
                                        onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })}
                                        className={controlClass}
                                    >
                                        <option value="BOOKINGS">Bookings</option>
                                        <option value="APPLICATIONS">Applications</option>
                                        <option value="INVOICING">Invoicing</option>
                                        <option value="SYSTEM">System</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                                        Recipient Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={editingTemplate.recipientType}
                                        onChange={(e) => setEditingTemplate({ ...editingTemplate, recipientType: e.target.value as any })}
                                        className={controlClass}
                                    >
                                        <option value="CLIENT">Client</option>
                                        <option value="INTERPRETER">Interpreter</option>
                                        <option value="APPLICANT">Applicant</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                                    Subject <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editingTemplate.subject}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                                    className={controlClass}
                                />
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-500">
                                    <label>
                                        Message Body <span className="text-red-500">*</span>
                                    </label>

                                    {/* Variable Inserter Dropdown - Simplified for mock */}
                                    <div className="relative group">
                                        <button type="button" className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs normal-case tracking-normal text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                            <Plus size={14} /> Insert Variable
                                        </button>
                                        <div className="absolute right-0 top-full z-50 mt-1 hidden h-48 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl group-hover:block dark:border-slate-700 dark:bg-slate-800">
                                            <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-2 px-2">Click to insert</div>
                                            {editingTemplate.allowedVariables.map(v => (
                                                <div
                                                    key={v}
                                                    onClick={() => insertVariable(v)}
                                                    className="px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 rounded mb-1 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600"
                                                >
                                                    {v}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <p className="mb-2 text-xs text-slate-500">Use markdown or HTML for text formatting: **bold**, `_italics_`, `&lt;br&gt;`.</p>
                                <textarea
                                    id="bodyTextarea"
                                    value={editingTemplate.body}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                                    rows={13}
                                    className={`${controlClass} font-mono leading-relaxed`}
                                />
                            </div>

                            <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={editingTemplate.isActive}
                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, isActive: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white"
                                />
                                <label htmlFor="isActive" className="font-medium text-slate-900 dark:text-white cursor-pointer select-none">
                                    Template is Active
                                </label>
                            </div>

                        </div>

                        <div className="sticky bottom-0 space-y-3 border-t border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10">
                                <div className="flex-1">
                                    <input
                                        type="email"
                                        placeholder="test-email@example.com"
                                        value={testRecipient}
                                        onChange={(e) => setTestRecipient(e.target.value)}
                                        className={controlClass}
                                    />
                                </div>
                                <Button
                                    onClick={handleSendTest}
                                    variant="secondary"
                                    size="sm"
                                    className="gap-2 whitespace-nowrap"
                                    disabled={sendingTest}
                                >
                                    {sendingTest ? <Spinner size="sm" /> : <Mail size={16} />}
                                    Send Test
                                </Button>
                            </div>

                            <div className="flex gap-3">
                                <Button onClick={() => setEditingTemplate(null)} variant="secondary" className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={handleSave} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Save size={18} />
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
