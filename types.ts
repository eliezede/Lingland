
export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  INTERPRETER = 'INTERPRETER'
}

export enum BookingStatus {
  REQUESTED = 'REQUESTED',
  SEARCHING = 'SEARCHING',
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
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED'
}

export enum ServiceType {
  FACE_TO_FACE = 'Face-to-Face',
  VIDEO = 'Video Remote',
  TELEPHONE = 'Telephone',
  TRANSLATION = 'Translation',
  BSL = 'BSL'
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
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

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  profileId?: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface Client {
  id: string;
  companyName: string;
  billingAddress: string;
  paymentTermsDays: number;
  contactPerson: string;
  email: string;
  defaultCostCodeType: 'PO' | 'ICS' | 'Cost Code';
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
  dbsDocumentUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  avatarUrl?: string;
  unavailableDates?: string[];
}

export interface GuestContact {
  name: string;
  organisation: string;
  email: string;
  phone?: string;
  billingEmail?: string;
}

export interface Booking {
  id: string;
  clientId: string | null;
  clientName: string;
  requestedByUserId?: string;
  bookingRef?: string;
  guestContact?: GuestContact;
  serviceType: ServiceType;
  languageFrom: string;
  languageTo: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  expectedEndTime?: string;
  locationType: 'ONLINE' | 'ONSITE';
  address?: string;
  postcode?: string;
  onlineLink?: string;
  status: BookingStatus;
  costCode?: string;
  caseType?: string;
  notes?: string;
  genderPreference?: 'Male' | 'Female' | 'None';
  interpreterId?: string;
  interpreterName?: string;
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

export interface SystemSettings {
  general: {
    companyName: string;
    supportEmail: string;
    businessAddress: string;
    websiteUrl?: string;
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

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface Timesheet {
  id: string;
  bookingId: string;
  clientId: string;
  interpreterId: string;
  actualStart: string;
  actualEnd: string;
  breakDurationMinutes: number;
  travelDurationMinutes?: number;
  unitsBillableToClient: number;
  unitsPayableToInterpreter: number;
  clientAmountCalculated: number;
  interpreterAmountCalculated: number;
  adminApproved: boolean;
  readyForClientInvoice: boolean;
  readyForInterpreterInvoice: boolean;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INVOICED';
  submittedAt?: string;
  supportingDocumentUrl?: string;
  clientInvoiceId?: string;
  interpreterInvoiceId?: string;
  totalClientAmount?: number;
  totalInterpreterAmount?: number;
}

export interface ClientInvoice {
  id: string;
  clientId: string;
  clientName: string;
  invoiceNumber: string;
  reference?: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalAmount: number;
  currency: string;
  items?: any[];
}

export interface InterpreterInvoice {
  id: string;
  interpreterId: string;
  interpreterName: string;
  issueDate: string;
  status: InvoiceStatus;
  totalAmount: number;
  model: 'UPLOAD' | 'SELF_BILLING';
  externalInvoiceReference?: string;
  uploadedPdfUrl?: string;
  items?: any[];
  currency?: string;
}

export interface Rate {
  id: string;
  rateType: 'CLIENT' | 'INTERPRETER';
  serviceType: ServiceType;
  amountPerUnit: number;
  minimumUnits: number;
}
