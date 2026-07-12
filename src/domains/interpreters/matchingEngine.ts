import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Booking, Interpreter, ServiceCategory } from '../../types';
import { Job } from '../jobs/types';

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

type MatchableJob = Pick<Booking | Job, 'languageTo' | 'date' | 'postcode' | 'locationType'>
    & Partial<Pick<Booking, 'serviceCategory'>>;

export const rankInterpreterForBooking = (interpreter: Interpreter, job: MatchableJob): InterpreterMatchResult => {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];

    const priority = getLanguagePriority(interpreter, job.languageTo);
    if (priority === null) {
        return { interpreter, score: 0, reasons, warnings: [`Does not cover ${job.languageTo}`] };
    }

    score += Math.max(35, 65 - Math.min(priority, 18) * 2);
    reasons.push(priority <= 1 ? `${job.languageTo} priority language` : `${job.languageTo} configured`);

    const isPassiveImportedProfile = interpreter.status === 'IMPORTED';
    const isTranslationOnly = interpreter.status === 'ONLY_TRANSL';
    if (isTranslationOnly && job.serviceCategory !== ServiceCategory.TRANSLATION) {
        return { interpreter, score: 0, reasons, warnings: ['Translation-only professional'] };
    }
    if (interpreter.status !== 'ACTIVE' && !isPassiveImportedProfile && !isTranslationOnly) {
        return { interpreter, score: 0, reasons, warnings: [`Interpreter status is ${interpreter.status}`] };
    }
    reasons.push(isPassiveImportedProfile
        ? 'Staff-managed active profile'
        : isTranslationOnly ? 'Active translation professional' : 'Active interpreter');

    if (!interpreter.isAvailable && !isPassiveImportedProfile) {
        return { interpreter, score: 0, reasons, warnings: ['Marked unavailable'] };
    }
    if (isPassiveImportedProfile && !interpreter.isAvailable) {
        warnings.push('Availability requires staff confirmation');
        warnings.push('Portal account not activated');
    } else {
        reasons.push('Available');
    }

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
    const q = query(collection(db, 'interpreters'), where('status', 'in', ['ACTIVE', 'IMPORTED', 'ONLY_TRANSL']));
    const snap = await getDocs(q);
    const allInterpreters = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interpreter));

    const scored = allInterpreters
        .map(interpreter => rankInterpreterForBooking(interpreter, job))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limitCount).map(r => r.interpreter);
};
