import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { UserRepository, UserSnapshot } from '../../../domains/users/repository';

export const userFirestoreRepository: UserRepository = {
    async getByProfileId(profileId: string): Promise<UserSnapshot | null> {
        const q = query(collection(db, 'users'), where('profileId', '==', profileId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...(d.data() as any) } as UserSnapshot;
        }
        return null;
    }
};
