import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    UserCircle2, Mail, Phone, MapPin, Languages,
    Award, ShieldCheck, Star, Calendar, ArrowUpRight,
    UserMinus, ExternalLink
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { UserAvatar } from '../ui/UserAvatar';
import { Booking, Interpreter } from '../../types';
import { InterpreterService, BookingService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { unassignInterpreterAction, createDependencies } from '../../ui/actions';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatLanguagePair } from '../../utils/languageDisplay';

interface InterpreterPreviewDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    interpreterId: string | null;
    jobId: string | null; // The job from which we might unassign
    onSuccess: () => void; // Refresh parent data
}

export const InterpreterPreviewDrawer: React.FC<InterpreterPreviewDrawerProps> = ({
    isOpen,
    onClose,
    interpreterId,
    jobId,
    onSuccess,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
    const [upcomingJobs, setUpcomingJobs] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUnassigning, setIsUnassigning] = useState(false);

    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    const openJobDetails = (job: Booking) => {
        navigate(`/admin/bookings/${job.id}`, {
            state: { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Previous workspace' },
        });
    };

    useEffect(() => {
        if (isOpen && interpreterId) {
            loadData();
        }
    }, [isOpen, interpreterId]);

    const loadData = async () => {
        if (!interpreterId) return;
        setIsLoading(true);
        try {
            const [profile, schedule] = await Promise.all([
                InterpreterService.getById(interpreterId),
                BookingService.getInterpreterSchedule(interpreterId)
            ]);
            setInterpreter(profile || null);
            setUpcomingJobs(schedule.filter(j => new Date(j.date) >= new Date()).slice(0, 3));
        } catch (e) {
            console.error("Failed to load interpreter details", e);
            showToast("Failed to load interpreter details", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnassign = async () => {
        if (!jobId) return;
        const ok = await confirm({
            title: 'Unassign Interpreter',
            message: 'Are you sure you want to unassign this interpreter from this job? The assignment will be cleared.',
            confirmLabel: 'Unassign',
            variant: 'warning'
        });
        if (ok) {
            setIsUnassigning(true);
            try {
                await unassignInterpreterAction(jobId, actionsDeps);
                showToast("Interpreter unassigned successfully", "success");
                onSuccess();
                onClose();
            } catch (e) {
                showToast("Failed to unassign interpreter", "error");
            } finally {
                setIsUnassigning(false);
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            type="drawer"
            title="Interpreter Intelligence"
            maxWidth="3xl"
        >
            {isLoading ? (
                <div className="space-y-6 animate-pulse p-4">
                    <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-32 bg-slate-50 dark:bg-slate-800/50 rounded-2xl" />
                        <div className="h-32 bg-slate-50 dark:bg-slate-800/50 rounded-2xl" />
                    </div>
                    <div className="h-48 bg-slate-50 dark:bg-slate-800/50 rounded-2xl" />
                </div>
            ) : interpreter ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Header Profile Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-4">
                                <UserAvatar 
                                    src={interpreter.photoUrl} 
                                    name={interpreter.name} 
                                    size="lg" 
                                    className="rounded-2xl border-4 border-white dark:border-slate-800 shadow-sm" 
                                />
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{interpreter.name}</h3>
                                        <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : 'warning'}>{interpreter.status}</Badge>
                                    </div>
                                    <div className="flex items-center space-x-3 mt-1 text-xs text-slate-500 font-medium">
                                        <span className="flex items-center"><Star size={12} className="mr-1 text-amber-500 fill-amber-500" /> 4.9 Rating</span>
                                        <span className="flex items-center"><MapPin size={12} className="mr-1" /> 2.4 miles away</span>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/admin/interpreters/${interpreter.id}`)}
                                className="h-10 px-4 flex items-center gap-2"
                            >
                                Full Profile <ExternalLink size={14} />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Compliance Status</h4>
                                    <div className="flex items-center text-sm font-bold text-green-600">
                                        <ShieldCheck size={16} className="mr-2" />
                                        DBS Valid until {interpreter.dbsExpiry ? new Date(interpreter.dbsExpiry).toLocaleDateString() : 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Primary Languages</h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {interpreter.languages.map(lang => (
                                            <span key={lang} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                                                {lang}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Channels</h4>
                                    <div className="space-y-1">
                                        <div className="flex items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <Mail size={12} className="mr-2 text-slate-400" /> {interpreter.email}
                                        </div>
                                        <div className="flex items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <Phone size={12} className="mr-2 text-slate-400" /> {interpreter.phone}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Upcoming Schedule Mini-Hub */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Upcoming Engagements</h4>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full uppercase tracking-widest">Active Professional</span>
                        </div>

                        <div className="space-y-2">
                            {upcomingJobs.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                                    <p className="text-sm text-slate-400 italic font-medium">No upcoming jobs found in record.</p>
                                </div>
                            ) : (
                                upcomingJobs.map(job => (
                                    <div key={job.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all">
                                        <div className="flex items-center space-x-4">
                                            <div className="p-2 bg-white dark:bg-slate-900 rounded-xl text-blue-600 shadow-sm">
                                                <Calendar size={18} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-white leading-none">
                                                    {new Date(job.date).toLocaleDateString([], { day: '2-digit', month: 'short' })} @ {job.startTime}
                                                </p>
                                                <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">
                                                    {formatLanguagePair(job.languageFrom, job.languageTo)}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => openJobDetails(job)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                                            <ArrowUpRight size={18} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Contextual Actions */}
                    {jobId && (
                        <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-black text-red-900 dark:text-red-400 mb-1">Unassign Professional</p>
                                <p className="text-[10px] text-red-700 dark:text-red-500 uppercase font-bold tracking-widest">Action will mark job as unassigned</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-white dark:bg-slate-900 border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-all"
                                onClick={handleUnassign}
                                isLoading={isUnassigning}
                                icon={UserMinus}
                            >
                                Unassign
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-12 text-center text-slate-500 font-bold uppercase tracking-widest">
                    Interpreter data missing.
                </div>
            )}
        </Modal>
    );
};
