import React, { useState, useEffect } from 'react';
import { UserPlus, Star, MapPin, CheckCircle2, Search, Filter } from 'lucide-react';
import { UserAvatar } from '../ui/UserAvatar';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Booking, Interpreter } from '../../types';
import { InterpreterService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { assignInterpreterAction, createDependencies } from '../../ui/actions';
import { LocationService } from '../../services/locationService';
import { InterpreterMatchResult, rankInterpreterForBooking } from '../../domains/interpreters/matchingEngine';

interface InterpreterAllocationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    job: Booking | null;
    onSuccess: () => void;
}

export const InterpreterAllocationDrawer: React.FC<InterpreterAllocationDrawerProps> = ({
    isOpen,
    onClose,
    job,
    onSuccess,
}) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [matches, setMatches] = useState<InterpreterMatchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [distances, setDistances] = useState<Record<string, { distance: number, duration: number }>>({});
    const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);

    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    useEffect(() => {
        if (isOpen && job) {
            loadInterpreters();
        }
    }, [isOpen, job]);

    const loadInterpreters = async () => {
        setIsLoading(true);
        try {
            const allInts = await InterpreterService.getAll();
            const ranked = allInts
                .map(interpreter => rankInterpreterForBooking(interpreter, job!))
                .filter(result => result.score > 0)
                .sort((a, b) => b.score - a.score);
            setMatches(ranked);
        } catch (e) {
            console.error("Failed to load interpreters", e);
            showToast("Failed to load interpreters", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (matches.length > 0 && job?.lat && job?.lng) {
            calculateAllDistances();
        }
    }, [matches, job]);

    const calculateAllDistances = async () => {
        if (!job?.lat || !job?.lng) return;
        
        setIsCalculatingDistances(true);
        try {
            // Filter interpreters that have coordinates
            const intsWithCoords = matches
                .filter(match => match.interpreter.address?.lat && match.interpreter.address?.lng)
                .map(match => ({
                    id: match.interpreter.id,
                    lat: match.interpreter.address!.lat!,
                    lng: match.interpreter.address!.lng!
                }));

            if (intsWithCoords.length > 0) {
                const matrix = await LocationService.calculateMatrix(
                    intsWithCoords,
                    { lat: job.lat, lng: job.lng }
                );
                setDistances(matrix);
            }
        } catch (e) {
            console.error("Failed to calculate distances", e);
        } finally {
            setIsCalculatingDistances(false);
        }
    };

    const handleAssign = async (interpreter: Interpreter) => {
        if (!job) return;
        try {
            await assignInterpreterAction(job.id, interpreter.id, actionsDeps);
            showToast(`${interpreter.name} assigned successfully`, 'success');
            onSuccess();
            onClose();
        } catch (e) {
            showToast("Failed to assign interpreter", 'error');
        }
    };

    const filteredMatches = matches.filter(match =>
        match.interpreter.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            type="drawer"
            title="Interpreter Allocation Hub"
            maxWidth="3xl"
        >
            {job && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Target Info Header */}
                    <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Target Language Path</h4>
                                <p className="text-xl font-black">{job.languageFrom} → {job.languageTo}</p>
                            </div>
                            <div className="text-right">
                                <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Schedule</h4>
                                <p className="text-sm font-bold">{new Date(job.date).toLocaleDateString([], { day: '2-digit', month: 'short' })} @ {job.startTime}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4 pt-4 border-t border-white/10">
                            <div className="flex items-center space-x-2">
                                <MapPin size={14} className="text-blue-400" />
                                <span className="text-xs font-medium">{job.location || 'Remote'}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Star size={14} className="text-amber-400" />
                                <span className="text-xs font-medium">{job.serviceType}</span>
                            </div>
                        </div>
                    </div>

                    {/* Search & Ranking */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Ranked Suggestions</h4>
                            <div className="flex items-center space-x-2">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search interpreter..."
                                        className="pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" size="sm" className="h-8 py-1 px-3">
                                    <Filter size={14} className="mr-2" />
                                    Advanced
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {isLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-50 dark:bg-slate-800/50 rounded-xl animate-pulse" />)}
                                </div>
                            ) : filteredMatches.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                                    <p className="text-sm text-slate-400 italic font-medium">No specialized interpreters found for this path.</p>
                                </div>
                            ) : (
                                filteredMatches.map((match, idx) => {
                                    const { interpreter: interp } = match;
                                    return (
                                    <div
                                        key={interp.id}
                                        className="group flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-blue-500 dark:hover:border-blue-400 transition-all hover:shadow-lg hover:shadow-blue-500/5 cursor-pointer"
                                        onClick={() => handleAssign(interp)}
                                    >
                                        <div className="flex items-center space-x-4">
                                            <div className="relative">
                                                <UserAvatar 
                                                    src={interp.photoUrl} 
                                                    name={interp.name} 
                                                    size="md" 
                                                    className="rounded-xl" 
                                                />
                                                {idx === 0 && searchQuery === '' && (
                                                    <div className="absolute -top-1 -right-1 bg-amber-500 text-white p-0.5 rounded-full border-2 border-white shadow-sm">
                                                        <Star size={10} fill="currentColor" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{interp.name}</p>
                                                    <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px] font-black text-slate-500 uppercase">Pro</span>
                                                </div>
                                                <div className="flex items-center space-x-3 mt-1.5">
                                                    <div className="flex items-center space-x-1">
                                                        <Star size={10} className="text-amber-400" />
                                                        <span className="text-[10px] text-slate-500">{98 - idx}% Reliability</span>
                                                    </div>
                                                    {distances[interp.id] && (
                                                        <div className="flex items-center space-x-1">
                                                            <MapPin size={10} className="text-blue-500" />
                                                        <span className="text-[10px] text-blue-600 font-bold">{distances[interp.id].distance.toFixed(1)} miles</span>
                                                    </div>
                                                )}
                                                    <div className="flex items-center space-x-1">
                                                        <CheckCircle2 size={10} className={match.warnings.some(w => w.includes('DBS')) ? 'text-amber-500' : 'text-green-500'} />
                                                        <span className="text-[10px] text-slate-500">{match.reasons.find(r => r.includes('DBS')) || match.warnings.find(w => w.includes('DBS')) || 'Checks pending'}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {match.reasons.slice(0, 3).map(reason => (
                                                        <span key={reason} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{reason}</span>
                                                    ))}
                                                    {match.warnings.slice(0, 2).map(warning => (
                                                        <span key={warning} className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{warning}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <div className="text-right mr-2">
                                                <p className="text-xs font-black text-slate-900 dark:text-white">Rank #{idx + 1}</p>
                                                <p className="text-[10px] text-green-600 font-bold uppercase tracking-tighter">{match.score}% Match</p>
                                            </div>
                                            <button className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 opacity-0 group-hover:opacity-100 transition-all hover:scale-105 active:scale-95">
                                                <UserPlus size={18} />
                                            </button>
                                        </div>
                                    </div>
                                )})
                            )}
                        </div>
                    </div>

                    {/* Batch Action Option */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-800 dark:text-white">Multi-Allocation Mode</p>
                                <p className="text-[10px] text-slate-500 mt-1">Send this job offer to all top-ranked interpreters simultaneously.</p>
                            </div>
                            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-900">Blast Offer</Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};
