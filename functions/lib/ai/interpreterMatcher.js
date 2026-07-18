"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankInterpreterForBooking = exports.findBestInterpreterForBooking = exports.rankInterpreterCandidate = void 0;
const normalize = (value) => String(value ?? '').trim().toLowerCase();
const timeToMinutes = (value) => {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const overlaps = (booking, candidate) => {
    if (String(booking.date || '') !== String(candidate.date || ''))
        return false;
    const firstStart = timeToMinutes(booking.startTime);
    const secondStart = timeToMinutes(candidate.startTime);
    const firstEnd = firstStart + Math.max(15, Number(booking.durationMinutes) || 60);
    const secondEnd = secondStart + Math.max(15, Number(candidate.durationMinutes) || 60);
    return firstStart < secondEnd && secondStart < firstEnd;
};
const languagePriority = (interpreter, language) => {
    const target = normalize(language);
    if (!target)
        return null;
    const proficiencies = Array.isArray(interpreter.languageProficiencies) ? interpreter.languageProficiencies : [];
    const proficiency = proficiencies.find(item => normalize(item?.language) === target);
    if (proficiency)
        return Math.max(1, Number(proficiency.l1) || 18);
    const languages = Array.isArray(interpreter.languages) ? interpreter.languages : [];
    return languages.some(item => normalize(item) === target) ? 18 : null;
};
const rankInterpreterCandidate = (id, interpreter, booking, conflicting) => {
    const status = String(interpreter.status || '').toUpperCase();
    if (!['ACTIVE', 'IMPORTED', 'ONLY_TRANSL'].includes(status))
        return null;
    const isTranslation = [booking.serviceCategory, booking.serviceType]
        .some(value => String(value || '').toUpperCase() === 'TRANSLATION');
    if (status === 'ONLY_TRANSL' && !isTranslation)
        return null;
    const priority = languagePriority(interpreter, String(booking.languageTo || ''));
    if (priority === null || conflicting)
        return null;
    const reasons = [];
    const warnings = [];
    let score = Math.max(35, 65 - Math.min(priority, 18) * 2);
    reasons.push(priority <= 1 ? 'Priority language' : 'Language configured');
    if (status === 'ACTIVE') {
        score += 12;
        reasons.push('Active portal profile');
    }
    else {
        score += 5;
        warnings.push('Staff-managed profile');
    }
    if (interpreter.isAvailable === false && status === 'ACTIVE')
        return null;
    if (interpreter.isAvailable === false)
        warnings.push('Availability requires staff confirmation');
    else {
        score += 8;
        reasons.push('Marked available');
    }
    const dbsExpiry = interpreter.dbs?.renewDate || interpreter.dbsExpiry;
    if (dbsExpiry && booking.date) {
        const valid = new Date(String(dbsExpiry)).getTime() >= new Date(String(booking.date)).getTime();
        if (!valid)
            return null;
        score += 8;
        reasons.push('DBS valid on job date');
    }
    else if (String(interpreter.dbs?.level || '').toUpperCase() === 'FAILED') {
        return null;
    }
    else {
        warnings.push('DBS date not verified by matcher');
    }
    if (interpreter.acceptsDirectAssignment === true) {
        score += 8;
        reasons.push('Accepts direct assignment');
    }
    else {
        warnings.push('Direct assignment preference not confirmed');
    }
    const interpreterPostcode = normalize(interpreter.address?.postcode || interpreter.postcode).split(' ')[0];
    const jobPostcode = normalize(booking.postcode).split(' ')[0];
    if (interpreterPostcode && jobPostcode && interpreterPostcode === jobPostcode) {
        score += 15;
        reasons.push('Same postcode area');
    }
    if (String(booking.locationType || '').toUpperCase() === 'ONSITE' && interpreter.hasCar === true) {
        score += 5;
        reasons.push('Car available for onsite work');
    }
    if (interpreter.keyInterpreter === true)
        score += 4;
    return {
        id,
        name: String(interpreter.name || 'Professional'),
        score: Math.min(100, Math.round(score)),
        reasons,
        warnings,
    };
};
exports.rankInterpreterCandidate = rankInterpreterCandidate;
const findBestInterpreterForBooking = async (db, bookingId, booking, excludedIds = []) => {
    const [interpreters, sameDayJobs] = await Promise.all([
        db.collection('interpreters').where('status', 'in', ['ACTIVE', 'IMPORTED', 'ONLY_TRANSL']).limit(500).get(),
        booking.date
            ? db.collection('bookings').where('date', '==', String(booking.date)).limit(500).get()
            : Promise.resolve({ docs: [] }),
    ]);
    const excluded = new Set(excludedIds.map(String));
    const terminal = new Set(['CANCELLED', 'PAID']);
    return interpreters.docs
        .filter(doc => !excluded.has(doc.id))
        .map(doc => {
        const conflicting = sameDayJobs.docs.some(job => {
            if (job.id === bookingId)
                return false;
            const value = job.data();
            return String(value.interpreterId || '') === doc.id
                && !terminal.has(String(value.status || '').toUpperCase())
                && overlaps(booking, value);
        });
        return (0, exports.rankInterpreterCandidate)(doc.id, doc.data(), booking, conflicting);
    })
        .filter((item) => item !== null && item.score >= 60)
        .sort((first, second) => second.score - first.score || first.id.localeCompare(second.id))[0] || null;
};
exports.findBestInterpreterForBooking = findBestInterpreterForBooking;
const rankInterpreterForBooking = async (db, bookingId, booking, interpreterId) => {
    const [interpreter, sameDayJobs] = await Promise.all([
        db.collection('interpreters').doc(interpreterId).get(),
        booking.date
            ? db.collection('bookings').where('date', '==', String(booking.date)).limit(500).get()
            : Promise.resolve({ docs: [] }),
    ]);
    if (!interpreter.exists)
        return null;
    const terminal = new Set(['CANCELLED', 'PAID']);
    const conflicting = sameDayJobs.docs.some(job => {
        if (job.id === bookingId)
            return false;
        const value = job.data();
        return String(value.interpreterId || '') === interpreterId
            && !terminal.has(String(value.status || '').toUpperCase())
            && overlaps(booking, value);
    });
    const result = (0, exports.rankInterpreterCandidate)(interpreterId, interpreter.data() || {}, booking, conflicting);
    return result && result.score >= 60 ? result : null;
};
exports.rankInterpreterForBooking = rankInterpreterForBooking;
//# sourceMappingURL=interpreterMatcher.js.map