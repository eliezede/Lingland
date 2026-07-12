"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePlatformEntity = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can delete platform records');
    }
};
const assertEmpty = async (collectionName, field, value, message) => {
    const linked = await db.collection(collectionName).where(field, '==', value).limit(1).get();
    if (!linked.empty)
        throw new functions.https.HttpsError('failed-precondition', message);
};
const deleteAuthUsers = async (uids) => {
    for (const uid of Array.from(new Set(uids.filter(Boolean)))) {
        try {
            await admin.auth().deleteUser(uid);
        }
        catch (error) {
            if (error?.code !== 'auth/user-not-found')
                throw error;
        }
    }
};
exports.deletePlatformEntity = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const entityType = String(data?.entityType || '').trim().toUpperCase();
    const id = String(data?.id || '').trim();
    if (!id || !['BOOKING', 'CLIENT', 'INTERPRETER', 'USER'].includes(entityType)) {
        throw new functions.https.HttpsError('invalid-argument', 'A supported entityType and id are required');
    }
    if (entityType === 'USER' && id === context.auth.uid) {
        throw new functions.https.HttpsError('failed-precondition', 'You cannot delete your own administrator account');
    }
    const batch = db.batch();
    const authUids = [];
    const now = new Date().toISOString();
    if (entityType === 'BOOKING') {
        const bookingRef = db.collection('bookings').doc(id);
        const booking = await bookingRef.get();
        if (!booking.exists)
            return { success: true, idempotent: true };
        const bookingData = booking.data() || {};
        if (bookingData.clientInvoiceId || bookingData.interpreterInvoiceId) {
            throw new functions.https.HttpsError('failed-precondition', 'An invoiced job cannot be deleted; cancel or reverse the invoice first');
        }
        const linkedCollections = ['assignments', 'bookingAssignments', 'timesheets', 'jobEvents'];
        for (const collectionName of linkedCollections) {
            const linked = await db.collection(collectionName).where(collectionName === 'jobEvents' ? 'jobId' : 'bookingId', '==', id).get();
            linked.docs.forEach(item => {
                if (collectionName === 'timesheets' && (item.data().clientInvoiceId || item.data().interpreterInvoiceId)) {
                    throw new functions.https.HttpsError('failed-precondition', 'A job with an invoiced timesheet cannot be deleted');
                }
                batch.delete(item.ref);
            });
        }
        const threads = await db.collection('chatThreads').where('bookingId', '==', id).get();
        for (const thread of threads.docs) {
            const messages = await db.collection('messages').where('threadId', '==', thread.id).get();
            messages.docs.forEach(message => batch.delete(message.ref));
            batch.delete(thread.ref);
        }
        batch.delete(bookingRef);
    }
    if (entityType === 'CLIENT' || entityType === 'INTERPRETER') {
        const isClient = entityType === 'CLIENT';
        await assertEmpty('bookings', isClient ? 'clientId' : 'interpreterId', id, `This ${entityType.toLowerCase()} has job history and cannot be deleted`);
        await assertEmpty(isClient ? 'clientInvoices' : 'interpreterInvoices', isClient ? 'clientId' : 'interpreterId', id, `This ${entityType.toLowerCase()} has invoice history and cannot be deleted`);
        if (!isClient)
            await assertEmpty('timesheets', 'interpreterId', id, 'This interpreter has timesheet history and cannot be deleted');
        const profileRef = db.collection(isClient ? 'clients' : 'interpreters').doc(id);
        const profile = await profileRef.get();
        if (!profile.exists)
            return { success: true, idempotent: true };
        const users = await db.collection('users').where('profileId', '==', id).get();
        users.docs.forEach(user => {
            authUids.push(String(user.data().authUid || user.id));
            batch.delete(user.ref);
        });
        if (!isClient) {
            const assignments = await db.collection('assignments').where('interpreterId', '==', id).get();
            assignments.docs.forEach(item => batch.delete(item.ref));
        }
        batch.delete(profileRef);
    }
    if (entityType === 'USER') {
        const userRef = db.collection('users').doc(id);
        const user = await userRef.get();
        if (!user.exists) {
            await deleteAuthUsers([id]);
            return { success: true, idempotent: true };
        }
        const userData = user.data() || {};
        const profileId = String(userData.profileId || userData.staffProfileId || '');
        const role = String(userData.role || '');
        if (profileId && role === 'CLIENT') {
            await assertEmpty('bookings', 'clientId', profileId, 'This user has client job history and cannot be deleted');
            await assertEmpty('clientInvoices', 'clientId', profileId, 'This user has client invoice history and cannot be deleted');
            batch.delete(db.collection('clients').doc(profileId));
        }
        else if (profileId && role === 'INTERPRETER') {
            await assertEmpty('bookings', 'interpreterId', profileId, 'This user has interpreter job history and cannot be deleted');
            await assertEmpty('timesheets', 'interpreterId', profileId, 'This user has interpreter timesheet history and cannot be deleted');
            await assertEmpty('interpreterInvoices', 'interpreterId', profileId, 'This user has interpreter invoice history and cannot be deleted');
            batch.delete(db.collection('interpreters').doc(profileId));
        }
        else {
            const staffProfiles = await db.collection('staffProfiles').where('userId', '==', id).get();
            staffProfiles.docs.forEach(profile => batch.delete(profile.ref));
            if (userData.staffProfileId)
                batch.delete(db.collection('staffProfiles').doc(String(userData.staffProfileId)));
        }
        authUids.push(String(userData.authUid || id));
        batch.delete(userRef);
    }
    batch.set(db.collection('deletionAudit').doc(), {
        entityType,
        entityId: id,
        deletedBy: context.auth.uid,
        deletedAt: now,
    });
    await batch.commit();
    await deleteAuthUsers(authUids);
    return { success: true, entityType, id };
});
//# sourceMappingURL=deletePlatformEntity.js.map