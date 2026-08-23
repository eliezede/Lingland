import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from './ui/Card';
import { getLondonDateKey } from '../utils/londonDateTime';

interface CalendarProps {
    jobs: any[];
    onDateClick?: (date: Date) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ jobs, onDateClick }) => {
    const [currentDate, setCurrentDate] = useState(() => {
        const [year, month] = getLondonDateKey().split('-').map(Number);
        return new Date(year, month - 1, 1);
    });

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;
    const toDateKey = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const totalDays = daysInMonth(year, month);
    const offset = firstDayOfMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const jobCountOnDay = (day: number) => jobs.filter(job => String(job.date || '').slice(0, 10) === toDateKey(day)).length;

    const isToday = (day: number) => getLondonDateKey() === toDateKey(day);

    const days = [];
    // Previous month days placeholder
    for (let i = 0; i < offset; i++) {
        days.push(<div key={`empty-${i}`} className="h-10 w-10 md:h-12 md:w-12" />);
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
        const jobCount = jobCountOnDay(d);
        const hasJob = jobCount > 0;
        const today = isToday(d);
        const dateLabel = new Intl.DateTimeFormat('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(new Date(year, month, d, 12));

        days.push(
            <button
                type="button"
                key={d}
                onClick={() => onDateClick?.(new Date(year, month, d))}
                aria-label={`${dateLabel}${jobCount ? `, ${jobCount} scheduled ${jobCount === 1 ? 'job' : 'jobs'}` : ''}`}
                aria-current={today ? 'date' : undefined}
                className={`
          h-10 w-10 md:h-12 md:w-12 flex flex-col items-center justify-center rounded-lg relative transition-colors text-xs font-bold
          ${today ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}
          ${hasJob && !today ? 'border-2 border-emerald-100 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/30' : ''}
        `}
            >
                {d}
                {hasJob && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${today ? 'bg-white' : 'bg-emerald-500'}`} />
                )}
            </button>
        );
    }

    return (
        <Card className="select-none p-4">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-slate-900 dark:text-white">
                    {monthNames[month]} {year}
                </h3>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={prevMonth}
                        aria-label="Previous month"
                        className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={nextMonth}
                        aria-label="Next month"
                        className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="flex h-8 items-center justify-center text-[10px] font-black uppercase text-slate-400">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days}
            </div>

            <div className="mt-6 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Jobs Scheduled
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    Today
                </div>
            </div>
        </Card>
    );
};
