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
exports.queueBookingStatusEmails = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const db = admin.firestore();
const fallbackBookedTemplates = [
    {
        id: 'BOOKED_CLIENT',
        recipientType: 'CLIENT',
        subject: 'Booking confirmed - interpreter assigned (Ref: {{bookingRef}})',
        body: 'Dear {{clientName}},<br><br>Your booking {{bookingRef}} is confirmed for {{date}} at {{time}}. {{interpreterName}} has been assigned.<br><br>Kind regards,<br>The Lingland Team',
    },
    {
        id: 'BOOKED_INTERPRETER',
        recipientType: 'INTERPRETER',
        subject: 'Job confirmation: {{bookingRef}} on {{date}}',
        body: 'Dear {{interpreterName}},<br><br>You are confirmed for assignment {{bookingRef}} on {{date}} at {{time}}. Please review the full details in your Lingland workspace.<br><br>Kind regards,<br>The Lingland Team',
    },
];
const fallbackIncomingTemplates = [
    {
        id: 'INCOMING_CLIENT',
        recipientType: 'CLIENT',
        subject: 'Booking request received (Ref: {{bookingRef}})',
        body: 'Dear {{clientName}},<br><br>We received your booking request {{bookingRef}} for {{languageFrom}} to {{languageTo}} on {{date}} at {{time}}. Our operations team will review it and confirm the assignment separately.<br><br>Kind regards,<br>The Lingland Team',
    },
];
const fallbackOfferTemplates = [{
        id: 'PENDING_ASSIGNMENT_INTERPRETER',
        recipientType: 'INTERPRETER',
        subject: 'New job offer: {{bookingRef}} on {{date}}',
        body: 'Dear {{interpreterName}},<br><br>A new assignment {{bookingRef}} is awaiting your response for {{date}} at {{time}}. Please review and respond in your Lingland app.<br><br>Kind regards,<br>The Lingland Operations Team',
    }];
const fallbackCancelledTemplates = [
    {
        id: 'CANCELLED_CLIENT',
        recipientType: 'CLIENT',
        subject: 'Booking cancelled (Ref: {{bookingRef}})',
        body: 'Dear {{clientName}},<br><br>Your booking {{bookingRef}} for {{date}} at {{time}} has been cancelled.<br><br>Kind regards,<br>The Lingland Team',
    },
    {
        id: 'CANCELLED_INTERPRETER',
        recipientType: 'INTERPRETER',
        subject: 'Assignment cancelled: {{bookingRef}}',
        body: 'Dear {{interpreterName}},<br><br>Assignment {{bookingRef}} for {{date}} at {{time}} has been cancelled. Please review your schedule in the Lingland app.<br><br>Kind regards,<br>The Lingland Operations Team',
    },
];
const fallbackAssignmentRemovedTemplates = [{
        id: 'ASSIGNMENT_REMOVED_INTERPRETER',
        recipientType: 'INTERPRETER',
        subject: 'Assignment update: {{bookingRef}}',
        body: 'Dear {{interpreterName}},<br><br>You are no longer assigned to {{bookingRef}} on {{date}} at {{time}}. Please review your current schedule in the Lingland app.<br><br>Kind regards,<br>The Lingland Operations Team',
    }];
const fallbackTimesheetApprovedTemplates = [{
        id: 'READY_FOR_INVOICE_INTERPRETER',
        recipientType: 'INTERPRETER',
        subject: 'Timesheet approved: {{bookingRef}}',
        body: 'Dear {{interpreterName}},<br><br>Your timesheet for {{bookingRef}} has been approved and moved to the payment workflow. You can follow its status in your Lingland app.<br><br>Kind regards,<br>The Lingland Finance Team',
    }];
const fallbackTemplatesByStatus = {
    INCOMING: fallbackIncomingTemplates,
    BOOKED: fallbackBookedTemplates,
    PENDING_ASSIGNMENT: fallbackOfferTemplates,
    ASSIGNMENT_PENDING: fallbackOfferTemplates,
    CANCELLED: fallbackCancelledTemplates,
    ASSIGNMENT_REMOVED: fallbackAssignmentRemovedTemplates,
    READY_FOR_INVOICE: fallbackTimesheetApprovedTemplates,
};
const render = (value, booking, extra) => {
    const location = booking.locationType === 'ONLINE'
        ? 'Remote / Online'
        : String(booking.address || booking.postcode || 'On-site');
    const dictionary = {
        '{{clientName}}': String(booking.guestContact?.name || booking.clientName || 'Valued Client'),
        '{{interpreterName}}': extra.interpreterName || String(booking.interpreterName || 'Interpreter'),
        '{{bookingRef}}': String(booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id || ''),
        '{{date}}': String(booking.date || ''),
        '{{time}}': String(booking.startTime || ''),
        '{{location}}': location,
        '{{languageFrom}}': String(booking.languageFrom || ''),
        '{{languageTo}}': String(booking.languageTo || ''),
        '{{serviceType}}': String(booking.serviceType || ''),
        '{{durationMinutes}}': String(booking.durationMinutes || ''),
        '{{status}}': String(booking.status || ''),
    };
    return Object.entries(dictionary).reduce((output, [key, replacement]) => output.split(key).join(replacement), value);
};
const resolveClientEmail = async (booking) => {
    const direct = String(booking.guestContact?.email || booking.email || booking.clientEmail || '').trim().toLowerCase();
    if (direct)
        return direct;
    if (!booking.clientId)
        return '';
    const client = await db.collection('clients').doc(String(booking.clientId)).get();
    return String(client.data()?.bookingEmail || client.data()?.email || '').trim().toLowerCase();
};
const resolveInterpreterEmail = async (booking, directEmail) => {
    if (directEmail)
        return directEmail.trim().toLowerCase();
    if (!booking.interpreterId)
        return '';
    const interpreter = await db.collection('interpreters').doc(String(booking.interpreterId)).get();
    return String(interpreter.data()?.email || '').trim().toLowerCase();
};
const queueBookingStatusEmails = async (bookingId, booking, status, extra = {}, eventId = '') => {
    const templatesSnap = await db.collection('emailTemplates').where('triggerStatus', '==', status).get();
    const configured = templatesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(template => template.isActive !== false);
    const templates = configured.length > 0
        ? configured
        : (fallbackTemplatesByStatus[status] || []);
    const clientEmail = await resolveClientEmail(booking);
    const interpreterEmail = await resolveInterpreterEmail(booking, String(extra.interpreterEmail || ''));
    for (const template of templates) {
        const recipientType = String(template.recipientType || '');
        const recipient = recipientType === 'CLIENT'
            ? clientEmail
            : recipientType === 'INTERPRETER'
                ? interpreterEmail
                : '';
        if (!recipient)
            continue;
        const templateId = String(template.id || 'booking-status');
        const dedupeSource = `${bookingId}:${status}:${templateId}:${recipient}:${eventId}`;
        const mailId = `booking_${(0, crypto_1.createHash)('sha256').update(dedupeSource).digest('hex').slice(0, 32)}`;
        const subject = render(String(template.subject || ''), { ...booking, id: bookingId, status }, {
            interpreterName: extra.interpreterName || '',
        });
        const html = render(String(template.body || ''), { ...booking, id: bookingId, status }, {
            interpreterName: extra.interpreterName || '',
        });
        try {
            await db.collection('mail').doc(mailId).create({
                to: [recipient],
                message: { subject, html },
                recipientType,
                templateId,
                statusTrigger: status,
                bookingId,
                source: 'booking_status_backend',
                eventId: eventId || null,
                createdAt: new Date().toISOString(),
            });
        }
        catch (error) {
            if (error?.code !== 6 && error?.code !== 'already-exists')
                throw error;
        }
    }
};
exports.queueBookingStatusEmails = queueBookingStatusEmails;
//# sourceMappingURL=bookingEmail.js.map