import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ChevronLeft, Paperclip, FileIcon, Calendar, ExternalLink, Hash } from 'lucide-react';
import { ChatService } from '../../services/chatService';
import { BookingService, StorageService } from '../../services/api';
import { ChatThread, ChatMessage, Booking } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

export const ChatSystem = () => {
  const { user } = useAuth();
  const { isOpen, setIsOpen, activeThreadId, setActiveThreadId } = useChat();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    return ChatService.subscribeToThreads(user.id, setThreads);
  }, [user]);

  useEffect(() => {
    if (!activeThreadId) {
      setActiveBooking(null);
      return;
    }
    const unsubscribe = ChatService.subscribeToMessages(activeThreadId, setMessages);
    
    const thread = threads.find(t => t.id === activeThreadId);
    if (thread?.bookingId) {
      const bid = thread.bookingId.startsWith('booking-') ? thread.bookingId.replace('booking-', '') : thread.bookingId;
      BookingService.getById(bid).then(setActiveBooking);
    }

    return () => unsubscribe();
  }, [activeThreadId, threads]);

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
      user.displayName || 'Usuário',
      inputText,
      recipientId
    );
    setInputText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeThreadId) return;

    setIsUploading(true);
    try {
      const path = `chats/${activeThreadId}/${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      
      const thread = threads.find(t => t.id === activeThreadId);
      const recipientId = thread?.participants.find(p => p !== user.id) || '';
      const type = file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT';

      await ChatService.sendMessage(
        activeThreadId,
        user.id,
        user.displayName || 'Usuário',
        '',
        recipientId,
        { url, type }
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const activeThread = threads.find(t => t.id === activeThreadId);
  const totalUnread = threads.reduce((acc, t) => acc + (t.unreadCount[user.id] || 0), 0);

  return (
    <div className="fixed bottom-24 lg:bottom-6 right-4 sm:right-6 z-[60] flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-2rem)] sm:w-96 h-[500px] sm:h-[600px] max-h-[calc(100dvh-120px)] bg-white dark:bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          {/* Header Principal */}
          <div className="p-5 bg-blue-600 text-white flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                {activeThreadId && (
                  <button onClick={() => setActiveThreadId(null)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                )}
                <div>
                  <h3 className="font-black text-sm tracking-tight">
                    {activeThreadId ? (activeThread?.participantNames[activeThread.participants.find(p => p !== user.id)!]) : 'Suporte Lingland'}
                  </h3>
                  <p className="text-[10px] text-blue-100 font-black uppercase tracking-widest">
                    {activeThreadId ? 'Conectado Agora' : 'Mensagens'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Contexto do Job Sticky */}
          {activeThreadId && activeBooking && (
            <div className="bg-slate-50 dark:bg-slate-800/90 p-3 px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Calendar size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter truncate">
                    #{activeBooking.bookingRef || activeBooking.id.substring(0,6)} • Vinculado
                  </p>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                    {activeBooking.languageTo} • {activeBooking.date}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => window.open(activeBooking.onlineLink || '#', '_blank')} 
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-blue-600"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          )}

          {/* Corpo das Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/20 scrollbar-hide">
            {!activeThreadId ? (
              <div className="space-y-3">
                {threads.length === 0 ? (
                   <div className="py-24 text-center opacity-30">
                      <MessageCircle size={48} className="mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">Sem conversas</p>
                   </div>
                ) : (
                  threads.map(t => (
                    <div 
                      key={t.id}
                      onClick={() => {
                        setActiveThreadId(t.id);
                        ChatService.resetUnread(t.id, user.id);
                      }}
                      className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                         <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 font-black">
                            {t.participantNames[t.participants.find(p => p !== user.id)!]?.charAt(0) || '?'}
                         </div>
                         <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                               {t.participantNames[t.participants.find(p => p !== user.id)!]}
                            </p>
                            {t.bookingId && <div className="text-[8px] font-black text-blue-500 uppercase flex items-center"><Hash size={8} className="mr-1" /> Job Ref</div>}
                            <p className="text-xs text-slate-500 truncate group-hover:text-slate-700 dark:group-hover:text-slate-300 font-medium">{t.lastMessage || 'Nova conversa'}</p>
                         </div>
                      </div>
                      {(t.unreadCount[user.id] || 0) > 0 && (
                        <div className="w-6 h-6 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-red-500/40">
                           {t.unreadCount[user.id]}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, idx) => {
                  const isMe = m.senderId === user.id;
                  const prevMsg = messages[idx-1];
                  const showTime = !prevMsg || prevMsg.senderId !== m.senderId;

                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] group`}>
                        <div className={`p-3.5 px-4 rounded-[1.5rem] text-sm shadow-sm relative ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-bl-none'
                        }`}>
                          {m.fileUrl && (
                            <div className="mb-2">
                               {m.fileType === 'IMAGE' ? (
                                 <img src={m.fileUrl} alt="anexo" className="rounded-xl max-w-full h-auto cursor-pointer border border-white/10" onClick={() => window.open(m.fileUrl, '_blank')} />
                               ) : (
                                 <a href={m.fileUrl} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${isMe ? 'bg-black/10' : 'bg-slate-50 dark:bg-slate-700'}`}>
                                   <FileIcon size={14} /> Ver Documento
                                 </a>
                               )}
                            </div>
                          )}
                          <p className="leading-tight font-medium">{m.text}</p>
                        </div>
                        {showTime && (
                          <div className={`flex items-center gap-1 mt-1 opacity-30 font-black text-[8px] uppercase tracking-tighter ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Footer Input */}
          {activeThreadId && (
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all disabled:opacity-50"
                >
                  <Paperclip size={20} />
                </button>
                <input 
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={isUploading ? "Enviando..." : "Sua mensagem..."}
                  disabled={isUploading}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl px-5 py-3 text-sm outline-none focus:ring-2 ring-blue-500 dark:text-white disabled:opacity-50 font-medium"
                />
                <button 
                  type="submit" 
                  disabled={!inputText.trim() || isUploading}
                  className="w-12 h-12 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-90"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Toggle flutuante */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-2xl shadow-blue-600/40 flex items-center justify-center transition-all hover:scale-110 active:scale-90 relative group"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {totalUnread > 0 && !isOpen && (
          <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-950 animate-bounce">
            {totalUnread}
          </span>
        )}
        <div className="absolute right-full mr-3 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl hidden sm:block">
           Precisa de ajuda?
        </div>
      </button>
    </div>
  );
};