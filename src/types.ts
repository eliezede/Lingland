
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

// --- BILLING & INVOICING TYPES ---

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  CANCELLED = 'CANCELLED',
  SUBMITTED = 'SUBMITTED', // For interpreter uploads
  APPROVED = 'APPROVED',   // For interpreter uploads
  REJECTED = 'REJECTED'    // For interpreter uploads
}

export interface Timesheet {
  id: string;
  bookingId: string;
  clientId: string;
  interpreterId: string;
  
  // Time data
  actualStart: string; // ISO Date
  actualEnd: string;   // ISO Date
  breakDurationMinutes: number;
  travelDurationMinutes?: number;
  
  // Calculated financial data
  unitsBillableToClient: number;
  unitsPayableToInterpreter: number;
  clientAmountCalculated: number;
  interpreterAmountCalculated: number;
  
  // Approval workflow
  clientSignatureUrl?: string;
  adminApproved: boolean;
  adminApprovedAt?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INVOICED';
  submittedAt?: string;
  
  // Supporting docs
  supportingDocumentUrl?: string;
  
  // Invoice links
  readyForClientInvoice: boolean;
  clientInvoiceId?: string;
  readyForInterpreterInvoice: boolean;
  interpreterInvoiceId?: string;
  
  createdAt?: string;
  updatedAt?: string;
  
  // Mock data compatibility
  totalClientAmount?: number;
  totalInterpreterAmount?: number;
}

export interface Rate {
  id: string;
  rateType: 'CLIENT' | 'INTERPRETER';
  clientId?: string;
  interpreterId?: string;
  serviceType: ServiceType;
  languageFrom: string;
  languageTo: string;
  unitType: 'HOUR' | 'SESSION' | 'WORD';
  amountPerUnit: number;
  minimumUnits: number;
  nightWeekendMultiplier?: number;
  active: boolean;
}

export interface InvoiceLineItem {
  id: string; // Usually just an index or generated ID
  invoiceId: string;
  timesheetId: string;
  bookingId: string;
  description: string;
  units: number;
  rate: number;
  total: number;
}

export interface ClientInvoice {
  id: string;
  clientId: string;
  clientName: string;
  issueDate: string; // ISO
  dueDate: string;   // ISO
  periodStart: string; // ISO
  periodEnd: string;   // ISO
  status: InvoiceStatus;
  totalAmount: number;
  currency: string;
  reference: string; // e.g. INV-2024-001
  notes?: string;
  pdfUrl?: string;
  
  items?: InvoiceLineItem[]; // Optional if fetched separately
  createdAt?: string;
  updatedAt?: string;
}

export interface InterpreterInvoice {
  id: string;
  interpreterId: string;
  interpreterName: string;
  issueDate: string;
  periodStart?: string;
  periodEnd?: string;
  status: InvoiceStatus;
  totalAmount: number;
  currency: string;
  model: 'UPLOAD' | 'SELF_BILLING';
  
  externalInvoiceReference?: string; // If they uploaded their own
  uploadedPdfUrl?: string;
  generatedPdfUrl?: string; // If we generated self-bill
  
  items?: InvoiceLineItem[];
  createdAt?: string;
  updatedAt?: string;
}

// --- USER TYPES ---

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  profileId?: string;
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
  dbsExpiry: string;
  avatarUrl?: string;
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
  locationType: 'ONLINE' | 'ONSITE';
  address?: string;
  postcode?: string;
  onlineLink?: string;
  status: BookingStatus;
  costCode?: string;
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
