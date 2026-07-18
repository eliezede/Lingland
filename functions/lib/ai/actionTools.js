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
exports.verifyActionOutcome = exports.rollbackActionTool = exports.executeActionTool = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const bookingEmail_1 = require("../mail/bookingEmail");
const interpreterMatcher_1 = require("./interpreterMatcher");
const nowIso = () => new Date().toISOString();
const text = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clean = (value) => JSON.parse(JSON.stringify(value));
const entityLink = (entityType, entityId) => {
    if (entityType === 'BOOKING')
        return `/admin/bookings/${encodeURIComponent(entityId)}`;
    if (entityType === 'CLIENT_INVOICE')
        return `/admin/billing/client-invoices/${encodeURIComponent(entityId)}`;
    if (entityType === 'INTERPRETER_INVOICE')
        return `/admin/billing/interpreter-invoices/${encodeURIComponent(entityId)}`;
    if (entityType === 'SYNC_CONFLICT')
        return '/admin/administration/migration';
    return '/admin/ai-command/attention';
};
const createOperationTask = async (input) => {
    const ref = input.db.collection('aiOperationalTasks').doc(`task_${input.suggestionId}`);
    const existing = await ref.get();
    const createdAt = nowIso();
    const assignedTeam = input.category === 'BILLING' || input.category === 'COST' ? 'FINANCE'
        : input.category === 'SYNC' ? 'ADMINISTRATION'
            : input.category === 'PLATFORM' ? 'ADMINISTRATION'
                : 'OPERATIONS';
    const task = {
        id: ref.id,
        source: 'AI_AUTOPILOT',
        executionId: input.executionId,
        suggestionId: input.suggestionId,
        action: input.action,
        status: 'OPEN',
        priority: input.risk,
        assignedTeam,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        title: text(input.title, 120),
        description: text(input.reason, 500),
        link: entityLink(input.entityType, input.entityId),
        organizationId: input.organizationId,
        createdAt: existing.data()?.createdAt || createdAt,
        createdBy: input.actorId,
        updatedAt: createdAt,
    };
    await ref.set(task, { merge: true });
    const admins = await input.db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN']).get();
    const activeAdmins = admins.docs.filter(doc => doc.data()?.status === 'ACTIVE');
    if (activeAdmins.length > 0) {
        const batch = input.db.batch();
        activeAdmins.forEach(doc => {
            batch.set(input.db.collection('notifications').doc(`${input.executionId}_task_${doc.id}`), {
                userId: doc.id,
                title: text(input.title, 100),
                message: text(input.reason, 500),
                type: 'AI_OPERATIONAL_TASK',
                link: task.link,
                read: false,
                internalOnly: true,
                aiExecutionId: input.executionId,
                aiTaskId: ref.id,
                createdBy: input.actorId,
                createdAt,
            }, { merge: true });
        });
        await batch.commit();
    }
    return {
        beforeSnapshot: existing.exists ? clean(existing.data() || {}) : null,
        afterSnapshot: clean(task),
        resultSummary: { taskId: ref.id, assignedTeam, recipients: activeAdmins.length, idempotent: existing.exists },
        rollbackAvailable: true,
        externalCommunicationAttempted: false,
    };
};
const createInternalAlert = async (input) => {
    const admins = await input.db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN']).get();
    const activeAdmins = admins.docs.filter(doc => doc.data()?.status === 'ACTIVE');
    const batch = input.db.batch();
    const createdAt = nowIso();
    activeAdmins.forEach(doc => {
        batch.set(input.db.collection('notifications').doc(`${input.executionId}_${doc.id}`), {
            userId: doc.id,
            title: text(input.title, 100),
            message: text(input.reason, 500),
            type: 'AI_OPERATIONAL_ALERT',
            link: entityLink(input.entityType, input.entityId),
            read: false,
            internalOnly: true,
            aiExecutionId: input.executionId,
            createdBy: input.actorId,
            createdAt,
        }, { merge: true });
    });
    await batch.commit();
    return {
        beforeSnapshot: null,
        afterSnapshot: { alertExecutionId: input.executionId, recipients: activeAdmins.length },
        resultSummary: { recipients: activeAdmins.length, internalOnly: true },
        rollbackAvailable: false,
        externalCommunicationAttempted: false,
    };
};
const placeJobOnHold = async (input) => {
    if (input.entityType !== 'BOOKING')
        throw new Error('PLACE_JOB_ON_HOLD requires a booking.');
    const bookingRef = input.db.collection('bookings').doc(input.entityId);
    const eventRef = input.db.collection('jobEvents').doc();
    const allowed = new Set(['INCOMING', 'NEEDS_ASSIGNMENT', 'OPENED', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'QUOTE_PENDING', 'BOOKED', 'ADMIN']);
    let before = {};
    const heldAt = nowIso();
    await input.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(bookingRef);
        if (!snapshot.exists)
            throw new Error('Booking not found.');
        const booking = snapshot.data() || {};
        const status = String(booking.status || 'INCOMING').toUpperCase();
        if (status === 'ADMIN_HOLD' && booking.aiHoldExecutionId === input.executionId) {
            before = clean(booking.aiHoldPreviousState || {});
            return;
        }
        if (!allowed.has(status))
            throw new Error(`Job cannot be placed on hold while ${status}.`);
        before = {
            status,
            aiHoldExecutionId: booking.aiHoldExecutionId || null,
            aiHoldReason: booking.aiHoldReason || null,
            aiHeldAt: booking.aiHeldAt || null,
        };
        transaction.update(bookingRef, {
            status: 'ADMIN_HOLD',
            aiHoldExecutionId: input.executionId,
            aiHoldReason: text(input.reason, 500),
            aiHeldAt: heldAt,
            aiHeldBy: input.actorId,
            aiHoldPreviousState: clean(before),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(eventRef, {
            jobId: input.entityId,
            organizationId: booking.organizationId || input.organizationId,
            type: 'AI_ADMIN_HOLD',
            source: 'ai_autopilot',
            actorUserId: input.actorId,
            metadata: { fromStatus: status, toStatus: 'ADMIN_HOLD', executionId: input.executionId },
            createdAt: heldAt,
        });
    });
    return {
        beforeSnapshot: before,
        afterSnapshot: { status: 'ADMIN_HOLD', aiHoldExecutionId: input.executionId },
        resultSummary: { bookingId: input.entityId, status: 'ADMIN_HOLD' },
        rollbackAvailable: true,
        externalCommunicationAttempted: false,
    };
};
const offerInterpreter = async (input) => {
    if (input.entityType !== 'BOOKING')
        throw new Error('OFFER_INTERPRETER requires a booking.');
    const bookingRef = input.db.collection('bookings').doc(input.entityId);
    const initial = await bookingRef.get();
    if (!initial.exists)
        throw new Error('Booking not found.');
    const initialBooking = initial.data() || {};
    const offeredIds = Array.isArray(initialBooking.offeredInterpreterIds) ? initialBooking.offeredInterpreterIds.map(String) : [];
    const requestedId = text(input.parameters.interpreterId, 160);
    const ranked = requestedId
        ? await (0, interpreterMatcher_1.rankInterpreterForBooking)(input.db, input.entityId, initialBooking, requestedId)
        : await (0, interpreterMatcher_1.findBestInterpreterForBooking)(input.db, input.entityId, initialBooking, offeredIds);
    const interpreterId = ranked?.id || '';
    if (!interpreterId)
        throw new Error('No eligible professional satisfies the assignment policy.');
    const interpreterRef = input.db.collection('interpreters').doc(interpreterId);
    const assignmentRef = input.db.collection('assignments').doc(`ai_${input.executionId}`);
    const eventRef = input.db.collection('jobEvents').doc();
    const now = nowIso();
    let before = {};
    let bookingForEmail = null;
    let interpreterForEmail = null;
    await input.db.runTransaction(async (transaction) => {
        const [bookingSnapshot, interpreterSnapshot, assignmentSnapshot] = await Promise.all([
            transaction.get(bookingRef),
            transaction.get(interpreterRef),
            transaction.get(assignmentRef),
        ]);
        if (!bookingSnapshot.exists)
            throw new Error('Booking not found.');
        if (!interpreterSnapshot.exists)
            throw new Error('Selected professional not found.');
        const booking = bookingSnapshot.data() || {};
        const status = String(booking.status || '').toUpperCase();
        if (assignmentSnapshot.exists && String(assignmentSnapshot.data()?.status || '') === 'OFFERED') {
            before = clean(assignmentSnapshot.data()?.previousBookingState || {});
            return;
        }
        if (booking.interpreterId && String(booking.interpreterId) !== interpreterId)
            throw new Error('Job already has another professional.');
        if (!['INCOMING', 'NEEDS_ASSIGNMENT', 'OPENED', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING'].includes(status)) {
            throw new Error(`Assignment offer is not valid while the job is ${status}.`);
        }
        const interpreter = interpreterSnapshot.data() || {};
        before = {
            status,
            interpreterId: booking.interpreterId || null,
            interpreterName: booking.interpreterName || null,
            interpreterPhotoUrl: booking.interpreterPhotoUrl || null,
            offeredInterpreterIds: Array.isArray(booking.offeredInterpreterIds) ? booking.offeredInterpreterIds : [],
        };
        transaction.set(assignmentRef, {
            bookingId: input.entityId,
            interpreterId,
            status: 'OFFERED',
            offeredAt: now,
            assignmentType: 'AI_POLICY',
            createdBy: input.actorId,
            aiExecutionId: input.executionId,
            matchScore: ranked?.score || Number(input.parameters.matchScore) || null,
            matchReasons: ranked?.reasons || [],
            matchWarnings: ranked?.warnings || [],
            previousBookingState: clean(before),
        }, { merge: true });
        transaction.update(bookingRef, {
            status: 'PENDING_ASSIGNMENT',
            interpreterId,
            interpreterName: interpreter.name || 'Professional',
            interpreterPhotoUrl: interpreter.photoUrl || null,
            offeredInterpreterIds: [interpreterId],
            aiAssignmentExecutionId: input.executionId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(eventRef, {
            jobId: input.entityId,
            organizationId: booking.organizationId || input.organizationId,
            type: 'AI_DIRECT_ASSIGNMENT_SENT',
            source: 'ai_autopilot',
            actorUserId: input.actorId,
            metadata: { fromStatus: status, toStatus: 'PENDING_ASSIGNMENT', interpreterId, assignmentId: assignmentRef.id, executionId: input.executionId },
            createdAt: now,
        });
        bookingForEmail = { ...booking, id: input.entityId, status: 'PENDING_ASSIGNMENT', interpreterId };
        interpreterForEmail = interpreter;
    });
    let externalCommunicationAttempted = false;
    let externalCommunicationQueued = false;
    let communicationError = '';
    if (input.externalCommunicationEnabled && bookingForEmail && interpreterForEmail) {
        externalCommunicationAttempted = true;
        const interpreter = interpreterForEmail;
        try {
            await (0, bookingEmail_1.queueBookingStatusEmails)(input.entityId, bookingForEmail, 'PENDING_ASSIGNMENT', {
                interpreterEmail: String(interpreter.email || ''),
                interpreterName: String(interpreter.name || ''),
            }, eventRef.id);
            externalCommunicationQueued = true;
        }
        catch (error) {
            communicationError = text(error instanceof Error ? error.message : 'Communication queue failed.', 240);
            await input.db.collection('aiOperationalTasks').doc(`communication_${input.executionId}`).set({
                id: `communication_${input.executionId}`,
                source: 'AI_AUTOPILOT',
                executionId: input.executionId,
                suggestionId: input.suggestionId,
                action: 'REVIEW_EXTERNAL_COMMUNICATION_FAILURE',
                status: 'OPEN',
                priority: 'HIGH',
                assignedTeam: 'OPERATIONS',
                entityType: input.entityType,
                entityId: input.entityId,
                entityLabel: input.entityLabel,
                title: 'Assignment offer communication needs review',
                description: communicationError,
                link: entityLink(input.entityType, input.entityId),
                organizationId: input.organizationId,
                createdAt: nowIso(),
                createdBy: input.actorId,
                updatedAt: nowIso(),
            }, { merge: true });
        }
    }
    return {
        beforeSnapshot: before,
        afterSnapshot: { bookingId: input.entityId, assignmentId: assignmentRef.id, interpreterId, status: 'PENDING_ASSIGNMENT', externalCommunicationExpected: input.externalCommunicationEnabled, externalCommunicationQueued },
        resultSummary: { bookingId: input.entityId, assignmentId: assignmentRef.id, interpreterId, matchScore: ranked?.score || null, matchReasons: ranked?.reasons || [], externalCommunicationQueued, communicationError },
        rollbackAvailable: true,
        externalCommunicationAttempted,
    };
};
const createClientInvoiceDraft = async (input) => {
    if (input.entityType !== 'BOOKING')
        throw new Error('CREATE_CLIENT_INVOICE_DRAFT requires a booking.');
    const bookingRef = input.db.collection('bookings').doc(input.entityId);
    const [bookingSnapshot, timesheetSnapshot] = await Promise.all([
        bookingRef.get(),
        input.db.collection('timesheets').where('bookingId', '==', input.entityId).limit(20).get(),
    ]);
    if (!bookingSnapshot.exists)
        throw new Error('Booking not found.');
    const booking = bookingSnapshot.data() || {};
    const candidates = timesheetSnapshot.docs.filter(doc => {
        const value = doc.data();
        return value.readyForClientInvoice === true && !value.clientInvoiceId && Number(value.clientAmountCalculated || 0) > 0;
    });
    if (candidates.length === 0)
        throw new Error('No approved uninvoiced timesheet is available for this job.');
    const clientId = String(booking.clientId || candidates[0].data().clientId || '');
    if (!clientId)
        throw new Error('The booking has no linked client.');
    const generationKey = (0, crypto_1.createHash)('sha256')
        .update(`${input.entityId}:${candidates.map(doc => doc.id).sort().join(',')}`)
        .digest('hex');
    const invoiceRef = input.db.collection('clientInvoices').doc(`ai_client_${generationKey.slice(0, 28)}`);
    const settingsRef = input.db.collection('systemSettings').doc('main');
    const clientRef = input.db.collection('clients').doc(clientId);
    const createdAt = nowIso();
    let resultSummary = {};
    let beforeSnapshot = {};
    await input.db.runTransaction(async (transaction) => {
        const [existingInvoice, settingsSnapshot, clientSnapshot, freshBooking, ...freshTimesheets] = await Promise.all([
            transaction.get(invoiceRef),
            transaction.get(settingsRef),
            transaction.get(clientRef),
            transaction.get(bookingRef),
            ...candidates.map(doc => transaction.get(doc.ref)),
        ]);
        if (existingInvoice.exists) {
            const existing = existingInvoice.data() || {};
            beforeSnapshot = clean(existing.aiBeforeSnapshot || {});
            resultSummary = { invoiceId: invoiceRef.id, invoiceNumber: existing.invoiceNumber || '', idempotent: true };
            return;
        }
        if (!clientSnapshot.exists)
            throw new Error('Client not found.');
        const eligible = freshTimesheets.filter(doc => doc.exists && doc.data()?.readyForClientInvoice === true && !doc.data()?.clientInvoiceId);
        if (eligible.length === 0)
            throw new Error('Eligible timesheets were already claimed.');
        const settings = settingsSnapshot.data() || {};
        const finance = settings.finance || {};
        const nextNumber = Number(finance.nextInvoiceNumber || 1);
        const invoiceNumber = `${String(finance.invoicePrefix || 'INV-')}${String(nextNumber).padStart(5, '0')}`;
        const configuredVat = Number(finance.vatRate ?? 0.2);
        const vatRate = configuredVat > 1 ? configuredVat / 100 : configuredVat;
        if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1)
            throw new Error('Finance VAT configuration is invalid.');
        const subtotal = Number(eligible.reduce((sum, doc) => sum + Number(doc.data()?.clientAmountCalculated || 0), 0).toFixed(2));
        if (subtotal <= 0)
            throw new Error('Invoice subtotal must be greater than zero.');
        const vatAmount = Number((subtotal * vatRate).toFixed(2));
        const totalAmount = Number((subtotal + vatAmount).toFixed(2));
        const client = clientSnapshot.data() || {};
        const paymentTermsDays = Number(client.paymentTermsDays ?? finance.paymentTermsDays ?? 30);
        const dueDate = new Date(Date.now() + paymentTermsDays * 86400000).toISOString();
        beforeSnapshot = {
            booking: { status: freshBooking.data()?.status || null, paymentStatus: freshBooking.data()?.paymentStatus || null },
            timesheets: eligible.map(doc => ({ id: doc.id, status: doc.data()?.status || null, readyForClientInvoice: doc.data()?.readyForClientInvoice === true })),
        };
        transaction.set(settingsRef, { finance: { ...finance, nextInvoiceNumber: nextNumber + 1 }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        eligible.forEach(timesheet => {
            const value = timesheet.data() || {};
            const lineAmount = Number(value.clientAmountCalculated || 0);
            const units = Number(value.unitsBillableToClient || 0);
            transaction.set(input.db.collection('clientInvoiceLines').doc(`${invoiceRef.id}_${timesheet.id}`), {
                invoiceId: invoiceRef.id,
                timesheetId: timesheet.id,
                bookingId: input.entityId,
                interpreterId: value.interpreterId || null,
                description: `Language service - job ${input.entityLabel}`,
                units,
                rate: units > 0 ? Number((lineAmount / units).toFixed(4)) : lineAmount,
                lineAmount,
                total: lineAmount,
                aiExecutionId: input.executionId,
            });
            transaction.update(timesheet.ref, {
                clientInvoiceId: invoiceRef.id,
                readyForClientInvoice: false,
                status: 'INVOICING',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        transaction.set(bookingRef, {
            status: 'INVOICING',
            clientInvoiceId: invoiceRef.id,
            clientInvoiceNumber: invoiceNumber,
            clientInvoiceReference: invoiceNumber,
            clientInvoiceStatus: 'DRAFT',
            paymentStatus: 'READY_FOR_INVOICE',
            aiInvoiceExecutionId: input.executionId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(invoiceRef, {
            id: invoiceRef.id,
            generationKey,
            aiExecutionId: input.executionId,
            clientId,
            clientName: client.companyName || 'Client',
            clientEmail: client.invoiceEmail || client.email || '',
            reference: invoiceNumber,
            invoiceNumber,
            issueDate: createdAt,
            dueDate,
            periodStart: booking.date || createdAt.slice(0, 10),
            periodEnd: booking.date || createdAt.slice(0, 10),
            status: 'DRAFT',
            subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            currency: finance.currency || 'GBP',
            timesheetCount: eligible.length,
            lineCount: eligible.length,
            financialIntegrityStatus: 'VERIFIED',
            referenceIntegrityStatus: 'VERIFIED',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: input.actorId,
            aiBeforeSnapshot: clean(beforeSnapshot),
        });
        resultSummary = { invoiceId: invoiceRef.id, invoiceNumber, subtotal, vatAmount, totalAmount, timesheetCount: eligible.length, idempotent: false };
    });
    return {
        beforeSnapshot,
        afterSnapshot: { bookingId: input.entityId, invoiceId: invoiceRef.id, status: 'DRAFT' },
        resultSummary,
        rollbackAvailable: true,
        externalCommunicationAttempted: false,
    };
};
const executeActionTool = async (input) => {
    switch (input.definition.handler) {
        case 'CREATE_OPERATION_TASK': return createOperationTask(input);
        case 'CREATE_INTERNAL_ALERT': return createInternalAlert(input);
        case 'PLACE_JOB_ON_HOLD': return placeJobOnHold(input);
        case 'OFFER_INTERPRETER': return offerInterpreter(input);
        case 'CREATE_CLIENT_INVOICE_DRAFT': return createClientInvoiceDraft(input);
        default: throw new Error('No execution tool is registered for this action.');
    }
};
exports.executeActionTool = executeActionTool;
const rollbackActionTool = async (input) => {
    const now = nowIso();
    if (input.handler === 'CREATE_OPERATION_TASK') {
        const taskId = text(input.afterSnapshot?.id || `task_${text(input.afterSnapshot?.suggestionId, 160)}`, 200);
        const query = taskId && taskId !== 'task_'
            ? await input.db.collection('aiOperationalTasks').doc(taskId).get()
            : await input.db.collection('aiOperationalTasks').where('executionId', '==', input.executionId).limit(1).get().then(snapshot => snapshot.docs[0]);
        const ref = query && 'ref' in query ? query.ref : null;
        if (!ref)
            throw new Error('Operation task not found for rollback.');
        const notifications = await input.db.collection('notifications').where('aiExecutionId', '==', input.executionId).get();
        const batch = input.db.batch();
        batch.set(ref, { status: 'CANCELLED', cancelledAt: now, cancelledBy: input.actorId, rollbackExecutionId: input.executionId }, { merge: true });
        notifications.docs.forEach(notification => batch.set(notification.ref, { read: true, cancelledAt: now, cancelledBy: input.actorId }, { merge: true }));
        await batch.commit();
        return { taskId: ref.id, status: 'CANCELLED' };
    }
    if (input.handler === 'PLACE_JOB_ON_HOLD') {
        const bookingRef = input.db.collection('bookings').doc(input.entityId);
        await input.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(bookingRef);
            if (!snapshot.exists)
                throw new Error('Booking not found.');
            const value = snapshot.data() || {};
            if (String(value.status || '') !== 'ADMIN_HOLD' || value.aiHoldExecutionId !== input.executionId) {
                throw new Error('Job changed after the AI hold and cannot be rolled back automatically.');
            }
            transaction.update(bookingRef, {
                status: String(input.beforeSnapshot?.status || 'NEEDS_ASSIGNMENT'),
                aiHoldExecutionId: admin.firestore.FieldValue.delete(),
                aiHoldReason: admin.firestore.FieldValue.delete(),
                aiHeldAt: admin.firestore.FieldValue.delete(),
                aiHeldBy: admin.firestore.FieldValue.delete(),
                aiHoldPreviousState: admin.firestore.FieldValue.delete(),
                aiHoldRolledBackAt: now,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        return { bookingId: input.entityId, status: input.beforeSnapshot?.status || 'NEEDS_ASSIGNMENT' };
    }
    if (input.handler === 'OFFER_INTERPRETER') {
        const bookingRef = input.db.collection('bookings').doc(input.entityId);
        const assignmentId = text(input.afterSnapshot?.assignmentId, 200);
        if (!assignmentId)
            throw new Error('Assignment reference is missing.');
        const assignmentRef = input.db.collection('assignments').doc(assignmentId);
        await input.db.runTransaction(async (transaction) => {
            const [booking, assignment] = await Promise.all([transaction.get(bookingRef), transaction.get(assignmentRef)]);
            if (!booking.exists || !assignment.exists)
                throw new Error('Booking or assignment no longer exists.');
            if (String(assignment.data()?.status || '') !== 'OFFERED' || booking.data()?.aiAssignmentExecutionId !== input.executionId) {
                throw new Error('The offer was already answered or changed and cannot be rolled back.');
            }
            transaction.set(assignmentRef, { status: 'REMOVED', respondedAt: now, removalReason: 'AI_EXECUTION_ROLLBACK', rolledBackBy: input.actorId }, { merge: true });
            transaction.update(bookingRef, {
                status: String(input.beforeSnapshot?.status || 'NEEDS_ASSIGNMENT'),
                interpreterId: input.beforeSnapshot?.interpreterId || null,
                interpreterName: input.beforeSnapshot?.interpreterName || null,
                interpreterPhotoUrl: input.beforeSnapshot?.interpreterPhotoUrl || null,
                offeredInterpreterIds: input.beforeSnapshot?.offeredInterpreterIds || [],
                aiAssignmentExecutionId: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        return { bookingId: input.entityId, assignmentId, status: 'REMOVED' };
    }
    if (input.handler === 'CREATE_CLIENT_INVOICE_DRAFT') {
        const invoiceId = text(input.afterSnapshot?.invoiceId, 200);
        if (!invoiceId)
            throw new Error('Invoice reference is missing.');
        const invoiceRef = input.db.collection('clientInvoices').doc(invoiceId);
        const [invoice, lines, timesheets] = await Promise.all([
            invoiceRef.get(),
            input.db.collection('clientInvoiceLines').where('invoiceId', '==', invoiceId).get(),
            input.db.collection('timesheets').where('clientInvoiceId', '==', invoiceId).get(),
        ]);
        if (!invoice.exists || String(invoice.data()?.status || '') !== 'DRAFT') {
            throw new Error('Only an unsent draft invoice can be rolled back.');
        }
        const priorTimesheets = Array.isArray(input.beforeSnapshot?.timesheets) ? input.beforeSnapshot?.timesheets : [];
        const priorById = new Map(priorTimesheets.map(item => [String(item.id || ''), item]));
        const batch = input.db.batch();
        lines.docs.forEach(line => batch.delete(line.ref));
        timesheets.docs.forEach(timesheet => {
            const prior = priorById.get(timesheet.id);
            batch.set(timesheet.ref, {
                clientInvoiceId: admin.firestore.FieldValue.delete(),
                readyForClientInvoice: prior?.readyForClientInvoice !== false,
                status: String(prior?.status || 'APPROVED'),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        batch.set(input.db.collection('bookings').doc(input.entityId), {
            status: String(input.beforeSnapshot?.booking?.status || 'READY_FOR_INVOICE'),
            paymentStatus: String(input.beforeSnapshot?.booking?.paymentStatus || 'READY_FOR_INVOICE'),
            clientInvoiceId: admin.firestore.FieldValue.delete(),
            clientInvoiceNumber: admin.firestore.FieldValue.delete(),
            clientInvoiceReference: admin.firestore.FieldValue.delete(),
            clientInvoiceStatus: admin.firestore.FieldValue.delete(),
            aiInvoiceExecutionId: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.delete(invoiceRef);
        await batch.commit();
        return { bookingId: input.entityId, invoiceId, status: 'ROLLED_BACK' };
    }
    throw new Error('This action does not support rollback.');
};
exports.rollbackActionTool = rollbackActionTool;
const verifyActionOutcome = async (input) => {
    if (input.handler === 'CREATE_OPERATION_TASK') {
        const snapshot = await input.db.collection('aiOperationalTasks').where('executionId', '==', input.executionId).limit(1).get();
        return { verified: !snapshot.empty && String(snapshot.docs[0].data().status || '') !== 'CANCELLED', detail: snapshot.empty ? 'Task missing' : `Task ${snapshot.docs[0].data().status || 'OPEN'}` };
    }
    if (input.handler === 'CREATE_INTERNAL_ALERT') {
        const snapshot = await input.db.collection('notifications').where('aiExecutionId', '==', input.executionId).limit(1).get();
        return { verified: !snapshot.empty, detail: snapshot.empty ? 'Alert missing' : 'Internal alert recorded' };
    }
    if (input.handler === 'PLACE_JOB_ON_HOLD') {
        const booking = await input.db.collection('bookings').doc(input.entityId).get();
        const value = booking.data() || {};
        return { verified: booking.exists && value.status === 'ADMIN_HOLD' && value.aiHoldExecutionId === input.executionId, detail: `Job status ${value.status || 'MISSING'}` };
    }
    if (input.handler === 'OFFER_INTERPRETER') {
        const assignmentId = text(input.afterSnapshot?.assignmentId || `ai_${input.executionId}`, 200);
        const assignment = assignmentId ? await input.db.collection('assignments').doc(assignmentId).get() : null;
        const status = String(assignment?.data()?.status || 'MISSING');
        const communicationExpected = input.afterSnapshot?.externalCommunicationExpected === true;
        const communicationQueued = input.afterSnapshot?.externalCommunicationQueued === true;
        const assignmentVerified = Boolean(assignment?.exists && ['OFFERED', 'ACCEPTED'].includes(status));
        const verified = assignmentVerified && (!communicationExpected || communicationQueued);
        return { verified, detail: `Assignment ${status}${communicationExpected ? `; communication ${communicationQueued ? 'queued' : 'missing'}` : ''}` };
    }
    if (input.handler === 'CREATE_CLIENT_INVOICE_DRAFT') {
        const invoiceId = text(input.afterSnapshot?.invoiceId, 200);
        const invoice = invoiceId
            ? await input.db.collection('clientInvoices').doc(invoiceId).get()
            : await input.db.collection('clientInvoices').where('aiExecutionId', '==', input.executionId).limit(1).get().then(snapshot => snapshot.docs[0] || null);
        const status = String(invoice?.data()?.status || 'MISSING');
        return { verified: Boolean(invoice?.exists && ['DRAFT', 'SENT', 'PAID'].includes(status)), detail: `Invoice ${status}` };
    }
    return { verified: false, detail: 'Unknown execution tool' };
};
exports.verifyActionOutcome = verifyActionOutcome;
//# sourceMappingURL=actionTools.js.map