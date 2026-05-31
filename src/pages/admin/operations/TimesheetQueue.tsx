import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCheck, AlertCircle, Clock, CheckCircle2, XCircle, Eye, ArrowRight, ShieldCheck, Info, Zap, CheckCircle } from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { Booking, BookingStatus, Timesheet, ServiceCategory, InterpreterInvoice, InvoiceStatus } from '../../../types';
import { BookingService, BillingService } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';

export const TimesheetQueue = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { bookings = [], loading, refresh } = useBookings();

    // Filter jobs that have submitted timesheets but aren't verified yet
    const pendingTimesheets = bookings.filter(b =>
        (b.status as any) === BookingStatus.TIMESHEET_SUBMITTED ||
        (b.status as any) === BookingStatus.READY_FOR_INVOICE ||
        (b.status as any) === 'TIMESHEET_SUBMITTED' // String literal for safety
    );

    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = useState(false);

    const openAuditHub = async (job: Booking) => {
        setSelectedJob(job);
        setSelectedTimesheet(null);
        setIsAuditModalOpen(true);

        try {
            const ts = await BillingService.getTimesheetByBookingId(job.id);
            setSelectedTimesheet(ts);
        } catch (error) {
            console.error("Failed to load timesheet evidence:", error);
        }
    };

    const handleVerify = async (job: Booking) => {
        try {
            await BillingService.approveTimesheetByBookingId(job.id);
            setIsAuditModalOpen(false);
            refresh();
            showToast("Timesheet authorized for billing", "success");
        } catch (e) {
            showToast("Failed to verify timesheet", "error");
        }
    };

    const handleBulkVerify = async (ids: string[]) => {
        setIsBulkLoading(true);
        let done = 0;
        await Promise.allSettled(ids.map(async id => {
            try {
                await BillingService.approveTimesheetByBookingId(id);
                done++;
            } catch { /* silent */ }
        }));
        setSelectedIds([]);
        setIsBulkLoading(false);
        refresh();
        showToast(`${done} claim${done !== 1 ? 's' : ''} authorized for billing`, 'success');
    };

    const columns = [
        {
            header: 'Job Reference',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 dark:text-white">{job.bookingRef || 'TBD'}</span>
                    <span className="text-[10px] text-slate-500 uppercase">{job.clientName}</span>
                    {job.adminNotes?.includes('Not executed:') && (
                        <span className="mt-1 inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700 border border-amber-100">Exception</span>
                    )}
                </div>
            )
        },
        {
            header: 'Interpreter',
            accessor: (job: Booking) => (
                <div className="flex items-center">
                    <UserAvatar
                        name={job.interpreterName || 'Unknown'}
                        src={job.interpreterPhotoUrl}
                        size="sm"
                        className="mr-3"
                    />
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{job.interpreterName}</div>
                </div>
            )
        },
        {
            header: 'Claimed Vol.',
            accessor: (job: Booking) => (
                <div className="flex items-center text-sm font-bold text-slate-900 dark:text-white">
                    {job.serviceCategory === ServiceCategory.TRANSLATION ? (
                        <>
                            <FileCheck size={14} className="mr-2 text-indigo-500" />
                            {job.durationMinutes === 0 ? 'TBD' : `${job.durationMinutes} Units`}
                        </>
                    ) : (
                        <>
                            <Clock size={14} className="mr-2 text-blue-500" />
                            {job.durationMinutes === 0 ? 'TBD' : `${Math.floor(job.durationMinutes / 60)}h ${job.durationMinutes % 60}m`}
                        </>
                    )}
                </div>
            )
        },
        {
            header: 'Status',
            accessor: (job: Booking) => <StatusBadge status={job.status} />
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="Timesheet Review" subtitle="Visual audit and compliance verification" />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 p-4 rounded-2xl flex items-start space-x-3">
                        <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                        <div>
                            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Quality Assurance Required</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">There are {pendingTimesheets.length} claims pending verification. Ensure actual times match the original job booking before authorizing payment.</p>
                        </div>
                    </div>

                    <Table
                        data={pendingTimesheets}
                        columns={columns}
                        selectable
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onRowClick={openAuditHub}
                        onRowDoubleClick={(job) => navigate(`/admin/bookings/${job.id}`, {
                            state: { returnTo: '/admin/operations/timesheets', returnLabel: 'Timesheet Review' },
                        })}
                        isLoading={loading}
                        emptyMessage="No pending timesheets for review."
                    />

                    <BulkActionBar
                        selectedIds={selectedIds}
                        selectedCount={selectedIds.length}
                        totalCount={pendingTimesheets.length}
                        entityLabel="claim"
                        isLoading={isBulkLoading}
                        onClearSelection={() => setSelectedIds([])}
                        actions={[
                            {
                                label: 'Authorize All',
                                icon: Zap,
                                onClick: () => handleBulkVerify(selectedIds),
                                variant: 'success',
                            }
                        ]}
                    />
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Integrity Summary</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Claims Verified Today</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">42</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Flagged Exceptions</span>
                                <span className="text-sm font-bold text-red-500 underline decoration-red-200">3</span>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800" />
                            <div className="flex items-center space-x-2 text-blue-600">
                                <Info size={14} />
                                <span className="text-[10px] font-bold uppercase">Auto-verify active for 1hr+</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Audit Sidebar Hub */}
            <Modal
                isOpen={isAuditModalOpen}
                onClose={() => setIsAuditModalOpen(false)}
                type="drawer"
                title="Visual Compliance Audit"
                maxWidth="4xl"
            >
                {selectedJob && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Comparison Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Original Booking */}
                            <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Original Job Record</h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Planned Schedule</p>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedJob.date}</p>
                                        <p className="text-lg font-black text-slate-700 dark:text-slate-300">{selectedJob.startTime}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">
                                            {selectedJob.serviceCategory === ServiceCategory.TRANSLATION ? 'Target Volume' : 'Allocated Duration'}
                                        </p>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                                            {selectedJob.serviceCategory === ServiceCategory.TRANSLATION ? 'As per source' : `${selectedJob.durationMinutes} minutes`}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Service Type</p>
                                        <p className="text-xs font-bold text-blue-600 uppercase">{selectedJob.serviceType}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Interpreter Claim */}
                            <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 shadow-lg shadow-blue-500/5">
                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Interpreter Claim</h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] text-blue-500 uppercase font-bold">Actual Attendance</p>
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                                            {selectedTimesheet?.actualStart ? new Date(selectedTimesheet.actualStart).toLocaleDateString() : selectedJob.date}
                                        </p>
                                        <p className="text-lg font-black text-blue-700 dark:text-blue-100">
                                            {selectedTimesheet?.actualStart ? new Date(selectedTimesheet.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : selectedJob.startTime}
                                            {selectedTimesheet?.actualEnd ? ` - ${new Date(selectedTimesheet.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-blue-500 uppercase font-bold">
                                            {selectedJob.serviceCategory === ServiceCategory.TRANSLATION ? 'Delivery Volume' : 'Session Mode'}
                                        </p>
                                        <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                                            {selectedJob.serviceCategory === ServiceCategory.TRANSLATION 
                                                ? `${selectedTimesheet?.wordCount || 0} ${selectedTimesheet?.units || 'words'}`
                                                : (selectedTimesheet?.sessionMode || 'Standard')}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] text-blue-500 uppercase font-bold">Travel</p>
                                            <p className="text-sm font-bold text-blue-900 dark:text-blue-200">{selectedTimesheet?.travelTimeMinutes || 0}m (£{selectedTimesheet?.travelFees || 0})</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-blue-500 uppercase font-bold">Mileage</p>
                                            <p className="text-sm font-bold text-blue-900 dark:text-blue-200">{selectedTimesheet?.mileage || 0}m (£{selectedTimesheet?.mileageFees || 0})</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                         <div>
                                            <p className="text-[10px] text-blue-500 uppercase font-bold">Parking/Transport</p>
                                            <p className="text-sm font-bold text-blue-900 dark:text-blue-200">£{(selectedTimesheet?.parking || 0) + (selectedTimesheet?.transport || 0)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-blue-500 uppercase font-bold text-right">Total Claim</p>
                                            <p className="text-lg font-black text-blue-700 dark:text-blue-100 text-right">£{selectedTimesheet?.totalToPay?.toFixed(2) || '0.00'}</p>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-800">
                                        <p className="text-[10px] text-green-600 uppercase font-black mb-1">Comparison Result</p>
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle2 size={14} className="text-green-500" />
                                            <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">
                                                {selectedTimesheet?.nonExecutionReason ? `Exception: ${selectedTimesheet.nonExecutionReason}` : 'Ready for Verification'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Supporting Evidence */}
                        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Supporting Evidence</h4>
                            <div className="flex items-center justify-center min-h-40 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 overflow-hidden">
                                {selectedTimesheet?.supportingDocumentUrl ? (
                                    <div className="w-full">
                                        {selectedTimesheet.supportingDocumentUrl.toLowerCase().endsWith('.pdf') ? (
                                            <div className="flex flex-col items-center p-4">
                                                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-lg flex items-center justify-center mb-3">
                                                    <FileCheck size={32} />
                                                </div>
                                                <p className="text-sm font-bold text-slate-700 mb-4">PDF Document Attached</p>
                                                <a
                                                    href={selectedTimesheet.supportingDocumentUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                                                >
                                                    View Evidence PDF
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="relative group">
                                                <img
                                                    src={selectedTimesheet.supportingDocumentUrl}
                                                    alt="Supporting Evidence"
                                                    className="max-w-full h-auto rounded-lg shadow-sm"
                                                />
                                                <a
                                                    href={selectedTimesheet.supportingDocumentUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg"
                                                >
                                                    <span className="bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold">Open Full Screen</span>
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center p-8">
                                        <AlertCircle className="mx-auto text-slate-300 mb-2" size={24} />
                                        <p className="text-xs text-slate-400 italic">No digital timesheet image attached.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Audit Actions */}
                        <div className="flex gap-3 justify-end pt-6 border-t border-slate-100 dark:border-slate-800">
                            <Button variant="outline" className="text-red-600 border-red-100 hover:bg-red-50">
                                <XCircle size={16} className="mr-2" />
                                Reject Claim
                            </Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20" onClick={() => handleVerify(selectedJob)}>
                                <CheckCircle2 size={16} className="mr-2" />
                                Authorize for Billing
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
