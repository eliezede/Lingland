import { collection, query, where, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { Notification, NotificationType } from '../types';

export const NotificationService = {
  subscribe: (userId: string, callback: (notifications: Notification[]) => void) => {
    // Removemos o orderBy para evitar a necessidade de índice composto no Firestore
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );

    return onSnapshot(q, (snapshot) => {
      const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      // Ordenação em memória para contornar limitações de índice
      const sortedNotes = notes.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      callback(sortedNotes);
    });
  },

  markAsRead: async (notificationId: string) => {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  },

  markAllAsRead: async (notifications: Notification[]) => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  },

  notify: async (userId: string, title: string, message: string, type: NotificationType, link?: string) => {
    const create = httpsCallable(functions, 'createNotification');
    await create({ audience: 'USER', userId, title, message, type, link });
  },

  notifyAdmins: async (title: string, message: string, type: NotificationType, link?: string) => {
    const create = httpsCallable(functions, 'createNotification');
    await create({ audience: 'ADMINS', title, message, type, link });
  },

  requestPermission: async () => {
    if (!('Notification' in window)) return false;
    const permission = await window.Notification.requestPermission();
    return permission === 'granted';
  }
};
