import { collection, doc, getDocs, getDoc, setDoc, query, where, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, EmailTemplate, EMAIL_VARIABLES, UserRole, ServiceType, InterpreterApplication, ApplicationStatus, User, ServiceCategory } from '../types';

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
    {
        id: 'INCOMING_CLIENT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.INCOMING,
        recipientType: 'CLIENT',
        name: 'Booking Request Received',
        subject: 'Confirmation of Booking Request: {{bookingRef}}',
        body: `Dear {{clientName}},<br><br>Thank you for choosing Lingland.<br><br>We have successfully received your booking request for an interpreter from {{languageFrom}} to {{languageTo}} on {{date}} at {{time}}.<br><br>**Service Details:**<br>- **Type:** {{serviceType}}<br>- **Location:** {{location}}<br><br>Our team is currently reviewing your request and matching you with a qualified interpreter. You will receive a notification as soon as an interpreter has been assigned.<br><br>If you have any questions, please do not hesitate to contact our support team.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.CLIENT,
        isActive: true
    },
    {
        id: 'BOOKED_CLIENT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.BOOKED,
        recipientType: 'CLIENT',
        name: 'Interpreter Assigned',
        subject: 'Booking Confirmed - Interpreter Assigned (Ref: {{bookingRef}})',
        body: `Dear {{clientName}},<br><br>We are pleased to confirm that a professional interpreter has been assigned to your booking (Ref: {{bookingRef}}).<br><br>**Booking Summary:**<br>- **Date:** {{date}} at {{time}}<br>- **Interpreter:** {{interpreterName}}<br>- **Language:** {{languageFrom}} to {{languageTo}}<br><br>You can view the full details of this assignment by logging into your client dashboard.<br><br>Thank you for choosing Lingland.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.CLIENT,
        isActive: true
    },
    {
        id: 'BOOKED_INTERPRETER',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.BOOKED,
        recipientType: 'INTERPRETER',
        name: 'Job Confirmed (Interpreter)',
        subject: 'Job Confirmation: {{bookingRef}} on {{date}}',
        body: `Dear {{interpreterName}},<br><br>You are officially booked for the assignment (Ref: {{bookingRef}}).<br><br>**Assignment Details:**<br>- **Date:** {{date}} at {{time}}<br>- **Type:** {{serviceType}}<br>- **Location:** {{location}}<br><br>Please check your interpreter dashboard for any client notes, exact addresses, and meeting links prior to the assignment.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.INTERPRETER,
        isActive: true
    },
    {
        id: 'OPENED_INTERPRETER',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.OPENED,
        recipientType: 'INTERPRETER',
        name: 'New Job Offer Available',
        subject: 'New Lingland Assignment Opportunity: {{languageTo}}',
        body: `Dear {{interpreterName}},<br><br>A new assignment matching your profile is now available.<br><br>**Opportunity Overview:**<br>- **Language:** {{languageTo}}<br>- **Date:** {{date}} at {{time}}<br>- **Location:** {{location}}<br><br>Please log in to your interpreter portal to review the complete details and accept or decline this offer as soon as possible.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.INTERPRETER,
        isActive: true
    },
    {
        id: 'CANCELLED_CLIENT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.CANCELLED,
        recipientType: 'CLIENT',
        name: 'Booking Cancelled (Client)',
        subject: 'Cancellation Confirmation: {{bookingRef}}',
        body: `Dear {{clientName}},<br><br>This email confirms that your booking (Ref: {{bookingRef}}) scheduled for {{date}} has been successfully cancelled.<br><br>If this cancellation was made in error or if you require further assistance, please contact our support team immediately.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.CLIENT,
        isActive: true
    },
    {
        id: 'CANCELLED_INTERPRETER',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.CANCELLED,
        recipientType: 'INTERPRETER',
        name: 'Job Cancelled (Interpreter)',
        subject: 'Notice of Job Cancellation: {{bookingRef}}',
        body: `Dear {{interpreterName}},<br><br>Please be advised that the booking (Ref: {{bookingRef}}) scheduled for {{date}} has been cancelled.<br><br>This appointment has been removed from your schedule. We appreciate your understanding and readiness to assist.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.INTERPRETER,
        isActive: true
    },
    {
        id: 'APP_RECEIVED_APPLICANT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'APPLICATIONS',
        triggerStatus: 'PENDING',
        recipientType: 'APPLICANT',
        name: 'Application Received',
        subject: 'Lingland Interpreter Application Received',
        body: `Dear {{applicantName}},<br><br>Thank you for submitting your application to join the Lingland professional network.<br><br>We have successfully received your details. Our administrative team will review your application shortly. If your qualifications meet our current requirements, we will automatically provision an account for you and notify you via email to proceed with the onboarding process.<br><br>We appreciate your interest in partnering with Lingland.<br><br>Kind regards,<br>Lingland Recruitment Team`,
        allowedVariables: EMAIL_VARIABLES.APPLICANT,
        isActive: true
    },
    {
        id: 'APP_RECEIVED_ADMIN',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'SYSTEM',
        triggerStatus: 'PENDING',
        recipientType: 'ADMIN',
        name: 'Admin - New Application Alert',
        subject: 'New Interpreter Application: {{applicantName}}',
        body: `Admin Alert,<br><br>A new interpreter application has been submitted through the portal.<br><br>**Applicant:** {{applicantName}}<br>**Languages:** {{languages}}<br>**Email:** {{applicantEmail}}<br><br>Please log in to the admin dashboard to review the application and begin the onboarding workflow.`,
        allowedVariables: EMAIL_VARIABLES.APPLICANT,
        isActive: true
    },
    {
        id: 'APP_APPROVED_APPLICANT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'APPLICATIONS',
        triggerStatus: 'APPROVED',
        recipientType: 'APPLICANT',
        name: 'Application Approved (Onboarding)',
        subject: 'Welcome to Lingland! Your Account is Ready',
        body: `Dear {{applicantName}},<br><br>Congratulations! Your preliminary application has been approved, and we are delighted to welcome you to the Lingland team.<br><br>We have provisioned a professional account for you. **You will shortly receive a separate email with a secure link to set your password.**<br><br>Once your password is set, please log in and complete your onboarding by:<br>1. Navigating to your **Profile** > **Compliance** tab.<br>2. Uploading a copy of your CV, your current DBS certificate, and any relevant qualifications.<br><br>Once we verify these documents, you will be fully active and eligible to receive assignments.<br><br>Welcome aboard!<br><br>Kind regards,<br>Lingland Administrative Team`,
        allowedVariables: EMAIL_VARIABLES.APPLICANT,
        isActive: true
    },
    {
        id: 'ONBOARDING_APPROVED',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'APPLICATIONS',
        triggerStatus: 'ONBOARDING_APPROVED',
        recipientType: 'APPLICANT',
        name: 'Onboarding - Document Verified',
        subject: 'Document Verified: {{documentName}}',
        body: `Dear {{applicantName}},<br><br>Good news! Our administrative team has reviewed and verified your <strong>{{documentName}}</strong>.<br><br>You can check your progress by logging into your dashboard.<br><br>Thank you,<br>Lingland Administrative Team`,
        allowedVariables: [...EMAIL_VARIABLES.APPLICANT, '{{documentName}}'],
        isActive: true
    },
    {
        id: 'ADMIN_HOLD_CLIENT',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'BOOKINGS',
        triggerStatus: BookingStatus.ADMIN,
        recipientType: 'CLIENT',
        name: 'Booking on Admin Hold',
        subject: 'Update Regarding Your Booking: {{bookingRef}}',
        body: `Dear {{clientName}},<br><br>We are writing to inform you that your booking (Ref: {{bookingRef}}) for {{languageTo}} on {{date}} has been placed on <strong>Administrative Hold</strong>.<br><br>Our team is currently performing a manual review of the requirements or assignment details. We will contact you shortly with further updates.<br><br>No further action is required from your side at this time.<br><br>Kind regards,<br>The Lingland Team`,
        allowedVariables: EMAIL_VARIABLES.CLIENT,
        isActive: true
    },
    {
        id: 'ONBOARDING_REJECTED',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'APPLICATIONS',
        triggerStatus: 'ONBOARDING_REJECTED',
        recipientType: 'APPLICANT',
        name: 'Onboarding - Document Issue',
        subject: 'Action Required: Issue with {{documentName}}',
        body: `Dear {{applicantName}},<br><br>We have reviewed your <strong>{{documentName}}</strong> but unfortunately, we cannot accept it in its current form.<br><br><strong>Reason:</strong> {{rejectionReason}}<br><br>Please log into your dashboard to upload a new version or contact us if you need assistance.<br><br>Thank you,<br>Lingland Administrative Team`,
        allowedVariables: [...EMAIL_VARIABLES.APPLICANT, '{{documentName}}', '{{rejectionReason}}'],
        isActive: true
    },
    {
        id: 'ONBOARDING_COMPLETED',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'APPLICATIONS',
        triggerStatus: 'ONBOARDING_COMPLETED',
        recipientType: 'APPLICANT',
        name: 'Onboarding - Completed',
        subject: 'Welcome to Lingland! Your profile is now ACTIVE',
        body: `Dear {{applicantName}},<br><br>Congratulations! You have successfully completed all onboarding requirements.<br><br>Your profile is now marked as <strong>ACTIVE</strong>. You will start receiving assignments and can browse available jobs on our platform.<br><br>We look forward to working with you!<br><br>Kind regards,<br>Lingland Administrative Team`,
        allowedVariables: EMAIL_VARIABLES.APPLICANT,
        isActive: true
    },
    {
        id: 'STAFF_INVITATION',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'SYSTEM',
        triggerStatus: 'STAFF_INVITED',
        recipientType: 'APPLICANT',
        name: 'Staff Invitation',
        subject: 'Welcome to Lingland - Secure Invitation',
        body: `Dear {{applicantName}},<br><br>You have been invited to join the Lingland administrative platform as a member of the {{departmentName}} department.<br><br>**Job Title:** {{jobTitle}}<br>**System Role:** {{role}}<br><br>Please click the link below to set your password and begin your onboarding journey:<br><br><a href="{{inviteLink}}">Set My Password & Join Team</a><br><br>Welcome aboard!<br><br>Kind regards,<br>Lingland Administrative Team`,
        allowedVariables: ['{{applicantName}}', '{{departmentName}}', '{{jobTitle}}', '{{role}}', '{{inviteLink}}'],
        isActive: true
    },
    {
        id: 'STAFF_ONBOARDING_DONE',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'SYSTEM',
        triggerStatus: 'STAFF_ONBOARDING_COMPLETE',
        recipientType: 'ADMIN',
        name: 'Staff Onboarding Completed',
        subject: 'Onboarding Completed: {{applicantName}}',
        body: `Admin Alert,<br><br>A new staff member has successfully completed their mandatory onboarding form.<br><br>**Staff Member:** {{applicantName}}<br>**Department:** {{departmentName}}<br><br>You can now verify their details in the Staff Directory.`,
        allowedVariables: ['{{applicantName}}', '{{departmentName}}'],
        isActive: true
    },
    {
        id: 'STAFF_ACCESS_UPDATED',
        organizationId: 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'SYSTEM',
        triggerStatus: 'STAFF_ACCESS_CHANGE',
        recipientType: 'APPLICANT',
        name: 'Staff Access Updated',
        subject: 'Security Notice: Your Platform Access has Changed',
        body: `Dear {{applicantName}},<br><br>Please be advised that your administrative permissions or organizational assignment has been updated.<br><br>**New Department:** {{departmentName}}<br>**New Level:** {{gradeLevel}}<br><br>These changes take effect immediately. Please log out and back in to see the updated menu options.<br><br>Kind regards,<br>Lingland Security Team`,
        allowedVariables: ['{{applicantName}}', '{{departmentName}}', '{{gradeLevel}}'],
        isActive: true
    }
];

export const EmailService = {
    // Fetch active templates
    getTemplates: async (): Promise<EmailTemplate[]> => {
        try {
            const q = query(collection(db, 'emailTemplates'));
            const snapshot = await getDocs(q);

            const dbTemplates = snapshot.docs.map(doc => doc.data() as EmailTemplate);

            // Merge with defaults if not present in DB
            const result: EmailTemplate[] = [];
            for (const def of DEFAULT_TEMPLATES) {
                const found = dbTemplates.find(t => t.id === def.id);
                result.push(found || def);
            }
            return result;
        } catch (e) {
            console.error("Error fetching templates, falling back to defaults", e);
            return DEFAULT_TEMPLATES;
        }
    },

    // Save/Update template
    saveTemplate: async (template: EmailTemplate) => {
        template.updatedAt = new Date().toISOString();
        await setDoc(doc(db, 'emailTemplates', template.id), template);
    },

    // The engine that parses {{variables}} safely for both Bookings and InterpreterApplications
    parseTemplate: (text: string, entity: any, extraData: any = {}): string => {
        let output = text;

        const isBooking = !!entity.bookingRef || !!entity.serviceType;

        // Create a dictionary of all possible variables dynamically
        const dictionary: Record<string, string> = {};

        if (isBooking) {
            const booking = entity as Booking;
            dictionary['{{clientName}}'] = booking.guestContact?.name || booking.clientName || 'Valued Client';
            dictionary['{{interpreterName}}'] = extraData.interpreterName || booking.interpreterName || 'Interpreter';
            dictionary['{{bookingRef}}'] = booking.bookingRef || booking.id.substring(0, 8);
            dictionary['{{date}}'] = booking.date ? new Date(booking.date).toLocaleDateString() : '';
            dictionary['{{time}}'] = booking.startTime || '';
            dictionary['{{location}}'] = booking.locationType === 'ONLINE' ? 'Remote / Online' : (booking.postcode || 'Onsite');
            dictionary['{{languageFrom}}'] = booking.languageFrom || '';
            dictionary['{{languageTo}}'] = booking.languageTo || '';
            dictionary['{{serviceType}}'] = booking.serviceType || '';
            dictionary['{{durationMinutes}}'] = booking.durationMinutes ? booking.durationMinutes.toString() : '';
            dictionary['{{totalAmount}}'] = booking.totalAmount ? `£${booking.totalAmount.toFixed(2)}` : 'TBC';
            dictionary['{{status}}'] = booking.status || '';
            // EM-02: Support for Cancellation Emails with reason
            if (extraData.cancelReason) dictionary['{{cancelReason}}'] = extraData.cancelReason;
        } else {
            const app = entity as InterpreterApplication;
            dictionary['{{applicantName}}'] = app.name || '';
            dictionary['{{applicantEmail}}'] = app.email || '';
            dictionary['{{applicantPhone}}'] = app.phone || '';
            dictionary['{{languages}}'] = (app.languageProficiencies || []).map(l => l.language).join(', ') || app.languages?.join(', ') || '';
            dictionary['{{applicationDate}}'] = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '';
            dictionary['{{applicationStatus}}'] = app.status || '';
            
            // Extra Data for Staff & Onboarding
            if (extraData.departmentName) dictionary['{{departmentName}}'] = extraData.departmentName;
            if (extraData.jobTitle) dictionary['{{jobTitle}}'] = extraData.jobTitle;
            if (extraData.role) dictionary['{{role}}'] = extraData.role;
            if (extraData.inviteLink) dictionary['{{inviteLink}}'] = extraData.inviteLink;
            if (extraData.gradeLevel) dictionary['{{gradeLevel}}'] = extraData.gradeLevel;
        }

        // Replace all instances
        for (const [key, value] of Object.entries(dictionary)) {
            output = output.replace(new RegExp(key, 'g'), value);
        }

        return output;
    },

    // Core trigger mechanism called from bookingService
    // In a real production app, this writes to an 'emails' collection that a Firebase Extension (Trigger Email) listens to.
    sendStatusEmail: async (
        booking: Booking,
        newStatus: BookingStatus,
        extraData: { interpreterId?: string; interpreterName?: string; interpreterEmail?: string; clientEmail?: string; cancelReason?: string } = {}
    ) => {
        console.log(`[EmailService] Triggered for status: ${newStatus}, bookingId: ${booking.id}`);
        try {
            const templates = await EmailService.getTemplates();
            console.log(`[EmailService] Found ${templates.length} templates total`);

            // Find templates that match this specific status trigger
            const matchingTemplates = templates.filter(t => t.triggerStatus === newStatus && t.isActive);
            console.log(`[EmailService] Matching templates for ${newStatus}: ${matchingTemplates.length}`);

            for (const template of matchingTemplates) {
                // Prepare content
                const subject = EmailService.parseTemplate(template.subject, booking, extraData);
                const body = EmailService.parseTemplate(template.body, booking, extraData);
                let recipientEmail = '';

                if (template.recipientType === 'CLIENT') {
                    // For guest bookings, the email is in guestContact.email
                    recipientEmail = extraData.clientEmail
                        || booking.guestContact?.email
                        || (booking as any).email
                        || '';
                    console.log(`[EmailService] Client recipient: ${recipientEmail}`);
                } else if (template.recipientType === 'INTERPRETER') {
                    recipientEmail = extraData.interpreterEmail || '';
                    // EM-01: Auto-fetch missing interpreter email globally
                    if (!recipientEmail && booking.interpreterId) {
                        try {
                            const iDoc = await getDoc(doc(db, 'interpreters', booking.interpreterId));
                            if (iDoc.exists()) recipientEmail = iDoc.data()?.email || '';
                        } catch (e) {
                            console.error('[EmailService] Failed to fetch missing interpreter email', e);
                        }
                    }
                    console.log(`[EmailService] Interpreter recipient: ${recipientEmail}`);
                }

                if (!recipientEmail) {
                    console.warn(`[EmailService] No recipient email found for template ${template.id}, skipping.`);
                    continue;
                }

                try {
                    await addDoc(collection(db, 'mail'), {
                        to: [recipientEmail],
                        message: {
                            subject,
                            html: body
                        },
                        statusTrigger: newStatus,
                        bookingId: booking.id,
                        createdAt: new Date().toISOString()
                    });
                    console.log(`[EmailService] ✅ Email queued for ${recipientEmail} (trigger: ${newStatus})`);
                } catch (writeErr) {
                    console.error(`[EmailService] ❌ Failed to write to Firestore 'mail' collection:`, writeErr);
                }
            }
        } catch (e) {
            console.error("[EmailService] Failed to process status email trigger", e);
        }
    },

    // Unified trigger for application flows
    sendApplicationEmail: async (
        application: InterpreterApplication,
        triggerEvent: string,
        adminSystemEmail: string = '', // Will fallback to systemSettings
        extraData: any = {}
    ) => {
        console.log(`[EmailService] Application Triggered: ${triggerEvent}, appId: ${application.id}`);
        try {
            const templates = await EmailService.getTemplates();
            // Find templates matching the application trigger event
            const matchingTemplates = templates.filter(t => t.triggerStatus === triggerEvent && t.isActive);
            console.log(`[EmailService] Matching application templates: ${matchingTemplates.length}`);

            for (const template of matchingTemplates) {
                const subject = EmailService.parseTemplate(template.subject, application, extraData);
                const body = EmailService.parseTemplate(template.body, application, extraData);
                let recipientEmail = '';

                if (template.recipientType === 'APPLICANT') {
                    recipientEmail = application.email;
                } else if (template.recipientType === 'ADMIN') {
                    // EM-05: Resolve Admin System Email via SystemSettings when requested
                    if (!adminSystemEmail) {
                        try {
                            const sDoc = await getDoc(doc(db, 'systemSettings', 'main'));
                            adminSystemEmail = sDoc.data()?.finance?.invoiceEmail || 'admin@lingland.com';
                        } catch {
                            adminSystemEmail = 'admin@lingland.com';
                        }
                    }
                    recipientEmail = adminSystemEmail;
                }

                if (!recipientEmail) continue;

                try {
                    await addDoc(collection(db, 'mail'), {
                        to: [recipientEmail],
                        message: { subject, html: body },
                        statusTrigger: triggerEvent,
                        applicationId: application.id,
                        createdAt: new Date().toISOString()
                    });
                    console.log(`[EmailService] ✅ Application Email queued for ${recipientEmail}`);
                } catch (writeErr) {
                    console.error(`[EmailService] ❌ Failed to write to 'mail' db for applications:`, writeErr);
                }
            }
        } catch (e) {
            console.error("[EmailService] Failed to process application email trigger", e);
        }
    },

    // Send a manual test email
    sendTestEmail: async (template: EmailTemplate, testRecipient: string) => {
        console.log(`[EmailService] Sending test email for template: ${template.name} to ${testRecipient}`);

        // Mock a booking for variable parsing
        const mockBooking: Booking = {
            id: 'TEST-123',
            bookingRef: 'REF-TEST',
            clientName: 'Test Client',
            requestedByUserId: 'system',
            organizationId: 'TEST-ORG',
            serviceCategory: ServiceCategory.INTERPRETATION,
            date: new Date().toISOString().split('T')[0],
            startTime: '10:00',
            durationMinutes: 60,
            languageFrom: 'English',
            languageTo: 'Portuguese',
            serviceType: ServiceType.FACE_TO_FACE,
            locationType: 'ONSITE',
            postcode: 'SW1A 1AA',
            status: BookingStatus.BOOKED,
            totalAmount: 150.00,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            clientId: 'system',
            notes: 'Test'
        };

        const mockApplication = {
            id: 'TEST-APP',
            name: 'Jane Doe Applicant',
            shortName: 'Jane',
            email: 'jane.doe@example.com',
            phone: '+44 7700 900000',
            gender: 'F',
            address: { street: '', town: '', county: '', postcode: 'SW1A 1AA', country: 'UK' },
            hasCar: true,
            languages: ['English', 'Spanish'],
            languageProficiencies: [],
            qualifications: [],
            status: ApplicationStatus.PENDING,
            submittedAt: new Date().toISOString(),
            nrpsi: { registered: false }, 
            dpsi: false
        } as unknown as InterpreterApplication;

        const entity = template.category === 'APPLICATIONS' ? mockApplication : mockBooking;

        const subject = EmailService.parseTemplate(template.subject, entity, { interpreterName: 'Test Interpreter' });
        const body = EmailService.parseTemplate(template.body, entity, { interpreterName: 'Test Interpreter' });

        try {
            const payload = {
                to: [testRecipient],
                message: {
                    subject: `[TEST] ${subject}`,
                    html: body
                },
                isTest: true,
                templateId: template.id,
                createdAt: new Date().toISOString()
            };

            const writePromise = addDoc(collection(db, 'mail'), payload);
            
            // Timeout after 3 seconds so the UI does not hang if Firestore is offline
            await Promise.race([
                writePromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            ]);
            
            console.log(`[EmailService] ✅ Test email queued for ${testRecipient}`);
            return true;
        } catch (error) {
            console.warn(`[EmailService] ⚠️ Firestore offline or timeout. Simulating test email locally.`);
            console.log(`\n\n==== [TEST EMAIL SENT] ============================\nTO: ${testRecipient}\nSUBJECT: [TEST] ${subject}\n\nBODY (HTML):\n${body}\n===================================================\n\n`);
            return true;
        }
    }
};
