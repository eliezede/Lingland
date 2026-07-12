
import * as admin from 'firebase-admin';

admin.initializeApp();

export * from './billing/onTimesheetAdminApproved';
export * from './billing/generateClientInvoice';
export * from './billing/generateInterpreterInvoices';
export * from './billing/updateClientInvoiceStatus';
export * from './billing/manageInterpreterInvoices';
export * from './billing/recordManualClientInvoice';
export * from './billing/submitTimesheet';
export * from './mail/onEmailCreated';
export * from './auth/onUserCreated';
export * from './airtable/onAirtableFormSubmit';
export * from './airtable/redbookSync';
export * from './airtable/syncInterpreters';
export * from './jobs/respondToAssignment';
export * from './jobs/recordInterpreterAttendance';
export * from './jobs/clientBookingActions';
export * from './jobs/createAdminBooking';
export * from './jobs/adminAssignmentActions';
export * from './jobs/adminUpdateBookingStatus';
export * from './admin/deletePlatformEntity';
export * from './notifications/onNotificationCreated';
export * from './notifications/onTimesheetSubmit'; // NT-05: Notify admins + interpreter on timesheet creation
export * from './notifications/onBookingOffer';
export * from './notifications/onAssignmentOffer';
export * from './notifications/onOfferDeclined';
export * from './notifications/createNotification';
export * from './notifications/onMessageCreated';
export * from './communications/createSupportThread';
export * from './cron/dbsExpiryCheck'; // ON-03: Daily cron for DBS expiry alerts
export * from './public/submitPublicIntake';
export * from './audit/onCriticalChange';
export * from './audit/createAuditHealthCheck';
