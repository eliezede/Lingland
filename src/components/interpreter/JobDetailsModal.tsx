import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { StatusBadge } from '../StatusBadge';
import { Booking, BookingStatus } from '../../types';
import {
    Calendar, Clock, MapPin, Video, Globe2,
    MessageSquare, CheckCircle2, XCircle, Info, ExternalLink, ShieldCheck, User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface JobDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    job: any | null; // Allow extended booking type with _isDirect and _assignmentId
    onAccept?: (id: string, isDirect?: boolean, assignmentId?: string) => Promise<void>;
    onReject?: (id: string, isDirect?: boolean, assignmentId?: string) => Promise<void>;
    onMessageAdmin?: (id: string) => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
    isOpen,
    onClose,
    job,
    onAccept,
    onReject,
    onMessageAdmin
}) => {
    const navigate = useNavigate();
    const [processing, setProcessing] = useState(false);

    if (!job) return null;

    const isOffer = job.status === BookingStatus.INCOMING || job.status === BookingStatus.OPENED || job.status === BookingStatus.ASSIGNMENT_PENDING || job.status === 'PENDING_ASSIGNMENT';

    const handleAction = async (action: () => Promise<void> | undefined) => {
        if (!action) return;
        setProcessing(true);
        try {
            await action();
            onClose();
        } catch (error) {
            console.error("Action failed", error);
        } finally {
            setProcessing(false);
        }
    };

    const footer = (
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-between">
            <div className="flex gap-3">
                <Button
                    variant="outline"
                    onClick={() => {
                        onClose();
                        navigate(`/interpreter/jobs/${job.id}`);
                    }}
                    icon={ExternalLink}
                    size="sm"
                >
                    Full Details
                </Button>
                {onMessageAdmin && (
                    <Button
                        variant="ghost"
                        onClick={() => onMessageAdmin(job.id)}
                        icon={MessageSquare}
                        size="sm"
                        className="text-blue-600 hover:bg-blue-50 hidden sm:flex"
                    >
                        Chat
                    </Button>
                )}
            </div>
            <div className="flex gap-3">
                {isOffer && (
                    <>
                        {onReject && (
                            <Button
                                variant="outline"
                                onClick={() => handleAction(() => onReject(job.id, job._isDirect, job._assignmentId))}
                                disabled={processing}
                                icon={XCircle}
                                size="sm"
                                className="text-red-600 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"
                            >
                                Decline
                            </Button>
                        )}
                        {onAccept && (
                            <Button
                                onClick={() => handleAction(() => onAccept(job.id, job._isDirect, job._assignmentId))}
                                disabled={processing}
                                icon={CheckCircle2}
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none"
                            >
                                Accept Job
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={job._isDirect || [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(job.status) ? "Direct Assignment" : "Job Opportunity"}
            footer={footer}
            type="drawer"
        >
            <div className="space-y-6">
                {/* Header Section */}
                <div className="flex justify-between items-start bg-slate-50 -mx-4 -mt-4 p-4 border-b border-slate-100 rounded-t-2xl">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-2xl font-black text-slate-900 leading-none mr-2">
                                {job.languageFrom} → {job.languageTo}
                            </span>
                            <StatusBadge status={job.status} />
                            {(job._isDirect || [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(job.status)) && (
                                <span className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                                    <ShieldCheck size={12} strokeWidth={3} /> Direct
                                </span>
                            )}
                        </div>
                        <p className="text-slate-500 font-medium flex items-center">
                            <Info size={14} className="mr-1.5" /> Reference: {job.bookingRef || 'TBD'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Estimated Pay</p>
                        <p className="text-2xl font-black text-emerald-600 leading-none">£45.00</p>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Schedule</label>
                            <div className="flex items-center text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                                <Calendar size={14} className="text-blue-500 mr-2" />
                                {job.date
                                    ? new Date(job.date.includes('T') ? job.date : job.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                                    : 'Date TBC'}
                            </div>
                            <div className="flex items-center text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200 mt-2">
                                <Clock size={14} className="text-blue-500 mr-2" />
                                {job.startTime || 'Time TBC'}{job.durationMinutes ? ` (${job.durationMinutes} mins)` : ''}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Service Type</label>
                            <div className="flex items-center text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                                <Globe2 size={14} className="text-indigo-500 mr-2" />
                                {job.serviceType}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Patient / Client</label>
                            <div className="flex items-center text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                                <User size={14} className="text-blue-500 mr-2" />
                                {job.patientName || 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Location</label>
                            <div className="flex items-start text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                                {job.locationType === 'ONLINE' ? (
                                    <>
                                        <Video size={14} className="text-blue-500 mr-2 mt-0.5" />
                                        <span className="break-all">Remote Video Call</span>
                                    </>
                                ) : (
                                    <>
                                        <MapPin size={14} className="text-red-500 mr-2 mt-0.5" />
                                        <span>{job.address || 'Address TBC'}, {job.postcode}</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {job.professionalName && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Name of Professional</label>
                                <div className="flex items-center text-xs font-medium text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                                    <User size={14} className="text-blue-500 mr-2" />
                                    {job.professionalName}
                                </div>
                            </div>
                        )}

                        {job.notes && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Special Instructions</label>
                                <div className="bg-amber-50 rounded p-3 border border-amber-200 text-xs text-amber-900 italic">
                                    "{job.notes}"
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default JobDetailsModal;
