import React, { useState, useEffect } from 'react';
import { Search, UserPlus, UserCheck, Star, CheckCircle2, Globe2, Clock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { Booking, Interpreter } from '../../types';
import { InterpreterService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { assignInterpreterAction, createDependencies } from '../../ui/actions';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../ui/UserAvatar';
import { formatLanguagePair } from '../../utils/languageDisplay';

interface AssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    booking: Booking | null;
    onSuccess: () => void;
}

/**
 * Unified Assignment Modal — follows UX_RULES.md Phase 1 spec:
 * - Success: close modal → show toast → refresh data
 * - Error: show toast error → keep modal open
 * - Filtering: by language match, then active status
 */
export const AssignmentModal: React.FC<AssignmentModalProps> = ({
    isOpen,
    onClose,
    booking,
    onSuccess,
}) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [assigningId, setAssigningId] = useState<string | null>(null);

    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    // Load and filter interpreters when booking changes
    useEffect(() => {
        if (!isOpen || !booking) return;
        setSearchQuery(booking.languageTo || '');
        const loadInterpreters = async () => {
            setIsLoading(true);
            try {
                const all = await InterpreterService.getAll();
                // Sort: language match first, then active status
                const sorted = all
                    .filter(i => i.status === 'ACTIVE')
                    .sort((a, b) => {
                        const aMatch = a.languages.some(l => l.toLowerCase().includes((booking.languageTo || '').toLowerCase()));
                        const bMatch = b.languages.some(l => l.toLowerCase().includes((booking.languageTo || '').toLowerCase()));
                        if (aMatch && !bMatch) return -1;
                        if (!aMatch && bMatch) return 1;
                        return a.name.localeCompare(b.name);
                    });
                setInterpreters(sorted);
            } catch {
                showToast('Failed to load interpreters', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        loadInterpreters();
    }, [isOpen, booking]);

    const filteredInterpreters = interpreters.filter(i => {
        const q = searchQuery.toLowerCase();
        return (
            i.name.toLowerCase().includes(q) ||
            i.languages.some(l => l.toLowerCase().includes(q)) ||
            i.regions.some(r => r.toLowerCase().includes(q))
        );
    });

    const handleAssign = async (interpreter: Interpreter) => {
        if (!booking) return;
        setAssigningId(interpreter.id);
        try {
            await assignInterpreterAction(booking.id, interpreter.id, actionsDeps);
            // ✅ UX_RULES: close → toast → refresh
            onClose();
            showToast(`${interpreter.name} assigned to ${booking.bookingRef || booking.id}`, 'success');
            onSuccess();
        } catch {
            // ✅ UX_RULES: keep modal open on error
            showToast('Failed to assign interpreter. Please try again.', 'error');
        } finally {
            setAssigningId(null);
        }
    };

    const isLanguageMatch = (interpreter: Interpreter) =>
        interpreter.languages.some(l =>
            l.toLowerCase().includes((booking?.languageTo || '').toLowerCase())
        );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Assign Interpreter${booking?.bookingRef ? ` — ${booking.bookingRef}` : ''}`}
            maxWidth="lg"
        >
            <div className="space-y-4">
                {/* Booking Context Banner */}
                {booking && (
                    <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600 p-2 rounded-lg">
                                <Globe2 size={16} />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Language Path</div>
                                <div className="font-bold">{formatLanguagePair(booking.languageFrom, booking.languageTo)}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Schedule</div>
                            <div className="text-sm font-bold flex items-center gap-1.5">
                                <Clock size={12} className="text-blue-400" />
                                {new Date(booking.date).toLocaleDateString([], { day: '2-digit', month: 'short' })} @ {booking.startTime}
                            </div>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search by name, language, or region..."
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Language Match Indicator */}
                {booking?.languageTo && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Star size={12} className="text-amber-500" />
                        <span>Interpreters qualified in <strong>{booking.languageTo}</strong> are shown first</span>
                    </div>
                )}

                {/* Interpreter List */}
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Spinner />
                        </div>
                    ) : filteredInterpreters.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                            <p className="text-sm text-slate-400 italic">No active interpreters found matching your search.</p>
                        </div>
                    ) : (
                        filteredInterpreters.map((interpreter) => {
                            const matched = isLanguageMatch(interpreter);
                            const isAssigning = assigningId === interpreter.id;
                            return (
                                <div
                                    key={interpreter.id}
                                    className={`flex items-center justify-between p-3 border rounded-xl transition-all bg-white dark:bg-slate-900 hover:shadow-sm ${matched
                                            ? 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10'
                                            : 'border-slate-200 dark:border-slate-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <UserAvatar 
                                            name={interpreter.name} 
                                            src={interpreter.photoUrl} 
                                            size="sm"
                                            className="rounded-xl shadow-sm border"
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">{interpreter.name}</p>
                                                {matched && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-black rounded uppercase tracking-wider">
                                                        <Star size={8} fill="currentColor" /> Match
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                {interpreter.languages.slice(0, 3).join(' · ')}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAssign(interpreter)}
                                        isLoading={isAssigning}
                                        disabled={!!assigningId}
                                        icon={isAssigning ? undefined : UserPlus}
                                        className={`text-xs px-3 py-1.5 h-8 ${matched ? '' : 'variant-outline'}`}
                                    >
                                        {isAssigning ? '' : 'Assign'}
                                    </Button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer summary */}
                {!isLoading && filteredInterpreters.length > 0 && (
                    <p className="text-[10px] text-slate-400 text-center">
                        {filteredInterpreters.filter(isLanguageMatch).length} language match{filteredInterpreters.filter(isLanguageMatch).length !== 1 ? 'es' : ''} · {filteredInterpreters.length} active total
                    </p>
                )}
            </div>
        </Modal>
    );
};
