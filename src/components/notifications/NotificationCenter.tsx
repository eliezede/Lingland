import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, Inbox, MessageSquare, Briefcase, CreditCard } from 'lucide-react';
import { NotificationService } from '../../services/notificationService';
import { Notification, NotificationType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export const NotificationCenter = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return NotificationService.subscribe(user.id, setNotifications);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.CHAT: return <MessageSquare size={14} className="text-blue-500" />;
      case NotificationType.JOB_OFFER: return <Briefcase size={14} className="text-purple-500" />;
      case NotificationType.PAYMENT: return <CreditCard size={14} className="text-green-500" />;
      default: return <Inbox size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 relative transition-all active:scale-90"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={() => NotificationService.markAllAsRead(notifications)}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center"
              >
                <CheckCheck size={12} className="mr-1" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Inbox size={32} className="mx-auto text-slate-200 mb-2" />
                <p className="text-xs text-slate-400 font-medium">All caught up!</p>
              </div>
            ) : (
              notifications.map(note => (
                <div 
                  key={note.id}
                  onClick={() => NotificationService.markAsRead(note.id)}
                  className={`p-4 border-b border-slate-50 dark:border-slate-800/50 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${!note.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${!note.read ? 'bg-white dark:bg-slate-800 shadow-sm' : 'bg-slate-100 dark:bg-slate-900'}`}>
                    {getIcon(note.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{note.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{note.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium uppercase tracking-tighter">
                      {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!note.read && <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5 flex-shrink-0" />}
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-center">
             <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">View Activity History</button>
          </div>
        </div>
      )}
    </div>
  );
};