
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const getClientInvoices = functions.https.onCall(async (data, context) => {
  // 1. Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  // 2. Get user details to verify role and client link
  const userId = context.auth.uid;
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  // 3. Verify user is authorized for this client
  // If role is CLIENT, they can only fetch their own invoices
  if (userData?.role === 'CLIENT') {
    const requestedClientId = data.clientId; // If frontend passes it, or we deduce it
    const linkedClientId = userData.profileId;

    if (!linkedClientId || (requestedClientId && requestedClientId !== linkedClientId)) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied to these invoices.');
    }

    // 4. Fetch Invoices
    const querySnapshot = await db.collection('clientInvoices')
      .where('clientId', '==', linkedClientId)
      .orderBy('issueDate', 'desc')
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } else if (userData?.role === 'ADMIN') {
    // Admins can fetch any
    const clientId = data.clientId;
    if (!clientId) {
        throw new functions.https.HttpsError('invalid-argument', 'ClientId required for admin fetch.');
    }
    const querySnapshot = await db.collection('clientInvoices')
      .where('clientId', '==', clientId)
      .orderBy('issueDate', 'desc')
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } else {
    throw new functions.https.HttpsError('permission-denied', 'Role not authorized.');
  }
});
