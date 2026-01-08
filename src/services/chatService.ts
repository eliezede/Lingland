import { 
  collection, query, where, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, increment,
  setDoc, getDoc, limit, orderBy
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ChatThread, ChatMessage, NotificationType } from '../types';
import { NotificationService } from './notificationService';

export const ChatService = {
  getOrCreateThread: async (participants: string[], names: Record<string, string>, bookingId?: string) => {
    // Generate a unique stable ID based on sorted participants or booking
    const threadId = bookingId ? `booking-${bookingId}` : participants.sort().join('_');
    const threadRef = doc(db, 'chatThreads', threadId);
    
    const threadSnap = await getDoc(threadRef);

    if (!threadSnap.exists()) {
      const threadData: any = {
        participants,
        participantNames: names,
        updatedAt: serverTimestamp(),
        bookingId: bookingId || null,
        unreadCount: participants.reduce((acc, p) => ({ ...acc, [p]: 0 }), {})
      };
      await setDoc(threadRef, threadData);
    } else {
      // If thread exists, just refresh the participant names in case they changed, 
      // but do NOT reset the unreadCount or participants list.
      await updateDoc(threadRef, {
        participantNames: names,
        updatedAt: serverTimestamp()
      });
    }

    return threadId;
  },

  sendMessage: async (
    threadId: string, 
    senderId: string, 
    senderName: string, 
    text: string, 
    recipientId: string,
    attachment?: { url: string, type: 'IMAGE' | 'DOCUMENT' }
  ) => {
    const messageData = {
      threadId,
      senderId,
      senderName,
      text,
      createdAt: new Date().toISOString(),
      fileUrl: attachment?.url || null,
      fileType: attachment?.type || null
    };

    // 1. Save message
    await addDoc(collection(db, 'messages'), messageData);
    
    // 2. Update thread summary
    const updateData: any = {
      lastMessage: attachment ? (attachment.type === 'IMAGE' ? '📷 Sent a photo' : '📄 Sent a document') : text,
      lastMessageAt: messageData.createdAt,
      updatedAt: serverTimestamp()
    };

    // 3. Increment unread for recipient
    if (recipientId) {
      updateData[`unreadCount.${recipientId}`] = increment(1);
      
      // Send notification
      NotificationService.notify(
        recipientId,
        `New message from ${senderName}`,
        attachment ? (attachment.type === 'IMAGE' ? '📷 Photo' : '📄 Document') : (text.length > 60 ? text.substring(0, 57) + '...' : text),
        NotificationType.CHAT,
        `/messages` 
      );
    }

    await updateDoc(doc(db, 'chatThreads', threadId), updateData);
  },

  subscribeToMessages: (threadId: string, callback: (messages: ChatMessage[]) => void) => {
    // We order by createdAt. Limit to 50 for enterprise performance.
    const q = query(
      collection(db, 'messages'),
      where('threadId', '==', threadId),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      // Sort in memory because Firestore compound queries might require manual index creation 
      // which we want to avoid during simple dev phases unless absolutely necessary.
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
      // Sort by activity in memory
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