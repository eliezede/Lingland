
import { Booking, BookingStatus, Client, Interpreter, ServiceType, User, UserRole, BookingAssignment, AssignmentStatus, Timesheet, Rate, ClientInvoice, InterpreterInvoice, SystemSettings } from '../types';

// === HELPERS ===
const today = new Date();
const getDate = (offset: number) => {
  const d = new Date(today);
  d.setDate(today.getDate() + offset);
  return d.toISOString().split('T')[0];
};

// === DEFAULT DATA ===

const DEFAULT_USERS: User[] = [
  { id: 'u1', displayName: 'Sarah Admin', email: 'admin@lingland.com', role: UserRole.ADMIN },
  { id: 'u2', displayName: 'NHS Admin', email: 'bookings@nhs.uk', role: UserRole.CLIENT, profileId: 'c1' },
  { id: 'u3', displayName: 'John Doe', email: 'john@interp.com', role: UserRole.INTERPRETER, profileId: 'i1' },
  { id: 'u4', displayName: 'Maria Garcia', email: 'maria@interp.com', role: UserRole.INTERPRETER, profileId: 'i2' },
];

const DEFAULT_CLIENTS: Client[] = [
  { id: 'c1', companyName: 'NHS Trust North', billingAddress: '1 Hospital Rd, London', paymentTermsDays: 30, contactPerson: 'Jane Smith', email: 'bookings@nhs.uk', defaultCostCodeType: 'PO' },
  { id: 'c2', companyName: 'Smith & Co Solicitors', billingAddress: '22 Legal Ln, Manchester', paymentTermsDays: 14, contactPerson: 'Bob Law', email: 'bob@smithlaw.com', defaultCostCodeType: 'Cost Code' },
];

const DEFAULT_INTERPRETERS: Interpreter[] = [
  { id: 'i1', name: 'John Doe', email: 'john@interp.com', phone: '07700900123', languages: ['Arabic', 'French'], regions: ['London', 'South East'], qualifications: ['DPSI'], status: 'ACTIVE', dbsExpiry: '2025-12-01' },
  { id: 'i2', name: 'Maria Garcia', email: 'maria@interp.com', phone: '07700900456', languages: ['Spanish', 'Portuguese'], regions: ['Manchester', 'North West'], qualifications: ['Community Level 3'], status: 'ACTIVE', dbsExpiry: '2024-11-15' },
];

const DEFAULT_BOOKINGS: Booking[] = [
  {
    id: 'b1', clientId: 'c1', clientName: 'NHS Trust North', requestedByUserId: 'u2',
    serviceType: ServiceType.FACE_TO_FACE, languageFrom: 'English', languageTo: 'Arabic',
    date: getDate(1), startTime: '10:00', durationMinutes: 90, // Tomorrow
    locationType: 'ONSITE', address: 'Ward 4, North Hospital', postcode: 'NW1 2BU',
    status: BookingStatus.REQUESTED, costCode: 'PO-9921', notes: 'Patient is elderly male.'
  },
  {
    id: 'b2', clientId: 'c2', clientName: 'Smith & Co Solicitors', requestedByUserId: 'u_temp',
    serviceType: ServiceType.VIDEO, languageFrom: 'English', languageTo: 'Spanish',
    date: getDate(-1), startTime: '14:00', durationMinutes: 60, // Yesterday
    locationType: 'ONLINE', onlineLink: 'https://zoom.us/j/123',
    status: BookingStatus.COMPLETED, interpreterId: 'i2', interpreterName: 'Maria Garcia',
    costCode: 'CASE-123'
  },
  {
    id: 'b3', clientId: 'c1', clientName: 'NHS Trust North', requestedByUserId: 'u2',
    serviceType: ServiceType.TELEPHONE, languageFrom: 'English', languageTo: 'French',
    date: getDate(-3), startTime: '09:00', durationMinutes: 30, // 3 days ago
    locationType: 'ONLINE',
    status: BookingStatus.COMPLETED, interpreterId: 'i1', interpreterName: 'John Doe',
  },
  {
    id: 'b4', clientId: 'c1', clientName: 'NHS Trust North', requestedByUserId: 'u2',
    serviceType: ServiceType.FACE_TO_FACE, languageFrom: 'English', languageTo: 'Polish',
    date: getDate(2), startTime: '11:00', durationMinutes: 120, // In 2 days
    locationType: 'ONSITE', address: 'Clinic A',
    status: BookingStatus.OFFERED,
  }
];

const DEFAULT_ASSIGNMENTS: BookingAssignment[] = [
  {
    id: 'a1', bookingId: 'b4', interpreterId: 'i1', status: AssignmentStatus.OFFERED,
    offeredAt: new Date().toISOString(),
    bookingSnapshot: { date: getDate(2), startTime: '11:00', languageTo: 'Polish', locationType: 'ONSITE', postcode: 'W1 2AB' }
  },
  {
    id: 'a2', bookingId: 'b4', interpreterId: 'i2', status: AssignmentStatus.DECLINED,
    offeredAt: new Date().toISOString(), respondedAt: new Date().toISOString()
  }
];

const DEFAULT_RATES: Rate[] = [
  // Fixed: Added missing required 'currency' property
  { id: 'r1', rateType: 'CLIENT', serviceType: ServiceType.FACE_TO_FACE, unitType: 'HOUR', amountPerUnit: 45.00, minimumUnits: 1, active: true, languageFrom: 'English', languageTo: 'Any', currency: 'GBP' },
  // Fixed: Added missing required 'currency' property
  { id: 'r2', rateType: 'CLIENT', serviceType: ServiceType.VIDEO, unitType: 'HOUR', amountPerUnit: 40.00, minimumUnits: 1, active: true, languageFrom: 'English', languageTo: 'Any', currency: 'GBP' },
  // Fixed: Added missing required 'currency' property
  { id: 'r3', rateType: 'INTERPRETER', serviceType: ServiceType.FACE_TO_FACE, unitType: 'HOUR', amountPerUnit: 25.00, minimumUnits: 1, active: true, languageFrom: 'English', languageTo: 'Any', currency: 'GBP' },
  // Fixed: Added missing required 'currency' property
  { id: 'r4', rateType: 'INTERPRETER', serviceType: ServiceType.VIDEO, unitType: 'HOUR', amountPerUnit: 22.00, minimumUnits: 1, active: true, languageFrom: 'English', languageTo: 'Any', currency: 'GBP' }
];

const DEFAULT_TIMESHEETS: Timesheet[] = [
  {
    id: 'ts1', bookingId: 'b3', interpreterId: 'i1', clientId: 'c1',
    submittedAt: getDate(-3) + 'T10:00:00Z',
    actualStart: getDate(-3) + 'T09:00:00', actualEnd: getDate(-3) + 'T09:30:00', breakDurationMinutes: 0,
    adminApproved: true, adminApprovedAt: getDate(-2) + 'T09:00:00Z', status: 'APPROVED',
    unitsBillableToClient: 1, totalClientAmount: 40.00,
    unitsPayableToInterpreter: 1, totalInterpreterAmount: 22.00,
    clientAmountCalculated: 40.00,
    interpreterAmountCalculated: 22.00,
    readyForClientInvoice: true, readyForInterpreterInvoice: true
  },
  {
    id: 'ts2', bookingId: 'b2', interpreterId: 'i2', clientId: 'c2',
    submittedAt: getDate(-1) + 'T15:10:00Z',
    actualStart: getDate(-1) + 'T14:00:00', actualEnd: getDate(-1) + 'T15:00:00', breakDurationMinutes: 0,
    adminApproved: false, status: 'SUBMITTED',
    unitsBillableToClient: 0, unitsPayableToInterpreter: 0,
    clientAmountCalculated: 0, interpreterAmountCalculated: 0,
    readyForClientInvoice: false, readyForInterpreterInvoice: false
  }
];

const DEFAULT_CLIENT_INVOICES: ClientInvoice[] = [];
const DEFAULT_INTERPRETER_INVOICES: InterpreterInvoice[] = [];

// === SYSTEM SETTINGS DEFAULTS ===

const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    companyName: 'Lingland Ltd',
    supportEmail: 'support@lingland.com',
    businessAddress: '123 Business Park, London, UK',
    websiteUrl: 'https://lingland.com'
  },
  finance: {
    currency: 'GBP',
    vatRate: 20,
    vatNumber: 'GB123456789',
    invoicePrefix: 'INV-',
    nextInvoiceNumber: 1001,
    paymentTermsDays: 30,
    invoiceFooterText: 'Bank Details: Sort 00-00-00, Acc 12345678. Thank you for your business.'
  },
  operations: {
    minBookingDurationMinutes: 60,
    cancellationWindowHours: 24,
    timeIncrementMinutes: 15,
    defaultOnlinePlatformUrl: 'https://meet.google.com/new'
  },
  masterData: {
    activeServiceTypes: [
      ServiceType.FACE_TO_FACE,
      ServiceType.VIDEO,
      ServiceType.TELEPHONE,
      ServiceType.TRANSLATION,
      ServiceType.BSL
    ],
    priorityLanguages: ['Arabic', 'Polish', 'Romanian', 'Urdu', 'Spanish']
  }
};

// === PERSISTENCE LOGIC ===

const load = <T>(key: string, defaults: T): T => {
  try {
    const item = localStorage.getItem(`lingland_${key}`);
    return item ? JSON.parse(item) : defaults;
  } catch {
    return defaults;
  }
};

export const MOCK_USERS: User[] = load('users', DEFAULT_USERS);
export const MOCK_CLIENTS: Client[] = load('clients', DEFAULT_CLIENTS);
export const MOCK_INTERPRETERS: Interpreter[] = load('interpreters', DEFAULT_INTERPRETERS);
export const MOCK_BOOKINGS: Booking[] = load('bookings', DEFAULT_BOOKINGS);
export const MOCK_ASSIGNMENTS: BookingAssignment[] = load('assignments', DEFAULT_ASSIGNMENTS);
export const MOCK_RATES: Rate[] = load('rates', DEFAULT_RATES);
export const MOCK_TIMESHEETS: Timesheet[] = load('timesheets', DEFAULT_TIMESHEETS);
export const MOCK_CLIENT_INVOICES: ClientInvoice[] = load('client_invoices', DEFAULT_CLIENT_INVOICES);
export const MOCK_INTERPRETER_INVOICES: InterpreterInvoice[] = load('interpreter_invoices', DEFAULT_INTERPRETER_INVOICES);
export const MOCK_SETTINGS: SystemSettings = load('settings', DEFAULT_SETTINGS);

export const saveMockData = () => {
  localStorage.setItem('lingland_users', JSON.stringify(MOCK_USERS));
  localStorage.setItem('lingland_clients', JSON.stringify(MOCK_CLIENTS));
  localStorage.setItem('lingland_interpreters', JSON.stringify(MOCK_INTERPRETERS));
  localStorage.setItem('lingland_bookings', JSON.stringify(MOCK_BOOKINGS));
  localStorage.setItem('lingland_assignments', JSON.stringify(MOCK_ASSIGNMENTS));
  localStorage.setItem('lingland_rates', JSON.stringify(MOCK_RATES));
  localStorage.setItem('lingland_timesheets', JSON.stringify(MOCK_TIMESHEETS));
  localStorage.setItem('lingland_client_invoices', JSON.stringify(MOCK_CLIENT_INVOICES));
  localStorage.setItem('lingland_interpreter_invoices', JSON.stringify(MOCK_INTERPRETER_INVOICES));
  localStorage.setItem('lingland_settings', JSON.stringify(MOCK_SETTINGS));
};
