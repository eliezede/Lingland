
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { User, UserRole } from '../types';
import { InterpreterService } from './interpreterService';

import { UserService } from './userService';

const AIRTABLE_CALLABLE_OPTIONS = { timeout: 600_000 };

export const MigrationService = {
  getActiveInterpreterStats: async () => {
    const syncInterpreters = httpsCallable(functions, 'syncAirtableInterpreters', AIRTABLE_CALLABLE_OPTIONS);
    const result = await syncInterpreters({ dryRun: true });
    const stats = (result.data as any)?.stats;
    return {
      total: Number(stats?.total || 0),
      deduplicated: Number(stats?.deduplicated || 0),
    };
  },

  /**
   * Performs the actual migration from Airtable to Firestore
   * Returns stats about the migration
   */
  migrateActiveInterpreters: async () => {
    const syncInterpreters = httpsCallable(functions, 'syncAirtableInterpreters', AIRTABLE_CALLABLE_OPTIONS);
    const result = await syncInterpreters({ dryRun: false });
    const stats = (result.data as any)?.stats;
    return {
      created: Number(stats?.created || 0),
      skipped: Number(stats?.skipped || 0),
      errors: Number(stats?.errors || 0),
      updated: Number(stats?.updated || 0),
    };
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
