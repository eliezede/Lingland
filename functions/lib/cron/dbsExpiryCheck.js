"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbsExpiryCheck = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// Creates a PubSub schedule running every weekday at 09:00 AM Europe/London time
exports.dbsExpiryCheck = functions.pubsub
    .schedule('0 9 * * 1-5')
    .timeZone('Europe/London')
    .onRun(async (context) => {
    console.log('Running daily DBS expiry check for interpreters...');
    const now = new Date();
    // 30 days from now
    const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection('interpreters')
        .where('status', 'in', ['ACTIVE', 'ONBOARDING']) // Only check active or onboarding
        .get();
    const batch = db.batch();
    let count = 0;
    snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const renewDateStr = data.dbs?.renewDate;
        if (!renewDateStr)
            return;
        const renewDate = new Date(renewDateStr);
        const isExpired = renewDate <= now;
        const paysToWarn = renewDate > now && renewDate <= warningDate;
        if (isExpired || paysToWarn) {
            const title = isExpired ? 'CRITICAL: DBS Expired' : 'Action Required: DBS Expiring Soon';
            const body = isExpired
                ? 'Your DBS Certificate has expired. You may be blocked from receiving new jobs. Please upload a new certificate immediately.'
                : `Your DBS Certificate will expire on ${renewDate.toLocaleDateString('en-GB')}. Please upload a new certificate within 30 days.`;
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
                userId: doc.id,
                title,
                body,
                topic: 'DBS_ALERTS',
                read: false,
                data: {
                    type: 'DBS_EXPIRY',
                    isExpired: isExpired
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            count++;
        }
    });
    if (count > 0) {
        await batch.commit();
        console.log(`Sent DBS expiry notifications to ${count} interpreters.`);
    }
    else {
        console.log('No interpreters require DBS expiry warnings today.');
    }
    return null;
});
//# sourceMappingURL=dbsExpiryCheck.js.map