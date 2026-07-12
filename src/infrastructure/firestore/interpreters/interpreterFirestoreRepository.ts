import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { InterpreterRepository, InterpreterSnapshot } from '../../../domains/interpreters/repository';

export const interpreterFirestoreRepository: InterpreterRepository = {
    async getSnapshotById(id: string): Promise<InterpreterSnapshot | null> {
        const snap = await getDoc(doc(db, 'interpreters', id));
        if (snap.exists()) {
            const data = snap.data();
            return { id: snap.id, name: data.name, email: data.email };
        }
        return null;
    }
};
