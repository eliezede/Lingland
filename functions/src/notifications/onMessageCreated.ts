import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onMessageCreated = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async snapshot => {
    const message = snapshot.data();
    const threadId = String(message.threadId || '');
    const senderId = String(message.senderId || '');
    if (!threadId || !senderId) return null;

    const thread = await db.collection('chatThreads').doc(threadId).get();
    if (!thread.exists) return null;
    const threadData = thread.data() || {};
    const participants = Array.isArray(threadData.participants) ? threadData.participants.map(String) : [];
    if (!participants.includes(senderId)) return null;

    const preview = message.fileUrl
      ? (message.fileType === 'IMAGE' ? 'Image attachment' : 'Document attachment')
      : String(message.text || '').slice(0, 80);
    const link = threadData.type === 'BOOKING' && threadData.bookingId
      ? `/admin/bookings/${threadData.bookingId}`
      : '/messages';
    const batch = db.batch();
    const createdAt = new Date().toISOString();
    participants.filter((participantId: string) => participantId !== senderId).forEach((userId: string) => {
      batch.set(db.collection('notifications').doc(), {
        userId,
        title: `New message from ${String(message.senderName || 'Lingland')}`,
        message: preview || 'New message',
        type: 'CHAT',
        read: false,
        link,
        threadId,
        ...(threadData.bookingId ? { bookingId: threadData.bookingId } : {}),
        ...(threadData.clientId ? { clientId: threadData.clientId } : {}),
        ...(threadData.departmentId ? { clientDepartmentIds: [threadData.departmentId] } : {}),
        createdAt,
      });
    });
    await batch.commit();
    return null;
  });
