import { 
  collection, query, where, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, increment,
  setDoc
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ChatThread, ChatMessage } from '../types';

export const ChatService = {
  getOrCreateThread: async (participants: string[], names: Record<string, string>, bookingId?: string) => {
    const threadId = bookingId ? `booking-${bookingId}` : participants.sort().join('_');
    const threadRef = doc(db, 'chatThreads', threadId);
    
    await setDoc(threadRef, {
      participants,
      participantNames: names,
      bookingId,
      updatedAt: serverTimestamp(),
      // Inicializa unreadCount apenas se não existir para evitar sobrescrever
      unreadCount: participants.reduce((acc, p) => ({ ...acc, [p]: 0 }), {})
    }, { merge: true });

    return threadId;
  },

  sendMessage: async (threadId: string, senderId: string, senderName: string, text: string, recipientId: string) => {
    const messageData = {
      threadId,
      senderId,
      senderName,
      text,
      createdAt: new Date().toISOString()
    };

    await addDoc(collection(db, 'messages'), messageData);
    
    const updateData: any = {
      lastMessage: text,
      lastMessageAt: messageData.createdAt
    };

    // PROTEÇÃO: Só incrementa se houver um recipientId válido para evitar "unreadCount." inválido
    if (recipientId) {
      updateData[`unreadCount.${recipientId}`] = increment(1);
    }

    await updateDoc(doc(db, 'chatThreads', threadId), updateData);
  },

  subscribeToMessages: (threadId: string, callback: (messages: ChatMessage[]) => void) => {
    const q = query(
      collection(db, 'messages'),
      where('threadId', '==', threadId)
    );

    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      // Ordenação em memória
      const sortedMsgs = msgs.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      callback(sortedMsgs);
    });
  },

  subscribeToThreads: (userId: string, callback: (threads: ChatThread[]) => void) => {
    const q = query(
      collection(db, 'chatThreads'),
      where('participants', 'array-contains', userId)
    );

    return onSnapshot(q, (snapshot) => {
      const threads = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatThread));
      // Ordenação em memória (mais recentes primeiro)
      const sortedThreads = threads.sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(sortedThreads);
    });
  },

  resetUnread: async (threadId: string, userId: string) => {
    if (!userId) return;
    await updateDoc(doc(db, 'chatThreads', threadId), {
      [`unreadCount.${userId}`]: 0
    });
  }
};