import { collection, addDoc, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { InterpreterApplication, ApplicationStatus, NotificationType } from '../types';
import { EmailService } from './emailService';
import { NotificationService } from './notificationService';
import { MOCK_USERS } from './mockData';

const COLLECTION = 'applications';

// Cache local persistente em memória para a sessão atual em modo mock
let MOCK_APPLICATIONS_CACHE: InterpreterApplication[] = [];

export const ApplicationService = {
  submit: async (data: Omit<InterpreterApplication, 'id' | 'status' | 'submittedAt'>) => {
    const application = {
      ...data,
      status: ApplicationStatus.PENDING,
      submittedAt: new Date().toISOString()
    };
    let createdApp: InterpreterApplication;

    try {
      const docRef = await addDoc(collection(db, COLLECTION), application);
      createdApp = { id: docRef.id, ...application } as InterpreterApplication;
    } catch (e) {
      console.warn("Application Service: Offline Mode / Mock Data Use");
      createdApp = { id: `app-${Date.now()}`, ...application } as InterpreterApplication;
      MOCK_APPLICATIONS_CACHE.push(createdApp);
    }

    // --- TRIGGER NOTIFICATIONS & EMAILS ---

    // 1. Notify Applicant via Email
    await EmailService.sendApplicationEmail(createdApp, 'PENDING');

    // 2. Notify Admins via Email
    await EmailService.sendApplicationEmail(createdApp, 'PENDING', 'admin@lingland.com');

    // 3. Notify Admins via In-App Notification
    const admins = MOCK_USERS.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
    admins.forEach(admin => {
      NotificationService.notify(
        admin.id,
        'New Interpreter Application',
        `A new application was submitted by ${createdApp.name} (${createdApp.languages?.join(', ')}).`,
        NotificationType.INFO,
        '/admin/applications?tab=PENDING'
      );
    });

    return createdApp;
  },

  getAll: async (): Promise<InterpreterApplication[]> => {
    try {
      const q = query(collection(db, COLLECTION), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      const remoteApps = snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterApplication));
      // Se houver dados remotos, eles ganham precedência, senão usa o cache local de testes
      return remoteApps.length > 0 ? remoteApps : MOCK_APPLICATIONS_CACHE;
    } catch (e) {
      return MOCK_APPLICATIONS_CACHE;
    }
  },

  updateStatus: async (id: string, status: ApplicationStatus) => {
    try {
      await updateDoc(doc(db, COLLECTION, id), { status });
    } catch (e) {
      console.error("Application Update Failed (Offline Mode):", e);
      // Atualiza o cache local para que a UI reflita a mudança imediatamente
      const app = MOCK_APPLICATIONS_CACHE.find(a => a.id === id);
      if (app) {
        app.status = status;
      }
    }
  }
};
