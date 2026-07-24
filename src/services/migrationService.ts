
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { User, UserRole } from '../types';
import { InterpreterService } from './interpreterService';

import { UserService } from './userService';

const AIRTABLE_CALLABLE_OPTIONS = { timeout: 600_000 };

export type AirtableProfessionalStats = {
  sourceRows: number;
  total: number;
  deduplicated: number;
  ambiguousSourceRows: number;
  portalEligible: number;
  passiveProfiles: number;
  profilesWithoutEmail: number;
  bySourceStatus: Record<string, number>;
  created: number;
  updated: number;
  profileOnly: number;
  usersCreated: number;
  usersUpdated: number;
  accountConflicts: number;
  conflict: number;
  skipped: number;
  errors: number;
};

const parseProfessionalStats = (value: unknown): AirtableProfessionalStats => {
  const stats = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const bySourceStatus = (
    stats.bySourceStatus && typeof stats.bySourceStatus === 'object'
      ? stats.bySourceStatus
      : {}
  ) as Record<string, unknown>;

  return {
    sourceRows: Number(stats.sourceRows || 0),
    total: Number(stats.total || 0),
    deduplicated: Number(stats.deduplicated || 0),
    ambiguousSourceRows: Number(stats.ambiguousSourceRows || 0),
    portalEligible: Number(stats.portalEligible || 0),
    passiveProfiles: Number(stats.passiveProfiles || 0),
    profilesWithoutEmail: Number(stats.profilesWithoutEmail || 0),
    bySourceStatus: Object.fromEntries(
      Object.entries(bySourceStatus).map(([key, count]) => [key, Number(count || 0)]),
    ),
    created: Number(stats.created || 0),
    updated: Number(stats.updated || 0),
    profileOnly: Number(stats.profileOnly || 0),
    usersCreated: Number(stats.usersCreated || 0),
    usersUpdated: Number(stats.usersUpdated || 0),
    accountConflicts: Number(stats.accountConflicts || 0),
    conflict: Number(stats.conflict || 0),
    skipped: Number(stats.skipped || 0),
    errors: Number(stats.errors || 0),
  };
};

export const MigrationService = {
  getProfessionalDirectoryStats: async (): Promise<AirtableProfessionalStats> => {
    const syncInterpreters = httpsCallable(functions, 'syncAirtableInterpreters', AIRTABLE_CALLABLE_OPTIONS);
    const result = await syncInterpreters({ dryRun: true });
    return parseProfessionalStats((result.data as { stats?: unknown })?.stats);
  },

  /**
   * Mirrors the Airtable professional directory into Firestore. Inactive and
   * historical people are retained as passive profiles; only eligible records
   * can receive a platform account.
   */
  syncProfessionalDirectory: async (): Promise<AirtableProfessionalStats> => {
    const syncInterpreters = httpsCallable(functions, 'syncAirtableInterpreters', AIRTABLE_CALLABLE_OPTIONS);
    const result = await syncInterpreters({ dryRun: false });
    return parseProfessionalStats((result.data as { stats?: unknown })?.stats);
  },

  /**
   * Sends activation emails to all users with IMPORTED status
   */
  sendActivationInvites: async () => {
    const usersQuery = query(collection(db, 'users'), where('status', '==', 'IMPORTED'), where('role', '==', UserRole.INTERPRETER));
    const userSnap = await getDocs(usersQuery);
    
    let sent = 0;
    let suppressed = 0;
    let errors = 0;

    for (const userDoc of userSnap.docs) {
      try {
        const userData = userDoc.data() as User;
        
        // Safety check: Don't resend if already sent (check interpreter profile)
        if (userData.profileId) {
          const interpreter = await InterpreterService.getById(userData.profileId);
          if (interpreter?.activationEmailSentAt) {
            console.log(`Skipping bulk invite for ${userData.email} - already sent at ${interpreter.activationEmailSentAt}`);
            continue;
          }
        }

        const inviteResult = await UserService.sendActivationInvite(userData.email, userData.displayName);
        if ((inviteResult as any)?.suppressed) {
          console.log(`Activation invite suppressed for ${userData.email} (${(inviteResult as any).communicationMode})`);
          suppressed++;
          continue;
        }

        // Mark as sent on interpreter profile
        if (userData.profileId) {
          await InterpreterService.updateProfile(userData.profileId, { 
            activationEmailSentAt: new Date().toISOString() 
          });
        }
        
        sent++;
      } catch (err) {
        console.error(`Error sending invite to ${userDoc.id}:`, err);
        errors++;
      }
    }

    return { sent, suppressed, errors };
  }
};
