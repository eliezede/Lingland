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
exports.completeStaffOnboarding = exports.completeAccountActivation = exports.sendAccountActivationInvite = exports.resendStaffInvite = exports.onUserCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const accountActivationPolicy_1 = require("./accountActivationPolicy");
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'STAFF'];
const ACTIVATION_ROLES = ['INTERPRETER', 'CLIENT'];
exports.onUserCreated = functions.runWith({
    secrets: ['BREVO_API_KEY'],
    timeoutSeconds: 60,
    memory: '256MB',
}).firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
    const userData = snap.data();
    if (!userData)
        return null;
    const email = String(userData.email || '').trim().toLowerCase();
    const displayName = String(userData.displayName || email.split('@')[0] || 'User');
    const role = String(userData.role || '');
    const status = String(userData.status || '');
    if (!email) {
        console.warn(`[onUserCreated] No email for user ${context.params.userId}`);
        return null;
    }
    if (userData.provisionedAt) {
        console.log(`[onUserCreated] User ${email} already provisioned, skipping.`);
        return null;
    }
    if (status && status !== 'PENDING') {
        console.log(`[onUserCreated] User ${email} status is ${status}, skipping provisioning.`);
        return null;
    }
    try {
        const authUser = await ensureAuthUser(email, displayName);
        const staffProfileId = STAFF_ROLES.includes(role)
            ? await ensureStaffProfile(authUser.uid, userData)
            : userData.staffProfileId || '';
        await alignUserDocumentToAuthUid(snap, authUser.uid, {
            authUid: authUser.uid,
            displayName,
            staffProfileId: staffProfileId || undefined,
            provisionedAt: new Date().toISOString(),
        });
        await sendInvitationEmail(authUser.uid, email, displayName, role);
        return true;
    }
    catch (error) {
        console.error(`[onUserCreated] Error provisioning user ${email}:`, error);
        await admin.firestore().collection('users').doc(context.params.userId).set({
            error: error?.message || 'Unknown error provisioning user',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        return null;
    }
});
exports.resendStaffInvite = functions.runWith({ secrets: ['BREVO_API_KEY'] }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    const callerRef = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!callerRef.exists || callerRef.data()?.role !== 'SUPER_ADMIN' || callerRef.data()?.status !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'Only SUPER_ADMIN can resend invites');
    }
    const userId = String(data?.userId || '');
    if (!userId)
        throw new functions.https.HttpsError('invalid-argument', 'userId is required');
    const userRef = await admin.firestore().collection('users').doc(userId).get();
    if (!userRef.exists)
        throw new functions.https.HttpsError('not-found', 'User not found');
    const userData = userRef.data();
    if (userData.status !== 'PENDING')
        throw new functions.https.HttpsError('failed-precondition', 'User is not pending');
    await sendInvitationEmail(userRef.id, userData.email, userData.displayName, userData.role);
    return { success: true };
});
exports.sendAccountActivationInvite = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Administrator authentication is required');
    }
    const caller = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!caller.exists || caller.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(caller.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can send activation invites');
    }
    const email = String(data?.email || '').trim().toLowerCase();
    const requestedDisplayName = String(data?.displayName || '').trim();
    if (!email)
        throw new functions.https.HttpsError('invalid-argument', 'email is required');
    const userSnap = await admin.firestore()
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
    if (userSnap.empty) {
        throw new functions.https.HttpsError('not-found', 'No platform user exists for this email');
    }
    const sourceDoc = userSnap.docs[0];
    const userData = sourceDoc.data();
    const role = String(userData.role || '');
    const status = String(userData.status || '');
    if (!ACTIVATION_ROLES.includes(role)) {
        throw new functions.https.HttpsError('failed-precondition', 'Activation links are only available for client and interpreter accounts');
    }
    if (!['IMPORTED', 'PENDING'].includes(status)) {
        throw new functions.https.HttpsError('failed-precondition', `Account status is ${status || 'UNKNOWN'} and cannot be activated`);
    }
    const displayName = requestedDisplayName || userData.displayName || email.split('@')[0];
    const authUser = await ensureAuthUser(email, displayName);
    await alignUserDocumentToAuthUid(sourceDoc, authUser.uid, {
        authUid: authUser.uid,
        displayName,
        activationEmailSentAt: new Date().toISOString(),
    });
    const portalUrl = await getPortalUrl();
    const activationLink = await buildPasswordSetupLink(email, `${portalUrl}/#/activate?token=${authUser.uid}`);
    await queueTemplateEmail('ACCOUNT_ACTIVATION', email, {
        '{{interpreterName}}': displayName,
        '{{activationLink}}': activationLink,
    }, {
        statusTrigger: 'IMPORTED',
        userId: authUser.uid,
    }, 'Activate your Lingland Account', `
        <p>Dear {{interpreterName}},</p>
        <p>Welcome to Lingland. Please use the secure link below to set your password and activate your account.</p>
        <p><a href="{{activationLink}}">Activate My Account</a></p>
        <p>{{activationLink}}</p>
    `);
    return { success: true, userId: authUser.uid };
});
exports.completeAccountActivation = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    }
    const uid = context.auth.uid;
    const authenticatedEmail = String(context.auth.token.email || '').trim().toLowerCase();
    const expectedFlow = String(data?.flow || '').toUpperCase();
    const userRef = admin.firestore().collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'The platform account is not linked to this sign-in');
    }
    const userData = userSnap.data() || {};
    const accountEmail = String(userData.email || '').trim().toLowerCase();
    const role = String(userData.role || '').toUpperCase();
    const status = String(userData.status || '').toUpperCase();
    const isStaff = STAFF_ROLES.includes(role);
    const isPortalUser = ACTIVATION_ROLES.includes(role);
    if (!authenticatedEmail || authenticatedEmail !== accountEmail) {
        throw new functions.https.HttpsError('permission-denied', 'The activation email does not match this account');
    }
    if (!isStaff && !isPortalUser) {
        throw new functions.https.HttpsError('failed-precondition', 'This account role cannot use the activation flow');
    }
    if (expectedFlow === 'STAFF' && !isStaff) {
        throw new functions.https.HttpsError('failed-precondition', 'This invitation is not a staff account');
    }
    if (expectedFlow === 'PORTAL' && !isPortalUser) {
        throw new functions.https.HttpsError('failed-precondition', 'This invitation is not a client or interpreter account');
    }
    if (!['PENDING', 'IMPORTED', 'ACTIVE'].includes(status)) {
        throw new functions.https.HttpsError('failed-precondition', `Account status ${status || 'UNKNOWN'} cannot be activated`);
    }
    const now = new Date().toISOString();
    const profileId = String(userData.profileId || '');
    const interpreterProfile = role === 'INTERPRETER' && profileId
        ? await admin.firestore().collection('interpreters').doc(profileId).get()
        : null;
    const batch = admin.firestore().batch();
    batch.set(userRef, {
        authUid: uid,
        passwordSetupAt: now,
        ...(isPortalUser ? { status: 'ACTIVE', activatedAt: now } : {}),
        updatedAt: now,
    }, { merge: true });
    if (role === 'INTERPRETER' && profileId) {
        batch.set(admin.firestore().collection('interpreters').doc(profileId), (0, accountActivationPolicy_1.buildInterpreterActivationPatch)(interpreterProfile?.data(), now), { merge: true });
    }
    if (role === 'CLIENT' && profileId) {
        batch.set(admin.firestore().collection('clients').doc(profileId), {
            status: 'ACTIVE',
            updatedAt: now,
        }, { merge: true });
    }
    await batch.commit();
    return { success: true, role, status: isPortalUser ? 'ACTIVE' : status };
});
exports.completeStaffOnboarding = functions.https.onCall(async (_data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const user = await userRef.get();
    const userData = user.data() || {};
    if (!user.exists || !STAFF_ROLES.includes(String(userData.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'A staff account is required');
    }
    let profile = null;
    if (userData.staffProfileId) {
        const direct = await admin.firestore().collection('staff_profiles').doc(String(userData.staffProfileId)).get();
        if (direct.exists)
            profile = direct;
    }
    if (!profile) {
        const match = await admin.firestore().collection('staff_profiles').where('userId', '==', context.auth.uid).limit(1).get();
        if (!match.empty)
            profile = match.docs[0];
    }
    const profileData = profile?.data() || {};
    if (!profile || profileData.onboardingCompleted !== true) {
        throw new functions.https.HttpsError('failed-precondition', 'Complete the staff profile before activating access');
    }
    const requiredValues = [
        profileData.phone,
        profileData.dob,
        profileData.niNumber,
        profileData.address?.street,
        profileData.address?.postcode,
        profileData.emergencyContact?.name,
        profileData.emergencyContact?.phone,
    ];
    if (requiredValues.some(value => !String(value || '').trim())) {
        throw new functions.https.HttpsError('failed-precondition', 'The staff onboarding profile is incomplete');
    }
    const now = new Date().toISOString();
    await userRef.set({
        status: 'ACTIVE',
        staffProfileId: profile.id,
        onboardingCompletedAt: now,
        updatedAt: now,
    }, { merge: true });
    return { success: true, status: 'ACTIVE' };
});
async function sendInvitationEmail(authUid, email, displayName, role) {
    const portalUrl = await getPortalUrl();
    console.log(`[sendInvitationEmail] Generating password reset link for ${email}...`);
    const setupLink = await buildPasswordSetupLink(email, `${portalUrl}/#/setup?token=${authUid}`);
    const roleLabel = getRoleLabel(role);
    await queueTemplateEmail('STAFF_INVITATION', email, {
        '{{applicantName}}': displayName || 'there',
        '{{departmentName}}': 'your',
        '{{jobTitle}}': roleLabel,
        '{{role}}': roleLabel,
        '{{inviteLink}}': setupLink,
    }, {
        statusTrigger: 'STAFF_INVITED',
        userId: authUid,
    }, 'Welcome to Lingland - Complete Your Account Setup', `
        <p>Hello <strong>{{applicantName}}</strong>,</p>
        <p>You have been invited to join Lingland as a <strong>{{role}}</strong>.</p>
        <p><a href="{{inviteLink}}">Set My Password &amp; Join Team</a></p>
        <p>{{inviteLink}}</p>
    `);
    console.log(`[sendInvitationEmail] Invitation email queued for ${email}`);
}
async function ensureAuthUser(email, displayName) {
    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        if (displayName && userRecord.displayName !== displayName) {
            await admin.auth().updateUser(userRecord.uid, { displayName });
            return admin.auth().getUser(userRecord.uid);
        }
        return userRecord;
    }
    catch (authErr) {
        if (authErr.code !== 'auth/user-not-found')
            throw authErr;
        return admin.auth().createUser({
            email,
            displayName,
            password: Math.random().toString(36).slice(-12) + 'A1!',
        });
    }
}
async function ensureStaffProfile(userId, userData) {
    if (userData.staffProfileId)
        return String(userData.staffProfileId);
    const existing = await admin.firestore()
        .collection('staff_profiles')
        .where('userId', '==', userId)
        .limit(1)
        .get();
    if (!existing.empty)
        return existing.docs[0].id;
    const profileRef = admin.firestore().collection('staff_profiles').doc();
    await profileRef.set({
        id: profileRef.id,
        userId,
        departmentId: userData._prov_departmentId || '',
        jobTitleId: userData._prov_jobTitleId || '',
        onboardingCompleted: false,
        preferences: { theme: 'system', language: 'en', notifications: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    return profileRef.id;
}
async function alignUserDocumentToAuthUid(sourceDoc, authUid, extraData = {}) {
    const userData = sourceDoc.data() || {};
    const { _prov_departmentId, _prov_jobTitleId, ...cleanUserData } = userData;
    const batch = admin.firestore().batch();
    const targetRef = admin.firestore().collection('users').doc(authUid);
    batch.set(targetRef, {
        ...cleanUserData,
        ...extraData,
        id: authUid,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (sourceDoc.id !== authUid && sourceDoc.ref) {
        batch.delete(sourceDoc.ref);
    }
    await batch.commit();
}
async function getPortalUrl() {
    try {
        const snap = await admin.firestore().collection('system').doc('settings').get();
        const configuredUrl = snap.data()?.general?.portalUrl;
        if (configuredUrl && typeof configuredUrl === 'string') {
            return trimTrailingSlash(configuredUrl);
        }
    }
    catch (error) {
        console.warn('[getPortalUrl] Failed to load portal URL from settings', error);
    }
    return 'https://lingland-2e52f.web.app';
}
async function buildPasswordSetupLink(email, continueUrl) {
    const resetLink = await admin.auth().generatePasswordResetLink(email, { url: continueUrl });
    const url = new URL(resetLink);
    const oobCode = url.searchParams.get('oobCode') || '';
    const separator = continueUrl.includes('?') ? '&' : '?';
    return `${continueUrl}${separator}oobCode=${encodeURIComponent(oobCode)}`;
}
async function queueTemplateEmail(templateId, email, variables, metadata, fallbackSubject, fallbackBody) {
    const templateSnap = await admin.firestore().collection('emailTemplates').doc(templateId).get();
    const template = templateSnap.exists ? templateSnap.data() : null;
    if (template && template.isActive === false) {
        throw new functions.https.HttpsError('failed-precondition', `${templateId} template is inactive`);
    }
    const subject = renderTemplate(String(template?.subject || fallbackSubject), variables);
    const html = renderTemplate(String(template?.body || fallbackBody), variables);
    await admin.firestore().collection('mail').add({
        to: [email],
        message: { subject, html },
        recipientType: String(template?.recipientType || (templateId === 'STAFF_INVITATION' ? 'STAFF' : 'INTERPRETER')),
        templateId,
        ...metadata,
        createdAt: new Date().toISOString(),
    });
}
function renderTemplate(template, variables) {
    return Object.entries(variables).reduce((output, [key, value]) => output.split(key).join(value || ''), template);
}
function getRoleLabel(role) {
    const roleLabels = {
        SUPER_ADMIN: 'Super Administrator',
        ADMIN: 'Administrator',
        COORDINATOR: 'Coordinator',
        STAFF: 'Staff Member',
        INTERPRETER: 'Interpreter',
        CLIENT: 'Client',
    };
    return roleLabels[role] || role || 'Team Member';
}
function trimTrailingSlash(value) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}
//# sourceMappingURL=onUserCreated.js.map