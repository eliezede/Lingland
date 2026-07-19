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
exports.linkMyLegacyBookings = exports.getMyClientInvoice = exports.getMyClientInvoices = exports.getMyClientBooking = exports.getMyClientBookings = exports.getMyClientPortalContext = exports.resolveClientPortalAccess = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const clientPortalPolicy_1 = require("./clientPortalPolicy");
const db = admin.firestore();
const RUNTIME = { timeoutSeconds: 60, memory: '256MB' };
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const canonicalClient = async (requestedClientId) => {
    let clientId = requestedClientId;
    for (let depth = 0; depth < 4; depth += 1) {
        const client = await db.collection('clients').doc(clientId).get();
        if (!client.exists)
            throw new functions.https.HttpsError('not-found', 'Client account not found.');
        const redirectId = text(client.data()?.mergedIntoClientId);
        if (!redirectId || redirectId === clientId)
            return { id: clientId, data: client.data() || {} };
        clientId = redirectId;
    }
    throw new functions.https.HttpsError('failed-precondition', 'Client redirect chain is invalid.');
};
const resolveClientPortalAccess = async (userId, userData) => {
    if (text(userData.role).toUpperCase() !== 'CLIENT' || text(userData.status).toUpperCase() !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'An active client account is required.');
    }
    const requestedClientId = text(userData.clientId || userData.profileId);
    if (!requestedClientId)
        throw new functions.https.HttpsError('failed-precondition', 'This account is not linked to a client.');
    const canonical = await canonicalClient(requestedClientId);
    let membershipId = text(userData.clientMembershipId);
    let agentId = text(userData.clientAgentId);
    let membershipDocument = null;
    if (membershipId) {
        const candidate = await db.collection('clientMemberships').doc(membershipId).get();
        if (candidate.exists && text(candidate.data()?.clientId) === canonical.id)
            membershipDocument = candidate;
    }
    if (!membershipDocument) {
        if (!agentId) {
            const normalizedEmail = text(userData.email).toLowerCase();
            if (normalizedEmail) {
                const agentMatches = await db.collection('clientAgents').where('normalizedEmail', '==', normalizedEmail).limit(2).get();
                if (agentMatches.size === 1)
                    agentId = agentMatches.docs[0].id;
            }
        }
        if (agentId) {
            const memberships = await db.collection('clientMemberships').where('clientId', '==', canonical.id).get();
            const match = memberships.docs.find(document => text(document.data().agentId) === agentId);
            if (match) {
                membershipDocument = match;
                membershipId = match.id;
            }
        }
    }
    const membership = membershipDocument?.data() || null;
    if (membership && text(membership.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'This client membership is inactive.');
    }
    if (membership)
        agentId = text(membership.agentId);
    const agentDocument = agentId ? await db.collection('clientAgents').doc(agentId).get() : null;
    const agent = agentDocument?.exists ? agentDocument.data() || null : null;
    if (agent && text(agent.agentType).toUpperCase() === 'SHARED_MAILBOX') {
        throw new functions.https.HttpsError('failed-precondition', 'A shared mailbox cannot sign in as a requester.');
    }
    const departmentSnapshot = await db.collection('clientDepartments').where('clientId', '==', canonical.id).get();
    const departments = departmentSnapshot.docs
        .filter(document => text(document.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
        .map(document => ({ id: document.id, data: document.data() }))
        .sort((left, right) => text(left.data.name).localeCompare(text(right.data.name)));
    const legacyFallback = !membership;
    const policy = (0, clientPortalPolicy_1.buildClientPortalPolicy)(membership, departments.map(department => department.id));
    return {
        userId,
        clientId: canonical.id,
        client: canonical.data,
        membershipId,
        membership,
        agentId,
        agent,
        departments,
        allowedDepartmentIds: policy.allowedDepartmentIds,
        accessLevel: policy.accessLevel,
        roles: policy.roles,
        legacyFallback,
        canRequest: policy.canRequest,
        canViewBookings: policy.canViewBookings,
    };
};
exports.resolveClientPortalAccess = resolveClientPortalAccess;
exports.getMyClientPortalContext = functions.runWith(RUNTIME).https.onCall(async (_data, context) => {
    if (!context.auth?.uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    const user = await db.collection('users').doc(context.auth.uid).get();
    if (!user.exists)
        throw new functions.https.HttpsError('not-found', 'Platform user not found.');
    const access = await (0, exports.resolveClientPortalAccess)(context.auth.uid, user.data() || {});
    const allowed = new Set(access.allowedDepartmentIds);
    return {
        client: {
            id: access.clientId,
            companyName: text(access.client.companyName),
            organizationId: text(access.client.organizationId) || 'lingland-main',
            status: text(access.client.status || 'ACTIVE').toUpperCase(),
        },
        agent: access.agent ? {
            id: access.agentId,
            displayName: text(access.agent.displayName),
            email: text(access.agent.email).toLowerCase(),
            agentType: text(access.agent.agentType).toUpperCase(),
        } : null,
        membership: access.membership ? {
            id: access.membershipId,
            accessLevel: access.accessLevel,
            roles: access.roles,
            departmentIds: access.allowedDepartmentIds,
        } : null,
        departments: access.departments
            .filter(department => allowed.has(department.id))
            .map(department => ({
            id: department.id,
            name: text(department.data.name),
            locationName: text(department.data.locationName),
        })),
        legacyFallback: access.legacyFallback,
        canRequest: access.canRequest,
        canViewBookings: access.canViewBookings,
        canReadFinance: (0, clientPortalPolicy_1.canReadClientFinance)(access),
    };
});
const requirePortalAccess = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists)
        throw new functions.https.HttpsError('not-found', 'Platform user not found.');
    return (0, exports.resolveClientPortalAccess)(uid, user.data() || {});
};
exports.getMyClientBookings = functions.runWith(RUNTIME).https.onCall(async (_data, context) => {
    const access = await requirePortalAccess(context.auth?.uid);
    if (!access.canViewBookings)
        return [];
    const snapshot = await db.collection('bookings').where('clientId', '==', access.clientId).get();
    return snapshot.docs
        .filter(document => (0, clientPortalPolicy_1.canManageClientBooking)(document.data(), access))
        .sort((left, right) => {
        const leftData = left.data();
        const rightData = right.data();
        return `${text(rightData.date)}T${text(rightData.startTime)}`
            .localeCompare(`${text(leftData.date)}T${text(leftData.startTime)}`);
    })
        .map(document => ({ id: document.id, ...document.data() }));
});
exports.getMyClientBooking = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
    const access = await requirePortalAccess(context.auth?.uid);
    if (!access.canViewBookings) {
        throw new functions.https.HttpsError('permission-denied', 'This membership does not include booking access.');
    }
    const bookingId = text(data?.bookingId);
    if (!bookingId)
        throw new functions.https.HttpsError('invalid-argument', 'bookingId is required.');
    const booking = await db.collection('bookings').doc(bookingId).get();
    if (!booking.exists)
        throw new functions.https.HttpsError('not-found', 'Booking not found.');
    if (!(0, clientPortalPolicy_1.canManageClientBooking)(booking.data() || {}, access)) {
        throw new functions.https.HttpsError('permission-denied', 'This booking is outside your membership scope.');
    }
    return { id: booking.id, ...booking.data() };
});
exports.getMyClientInvoices = functions.runWith(RUNTIME).https.onCall(async (_data, context) => {
    const access = await requirePortalAccess(context.auth?.uid);
    if (!(0, clientPortalPolicy_1.canReadClientFinance)(access))
        return [];
    const visibleStatuses = new Set(['SENT', 'APPROVED', 'PAID']);
    const snapshot = await db.collection('clientInvoices').where('clientId', '==', access.clientId).get();
    return snapshot.docs
        .filter(document => (visibleStatuses.has(text(document.data().status).toUpperCase())
        && (0, clientPortalPolicy_1.canReadClientInvoice)(document.data(), access)))
        .sort((left, right) => {
        const leftData = left.data();
        const rightData = right.data();
        return text(rightData.issueDate || rightData.createdAt)
            .localeCompare(text(leftData.issueDate || leftData.createdAt));
    })
        .map(document => ({ id: document.id, ...document.data() }));
});
exports.getMyClientInvoice = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
    const access = await requirePortalAccess(context.auth?.uid);
    if (!(0, clientPortalPolicy_1.canReadClientFinance)(access)) {
        throw new functions.https.HttpsError('permission-denied', 'This membership does not include finance access.');
    }
    const invoiceId = text(data?.invoiceId);
    if (!invoiceId)
        throw new functions.https.HttpsError('invalid-argument', 'invoiceId is required.');
    const invoice = await db.collection('clientInvoices').doc(invoiceId).get();
    const invoiceData = invoice.data() || {};
    if (!invoice.exists || text(invoiceData.clientId) !== access.clientId) {
        throw new functions.https.HttpsError('not-found', 'Invoice not found.');
    }
    if (!(0, clientPortalPolicy_1.canReadClientInvoice)(invoiceData, access)) {
        throw new functions.https.HttpsError('permission-denied', 'This invoice is outside your membership scope.');
    }
    if (!['SENT', 'APPROVED', 'PAID'].includes(text(invoiceData.status).toUpperCase())) {
        throw new functions.https.HttpsError('permission-denied', 'This invoice is not available in the client portal.');
    }
    return { id: invoice.id, ...invoiceData };
});
exports.linkMyLegacyBookings = functions.runWith(RUNTIME).https.onCall(async (_data, context) => {
    if (!context.auth?.uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
    const user = await db.collection('users').doc(context.auth.uid).get();
    if (!user.exists)
        throw new functions.https.HttpsError('not-found', 'Platform user not found.');
    const userData = user.data() || {};
    const access = await (0, exports.resolveClientPortalAccess)(context.auth.uid, userData);
    if (!access.legacyFallback)
        return { linked: 0, skipped: true };
    const originalEmail = text(userData.email);
    const emails = Array.from(new Set([originalEmail, originalEmail.toLowerCase()].filter(Boolean)));
    if (!emails.length)
        return { linked: 0, skipped: true };
    const fields = ['guestContact.email', 'bookingEmail', 'contactEmail'];
    const snapshots = await Promise.all(fields.map(field => db.collection('bookings')
        .where(field, 'in', emails)
        .limit(150)
        .get()));
    const documents = new Map();
    snapshots.forEach(snapshot => snapshot.docs.forEach(document => documents.set(document.id, document)));
    const batch = db.batch();
    let linked = 0;
    for (const document of Array.from(documents.values()).slice(0, 400)) {
        const current = document.data();
        const currentClientId = text(current.clientId);
        if (currentClientId && currentClientId !== access.clientId)
            continue;
        const update = {};
        if (!currentClientId) {
            update.clientId = access.clientId;
            update.clientName = text(current.clientName) || text(access.client.companyName);
        }
        if (!text(current.requestedByUserId))
            update.requestedByUserId = access.userId;
        if (access.agentId && !text(current.requestedByAgentId))
            update.requestedByAgentId = access.agentId;
        if (!current.clientSnapshot) {
            update.clientSnapshot = {
                organizationName: text(access.client.companyName),
                departmentName: '',
                requesterName: text(access.agent?.displayName || userData.displayName),
                requesterEmail: text(access.agent?.email || userData.email).toLowerCase(),
            };
        }
        if (!Object.keys(update).length)
            continue;
        update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.update(document.ref, update);
        linked += 1;
    }
    if (linked > 0) {
        batch.set(db.collection('auditLogs').doc(), {
            action: 'CLIENT_LEGACY_HISTORY_LINKED',
            actorUserId: access.userId,
            clientId: access.clientId,
            linkedCount: linked,
            source: 'client_portal',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
    }
    return { linked, skipped: false };
});
//# sourceMappingURL=clientPortalAccess.js.map