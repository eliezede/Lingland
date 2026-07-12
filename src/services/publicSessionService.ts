import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebaseConfig';

export const PublicSessionService = {
  ensure: async (): Promise<string> => {
    if (auth.currentUser) return auth.currentUser.uid;
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  }
};
