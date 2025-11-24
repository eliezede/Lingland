import { Booking, BookingStatus, Client, Interpreter, User, BookingAssignment, AssignmentStatus, Timesheet, Rate, ClientInvoice, InterpreterInvoice, InvoiceLineItem, ServiceType } from '../types';
import { MOCK_BOOKINGS, MOCK_CLIENTS, MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, MOCK_USERS, MOCK_TIMESHEETS, MOCK_RATES, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES, saveMockData } from './mockData';

// === CORE SERVICES ===

export const UserService = {
  getUserById: async (id: string): Promise<User | undefined> => {
    return MOCK_USERS.find(u => u.id === id);
  }
};

export const StatsService = {
  getAdminStats: async () => {
    await new Promise(r => setTimeout(r, 400));
    return {
      pendingRequests: MOCK_BOOKINGS.filter(b => b.status === BookingStatus.REQUESTED).length,
      activeInterpreters: MOCK_INTERPRETERS.filter(i => i.status === 'ACTIVE').length,
      unpaidInvoices: MOCK_CLIENT_INVOICES.filter(i => i.status === 'SENT').length,
      revenueMonth: 45250
    };
  }
};

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    await new Promise(r => setTimeout(r, 400));
    return [...MOCK_BOOKINGS];
  },
  getById: async (id: string): Promise<Booking | undefined> => {
    await new Promise(r => setTimeout(r, 200));
    return MOCK_BOOKINGS.find(b => b.id === id);
  },
  getBookingsByIds: async (ids: string[]): Promise<Booking[]> => {
    await new Promise(r => setTimeout(r, 300));
    return MOCK_BOOKINGS.filter(b => ids.includes(b.id));
  },
  getByClientId: async (clientId: string): Promise<Booking[]> => {
    await new Promise(r => setTimeout(r, 300));
    return MOCK_BOOKINGS.filter(b => b.clientId === clientId);
  },
  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    await new Promise(r => setTimeout(r, 300));
    return MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && b.status !== BookingStatus.CANCELLED);
  },
  
  // --- ASSIGNMENTS ---
  
  getAssignmentsForInterpreter: async (interpreterId: string): Promise<BookingAssignment[]> => {
    await new Promise(r => setTimeout(r, 300));
    const assignments = MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId);
    return assignments.map(a => {
      const booking = MOCK_BOOKINGS.find(b => b.id === a.bookingId);
      if (booking) {
        return { ...a, bookingSnapshot: booking };
      }
      return a;
    });
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    const assignments = await BookingService.getAssignmentsForInterpreter(interpreterId);
    return assignments.filter(a => a.status === AssignmentStatus.OFFERED);
  },

  create: async (booking: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking: Booking = {
      ...booking,
      id: Math.random().toString(36).substr(2, 9),
      status: BookingStatus.REQUESTED
    };
    MOCK_BOOKINGS.push(newBooking);
    saveMockData();
    return newBooking;
  },
  
  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    const booking = MOCK_BOOKINGS.find(b => b.id === id);
    if (booking) {
      booking.status = status;
      saveMockData();
    }
  },

  acceptAssignment: async (assignmentId: string): Promise<void> => {
    const assignment = MOCK_ASSIGNMENTS.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    assignment.status = AssignmentStatus.ACCEPTED;
    assignment.respondedAt = new Date().toISOString();
    
    const booking = MOCK_BOOKINGS.find(b => b.id === assignment.bookingId);
    if (booking) {
      booking.status = BookingStatus.CONFIRMED;
      booking.interpreterId = assignment.interpreterId;
      const interpreter = MOCK_INTERPRETERS.find(i => i.id === assignment.interpreterId);
      if (interpreter) booking.interpreterName = interpreter.name;
    }
    
    MOCK_ASSIGNMENTS.forEach(a => {
      if (a.bookingId === assignment.bookingId && a.id !== assignmentId) {
        a.status = AssignmentStatus.EXPIRED;
      }
    });
    saveMockData();
  },

  declineAssignment: async (assignmentId: string): Promise<void> => {
    const assignment = MOCK_ASSIGNMENTS.find(a => a.id === assignmentId);
    if (assignment) {
      assignment.status = AssignmentStatus.DECLINED;
      assignment.respondedAt = new Date().toISOString();
      saveMockData();
    }
  },
  
  acceptOffer: async (id: string) => BookingService.acceptAssignment(id),
  declineOffer: async (id: string) => BookingService.declineAssignment(id),

  // --- MATCHING ---

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    await new Promise(r => setTimeout(r, 300));
    return MOCK_INTERPRETERS.filter(i => 
      i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())) && 
      i.status === 'ACTIVE'
    );
  },

  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    await new Promise(r => setTimeout(r, 200));
    return MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    await new Promise(r => setTimeout(r, 300));
    
    const existing = MOCK_ASSIGNMENTS.find(a => a.bookingId === bookingId && a.interpreterId === interpreterId);
    if (existing) return existing;

    const newAssignment: BookingAssignment = {
      id: `assign-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      bookingId,
      interpreterId,
      status: AssignmentStatus.OFFERED,
      offeredAt: new Date().toISOString(),
      bookingSnapshot: MOCK_BOOKINGS.find(b => b.id === bookingId) || {}
    };

    MOCK_ASSIGNMENTS.push(newAssignment);
    
    const booking = MOCK_BOOKINGS.find(b => b.id === bookingId);
    if (booking && booking.status === BookingStatus.REQUESTED) {
      booking.status = BookingStatus.OFFERED;
    }

    saveMockData();
    return newAssignment;
  },

  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    await new Promise(r => setTimeout(r, 300));
    const booking = MOCK_BOOKINGS.find(b => b.id === bookingId);
    const interpreter = MOCK_INTERPRETERS.find(i => i.id === interpreterId);
    
    if (booking && interpreter) {
      booking.status = BookingStatus.CONFIRMED;
      booking.interpreterId = interpreter.id;
      booking.interpreterName = interpreter.name;
      
      MOCK_ASSIGNMENTS.forEach(a => {
        if (a.bookingId === bookingId) {
          if (a.interpreterId === interpreterId) {
            a.status = AssignmentStatus.ACCEPTED;
          } else {
            a.status = AssignmentStatus.EXPIRED;
          }
        }
      });

      saveMockData();
    }
  }
};

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    await new Promise(r => setTimeout(r, 300));
    return [...MOCK_CLIENTS];
  },
  getById: async (id: string) => MOCK_CLIENTS.find(c => c.id === id),
  
  create: async (data: Omit<Client, 'id'>): Promise<Client> => {
    await new Promise(r => setTimeout(r, 400));
    const newClient: Client = {
      ...data,
      id: `c-${Date.now()}`,
    };
    MOCK_CLIENTS.push(newClient);
    saveMockData();
    return newClient;
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    await new Promise(r => setTimeout(r, 300));
    const index = MOCK_CLIENTS.findIndex(c => c.id === id);
    if (index !== -1) {
      MOCK_CLIENTS[index] = { ...MOCK_CLIENTS[index], ...data };
      saveMockData();
      return MOCK_CLIENTS[index];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    await new Promise(r => setTimeout(r, 300));
    const index = MOCK_CLIENTS.findIndex(c => c.id === id);
    if (index !== -1) {
      MOCK_CLIENTS.splice(index, 1);
      saveMockData();
    }
  }
};

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    await new Promise(r => setTimeout(r, 300));
    return [...MOCK_INTERPRETERS];
  },
  getById: async (id: string) => MOCK_INTERPRETERS.find(i => i.id === id),
  
  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    const idx = MOCK_INTERPRETERS.findIndex(i => i.id === id);
    if (idx !== -1) {
      MOCK_INTERPRETERS[idx] = { ...MOCK_INTERPRETERS[idx], ...data };
      saveMockData();
    }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    await new Promise(r => setTimeout(r, 400));
    const newInterpreter: Interpreter = {
      ...data,
      id: `i-${Date.now()}`,
      status: 'ONBOARDING'
    };
    MOCK_INTERPRETERS.push(newInterpreter);
    saveMockData();
    return newInterpreter;
  }
};

// === BILLING SERVICES ===

export const BillingService = {
  getAllTimesheets: async (): Promise<Timesheet[]> => {
    await new Promise(r => setTimeout(r, 400));
    return [...MOCK_TIMESHEETS];
  },
  getInterpreterTimesheets: async (interpreterId: string): Promise<Timesheet[]> => {
    return MOCK_TIMESHEETS.filter(t => t.interpreterId === interpreterId);
  },
  getUninvoicedTimesheetsForInterpreter: async (interpreterId: string): Promise<Timesheet[]> => {
    return MOCK_TIMESHEETS.filter(t => 
      t.interpreterId === interpreterId && 
      t.adminApproved && 
      !t.interpreterInvoiceId
    );
  },
  submitTimesheet: async (data: Partial<Timesheet>): Promise<Timesheet> => {
    await new Promise(r => setTimeout(r, 500));
    const newTs: Timesheet = {
      id: `ts-${Date.now()}`,
      bookingId: data.bookingId!,
      interpreterId: data.interpreterId!,
      clientId: data.clientId!,
      submittedAt: new Date().toISOString(),
      actualStart: data.actualStart!,
      actualEnd: data.actualEnd!,
      breakDurationMinutes: data.breakDurationMinutes || 0,
      adminApproved: false,
      status: 'SUBMITTED',
      readyForClientInvoice: false,
      readyForInterpreterInvoice: false,
      unitsBillableToClient: 0,
      unitsPayableToInterpreter: 0,
      clientAmountCalculated: 0,
      interpreterAmountCalculated: 0
    };
    MOCK_TIMESHEETS.push(newTs);
    saveMockData();
    return newTs;
  },
  approveTimesheet: async (timesheetId: string): Promise<Timesheet | null> => {
    const ts = MOCK_TIMESHEETS.find(t => t.id === timesheetId);
    if (!ts) return null;
    
    const booking = MOCK_BOOKINGS.find(b => b.id === ts.bookingId);
    if (!booking) return null;

    const clientRate = MOCK_RATES.find(r => r.type === 'CLIENT_CHARGE') || MOCK_RATES[0];
    const interpRate = MOCK_RATES.find(r => r.type === 'INTERPRETER_PAY') || MOCK_RATES[2];

    const start = new Date(ts.actualStart);
    const end = new Date(ts.actualEnd);
    let durationMins = (end.getTime() - start.getTime()) / 1000 / 60;
    durationMins -= ts.breakDurationMinutes;
    if (durationMins < 0) durationMins = 0;

    let units = durationMins / 60;
    if (units < clientRate.minimumUnits) units = clientRate.minimumUnits;

    ts.adminApproved = true;
    ts.adminApprovedAt = new Date().toISOString();
    ts.status = 'APPROVED';
    ts.unitsBillableToClient = Number(units.toFixed(2));
    ts.unitsPayableToInterpreter = Number(units.toFixed(2));
    ts.totalClientAmount = Number((units * clientRate.amountPerUnit).toFixed(2));
    ts.totalInterpreterAmount = Number((units * interpRate.amountPerUnit).toFixed(2));
    ts.clientAmountCalculated = ts.totalClientAmount;
    ts.interpreterAmountCalculated = ts.totalInterpreterAmount;
    ts.readyForClientInvoice = true;
    ts.readyForInterpreterInvoice = true;

    saveMockData();
    return ts;
  },
  getClientInvoices: async (): Promise<ClientInvoice[]> => [...MOCK_CLIENT_INVOICES],
  getClientInvoiceById: async (id: string): Promise<ClientInvoice | undefined> => MOCK_CLIENT_INVOICES.find(inv => inv.id === id),
  generateClientInvoice: async (clientId: string): Promise<ClientInvoice> => {
    const client = MOCK_CLIENTS.find(c => c.id === clientId);
    const eligibleTimesheets = MOCK_TIMESHEETS.filter(t => 
      t.clientId === clientId && t.readyForClientInvoice && !t.clientInvoiceId
    );
    if (eligibleTimesheets.length === 0) throw new Error("No eligible timesheets found.");

    const invoiceId = `inv-c-${Date.now()}`;
    const items: InvoiceLineItem[] = eligibleTimesheets.map(ts => ({
      timesheetId: ts.id,
      bookingId: ts.bookingId,
      description: `Service - ${ts.actualStart.split('T')[0]}`,
      units: ts.unitsBillableToClient || 0,
      rate: (ts.clientAmountCalculated || 0) / (ts.unitsBillableToClient || 1),
      total: ts.clientAmountCalculated || 0
    }));

    const total = items.reduce((sum, item) => sum + item.total, 0);
    const newInvoice: ClientInvoice = {
      id: invoiceId,
      clientId,
      clientName: client?.companyName || 'Unknown',
      invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
      status: 'DRAFT',
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      totalAmount: total,
      currency: 'GBP',
      items
    };

    eligibleTimesheets.forEach(ts => {
      ts.clientInvoiceId = invoiceId;
      ts.status = 'INVOICED';
    });

    MOCK_CLIENT_INVOICES.push(newInvoice);
    saveMockData();
    return newInvoice;
  },
  getInterpreterInvoices: async (interpreterId: string): Promise<InterpreterInvoice[]> => {
    return MOCK_INTERPRETER_INVOICES.filter(i => i.interpreterId === interpreterId);
  },
  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], ref: string, amount: number): Promise<InterpreterInvoice> => {
    const interpreter = MOCK_INTERPRETERS.find(i => i.id === interpreterId);
    const newInvoice: InterpreterInvoice = {
      id: `inv-i-${Date.now()}`,
      interpreterId,
      interpreterName: interpreter?.name || '',
      model: 'UPLOAD',
      status: 'SUBMITTED',
      externalInvoiceReference: ref,
      totalAmount: amount,
      issueDate: new Date().toISOString(),
      items: [] 
    };
    timesheetIds.forEach(tsId => {
      const ts = MOCK_TIMESHEETS.find(t => t.id === tsId);
      if (ts) ts.interpreterInvoiceId = newInvoice.id;
    });
    MOCK_INTERPRETER_INVOICES.push(newInvoice);
    saveMockData();
    return newInvoice;
  }
};