import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
  setDoc,
  getDoc,
  getDocs,
  limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { ChatMessage, ChatThread, User, UserRole } from '../types';

type ChatParticipant = Pick<User, 'id' | 'displayName' | 'photoUrl' | 'email' | 'role' | 'profileId'>;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const toMillis = (value: any) => {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const normalizeThread = (id: string, data: any): ChatThread => ({
  id,
  participants: data.participants || [],
  participantNames: data.participantNames || {},
  participantPhotos: data.participantPhotos || {},
  lastMessage: data.lastMessage || '',
  lastMessageAt: data.lastMessageAt?.toDate ? data.lastMessageAt.toDate().toISOString() : data.lastMessageAt,
  bookingId: data.bookingId || undefined,
  departmentId: data.departmentId || undefined,
  type: data.type || (data.bookingId ? 'BOOKING' : 'DIRECT'),
  unreadCount: data.unreadCount || {},
  metadata: data.metadata || {},
});

const normalizeMessage = (id: string, data: any): ChatMessage => ({
  id,
  threadId: data.threadId,
  senderId: data.senderId,
  senderName: data.senderName,
  text: data.text || '',
  createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
  fileUrl: data.fileUrl || undefined,
  fileType: data.fileType || undefined,
});

const getUserFromDoc = (id: string, data: any): ChatParticipant => ({
  id,
  displayName: data.displayName || data.name || data.email || 'User',
  photoUrl: data.photoUrl || '',
  email: data.email || '',
  role: data.role,
  profileId: data.profileId,
});

export const ChatService = {
  getOrCreateThread: async (
    participants: string[],
    names: Record<string, string>,
    photos: Record<string, string> = {},
    bookingId?: string,
    metadata: Record<string, any> = {}
  ) => {
    const cleanParticipants = unique(participants);
    const threadId = bookingId ? `booking-${bookingId}` : cleanParticipants.slice().sort().join('_');
    const threadRef = doc(db, 'chatThreads', threadId);
    const threadSnap = await getDoc(threadRef);
    const unreadCount = cleanParticipants.reduce((acc, participantId) => ({ ...acc, [participantId]: 0 }), {});

    if (!threadSnap.exists()) {
      await setDoc(threadRef, {
        id: threadId,
        type: bookingId ? 'BOOKING' : 'DIRECT',
        participants: cleanParticipants,
        participantNames: names,
        participantPhotos: photos,
        bookingId: bookingId || null,
        metadata,
        unreadCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = threadSnap.data();
      const mergedParticipants = unique([...(existing.participants || []), ...cleanParticipants]);
      const unreadPatch = mergedParticipants.reduce((acc, participantId) => {
        if ((existing.unreadCount || {})[participantId] === undefined) {
          return { ...acc, [`unreadCount.${participantId}`]: 0 };
        }
        return acc;
      }, {} as Record<string, number>);

      await updateDoc(threadRef, {
        participants: mergedParticipants,
        participantNames: { ...(existing.participantNames || {}), ...names },
        participantPhotos: { ...(existing.participantPhotos || {}), ...photos },
        metadata: { ...(existing.metadata || {}), ...metadata },
        updatedAt: serverTimestamp(),
        ...unreadPatch,
      });
    }

    return threadId;
  },

  getOrCreateDepartmentThread: async (departmentId: string, departmentName: string, staffIds: string[]) => {
    const threadId = `dept-${departmentId}`;
    const threadRef = doc(db, 'chatThreads', threadId);
    const threadSnap = await getDoc(threadRef);
    const cleanStaffIds = unique(staffIds);

    if (!threadSnap.exists()) {
      await setDoc(threadRef, {
        id: threadId,
        type: 'DEPARTMENT',
        departmentId,
        participants: cleanStaffIds,
        participantNames: { [threadId]: departmentName },
        unreadCount: cleanStaffIds.reduce((acc, participantId) => ({ ...acc, [participantId]: 0 }), {}),
        metadata: { name: departmentName },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = threadSnap.data();
      const unreadPatch = cleanStaffIds.reduce((acc, participantId) => {
        if ((existing.unreadCount || {})[participantId] === undefined) {
          return { ...acc, [`unreadCount.${participantId}`]: 0 };
        }
        return acc;
      }, {} as Record<string, number>);

      await updateDoc(threadRef, {
        participants: cleanStaffIds,
        metadata: { ...(existing.metadata || {}), name: departmentName },
        updatedAt: serverTimestamp(),
        ...unreadPatch,
      });
    }

    return threadId;
  },

  sendMessage: async (
    threadId: string,
    senderId: string,
    senderName: string,
    text: string,
    recipientId?: string,
    attachment?: { url: string; type: 'IMAGE' | 'DOCUMENT' }
  ) => {
    const cleanText = text.trim();
    if (!cleanText && !attachment) return;

    const threadRef = doc(db, 'chatThreads', threadId);
    const threadSnap = await getDoc(threadRef);
    if (!threadSnap.exists()) throw new Error('Chat thread not found');

    const thread = normalizeThread(threadSnap.id, threadSnap.data());
    const recipients = recipientId
      ? [recipientId]
      : thread.participants.filter(participantId => participantId !== senderId);

    const messageData = {
      threadId,
      senderId,
      senderName,
      text: cleanText,
      createdAt: new Date().toISOString(),
      fileUrl: attachment?.url || null,
      fileType: attachment?.type || null,
    };

    await addDoc(collection(db, 'messages'), messageData);

    const updateData: Record<string, any> = {
      lastMessage: attachment ? (attachment.type === 'IMAGE' ? 'Sent an image' : 'Sent a document') : cleanText,
      lastMessageAt: messageData.createdAt,
      updatedAt: serverTimestamp(),
    };

    recipients.forEach(participantId => {
      updateData[`unreadCount.${participantId}`] = increment(1);
    });

    await updateDoc(threadRef, updateData);

  },

  subscribeToMessages: (threadId: string, callback: (messages: ChatMessage[]) => void) => {
    const q = query(
      collection(db, 'messages'),
      where('threadId', '==', threadId),
      limit(100)
    );

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs
        .map(d => normalizeMessage(d.id, d.data()))
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      callback(messages);
    });
  },

  subscribeToThreads: (userId: string, callback: (threads: ChatThread[]) => void) => {
    const q = query(
      collection(db, 'chatThreads'),
      where('participants', 'array-contains', userId)
    );

    return onSnapshot(q, (snapshot) => {
      const threads = snapshot.docs
        .map(d => normalizeThread(d.id, d.data()))
        .sort((a, b) => toMillis(b.lastMessageAt || b.metadata?.updatedAt) - toMillis(a.lastMessageAt || a.metadata?.updatedAt));
      callback(threads);
    });
  },

  resetUnread: async (threadId: string, userId: string) => {
    if (!threadId || !userId) return;
    await updateDoc(doc(db, 'chatThreads', threadId), {
      [`unreadCount.${userId}`]: 0,
    });
  },

  resolveUserByProfileId: async (profileId: string): Promise<ChatParticipant | null> => {
    if (!profileId) return null;
    const q = query(collection(db, 'users'), where('profileId', '==', profileId), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : getUserFromDoc(snap.docs[0].id, snap.docs[0].data());
  },

  resolveUserByEmail: async (email: string): Promise<ChatParticipant | null> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return null;
    const q = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : getUserFromDoc(snap.docs[0].id, snap.docs[0].data());
  },

  getAdminSupportUser: async (): Promise<ChatParticipant | null> => {
    const q = query(collection(db, 'users'), where('role', 'in', [UserRole.SUPER_ADMIN, UserRole.ADMIN]), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : getUserFromDoc(snap.docs[0].id, snap.docs[0].data());
  },

  getOrCreateSupportThread: async (bookingId?: string): Promise<string> => {
    const createThread = httpsCallable<
      { bookingId?: string },
      { success: boolean; threadId: string }
    >(functions, 'createSupportThread');
    const response = await createThread({ ...(bookingId ? { bookingId } : {}) });
    if (!response.data?.success || !response.data.threadId) {
      throw new Error('The operations conversation could not be opened.');
    }
    return response.data.threadId;
  },

  getOrCreateDirectThreadWithUser: async (
    currentUser: ChatParticipant,
    otherUser: ChatParticipant,
    metadata: Record<string, any> = {}
  ) => {
    return ChatService.getOrCreateThread(
      [currentUser.id, otherUser.id],
      {
        [currentUser.id]: currentUser.displayName || 'Me',
        [otherUser.id]: otherUser.displayName || otherUser.email || 'User',
      },
      {
        [currentUser.id]: currentUser.photoUrl || '',
        [otherUser.id]: otherUser.photoUrl || '',
      },
      undefined,
      metadata
    );
  },

  getOrCreateBookingThread: async (
    bookingId: string,
    currentUser: ChatParticipant,
    otherUser: ChatParticipant,
    metadata: Record<string, any> = {}
  ) => {
    return ChatService.getOrCreateThread(
      [currentUser.id, otherUser.id],
      {
        [currentUser.id]: currentUser.displayName || 'Me',
        [otherUser.id]: otherUser.displayName || otherUser.email || 'User',
      },
      {
        [currentUser.id]: currentUser.photoUrl || '',
        [otherUser.id]: otherUser.photoUrl || '',
      },
      bookingId,
      metadata
    );
  },
};
