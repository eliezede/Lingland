// Define all core types and enums for the Lingland platform

export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  INTERPRETER = 'INTERPRETER'
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  profileId?: string;
}

export enum ServiceType {
  FACE_TO_FACE = 'Face-to-Face',
  VIDEO = 'Video Call',
  TELEPHONE = 'Telephone',
  TRANSLATION = 'Translation',
  BSL = 'British Sign Language'
}

export enum BookingStatus {
  REQUESTED = 'REQUESTED',
  OFFERED = 'OFFERED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  INVOICED = 'INVOICED',
  PAID = 'PAID'
}

export enum AssignmentStatus {
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED'
}

export interface Booking {
  id: string;
  clientId: string;
  clientName: string;
  requestedByUserId: string;
  serviceType: ServiceType;
  languageFrom: string;
  languageTo: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  locationType: 'ONSITE' | 'ONLINE';
  address?: string;
  postcode?: string;
  onlineLink?: string;
  status: BookingStatus;
  costCode?: string;
  notes?: string;
  interpreterId?: string;
  interpreterName?: string;
  bookingRef?: string;
  expectedEndTime?: string;
  createdAt?: any;
  updatedAt?: any;
  caseType?: string;
  genderPreference?: 'Male' | 'Female' | 'None';
  guestContact?: GuestContact;
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

export interface Client {
  id: string;
  companyName: string;
  billingAddress: string;
  paymentTermsDays: number;
  contactPerson: string;
  email: string;
  defaultCostCodeType: 'PO' | 'Cost Code' | 'Client Name';
}

export interface Interpreter {
  id: string;
  name: string;
  email: string;
  phone: string;
  languages: string[];
  regions: string[];
  qualifications: string[];
  status: 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED';
  isAvailable: boolean;
  dbsExpiry: string;
  addressLine1?: string;
  postcode?: string;
  dbsDocumentUrl?: string;
  unavailableDates?: string[];
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

export interface Timesheet {
  id: string;
  bookingId: string;
  interpreterId: string;
  clientId: string;
  submittedAt: string;
  actualStart: string;
  actualEnd: string;
  breakDurationMinutes: number;
  adminApproved: boolean;
  adminApprovedAt?: string;
  status: 'SUBMITTED' | 'APPROVED' | 'INVOICED';
  readyForClientInvoice: boolean;
  readyForInterpreterInvoice: boolean;
  unitsBillableToClient: number;
  unitsPayableToInterpreter: number;
  totalClientAmount?: number;
  totalInterpreterAmount?: number;
  clientAmountCalculated: number;
  interpreterAmountCalculated: number;
  clientInvoiceId?: string;
  interpreterInvoiceId?: string;
  supportingDocumentUrl?: string;
}

export interface ClientInvoice {
  id: string;
  clientId: string;
  clientName: string;
  reference: string;
  invoiceNumber?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    description: string;
    units: number;
    rate: number;
    total: number;
    quantity?: number;
  }>;
}

export interface InterpreterInvoice {
  id: string;
  interpreterId: string;
  interpreterName: string;
  model: 'UPLOAD' | 'SELF_BILL';
  status: InvoiceStatus;
  externalInvoiceReference?: string;
  totalAmount: number;
  issueDate: string;
  items: Array<{
    description: string;
    total: number;
  }>;
  currency: string;
  uploadedPdfUrl?: string;
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
  email: string;
  phone: string;
  postcode: string;
  languages: string[];
  qualifications: string[];
  dbsNumber?: string;
  experienceSummary: string;
  status: ApplicationStatus;
  submittedAt: string;
}

export interface SystemSettings {
  general: {
    companyName: string;
    supportEmail: string;
    businessAddress: string;
    websiteUrl: string;
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
}

export interface GuestContact {
  name: string;
  organisation: string;
  email: string;
  phone: string;
  billingEmail?: string;
}

export enum NotificationType {
  INFO = 'INFO',
  JOB_OFFER = 'JOB_OFFER',
  PAYMENT = 'PAYMENT',
  CHAT = 'CHAT',
  SYSTEM = 'SYSTEM'
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
  lastMessage?: string;
  lastMessageAt?: string;
  bookingId?: string;
  unreadCount: Record<string, number>;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}
