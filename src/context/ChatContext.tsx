import React, { createContext, useContext, useState } from 'react';

interface ChatContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  openThread: (threadId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const openThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setIsOpen(true);
  };

  return (
    <ChatContext.Provider value={{ isOpen, setIsOpen, activeThreadId, setActiveThreadId, openThread }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};