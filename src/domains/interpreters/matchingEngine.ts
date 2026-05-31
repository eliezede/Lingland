import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Booking, Interpreter } from '../../types';
import { Job } from '../jobs/types';
import { MOCK_INTERPRETERS } from '../../services/mockData';

export interface InterpreterMatchResult {
    interpreter: Interpreter;
    score: number;
    reasons: string[];
    warnings: string[];
}

const normalize = (value?: string) => (value || '').toLowerCase().trim();

const getLanguagePriority = (interpreter: Interpreter, languageTo?: string): number | null => {
    const target = normalize(languageTo);
    if (!target) return null;

    const proficiency = interpreter.languageProficiencies?.find(p => normalize(p.language) === target);
    if (proficiency) return proficiency.l1 ?? 18;

    const legacyMatch = interpreter.languages?.some(l => normalize(l) === target);
    return legacyMatch ? 18 : null;
};

export const rankInterpreterForBooking = (interpreter: Interpreter, job: Pick<Booking | Job, 'languageTo' | 'date' | 'postcode' | 'locationType'>): InterpreterMatchResult => {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];

    const priority = getLanguagePriority(interpreter, job.languageTo);
    if (priority === null) {
        return { interpreter, score: 0, reasons, warnings: [`Does not cover ${job.languageTo}`] };
    }

    score += Math.max(35, 65 - Math.min(priority, 18) * 2);
    reasons.push(priority <= 1 ? `${job.languageTo} priority language` : `${job.languageTo} configured`);

    if (interpreter.status !== 'ACTIVE') {
        return { interpreter, score: 0, reasons, warnings: [`Interpreter status is ${interpreter.status}`] };
    }
    reasons.push('Active interpreter');

    if (!interpreter.isAvailable) {
        return { interpreter, score: 0, reasons, warnings: ['Marked unavailable'] };
    }
    reasons.push('Available');

    const dbsExpiry = interpreter.dbs?.renewDate || interpreter.dbsExpiry;
    if (dbsExpiry) {
        const dbsDate = new Date(dbsExpiry);
        const jobDate = new Date(job.date);
        if (dbsDate > jobDate) {
            score += 10;
            reasons.push('DBS valid on job date');
        } else {
            warnings.push('DBS may be expired by job date');
        }
    } else if (interpreter.dbs?.level && interpreter.dbs.level !== 'N/A' && interpreter.dbs.level !== 'FAILED') {
        score += 5;
        reasons.push(`${interpreter.dbs.level} recorded`);
    } else {
        warnings.push('No valid DBS evidence recorded');
    }

    if (interpreter.acceptsDirectAssignment) {
        score += 5;
        reasons.push('Accepts direct assignment');
    } else {
        warnings.push('Does not explicitly accept direct assignment');
    }

    const interpreterPostcode = interpreter.address?.postcode || interpreter.postcode;
    if (interpreterPostcode && job.postcode) {
        const intPrefix = interpreterPostcode.split(' ')[0].toUpperCase();
        const jobPrefix = job.postcode.split(' ')[0].toUpperCase();
        if (intPrefix === jobPrefix) {
            score += 20;
            reasons.push('Same postcode area');
        } else {
            score += 4;
            reasons.push('Has postcode for travel estimate');
        }
    }

    if (job.locationType === 'ONSITE' && interpreter.hasCar) {
        score += 6;
        reasons.push('Has car for onsite work');
    }

    if (interpreter.keyInterpreter) {
        score += 6;
        reasons.push('Key interpreter');
    }

    return {
        interpreter,
        score: Math.min(100, Math.round(score)),
        reasons,
        warnings
    };
};

export const calculateInterpreterScore = (interpreter: Interpreter, job: Job): number => {
    return rankInterpreterForBooking(interpreter, job).score;
};

export const findBestInterpreters = async (job: Job, limitCount: number = 5): Promise<Interpreter[]> => {
    let allInterpreters: Interpreter[] = [];
    try {
        const q = query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE'));
        const snap = await getDocs(q);
        allInterpreters = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interpreter));
    } catch (error) {
        allInterpreters = MOCK_INTERPRETERS.filter(i => i.status === 'ACTIVE');
    }

    const scored = allInterpreters
        .map(interpreter => rankInterpreterForBooking(interpreter, job))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limitCount).map(r => r.interpreter);
};
