import { Booking, BookingStatus, Client, Interpreter, ServiceType, User, UserRole, BookingAssignment, AssignmentStatus, Timesheet, Rate, ClientInvoice, InterpreterInvoice, SystemSettings, ServiceCategory, SessionMode } from '../types';

// === HELPERS ===
const today = new Date();
const getDate = (offset: number) => {
  const d = new Date(today);
  d.setDate(today.getDate() + offset);
  return d.toISOString().split('T')[0];
};

// === DEFAULT DATA ===

const DEFAULT_USERS: User[] = [
  { id: 'u1', displayName: 'Sarah Admin', email: 'admin@lingland.com', role: UserRole.ADMIN, status: 'ACTIVE', photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop' },
  { id: 'u2', displayName: 'NHS Admin', email: 'bookings@nhs.uk', role: UserRole.CLIENT, profileId: 'c1', status: 'ACTIVE', photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop' },
  { id: 'u3', displayName: 'John Doe', email: 'john@interp.com', role: UserRole.INTERPRETER, profileId: 'i1', status: 'ACTIVE', photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop' },
  { id: 'u4', displayName: 'Maria Garcia', email: 'maria@interp.com', role: UserRole.INTERPRETER, profileId: 'i2', status: 'ACTIVE', photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop' },
];

const DEFAULT_CLIENTS: Client[] = [
  { id: 'c1', companyName: 'NHS Trust North', billingAddress: '1 Hospital Rd, London', paymentTermsDays: 30, contactPerson: 'Jane Smith', email: 'bookings@nhs.uk', defaultCostCodeType: 'PO', organizationId: 'org1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'c2', companyName: 'Smith & Co Solicitors', billingAddress: '22 Legal Ln, Manchester', paymentTermsDays: 14, contactPerson: 'Bob Law', email: 'bob@smithlaw.com', defaultCostCodeType: 'Cost Code', organizationId: 'org1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const DEFAULT_INTERPRETERS: Interpreter[] = [
  { 
    id: 'i1', 
    name: 'John Doe', 
    shortName: 'John',
    email: 'john@interp.com', 
    phone: '07700900123', 
    gender: 'M',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    address: { street: '123 Baker St', town: 'London', county: 'Greater London', postcode: 'NW1 6XE', country: 'United Kingdom' },
    hasCar: true,
    languages: ['Arabic', 'French'], 
    languageProficiencies: [
      { language: 'English', l1: 1, translateOrder: 'T1' },
      { language: 'Arabic', l1: 2, translateOrder: 'T2' }
    ],
    status: 'ONBOARDING', 
    isAvailable: true, 
    dbs: { level: 'DBS', number: '123456789', autoRenew: true, renewDate: '2025-12-01' },
    qualifications: ['DPSI'],
    nrpsi: { registered: true, number: '15522' },
    dpsi: true,
    badge: { idStatus: 'In use', issuedDate: '2023-01-15' },
    inductionsCompleted: ['MS Teams'],
    workChecksCompleted: ['CV', 'Interviewed'],
    workFormsSigned: [],
    otherPaperwork: [],
    rates: {
      ratesType: 'Lingland Rates',
      f2fRate: 25,
      stF2F: 25,
      stVideo: 20,
      stPhone: 15,
      oohF2F: 35,
      oohVideo: 30,
      oohPhone: 25,
      spRatesInt: 0,
      travelTimeST: 12,
      mileageST: 0.45
    },
    keyInterpreter: false,
    documentUrls: [],
    regions: [],
    organizationId: 'org1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  { 
    id: 'i2', 
    name: 'Maria Garcia', 
    email: 'maria@interp.com', 
    phone: '07700900456', 
    gender: 'F',
    photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
    address: { street: '45 Low St', town: 'Manchester', county: 'Greater Manchester', postcode: 'M1 1AA', country: 'United Kingdom' },
    hasCar: false,
    languages: ['Spanish', 'Portuguese'], 
    languageProficiencies: [{language: 'English', l1: 1, translateOrder: 'T1'}, {language: 'Spanish', l1: 2, translateOrder: 'no'}], 
    status: 'ACTIVE', 
    isAvailable: true, 
    dbs: { level: 'S-DBS', renewDate: '2024-11-15', autoRenew: false }, 
    qualifications: ['Community Level 3'], 
    nrpsi: { registered: false },
    dpsi: false,
    badge: { idStatus: 'Not made yet' },
    keyInterpreter: true,
    documentUrls: [],
    regions: [],
    workFormsSigned: [],
    otherPaperwork: [],
    inductionsCompleted: [],
    workChecksCompleted: [],
    rates: { ratesType: 'Lingland Rates', f2fRate: 22, stF2F: 22, spRatesInt: 0 } as any, 
    organizationId: 'org1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
];


const DEFAULT_BOOKINGS: Booking[] = [
  {
    id: 'b1', clientId: 'c1', clientName: 'NHS Trust North', requestedByUserId: 'u2',
    organizationId: 'org1', serviceCategory: ServiceCategory.INTERPRETATION,
    serviceType: ServiceType.FACE_TO_FACE, languageFrom: 'English', languageTo: 'Arabic',
    date: getDate(1), startTime: '10:00', durationMinutes: 90,
    locationType: 'ONSITE', address: 'Ward 4, North Hospital', postcode: 'NW1 2BU',
    status: BookingStatus.INCOMING, costCode: 'PO-9921', notes: 'Patient is elderly male.',
    patientName: 'A. Smith / 12345', professionalName: 'Dr. Hussain', gdprConsent: true
  },
  {
    id: 'b2', clientId: 'c2', clientName: 'Smith & Co Solicitors', requestedByUserId: 'u_temp',
    organizationId: 'org1', serviceCategory: ServiceCategory.INTERPRETATION,
    serviceType: ServiceType.VIDEO, languageFrom: 'English', languageTo: 'Spanish',
    date: getDate(-1), startTime: '14:00', durationMinutes: 60,
    locationType: 'ONLINE', onlineLink: 'https://zoom.us/j/123',
    status: BookingStatus.BOOKED, interpreterId: 'i2', interpreterName: 'Maria Garcia',
    interpreterPhotoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
    costCode: 'CASE-123',
    patientName: 'J. Doe', professionalName: 'Sarah Solicitor', gdprConsent: true
  }
];

const DEFAULT_ASSIGNMENTS: BookingAssignment[] = [];
const DEFAULT_RATES: Rate[] = [
  { id: 'r1', rateType: 'CLIENT', serviceType: ServiceType.FACE_TO_FACE, amountPerUnit: 45.00, minimumUnits: 1 },
  { id: 'r2', rateType: 'CLIENT', serviceType: ServiceType.VIDEO, amountPerUnit: 40.00, minimumUnits: 1 },
  { id: 'r3', rateType: 'INTERPRETER', serviceType: ServiceType.FACE_TO_FACE, amountPerUnit: 25.00, minimumUnits: 1 },
  { id: 'r4', rateType: 'INTERPRETER', serviceType: ServiceType.VIDEO, amountPerUnit: 22.00, minimumUnits: 1 }
];

const DEFAULT_TIMESHEETS: Timesheet[] = [];
const DEFAULT_CLIENT_INVOICES: ClientInvoice[] = [];
const DEFAULT_INTERPRETER_INVOICES: InterpreterInvoice[] = [];

const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    companyName: 'Lingland Ltd',
    supportEmail: 'support@lingland.com',
    businessAddress: '123 Business Park, London, UK',
    websiteUrl: 'https://lingland.com',
    portalUrl: 'https://lingland-2e52f.web.app'
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