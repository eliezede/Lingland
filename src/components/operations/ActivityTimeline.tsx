import React from 'react';
import {
    CheckCircle2,
    Clock,
    MessageSquare,
    FileText,
    AlertCircle,
    Send,
    UserPlus,
    UserMinus,
    Settings,
    Mail,
    Receipt,
    Trash2,
    Edit,
    User
} from 'lucide-react';
import { Badge } from '../ui/Badge';

export interface TimelineEvent {
    id: string;
    type: string;
    description?: string;
    createdAt: unknown;
    actorUserId?: string;
    actorName?: string;
    metadata?: any;
}

const parseEventDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    if (typeof value === 'object') {
        const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
        if (typeof timestamp.toDate === 'function') {
            const date = timestamp.toDate();
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const seconds = timestamp.seconds ?? timestamp._seconds;
        if (typeof seconds === 'number') {
            const date = new Date(seconds * 1000);
            return Number.isNaN(date.getTime()) ? null : date;
        }
    }

    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? null : date;
};

interface ActivityTimelineProps {
    events: TimelineEvent[];
    isLoading?: boolean;
    className?: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
    events,
    isLoading = false,
    className = ""
}) => {
    if (isLoading) {
        return (
            <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-slate-100 rounded w-1/4" />
                            <div className="h-3 bg-slate-50 rounded w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Clock className="text-slate-300 mb-2" size={32} />
                <p className="text-sm font-medium text-slate-500 italic">No activity recorded yet.</p>
            </div>
        );
    }

    const getEventIcon = (type: string) => {
        const t = type.toUpperCase();
        if (t.includes('STATUS')) return <Settings size={14} className="text-blue-500" />;
        if (t.includes('ASSIGN') || t.includes('OFFER')) return <UserPlus size={14} className="text-indigo-500" />;
        if (t.includes('UNASSIGN')) return <UserMinus size={14} className="text-red-500" />;
        if (t.includes('MESSAGE') || t.includes('CHAT')) return <MessageSquare size={14} className="text-emerald-500" />;
        if (t.includes('FILE') || t.includes('DOC')) return <FileText size={14} className="text-amber-500" />;
        if (t.includes('MAIL')) return <Mail size={14} className="text-sky-500" />;
        if (t.includes('BILL') || t.includes('INVOICE') || t.includes('PAID') || t.includes('PAYMENT')) return <Receipt size={14} className="text-emerald-600" />;
        if (t.includes('DELETE')) return <Trash2 size={14} className="text-slate-600" />;
        if (t.includes('EDIT')) return <Edit size={14} className="text-orange-500" />;
        return <Clock size={14} className="text-slate-400" />;
    };

    const formatEventName = (type: string) => {
        return type
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    };

    const getEventDescription = (evt: TimelineEvent) => {
        if (evt.description) return evt.description;
        const from = evt.metadata?.fromStatus;
        const to = evt.metadata?.toStatus;
        if (from && to) return `Moved from ${from} to ${to}.`;
        if (evt.metadata?.recordedByStaff) return 'Recorded manually by staff.';
        return `The job record was updated with ${formatEventName(evt.type)} event.`;
    };

    return (
        <div className={`relative ${className}`}>
            {/* Timeline Thread */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800" />

            <div className="space-y-8">
                {events.map((evt, idx) => {
                    const eventDate = parseEventDate(evt.createdAt);
                    return (
                    <div key={evt.id || idx} className="relative flex gap-4 group">
                        {/* Icon Bubble */}
                        <div className="relative z-10 w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            {getEventIcon(evt.type)}
                        </div>

                        {/* Content Container */}
                        <div className="flex-1 pt-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-0.5">
                                        {formatEventName(evt.type)}
                                    </h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
                                        {getEventDescription(evt)}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    {eventDate ? (
                                        <>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                                {eventDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                {eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="max-w-20 text-[10px] font-medium text-slate-400">Date unavailable</p>
                                    )}
                                </div>
                            </div>

                            {/* Meta Info (Actor, Tags) */}
                            {(evt.actorName || evt.metadata) && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {evt.actorName && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-800">
                                            <User size={10} className="text-slate-400" />
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">By {evt.actorName}</span>
                                        </div>
                                    )}
                                    {evt.metadata?.status && (
                                        <Badge variant="neutral" className="text-[9px] uppercase font-black">
                                            {evt.metadata.status}
                                        </Badge>
                                    )}
                                    {evt.metadata?.recordedByStaff && (
                                        <Badge variant="warning" className="text-[9px] uppercase font-black">
                                            Manual staff
                                        </Badge>
                                    )}
                                    {evt.metadata?.source && (
                                        <Badge variant="neutral" className="text-[9px] uppercase font-black">
                                            {String(evt.metadata.source).replace(/_/g, ' ')}
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
};
