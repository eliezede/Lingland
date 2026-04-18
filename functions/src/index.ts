
import * as admin from 'firebase-admin';

admin.initializeApp();

export * from './billing/onTimesheetAdminApproved';
export * from './billing/generateClientInvoice';
export * from './billing/generateInterpreterInvoices';
export * from './mail/onEmailCreated';
export * from './auth/onUserCreated';
export * from './airtable/onAirtableFormSubmit';
export * from './notifications/onNotificationCreated';
export * from './notifications/onTimesheetSubmit'; // NT-05: Notify admins + interpreter on timesheet creation
export * from './notifications/onBookingOffer';
export * from './notifications/onAssignmentOffer';
export * from './notifications/onOfferDeclined';
export * from './cron/dbsExpiryCheck'; // ON-03: Daily cron for DBS expiry alerts
