import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Building2,
  Check,
  FileIcon,
  Hash,
  ImageIcon,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { ChatService } from '../../services/chatService';
import { StorageService } from '../../services/storageService';
import { StaffService } from '../../services/staffService';
import { ChatMessage, ChatThread, Department, User } from '../../types';
import { PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { UserAvatar } from '../ui/UserAvatar';

type ChatWorkspaceProps = {
  mode: 'admin' | 'interpreter' | 'client';
};

const getTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getOtherParticipantId = (thread: ChatThread | undefined, currentUserId: string | undefined) => {
  if (!thread || !currentUserId) return '';
  return thread.type === 'DEPARTMENT'
    ? thread.id
    : thread.participants.find(participantId => participantId !== currentUserId) || thread.participants[0] || '';
};

const getThreadTitle = (thread: ChatThread | undefined, currentUserId: string | undefined) => {
  if (!thread) return 'Select a conversation';
  if (thread.type === 'DEPARTMENT') return thread.metadata?.name || thread.participantNames?.[thread.id] || 'Department';
  const otherId = getOtherParticipantId(thread, currentUserId);
  return thread.participantNames?.[otherId] || thread.metadata?.name || 'Conversation';
};

const getThreadSubtitle = (thread: ChatThread | undefined) => {
  if (!thread) return 'No active thread';
  if (thread.type === 'BOOKING') return `Job ${thread.bookingId}`;
  if (thread.type === 'DEPARTMENT') return 'Department channel';
  return 'Direct message';
};

const ThreadIcon = ({ thread, name, photo }: { thread: ChatThread; name: string; photo?: string }) => {
  if (thread.type === 'DEPARTMENT') {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Users size={18} />
      </div>
    );
  }
  return <UserAvatar name={name} src={photo} size="sm" className="rounded-lg shadow-sm" />;
};

const MessageBubble = ({ message, isMe, compact }: { message: ChatMessage; isMe: boolean; compact: boolean }) => (
  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[82%] md:max-w-[68%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
      <div
        className={`rounded-lg px-3 py-2 text-sm shadow-sm ${
          isMe
            ? 'bg-blue-600 text-white'
            : 'border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
        }`}
      >
        {message.fileUrl && (
          <div className={message.text ? 'mb-2' : ''}>
            {message.fileType === 'IMAGE' ? (
              <button type="button" onClick={() => window.open(message.fileUrl, '_blank')} className="block overflow-hidden rounded-md">
                <img src={message.fileUrl} alt="Attachment" className="max-h-72 max-w-full object-contain" />
              </button>
            ) : (
              <a
                href={message.fileUrl}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                  isMe ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <FileIcon size={14} /> Open attachment
              </a>
            )}
          </div>
        )}
        {message.text && <p className="whitespace-pre-wrap leading-6">{message.text}</p>}
      </div>
      {!compact && (
        <div className={`mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400 ${isMe ? 'justify-end' : 'justify-start'}`}>
          <span>{message.senderName}</span>
          <span>{getTime(message.createdAt)}</span>
          {isMe && <Check size={10} />}
        </div>
      )}
    </div>
  </div>
);

export const ChatWorkspace = ({ mode }: ChatWorkspaceProps) => {
  const { user, isAdmin } = useAuth();
  const { activeThreadId, setActiveThreadId } = useChat();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'staff'>('inbox');
  const [staff, setStaff] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return ChatService.subscribeToThreads(user.id, (data) => {
      setThreads(data);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!activeThreadId || !user) {
      setMessages([]);
      return;
    }
    ChatService.resetUnread(activeThreadId, user.id).catch(() => {});
    return ChatService.subscribeToMessages(activeThreadId, setMessages);
  }, [activeThreadId, user]);

  useEffect(() => {
    if (activeTab !== 'staff' || !isAdmin) return;
    StaffService.getAllAdminUsers().then(setStaff).catch(() => setStaff([]));
    StaffService.getDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [activeTab, isAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const activeThread = threads.find(thread => thread.id === activeThreadId);

  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter(thread => {
      const title = getThreadTitle(thread, user?.id).toLowerCase();
      const subtitle = getThreadSubtitle(thread).toLowerCase();
      const lastMessage = (thread.lastMessage || '').toLowerCase();
      return title.includes(query) || subtitle.includes(query) || lastMessage.includes(query);
    });
  }, [searchTerm, threads, user?.id]);

  const selectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    if (user) ChatService.resetUnread(threadId, user.id).catch(() => {});
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeThreadId || !user) return;

    const text = inputText;
    setInputText('');
    await ChatService.sendMessage(activeThreadId, user.id, user.displayName || 'User', text);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeThreadId || !user) return;

    setIsUploading(true);
    try {
      const path = `chats/${activeThreadId}/${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      await ChatService.sendMessage(
        activeThreadId,
        user.id,
        user.displayName || 'User',
        '',
        undefined,
        { url, type: file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT' }
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startSupportChat = async () => {
    if (!user) return;
    const adminUser = await ChatService.getAdminSupportUser();
    if (!adminUser) return;
    const threadId = await ChatService.getOrCreateDirectThreadWithUser(user, adminUser, { name: 'Operations support' });
    selectThread(threadId);
  };

  const startStaffChat = async (staffUser: User) => {
    if (!user) return;
    const threadId = await ChatService.getOrCreateDirectThreadWithUser(user, staffUser);
    selectThread(threadId);
  };

  const startDepartmentChat = async (department: Department) => {
    const threadId = await ChatService.getOrCreateDepartmentThread(department.id, department.name, staff.map(member => member.id));
    selectThread(threadId);
  };

  if (!user) return null;

  return (
    <div className="-m-3 flex min-h-[calc(100dvh-4rem)] flex-col bg-slate-100 dark:bg-slate-950 sm:-m-5 lg:-m-6">
      <PageHeader
        title={mode === 'admin' ? 'Messages' : 'Communication Hub'}
        subtitle={mode === 'admin' ? 'Operational inbox for jobs, partners and internal teams.' : 'Messages with operations and support.'}
      >
        {mode !== 'admin' && (
          <Button type="button" variant="secondary" icon={MessageSquare} onClick={startSupportChat}>Message operations</Button>
        )}
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className={`${activeThreadId ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-slate-200 dark:border-slate-800`}>
          <div className="border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search conversations"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>

            {isAdmin && (
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setActiveTab('inbox')}
                  className={`h-8 rounded-md text-xs font-semibold ${activeTab === 'inbox' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('staff')}
                  className={`h-8 rounded-md text-xs font-semibold ${activeTab === 'staff' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}
                >
                  Staff
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner size="md" />
              </div>
            ) : activeTab === 'staff' && isAdmin ? (
              <div className="space-y-4 p-3">
                {departments.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Departments</p>
                    <div className="space-y-1">
                      {departments.map(department => (
                        <button
                          key={department.id}
                          type="button"
                          onClick={() => startDepartmentChat(department)}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                            <Hash size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{department.name}</p>
                            <p className="text-xs text-slate-500">Department channel</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">People</p>
                  <div className="space-y-1">
                    {staff.filter(member => member.id !== user.id).map(member => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => startStaffChat(member)}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <UserAvatar name={member.displayName || member.email} src={member.photoUrl} size="sm" className="rounded-lg" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{member.displayName}</p>
                          <p className="truncate text-xs text-slate-500">{member.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center p-8 text-center">
                <MessageSquare size={28} className="mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{searchTerm ? 'No matching conversations' : 'No conversations yet'}</p>
                {mode !== 'admin' && (
                  <button type="button" onClick={startSupportChat} className="mt-3 text-sm font-semibold text-blue-600">Message operations</button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredThreads.map(thread => {
                  const title = getThreadTitle(thread, user.id);
                  const otherId = getOtherParticipantId(thread, user.id);
                  const unread = thread.unreadCount?.[user.id] || 0;
                  const selected = activeThreadId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => selectThread(thread.id)}
                      className={`flex w-full gap-3 px-3 py-3 text-left transition-colors ${selected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <ThreadIcon thread={thread} name={title} photo={thread.participantPhotos?.[otherId]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
                          {unread > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {thread.type === 'BOOKING' ? <Briefcase size={11} /> : thread.type === 'DEPARTMENT' ? <Users size={11} /> : <Building2 size={11} />}
                          <span className="truncate">{getThreadSubtitle(thread)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{thread.lastMessage || 'New conversation'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className={`${activeThreadId ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-slate-50 dark:bg-slate-950`}>
          {activeThread ? (
            <>
              <div className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveThreadId(null)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 lg:hidden"
                  >
                    Back
                  </button>
                  <ThreadIcon thread={activeThread} name={getThreadTitle(activeThread, user.id)} photo={activeThread.participantPhotos?.[getOtherParticipantId(activeThread, user.id)]} />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{getThreadTitle(activeThread, user.id)}</h2>
                    <p className="truncate text-xs text-slate-500">{getThreadSubtitle(activeThread)}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-4xl space-y-3">
                  {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const compact = Boolean(previous && previous.senderId === message.senderId);
                    return <MessageBubble key={message.id} message={message} isMe={message.senderId === user.id} compact={compact} />;
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <form onSubmit={handleSendMessage} className="mx-auto flex max-w-4xl items-center gap-2">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    aria-label="Attach file"
                  >
                    {isUploading ? <ImageIcon size={17} className="animate-pulse" /> : <Paperclip size={17} />}
                  </button>
                  <textarea
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    disabled={isUploading}
                    placeholder={isUploading ? 'Uploading attachment...' : 'Write a message'}
                    rows={1}
                    className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !isUploading) || isUploading}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send size={17} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MessageSquare size={36} className="mb-4 text-slate-300" />
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Select a conversation</h2>
              <p className="mt-1 text-sm text-slate-500">Messages, job chats and internal threads open here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
