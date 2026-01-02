import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, ChevronLeft } from 'lucide-react';
import { ChatService } from '../../services/chatService';
import { ChatThread, ChatMessage } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

export const ChatSystem = () => {
  const { user } = useAuth();
  const { isOpen, setIsOpen, activeThreadId, setActiveThreadId } = useChat();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return ChatService.subscribeToThreads(user.id, setThreads);
  }, [user]);

  useEffect(() => {
    if (!activeThreadId) return;
    return ChatService.subscribeToMessages(activeThreadId, setMessages);
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!user) return null;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeThreadId) return;

    const thread = threads.find(t => t.id === activeThreadId);
    const recipientId = thread?.participants.find(p => p !== user.id) || '';
    
    await ChatService.sendMessage(
      activeThreadId,
      user.id,
      user.displayName || 'System',
      inputText,
      recipientId
    );
    setInputText('');
  };

  const activeThread = threads.find(t => t.id === activeThreadId);
  const totalUnread = threads.reduce((acc, t) => acc + (t.unreadCount[user.id] || 0), 0);

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 h-[500px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeThreadId && (
                <button onClick={() => setActiveThreadId(null)} className="p-1 hover:bg-white/20 rounded-lg">
                  <ChevronLeft size={20} />
                </button>
              )}
              <div>
                <h3 className="font-bold text-sm">
                  {activeThreadId ? (activeThread?.participantNames[activeThread.participants.find(p => p !== user.id)!]) : 'Lingland Support Chat'}
                </h3>
                <p className="text-[10px] text-blue-100 font-medium uppercase tracking-widest">
                  {activeThreadId ? 'Active Conversation' : 'Your Inbox'}
                </p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950/50">
            {!activeThreadId ? (
              <div className="space-y-2">
                {threads.length === 0 ? (
                   <div className="py-20 text-center opacity-50">
                      <MessageCircle size={40} className="mx-auto mb-3" />
                      <p className="text-sm font-bold">No active chats</p>
                   </div>
                ) : (
                  threads.map(t => (
                    <div 
                      key={t.id}
                      onClick={() => {
                        setActiveThreadId(t.id);
                        ChatService.resetUnread(t.id, user.id);
                      }}
                      className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-blue-500 transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                         <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500 font-bold">
                            {t.participantNames[t.participants.find(p => p !== user.id)!]?.charAt(0) || '?'}
                         </div>
                         <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                               {t.participantNames[t.participants.find(p => p !== user.id)!]}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{t.lastMessage || 'Start a conversation'}</p>
                         </div>
                      </div>
                      {(t.unreadCount[user.id] || 0) > 0 && (
                        <div className="w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                           {t.unreadCount[user.id]}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      m.senderId === user.id 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'
                    }`}>
                      {m.text}
                      <p className={`text-[9px] mt-1 opacity-60 font-bold ${m.senderId === user.id ? 'text-right' : 'text-left'}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Footer */}
          {activeThreadId && (
            <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <input 
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500 dark:text-white"
              />
              <button type="submit" className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                <Send size={18} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all hover:scale-110 active:scale-90 relative"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {totalUnread > 0 && !isOpen && (
          <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-950">
            {totalUnread}
          </span>
        )}
      </button>
    </div>
  );
};