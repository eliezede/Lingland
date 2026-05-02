
import { collection, query, where, getDocs, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { AirtableService } from './airtableService';
import { Interpreter, User, UserRole } from '../types';
import { InterpreterService } from './interpreterService';

export const MigrationService = {
  /**
   * Performs the actual migration from Airtable to Firestore
   * Returns stats about the migration
   */
  migrateActiveInterpreters: async () => {
    const interpreters = await AirtableService.fetchActiveInterpreters();
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const data of interpreters) {
      try {
        if (!data.email) {
          console.warn(`Skipping interpreter ${data.name} due to missing email`);
          skipped++;
          continue;
        }

        // 1. Check if user already exists
        const userQuery = query(collection(db, 'users'), where('email', '==', data.email.toLowerCase()));
        const userSnap = await getDocs(userQuery);

        // 2. Create/Update Interpreter Profile
        let interpreterProfile;
        if (!userSnap.empty && userSnap.docs[0].data().profileId) {
          // Already has a profile, maybe update?
          console.log(`User ${data.email} already exists with profile, updating...`);
          await InterpreterService.updateProfile(userSnap.docs[0].data().profileId, data as any);
          interpreterProfile = { id: userSnap.docs[0].data().profileId };
          skipped++;
        } else {
          console.log(`Creating new profile for ${data.email}...`);
          interpreterProfile = await InterpreterService.create(data as any);
          
          // 3. Create/Update User Document
          const userDocData: Omit<User, 'id'> = {
            displayName: data.name || 'Interpreter',
            email: data.email.toLowerCase(),
            role: UserRole.INTERPRETER,
            status: 'IMPORTED',
            profileId: interpreterProfile.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          if (!userSnap.empty) {
            console.log(`Linking existing user ${data.email} to new profile...`);
            await setDoc(doc(db, 'users', userSnap.docs[0].id), userDocData, { merge: true });
          } else {
            console.log(`Creating new user doc for ${data.email}...`);
            await addDoc(collection(db, 'users'), userDocData);
          }
          created++;
        }
      } catch (err) {
        console.error(`Error migrating ${data.name}:`, err);
        errors++;
      }
    }

    return { created, skipped, errors };
  },

  /**
   * Sends activation emails to all users with IMPORTED status
   */
  sendActivationInvites: async () => {
    const usersQuery = query(collection(db, 'users'), where('status', '==', 'IMPORTED'), where('role', '==', UserRole.INTERPRETER));
    const userSnap = await getDocs(usersQuery);
    
    let sent = 0;
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

        const activationLink = `${window.location.origin}/#/activate?email=${encodeURIComponent(userData.email)}`;
        
        // Queue email via 'mail' collection (Firebase Extension)
        await addDoc(collection(db, 'mail'), {
          to: [userData.email],
          template: {
            name: 'ACCOUNT_ACTIVATION',
            data: {
              interpreterName: userData.displayName,
              activationLink: activationLink
            }
          },
          createdAt: new Date().toISOString()
        });

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

    return { sent, errors };
  }
};
