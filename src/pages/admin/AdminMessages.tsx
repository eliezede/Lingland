import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChatService } from '../../services/chatService';
import { StorageService } from '../../services/api';
import { ChatThread, ChatMessage } from '../../types';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Search, Send, MessageSquare, Hash, FileIcon, ImageIcon, Paperclip, Check, ChevronLeft } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

export const AdminMessages = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    return ChatService.subscribeToThreads(user.id, (data) => {
      setThreads(data);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!activeThreadId) return;
    const unsubscribe = ChatService.subscribeToMessages(activeThreadId, setMessages);
    return () => unsubscribe();
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeThreadId || !user) return;

    const thread = threads.find(t => t.id === activeThreadId);
    const recipientId = thread?.participants.find(p => p !== user.id) || '';
    
    const text = inputText;
    setInputText('');
    
    await ChatService.sendMessage(
      activeThreadId,
      user.id,
      user.displayName || 'Admin',
      text,
      recipientId
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeThreadId || !user) return;

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
        user.displayName || 'Admin',
        '',
        recipientId,
        { url, type }
      );
    } finally {
      setIsUploading(false);
    }
  };

  const filteredThreads = threads.filter(t => {
    const otherParticipantId = t.participants.find(p => p !== user?.id);
    const otherName = t.participantNames[otherParticipantId!] || '';
    return otherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           t.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (loading) return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;

  const activeThread = threads.find(t => t.id === activeThreadId);

  return (
    <div className="h-[calc(100vh-12rem)] flex gap-6 overflow-hidden">
      {/* Sidebar de Conversas */}
      <Card padding="none" className="w-80 flex flex-col overflow-hidden bg-white dark:bg-slate-900 border-none shadow-xl">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search conversations..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm outline-none dark:text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {searchTerm ? 'No results found.' : 'No active chats.'}
            </div>
          ) : (
            filteredThreads.map(t => {
              const otherParticipantId = t.participants.find(p => p !== user?.id);
              const otherName = t.participantNames[otherParticipantId!] || 'User';
              const isSelected = activeThreadId === t.id;
              const unread = t.unreadCount[user?.id!] || 0;

              return (
                <div 
                  key={t.id}
                  onClick={() => {
                    setActiveThreadId(t.id);
                    if (user) ChatService.resetUnread(t.id, user.id);
                  }}
                  className={`p-4 border-b border-slate-50 dark:border-slate-800 cursor-pointer transition-all flex gap-3 ${
                    isSelected ? 'bg-blue-50/80 dark:bg-blue-900/10 border-l-4 border-l-blue-600 shadow-inner' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-black text-slate-500 shadow-sm shrink-0">
                    {otherName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                       <p className={`text-sm truncate font-black ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                         {otherName}
                       </p>
                       {unread > 0 && <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md shadow-red-500/30">{unread}</span>}
                    </div>
                    {t.bookingId && (
                      <div className="flex items-center text-[9px] text-blue-500 font-black uppercase tracking-tighter mt-0.5">
                        <Hash size={10} className="mr-0.5" /> Job {t.bookingId.replace('booking-', '')}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1 font-medium">{t.lastMessage || 'New conversation'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Janela de Chat */}
      <Card padding="none" className="flex-1 flex flex-col overflow-hidden bg-slate-50/30 dark:bg-slate-950/20 relative border-2 border-white dark:border-slate-800 shadow-2xl">
        {activeThreadId ? (
          <>
            {/* Header do Chat */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shadow-sm z-10">
               <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-black shadow-inner">
                    {activeThread?.participantNames[activeThread.participants.find(p => p !== user?.id)!]?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      {activeThread?.participantNames[activeThread.participants.find(p => p !== user?.id)!]}
                    </h3>
                    <div className="flex items-center text-[10px] text-green-500 font-bold uppercase tracking-widest">
                       <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></div>
                       Admin Support Channel
                    </div>
                  </div>
               </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {messages.map((m, idx) => {
                const isMe = m.senderId === user?.id;
                const nextMessage = messages[idx + 1];
                const isLastInGroup = !nextMessage || nextMessage.senderId !== m.senderId;

                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-400`}>
                    <div className={`max-w-[75%] ${isMe ? 'order-2' : ''}`}>
                      <div className={`p-4 rounded-[1.5rem] text-sm shadow-sm transition-all hover:shadow-md ${
                        isMe 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-100 dark:border-slate-700'
                      }`}>
                        {m.fileUrl && (
                          <div className="mb-3">
                            {m.fileType === 'IMAGE' ? (
                              <img src={m.fileUrl} alt="attachment" className="rounded-2xl max-w-full h-auto cursor-pointer border-2 border-white/20 shadow-lg" onClick={() => window.open(m.fileUrl, '_blank')} />
                            ) : (
                              <a href={m.fileUrl} target="_blank" rel="noreferrer" className={`flex items-center p-3 rounded-2xl text-xs font-bold ${isMe ? 'bg-black/10 hover:bg-black/20' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200'}`}>
                                <FileIcon size={16} className="mr-3" /> View Document
                              </a>
                            )}
                          </div>
                        )}
                        <p className="leading-relaxed font-medium">{m.text}</p>
                      </div>
                      {isLastInGroup && (
                        <div className={`flex items-center gap-1 mt-1.5 opacity-40 font-black text-[8px] uppercase tracking-tighter ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMe && <Check size={8} />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de Mensagem */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              <form onSubmit={handleSendMessage} className="flex gap-3 items-center">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-all disabled:opacity-50"
                >
                  <Paperclip size={20} />
                </button>
                <input 
                  type="text" 
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={isUploading ? "Uploading file..." : "Type your message..."}
                  disabled={isUploading}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 py-3 text-sm focus:ring-2 ring-blue-500 outline-none dark:text-white font-medium"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() || isUploading}
                  className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
            <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl flex items-center justify-center mb-8 border border-slate-100 dark:border-slate-700">
              <MessageSquare size={48} className="text-slate-300" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Help Desk</h3>
            <p className="text-sm max-w-xs font-medium">Select a conversation from the sidebar to start supporting your partners.</p>
          </div>
        )}
      </Card>
    </div>
  );
};