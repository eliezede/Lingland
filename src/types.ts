// Define all core types and enums for the Lingland platform
import { ServiceType, AssignmentStatus, GuestContact, Currency } from './shared/types/common';
import { TenantScopedEntity } from './shared/types/baseEntity';
import { JobStatus } from './domains/jobs/status';
import { Job, JobAssignment } from './domains/jobs/types';
import { allowedTransitions, canTransition } from './domains/jobs/stateMachine';
import { JobEventType, JobEvent } from './domains/jobs/jobEvents';

export type {
  GuestContact,
  Currency,
  JobStatus,
  Job,
  JobAssignment,
  JobEventType,
  JobEvent
};

export {
  ServiceType,
  AssignmentStatus,
  allowedTransitions,
  canTransition
};

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // Can manage global settings, system views, and all admin functions
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  INTERPRETER = 'INTERPRETER'
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  photoUrl?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'IMPORTED';
  profileId?: string;
  staffProfileId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  createdAt: string;
}

export interface JobTitle {
  id: string;
  name: string;
  departmentId: string;
  level?: number;
  createdAt: string;
}

export interface StaffProfile {
  id: string;
  userId: string;
  jobTitleId: string;
  departmentId: string;
  phone?: string;
  photoUrl?: string;
  dob?: string;
  niNumber?: string;
  address?: {
    houseNumber?: string;
    street: string;
    town: string;
    county: string;
    postcode: string;
    lat?: number;
    lng?: number;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: 'en' | 'pt';
    notifications: boolean;
    compactMode?: boolean;
  };
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum ServiceCategory {
  INTERPRETATION = 'INTERPRETATION',
  TRANSLATION = 'TRANSLATION'
}

export enum SessionMode {
  F2F = 'Face-to-Face',
  VIDEO = 'Videocall',
  PHONE = 'Over the Phone',
  CANCELLATION = 'cancellation fees'
}

export enum SageCode {
  I001 = 'I001', // Standard F2F
  I002 = 'I002', // Standard Video
  I003 = 'I003', // Standard Phone
  I007 = 'I007', // OOH F2F
  I008 = 'I008', // OOH Video
  I009 = 'I009', // OOH Phone
  I010 = 'I010', // Special
  I013 = 'I013', // Travel Time
  I014 = 'I014'  // Mileage
}

export enum BookingStatus {
  DRAFT = 'DRAFT',
  INCOMING = 'INCOMING', // Initial state
  NEEDS_ASSIGNMENT = 'NEEDS_ASSIGNMENT',
  ASSIGNMENT_PENDING = 'ASSIGNMENT_PENDING',
  OPENED = 'OPENED', // Interpreter assigned but hasn't accepted
  QUOTE_PENDING = 'QUOTE_PENDING',
  BOOKED = 'BOOKED', // Interpreter accepted
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  ADMIN = 'ADMIN', // Manual standby by admin
  ADMIN_HOLD = 'ADMIN_HOLD',
  CANCELLED = 'CANCELLED',
  TIMESHEET_SUBMITTED = 'TIMESHEET_SUBMITTED', // Job done, timesheet submitted, awaiting admin verification
  TIMESHEET_VERIFIED = 'TIMESHEET_VERIFIED',
  READY_FOR_INVOICE = 'READY_FOR_INVOICE', // Verified, ready for invoicing
  INVOICING = 'INVOICING',
  INVOICED = 'INVOICED', // Invoice generated
  PAID = 'PAID' // Invoice paid
}

export type OperatingMode = 'AIRTABLE_MIRROR' | 'HYBRID' | 'PLATFORM_LIVE';
export type CommunicationMode = 'SUPPRESSED' | 'INTERNAL_ONLY' | 'SELECTIVE_LIVE' | 'LIVE';
export type SourceOfTruth = 'AIRTABLE' | 'HYBRID' | 'PLATFORM';
export type AirtableImportMode = 'ON' | 'READ_ONLY' | 'OFF';
export type BookingSourceSystem = 'AIRTABLE' | 'STAFF_MANUAL' | 'CLIENT_PORTAL' | 'INTERPRETER_APP' | 'PLATFORM';
export type BookingSyncStatus = 'SYNCED' | 'LOCAL_ONLY' | 'CONFLICT' | 'ARCHIVED';

export interface PlatformModeSettings {
  operatingMode: OperatingMode;
  communicationMode: CommunicationMode;
  sourceOfTruth: SourceOfTruth;
  airtableImportMode: AirtableImportMode;
  hybridOperationsEnabled: boolean;
  jobNumbering: {
    prefix: string;
    year: number;
    nextSequence: number;
    displayIncludesLanguage: boolean;
  };
}


export interface Booking {
  id: string;
  clientId: string;
  clientName: string;
  requestedByUserId: string;
  organizationId: string;
  serviceCategory: ServiceCategory;
  serviceType: string; // e.g. "Legal", "Medical"
  languageFrom: string;
  languageTo: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  locationType: 'ONSITE' | 'ONLINE';
  location?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  onlineLink?: string;
  status: BookingStatus;
  costCode?: string;
  notes?: string;
  interpreterId?: string;
  interpreterName?: string;
  interpreterPhotoUrl?: string;
  bookingRef?: string;
  jobNumber?: string;
  displayRef?: string;
  legacyPlatformRef?: string;
  legacyAirtableRef?: string;
  sourceSystem?: BookingSourceSystem;
  sourceRecordId?: string;
  lastSyncedAt?: string;
  syncStatus?: BookingSyncStatus;
  expectedEndTime?: string;
  createdAt?: any;
  updatedAt?: any;
  caseType?: string;
  genderPreference?: 'Male' | 'Female' | 'None';
  guestContact?: GuestContact;
  currency?: string;
  priority?: 'High' | 'Normal' | 'Low';
  totalAmount?: number;
  timesheetId?: string | null;
  timesheetStatus?: Timesheet['status'] | string;
  timesheetSubmittedAt?: string;
  timesheetVerifiedAt?: string;
  billingReadyAt?: string;
  clientInvoiceId?: string | null;
  clientInvoiceNumber?: string;
  clientInvoiceReference?: string;
  interpreterInvoiceId?: string | null;
  interpreterInvoiceNumber?: string;
  interpreterInvoiceReference?: string;
  paymentStatus?: 'NOT_READY' | 'READY_FOR_INVOICE' | 'INVOICED' | 'PAID' | 'ISSUE';
  invoicedAt?: string;
  paidAt?: string;
  billingIssueFlag?: boolean;
  billingIssueReason?: string;
  billingIssueRaisedAt?: string;
  endTime?: string;
  patientReference?: string;
  adminNotes?: string;
  // Translation-specific fields
  translationFormat?: string;
  translationFormatOther?: string;
  quoteRequested?: boolean;
  sourceFiles?: Array<string | { name?: string; url?: string }>;
  deliveryEmail?: string;
  gdprConsent?: boolean;
  agreedToTerms?: boolean;
  professionalName?: string;
  patientName?: string;
  isOOH?: boolean;
  sageCode?: SageCode;
  sessionMode?: SessionMode;
}

export interface BookingAssignment {
  id: string;
  bookingId: string;
  interpreterId: string;
  status: AssignmentStatus;
  offeredAt: string;
  respondedAt?: string;
  bookingSnapshot?: Partial<Booking>;
}

export interface Client extends TenantScopedEntity {
  companyName: string;
  billingAddress: string;
  paymentTermsDays: number;
  contactPerson: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  status?: 'ACTIVE' | 'GUEST' | 'SUSPENDED';
  defaultCostCodeType: 'PO' | 'Cost Code' | 'Client Name';
}

export interface LanguageProficiency {
  language: string;
  l1: number; // 1 to 15 (priority)
  translateOrder: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'no';
}

export interface InterpreterRates {
  pricing?: string;
  ratesType: 'Lingland Rates' | 'Special Rates';
  f2fRate: number;
  stF2F: number;
  stVideo: number;
  stPhone: number;
  oohF2F: number;
  oohVideo: number;
  oohPhone: number;
  spRatesInt: number;
  travelTimeST: number;
  mileageST: number;
}

export type OnboardingDocStatus = 'MISSING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED';

export interface BankDetails {
  accountName: string;
  accountNumber: string; // 8 digits in UK
  sortCode: string;      // 00-00-00 format
  bankName?: string;
}

export interface Interpreter extends TenantScopedEntity {
  // Identification
  name: string;
  shortName?: string;
  photoUrl?: string;
  joinedDate?: string;
  
  // Personal Data
  email: string;
  phone: string;
  homePhone?: string;
  gender: 'M' | 'F' | 'O';
  address: {
    houseNumber?: string;
    street: string;
    town: string;
    county: string;
    postcode: string;
    country: string;
    lat?: number;
    lng?: number;
  };
  hasCar: boolean;
  skypeId?: string;

  // Language & Priority
  languages: string[]; // Keep for legacy/compat
  regions: string[];
  languageProficiencies: LanguageProficiency[];
  
  // Status & Activity
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'UNRELIABLE' | 'ONLY_TRANSL' | 'APPLICANT' | 'ONBOARDING' | 'SUSPENDED' | 'BLOCKED' | 'IMPORTED';
  activationEmailSentAt?: string;
  keyInterpreter: boolean;
  nhsLevel?: 'Level 1' | 'Level 2' | 'Level 3';

  // DBS & Checks
  dbs: {
    level: 'DBS' | 'S-DBS' | 'CRB' | 'N/A' | 'FAILED';
    issuedDate?: string;
    number?: string;
    autoRenew: boolean;
    renewDate?: string;
    notes?: string;
  };

  // Qualifications & Registration
  qualifications: string[];
  nrpsi: {
    registered: boolean;
    number?: string;
  };
  dpsi: boolean;
  experience?: string;
  documentUrls: string[]; // For scanned docs

  // Badge & ID
  badge: {
    idStatus: 'In use' | 'Being made' | 'Not made yet' | 'Not needed/Other' | 'collected/returned';
    issuedDate?: string;
  };
  registrationDate?: string;

  // Work Checks & Forms (signed/completed)
  inductionsCompleted: string[]; // MS Teams, Skype, Training with other staff
  workChecksCompleted: string[]; // CV, Interviewed, Passport checked, Reference 1, Reference 2, Right to work UK
  workFormsSigned: string[]; // Code of Conduct, IR Disclaimer
  otherPaperwork: string[]; // added mobile to office, sent welcome letter, etc.

  // Rates
  rates: InterpreterRates;

  // Payments & Finance (UK BACS)
  bankDetails?: BankDetails;

  // Auxiliary
  notes?: string;
  isAvailable: boolean; // Keep for legacy/UI

  // Legacy & Compatibility fields (used by frontend forms)
  postcode?: string; // Flat postcode field (mirrors address.postcode)
  addressLine1?: string; // Flat address line (mirrors address.street)
  dbsExpiry?: string; // DBS expiry shorthand (mirrors dbs.renewDate)
  dbsDocumentUrl?: string; // Direct DBS doc URL (mirrors documentUrls[0])
  unavailableDates?: string[]; // Dates interpreter marked as unavailable
  acceptsDirectAssignment?: boolean; // Whether interpreter accepts direct booking

  // Onboarding Tracking
  onboarding?: {
    dbs: { url?: string; status: OnboardingDocStatus; notes?: string };
    idCheck: { url?: string; status: OnboardingDocStatus; notes?: string };
    certifications: { urls?: string[]; status: OnboardingDocStatus; notes?: string };
    rightToWork: { 
      type?: 'BRP' | 'SHARE_CODE';
      url?: string; 
      shareCode?: string;
      status: OnboardingDocStatus; 
      notes?: string 
    };
    overallStatus: 'DOCUMENTS_PENDING' | 'IN_REVIEW' | 'INTERVIEW_PENDING' | 'COMPLETED';
  };
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  SUBMITTED = 'SUBMITTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  APPROVED = 'APPROVED'
}

export type TimesheetSource = 'INTERPRETER_APP' | 'STAFF_MANUAL' | 'AIRTABLE_MIRROR' | 'SYSTEM_IMPORT';

export interface Timesheet extends TenantScopedEntity {
  bookingId: string;
  interpreterId: string;
  clientId: string;
  submittedAt: string;
  sessionMode: SessionMode;
  actualStart: string;
  actualEnd: string;
  sessionDurationMinutes: number;
  sessionFees: number;
  travelTimeMinutes?: number;
  travelFees?: number;
  mileage?: number;
  mileageFees?: number;
  parking?: number;
  transport?: number;
  totalToPay: number;
  breakDurationMinutes: number;
  
  // Translation-specific billing fields
  wordCount?: number;
  unitPrice?: number;
  units?: 'words' | 'pages' | 'documents' | 'hours';
  interpreterAmountCalculated?: number;
  clientAmountCalculated?: number;

  adminApproved: boolean;
  adminApprovedAt?: string;
  status: 'SUBMITTED' | 'APPROVED' | 'INVOICING' | 'INVOICED';
  readyForClientInvoice: boolean;
  readyForInterpreterInvoice: boolean;
  unitsBillableToClient: number;
  unitsPayableToInterpreter: number;
  clientInvoiceId?: string | null;
  interpreterInvoiceId?: string | null;
  nonExecutionReason?: string;
  billableCancellation?: boolean;
  exceptionType?: 'CANCELLATION' | 'NO_SHOW' | 'DID_NOT_ATTEND';
  supportingDocumentUrl?: string;
  clientSignatureUrl?: string;
  clientNameSigned?: string;
  interpreterPhotoUrl?: string;
  source?: TimesheetSource;
  recordedByStaff?: boolean;
}

export type FiscalCategory =
  | 'INTERPRETING_SERVICES'
  | 'TRANSLATION_SERVICES'
  | 'TRAVEL_TIME'
  | 'MILEAGE'
  | 'CANCELLATION_FEE'
  | 'LATE_NOTICE_FEE'
  | 'ADMIN_FEE'
  | 'ADDITIONAL_EXPENSES';

export interface ClientInvoiceItem {
  id: string;
  category: FiscalCategory;
  description: string;
  units: number;
  rate: number;
  total: number;
  quantity?: number;
  taxable?: boolean;
}

export interface InterpreterPaymentItem {
  id: string;
  category: FiscalCategory;
  description: string;
  units: number;
  rate: number;
  total: number;
  taxable?: boolean;
}

export interface ClientInvoice extends TenantScopedEntity {
  clientId: string;
  clientName: string;
  reference: string;
  invoiceNumber?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal?: number;
  vatRate?: number;
  vatAmount?: number;
  totalAmount: number;
  currency: string;
  items: ClientInvoiceItem[];
}

export interface InterpreterInvoice extends TenantScopedEntity {
  interpreterId: string;
  interpreterName: string;
  model: 'UPLOAD' | 'SELF_BILL';
  status: InvoiceStatus;
  externalInvoiceReference?: string;
  totalAmount: number;
  issueDate: string;
  items: InterpreterPaymentItem[];
  currency: string;
  uploadedPdfUrl?: string;
  interpreterPhotoUrl?: string;
}

export interface Rate {
  id: string;
  rateType: 'CLIENT' | 'INTERPRETER';
  serviceType: ServiceType;
  amountPerUnit: number;
  minimumUnits: number;
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface InterpreterApplication {
  id: string;
  name: string;
  shortName?: string;
  email: string;
  phone: string;
  photoUrl?: string;
  gender: 'M' | 'F' | 'O';
  address: {
    houseNumber?: string;
    street: string;
    town: string;
    county: string;
    postcode: string;
    country: string;
    lat?: number;
    lng?: number;
  };
  hasCar: boolean;
  skypeId?: string;
  languageProficiencies: LanguageProficiency[];
  languages: string[]; // For backward compatibility
  qualifications: string[];
  nrpsi: {
    registered: boolean;
    number?: string;
  };
  dpsi: boolean;
  dbsNumber?: string;
  experienceSummary: string;
  cvUrl?: string;
  status: ApplicationStatus;
  submittedAt: string;
}

export interface SystemSettings {
  general: {
    companyName: string;
    supportEmail: string;
    businessAddress: string;
    websiteUrl: string;
    portalUrl: string; // Added to handle system-generated links (activation, etc.)
    logoUrl?: string;
  };
  finance: {
    currency: string;
    vatRate: number;
    vatNumber: string;
    invoicePrefix: string;
    nextInvoiceNumber: number;
    paymentTermsDays: number;
    invoiceFooterText: string;
  };
  operations: {
    minBookingDurationMinutes: number;
    cancellationWindowHours: number;
    timeIncrementMinutes: number;
    defaultOnlinePlatformUrl: string;
  };
  masterData: {
    activeServiceTypes: ServiceType[];
    priorityLanguages: string[];
  };
  platformMode?: PlatformModeSettings;
}


export enum NotificationType {
  INFO = 'INFO',
  JOB_OFFER = 'JOB_OFFER',
  PAYMENT = 'PAYMENT',
  CHAT = 'CHAT',
  SYSTEM = 'SYSTEM',
  URGENT = 'URGENT',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING'
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface ChatThread {
  id: string;
  participants: string[]; // uids
  participantNames: Record<string, string>;
  participantPhotos?: Record<string, string>;
  lastMessage?: string;
  lastMessageAt?: string;
  bookingId?: string;
  departmentId?: string;
  type?: 'DIRECT' | 'BOOKING' | 'DEPARTMENT';
  unreadCount: Record<string, number>;
  metadata?: any;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  fileUrl?: string;
  fileType?: 'IMAGE' | 'DOCUMENT';
}

export interface ViewFilter {
  statuses?: BookingStatus[];
  dateRange?: 'TODAY' | 'TOMORROW' | 'NEXT_7_DAYS' | 'THIS_MONTH' | 'ALL';
  interpreterId?: string;
  hasInterpreter?: boolean;
  serviceCategory?: ServiceCategory;
}

export type SortableField = 'date' | 'status' | 'client' | 'interpreter' | 'languageTo' | 'duration' | 'amount' | 'serviceCategory';
export type FilterableField = 'status' | 'languageTo' | 'serviceType' | 'serviceCategory' | 'locationType' | 'interpreterId' | 'date' | 'clientName' | 'costCode' | 'totalAmount';
export type GroupableField = 'status' | 'languageTo' | 'serviceType' | 'serviceCategory' | 'locationType' | 'date' | 'client' | 'interpreter';
export type BookingWorkspace = 'operations' | 'finance';

export type BookingColumnField =
  | 'ref' | 'date' | 'time' | 'client' | 'languageFrom' | 'languageTo'
  | 'serviceType' | 'serviceCategory' | 'wordCount' | 'duration' | 'location' | 'interpreter' | 'status' | 'amount';

export const ALL_BOOKING_COLUMNS: { field: BookingColumnField; label: string }[] = [
  { field: 'ref', label: 'Reference' },
  { field: 'date', label: 'Date' },
  { field: 'time', label: 'Time' },
  { field: 'client', label: 'Client' },
  { field: 'languageFrom', label: 'From Language' },
  { field: 'languageTo', label: 'To Language' },
  { field: 'serviceCategory', label: 'Service' },
  { field: 'serviceType', label: 'Service Type' },
  { field: 'wordCount', label: 'Word Count' },
  { field: 'duration', label: 'Duration' },
  { field: 'location', label: 'Location' },
  { field: 'interpreter', label: 'Interpreter' },
  { field: 'status', label: 'Status' },
  { field: 'amount', label: 'Amount' },
];

export interface ViewSortRule {
  field: SortableField;
  direction: 'asc' | 'desc';
}

export interface ViewFilterRule {
  id: string;
  field: FilterableField;
  operator: 'is' | 'isNot' | 'contains' | 'isBetween' | 'isAfter' | 'isBefore';
  value: any;
}

export type BookingViewScope = 'SYSTEM' | 'TEAM' | 'PERSONAL';

export interface BookingView {
  id: string;
  name: string;
  icon?: string;
  isSystem?: boolean;
  isFavorite?: boolean;
  workspace?: BookingWorkspace;
  viewScope?: BookingViewScope;
  ownerId?: string;
  // Legacy (kept for backward compat)
  filters: ViewFilter;
  sortBy: 'dateAsc' | 'dateDesc' | 'status' | 'client';
  // Advanced customization
  hiddenFields?: BookingColumnField[];
  hiddenColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  pinnedColumns?: string[];
  filterRules?: ViewFilterRule[];
  groupBy?: GroupableField | '';
  sortRules?: ViewSortRule[];
}

export interface EmailTemplate extends TenantScopedEntity {
  category: 'BOOKINGS' | 'APPLICATIONS' | 'INVOICING' | 'SYSTEM';
  triggerStatus: BookingStatus | string; // Extended to support ApplicationStatus string
  recipientType: 'CLIENT' | 'INTERPRETER' | 'ADMIN' | 'APPLICANT';
  name: string;
  subject: string;
  body: string; // Markdown or HTML content
  allowedVariables: string[]; // e.g., ['{{clientName}}', '{{interpreterName}}', '{{bookingRef}}']
  isActive: boolean;
}

export const EMAIL_VARIABLES = {
  CLIENT: ['{{clientName}}', '{{bookingRef}}', '{{date}}', '{{time}}', '{{location}}', '{{languageFrom}}', '{{languageTo}}', '{{serviceType}}', '{{durationMinutes}}', '{{totalAmount}}'],
  INTERPRETER: ['{{interpreterName}}', '{{bookingRef}}', '{{date}}', '{{time}}', '{{location}}', '{{languageFrom}}', '{{languageTo}}', '{{serviceType}}', '{{durationMinutes}}'],
  ADMIN: ['{{clientName}}', '{{interpreterName}}', '{{bookingRef}}', '{{status}}'],
  APPLICANT: ['{{applicantName}}', '{{applicantEmail}}', '{{applicantPhone}}', '{{languages}}', '{{applicationDate}}', '{{applicationStatus}}']
};

export enum SystemModule {
  DASHBOARD = 'DASHBOARD',
  BOOKINGS = 'BOOKINGS',
  INTERPRETERS = 'INTERPRETERS',
  CLIENTS = 'CLIENTS',
  FINANCE = 'FINANCE',
  MESSAGES = 'MESSAGES',
  RECRUITMENT = 'RECRUITMENT',
  STAFF_MGMT = 'STAFF_MGMT',
  SYSTEM_CONFIG = 'SYSTEM_CONFIG',
  AUDIT_LOGS = 'AUDIT_LOGS'
}

export interface LevelPermission {
  level: number;
  modules: SystemModule[];
}
