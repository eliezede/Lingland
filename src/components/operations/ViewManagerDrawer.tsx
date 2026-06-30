import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useBookingViews } from '../../hooks/useBookingViews';
import { BookingStatus, BookingWorkspace, FilterableField, SortableField, GroupableField, ViewFilterRule, ViewSortRule, ServiceType, Interpreter, BookingView } from '../../types';
import { Trash2, Save, Plus, X, Filter, ArrowUpDown, Layers, Columns3, Pin, EyeOff, RotateCcw } from 'lucide-react';
import { InterpreterService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface ViewManagerDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    viewId: string | null; // null for new view
    workspace?: BookingWorkspace;
}

const FILTERABLE_FIELDS: { value: FilterableField; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'clientName', label: 'Client' },
    { value: 'costCode', label: 'PO / Cost Code' },
    { value: 'totalAmount', label: 'Client Charge' },
    { value: 'languageTo', label: 'To Language' },
    { value: 'serviceType', label: 'Service Type' },
    { value: 'locationType', label: 'Location Type' },
    { value: 'interpreterId', label: 'Interpreter' },
    { value: 'date', label: 'Date / Range' }
];

const SORTABLE_FIELDS: { value: SortableField; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'status', label: 'Status' },
    { value: 'client', label: 'Client' },
    { value: 'languageTo', label: 'Language' },
    { value: 'duration', label: 'Duration' },
    { value: 'amount', label: 'Amount' }
];

const GROUPABLE_FIELDS: { value: GroupableField | ''; label: string }[] = [
    { value: '', label: 'None' },
    { value: 'status', label: 'Status' },
    { value: 'client', label: 'Client' },
    { value: 'interpreter', label: 'Interpreter' },
    { value: 'languageTo', label: 'Language' },
    { value: 'serviceType', label: 'Service Type' },
    { value: 'locationType', label: 'Location Type' },
    { value: 'date', label: 'Date' }
];

const GRID_FIELD_LABELS: Record<string, string> = {
    jobNumber: 'Job Number',
    status: 'Status',
    bookedFor: 'Booked For',
    client: 'Client',
    language: 'Language',
    interpreter: 'Professional',
    location: 'Location',
    service: 'Service',
    duration: 'Duration',
    contact: 'Contact',
    amount: 'Client Charge',
    professionalCost: 'Professional Cost',
    margin: 'Margin',
    costCode: 'Cost Code',
    billingState: 'Billing State',
    invoiceRef: 'Invoice Ref',
    action: 'Action',
};

const formatLayoutFields = (fields?: string[]) => {
    if (!fields || fields.length === 0) return 'None';
    const labels = fields.map(field => GRID_FIELD_LABELS[field] || field);
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`;
};

export const ViewManagerDrawer: React.FC<ViewManagerDrawerProps> = ({
    isOpen,
    onClose,
    viewId,
    workspace = 'operations',
}) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { views, saveCustomView, updateCustomView, deleteCustomView } = useBookingViews(user?.id || '', workspace);

    const [name, setName] = useState('');
    const [filterRules, setFilterRules] = useState<ViewFilterRule[]>([]);
    const [sortRules, setSortRules] = useState<ViewSortRule[]>([]);
    const [groupBy, setGroupBy] = useState<GroupableField | ''>('');
    const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
    const currentView = views.find(v => v.id === viewId) as BookingView | undefined;

    useEffect(() => {
        const loadInterpreters = async () => {
            try {
                const data = await InterpreterService.getAll();
                setInterpreters(data);
            } catch (e) {
                console.error("Failed to load interpreters", e);
            }
        };
        loadInterpreters();
    }, []);

    useEffect(() => {
        if (isOpen) {
            if (viewId) {
                const view = views.find(v => v.id === viewId);
                if (view) {
                    setName(view.name);
                    setFilterRules(view.filterRules || []);
                    setSortRules(view.sortRules || []);
                    setGroupBy(view.groupBy || '');
                }
            } else {
                setName('');
                setFilterRules([]);
                setSortRules([{ field: 'date', direction: 'desc' }]);
                setGroupBy('');
            }
        }
    }, [isOpen, viewId, views]);

    const handleSave = () => {
        if (!name.trim()) {
            showToast('Please enter a view name', 'error');
            return;
        }

        const viewData = {
            name,
            filters: {}, // Keep empty for compatibility
            sortBy: 'dateDesc' as const, // Fallback
            filterRules,
            sortRules,
            groupBy,
            workspace
        };

        if (viewId) {
            updateCustomView(viewId, viewData);
            showToast('View updated', 'success');
        } else {
            saveCustomView(viewData);
            showToast('View created', 'success');
        }
        onClose();
    };

    const addFilterRule = () => {
        setFilterRules([
            ...filterRules,
            { id: `rule-${Date.now()}`, field: 'status', operator: 'is', value: BookingStatus.INCOMING }
        ]);
    };

    const removeFilterRule = (id: string) => {
        setFilterRules(filterRules.filter(r => r.id !== id));
    };

    const updateFilterRule = (id: string, updates: Partial<ViewFilterRule>) => {
        setFilterRules(filterRules.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const addSortRule = () => {
        setSortRules([...sortRules, { field: 'date', direction: 'desc' }]);
    };

    const removeSortRule = (index: number) => {
        setSortRules(sortRules.filter((_, i) => i !== index));
    };

    const updateSortRule = (index: number, updates: Partial<ViewSortRule>) => {
        setSortRules(sortRules.map((r, i) => i === index ? { ...r, ...updates } : r));
    };

    const isSystem = views.find(v => v.id === viewId)?.isSystem;
    const hasSavedLayout = Boolean(
        currentView?.columnOrder?.length ||
        Object.keys(currentView?.columnWidths || {}).length ||
        currentView?.pinnedColumns?.length ||
        currentView?.hiddenColumns?.length
    );

    const resetSavedLayout = () => {
        if (!viewId) return;
        updateCustomView(viewId, {
            columnOrder: [],
            columnWidths: {},
            pinnedColumns: [],
            hiddenColumns: undefined,
        });
        showToast('View layout reset', 'success');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            type="drawer"
            title={viewId ? 'Edit View' : 'Create View'}
            maxWidth="md"
        >
            <div className="space-y-8 p-6">
                <section>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">View Identity</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Urgent ONLINE Jobs"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none transition-all text-sm font-bold text-slate-900 dark:text-white"
                    />
                </section>

                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Filter size={14} className="text-slate-400" />
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Filter Rules</label>
                        </div>
                        <button onClick={addFilterRule} className="text-[10px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-700 flex items-center gap-1">
                            <Plus size={12} /> Add Rule
                        </button>
                    </div>

                    <div className="space-y-3">
                        {filterRules.map(rule => (
                            <div key={rule.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                <select
                                    value={rule.field}
                                    onChange={(e) => updateFilterRule(rule.id, { field: e.target.value as FilterableField })}
                                    className="flex-1 min-w-[120px] bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300"
                                >
                                    {FILTERABLE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                                <select
                                    value={rule.operator}
                                    onChange={(e) => updateFilterRule(rule.id, { operator: e.target.value as any })}
                                    className="w-24 bg-transparent outline-none text-xs font-bold text-slate-400"
                                >
                                    <option value="is">is</option>
                                    <option value="isNot">is not</option>
                                    <option value="contains">contains</option>
                                    {rule.field === 'date' && <option value="isBetween">between</option>}
                                    {rule.field === 'date' && <option value="isAfter">after</option>}
                                    {rule.field === 'date' && <option value="isBefore">before</option>}
                                </select>

                                {/* Dynamic Input Renderer */}
                                {rule.field === 'status' ? (
                                    <select
                                        value={rule.value}
                                        onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                    >
                                        <option value="">Select Status</option>
                                        {Object.values(BookingStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                ) : rule.field === 'serviceType' ? (
                                    <select
                                        value={rule.value}
                                        onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                    >
                                        <option value="">Select Service</option>
                                        {Object.values(ServiceType).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                ) : rule.field === 'locationType' ? (
                                    <select
                                        value={rule.value}
                                        onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                    >
                                        <option value="">Select Location Type</option>
                                        <option value="ONSITE">On-Site</option>
                                        <option value="ONLINE">Online</option>
                                    </select>
                                ) : rule.field === 'interpreterId' ? (
                                    <>
                                        <input
                                            type="text"
                                            list={`interpreters-${rule.id}`}
                                            value={interpreters.find(i => i.id === rule.value)?.name || rule.value}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const matched = interpreters.find(i => i.name === val);
                                                updateFilterRule(rule.id, { value: matched ? matched.id : val });
                                            }}
                                            placeholder="Search interpreter..."
                                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                        />
                                        <datalist id={`interpreters-${rule.id}`}>
                                            {interpreters.map(i => <option key={i.id} value={i.name} />)}
                                        </datalist>
                                    </>
                                ) : rule.field === 'date' ? (
                                    <div className="flex-1 flex gap-1 items-center">
                                        <input
                                            type="date"
                                            value={rule.value.split(',')[0] || ''}
                                            onChange={(e) => {
                                                const parts = rule.value.split(',');
                                                parts[0] = e.target.value;
                                                updateFilterRule(rule.id, { value: parts.join(',') });
                                            }}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                        />
                                        {rule.operator === 'isBetween' && (
                                            <>
                                                <span className="text-xs font-bold text-slate-400">and</span>
                                                <input
                                                    type="date"
                                                    value={rule.value.split(',')[1] || ''}
                                                    onChange={(e) => {
                                                        const parts = rule.value.split(',');
                                                        parts[1] = e.target.value;
                                                        updateFilterRule(rule.id, { value: `${parts[0] || ''},${parts[1]}` });
                                                    }}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                                />
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={rule.value}
                                        onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold"
                                    />
                                )}

                                <button onClick={() => removeFilterRule(rule.id)} className="text-slate-400 hover:text-red-500 p-1">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {filterRules.length === 0 && (
                            <div className="text-center py-4 text-xs text-slate-400 italic">No filters applied. Showing all jobs.</div>
                        )}
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <ArrowUpDown size={14} className="text-slate-400" />
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sort Rules</label>
                        </div>
                        <button onClick={addSortRule} className="text-[10px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-700 flex items-center gap-1">
                            <Plus size={12} /> Add Tier
                        </button>
                    </div>

                    <div className="space-y-3">
                        {sortRules.map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                <select
                                    value={rule.field}
                                    onChange={(e) => updateSortRule(idx, { field: e.target.value as SortableField })}
                                    className="flex-1 bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300"
                                >
                                    {SORTABLE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                                <select
                                    value={rule.direction}
                                    onChange={(e) => updateSortRule(idx, { direction: e.target.value as 'asc' | 'desc' })}
                                    className="w-32 bg-transparent outline-none text-xs font-bold text-slate-400"
                                >
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                                <button onClick={() => removeSortRule(idx)} className="text-slate-400 hover:text-red-500 p-1">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <Layers size={14} className="text-slate-400" />
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Group Organization</label>
                    </div>
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as GroupableField | '')}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-blue-500 outline-none transition-all text-sm font-bold text-slate-900 dark:text-white"
                    >
                        {GROUPABLE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </section>

                {viewId && (
                    <section>
                        <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Columns3 size={14} className="text-slate-400" />
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Table Layout</label>
                            </div>
                            <button
                                type="button"
                                onClick={resetSavedLayout}
                                disabled={!hasSavedLayout}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            >
                                <RotateCcw size={12} /> Reset
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <EyeOff size={12} /> Hidden
                                </div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatLayoutFields(currentView?.hiddenColumns)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <Pin size={12} /> Frozen
                                </div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatLayoutFields(currentView?.pinnedColumns)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <Columns3 size={12} /> Layout
                                </div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {(currentView?.columnOrder?.length || 0)} ordered / {Object.keys(currentView?.columnWidths || {}).length} resized
                                </p>
                            </div>
                        </div>
                    </section>
                )}

                <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    {viewId && !isSystem ? (
                        <Button variant="outline" className="text-red-600 border-red-100 hover:bg-red-50" onClick={() => { deleteCustomView(viewId); onClose(); }} icon={Trash2}>Delete View</Button>
                    ) : <div />}

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} icon={Save}>Save View</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
