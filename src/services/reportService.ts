import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

const COLLECTION_NAME = 'reportPreferences';
const EXPORT_LOG_COLLECTION = 'reportExportLogs';
const SCHEDULE_COLLECTION = 'reportSchedules';
const APPROVAL_COLLECTION = 'reportApprovalRequests';

export type SavedReportVisibility = 'PRIVATE' | 'TEAM' | 'ADMIN';

export interface SavedReportFilterState {
  preset: string;
  period: string;
  dateBasis: string;
  service: string;
  status: string;
  clientQuery: string;
}

export interface SavedReport {
  id: string;
  name: string;
  description?: string;
  workspace: 'finance' | 'operations' | 'management' | 'reconciliation';
  visibility: SavedReportVisibility;
  favorite?: boolean;
  system?: boolean;
  filters: SavedReportFilterState;
  createdAt: string;
  updatedAt: string;
}

export interface ReportExportLogInput {
  userId: string;
  userRole?: string;
  reportName: string;
  exportType: 'PDF' | 'PRESENTATION';
  filters: SavedReportFilterState;
  recordCount: number;
  selectedReportId?: string;
}

export interface ReportExportLog extends ReportExportLogInput {
  id: string;
  organizationId?: string;
  createdAt?: string;
}

export interface ReportApprovalRequestInput {
  userId: string;
  userRole?: string;
  reportName: string;
  insightId: string;
  insightTitle: string;
  requestedAction: string;
  filters: SavedReportFilterState;
  recordCount: number;
  selectedReportId?: string;
}

export interface ReportApprovalRequest extends ReportApprovalRequestInput {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ReportScheduleFrequency = 'WEEKLY' | 'MONTHLY';

export interface ReportSchedule {
  id: string;
  userId: string;
  reportId: string;
  reportName: string;
  frequency: ReportScheduleFrequency;
  deliveryMode: 'INTERNAL_ONLY';
  recipients: string[];
  active: boolean;
  nextRunLabel: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportPreferenceDocument {
  userId: string;
  organizationId: string;
  reports: SavedReport[];
  createdAt?: any;
  updatedAt?: any;
}

const preferenceId = (userId: string) => `${userId}_reports`;
const scheduleId = (userId: string) => `${userId}_schedules`;

export const ReportService = {
  getUserReports: async (userId: string): Promise<SavedReport[]> => {
    if (!userId) return [];

    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, preferenceId(userId)));
      if (!snap.exists()) return [];
      const data = snap.data() as ReportPreferenceDocument;
      return Array.isArray(data.reports) ? data.reports : [];
    } catch (error) {
      console.warn('[ReportService] Failed to load reports', error);
      return [];
    }
  },

  saveUserReports: async (userId: string, reports: SavedReport[], organizationId = 'lingland-main'): Promise<void> => {
    if (!userId) return;

    await setDoc(doc(db, COLLECTION_NAME, preferenceId(userId)), {
      userId,
      organizationId,
      reports,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  getUserSchedules: async (userId: string): Promise<ReportSchedule[]> => {
    if (!userId) return [];

    try {
      const snap = await getDoc(doc(db, SCHEDULE_COLLECTION, scheduleId(userId)));
      if (!snap.exists()) return [];
      const data = snap.data() as { schedules?: ReportSchedule[] };
      return Array.isArray(data.schedules) ? data.schedules : [];
    } catch (error) {
      console.warn('[ReportService] Failed to load report schedules', error);
      return [];
    }
  },

  saveUserSchedules: async (userId: string, schedules: ReportSchedule[], organizationId = 'lingland-main'): Promise<void> => {
    if (!userId) return;

    await setDoc(doc(db, SCHEDULE_COLLECTION, scheduleId(userId)), {
      userId,
      organizationId,
      schedules,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  getRecentExportLogs: async (maxRows = 8): Promise<ReportExportLog[]> => {
    try {
      const logsQuery = query(
        collection(db, EXPORT_LOG_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(maxRows),
      );
      const snapshot = await getDocs(logsQuery);
      return snapshot.docs.map(logDoc => {
        const data = logDoc.data() as Omit<ReportExportLog, 'id'> & { createdAt?: any };
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt === 'string'
            ? data.createdAt
            : undefined;
        return {
          ...data,
          id: logDoc.id,
          createdAt,
        } as ReportExportLog;
      });
    } catch (error) {
      console.warn('[ReportService] Failed to load report export logs', error);
      return [];
    }
  },

  getRecentApprovalRequests: async (maxRows = 8): Promise<ReportApprovalRequest[]> => {
    try {
      const approvalsQuery = query(
        collection(db, APPROVAL_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(maxRows),
      );
      const snapshot = await getDocs(approvalsQuery);
      return snapshot.docs.map(approvalDoc => {
        const data = approvalDoc.data() as Omit<ReportApprovalRequest, 'id'> & { createdAt?: any; updatedAt?: any };
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt === 'string'
            ? data.createdAt
            : undefined;
        const updatedAt = data.updatedAt?.toDate
          ? data.updatedAt.toDate().toISOString()
          : typeof data.updatedAt === 'string'
            ? data.updatedAt
            : undefined;
        return {
          ...data,
          id: approvalDoc.id,
          createdAt,
          updatedAt,
        } as ReportApprovalRequest;
      });
    } catch (error) {
      console.warn('[ReportService] Failed to load report approval requests', error);
      return [];
    }
  },

  createApprovalRequest: async (input: ReportApprovalRequestInput, organizationId = 'lingland-main'): Promise<string | undefined> => {
    if (!input.userId) return;

    try {
      const approvalRef = await addDoc(collection(db, APPROVAL_COLLECTION), {
        ...input,
        status: 'PENDING',
        organizationId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return approvalRef.id;
    } catch (error) {
      console.warn('[ReportService] Failed to create report approval request', error);
      return undefined;
    }
  },

  logExport: async (input: ReportExportLogInput, organizationId = 'lingland-main'): Promise<string | undefined> => {
    if (!input.userId) return;

    try {
      const logRef = await addDoc(collection(db, EXPORT_LOG_COLLECTION), {
        ...input,
        organizationId,
        createdAt: serverTimestamp(),
      });
      return logRef.id;
    } catch (error) {
      console.warn('[ReportService] Failed to log report export', error);
      return undefined;
    }
  },
};
