import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { brevoService } from '../services/brevoService';

const getCommunicationMode = async () => {
    const settings = await admin.firestore().collection('system').doc('settings').get();
    return settings.data()?.platformMode?.communicationMode || 'SUPPRESSED';
};

export const onEmailCreated = functions.runWith({
    secrets: ['BREVO_API_KEY'],
    timeoutSeconds: 60,
    memory: '256MB'
}).firestore
    .document('mail/{mailId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data) return null;

        const { to, message } = data;
        if (!to || !message) {
            console.warn(`[onEmailCreated] Missing to or message for ${context.params.mailId}. Data:`, data);
            return null;
        }

        const { subject, html } = message;

        try {
            const communicationMode = await getCommunicationMode();
            if (communicationMode !== 'LIVE') {
                console.log(`[onEmailCreated] Suppressed email ${context.params.mailId} because communication mode is ${communicationMode}.`);
                await admin.firestore().collection('emailAudit').add({
                    ...data,
                    mailId: context.params.mailId,
                    status: 'SUPPRESSED',
                    communicationMode,
                    suppressedReason: `Communication mode ${communicationMode} suppressed outbound delivery`,
                    createdAt: new Date().toISOString()
                });

                return snap.ref.update({
                    delivery: {
                        state: 'SUPPRESSED',
                        communicationMode,
                        suppressedAt: new Date().toISOString()
                    }
                });
            }

            console.log(`[onEmailCreated] Sending email via Brevo for: ${context.params.mailId}`);
            await brevoService.sendEmail(
                Array.isArray(to) ? to : [to],
                subject,
                html
            );

            // Update the status in the Firestore document
            return snap.ref.update({
                delivery: {
                    state: 'SUCCESS',
                    sentAt: new Date().toISOString()
                }
            });
        } catch (error: any) {
            console.error(`[onEmailCreated] ❌ Error sending email:`, error);
            return snap.ref.update({
                delivery: {
                    state: 'ERROR',
                    error: error.message,
                    errorTime: new Date().toISOString()
                }
            });
        }
    });
