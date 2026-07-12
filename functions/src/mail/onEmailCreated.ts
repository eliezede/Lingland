import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { brevoService } from '../services/brevoService';
import { canDeliverCommunication, normalizeCommunicationMode } from '../communications/deliveryPolicy';

const getCommunicationMode = async () => {
    const settings = await admin.firestore().collection('system').doc('settings').get();
    return normalizeCommunicationMode(settings.data()?.platformMode?.communicationMode);
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
            const recipientType = String(data.recipientType || '').toUpperCase();
            const canSend = canDeliverCommunication(communicationMode, recipientType);
            if (!canSend) {
                console.log(`[onEmailCreated] Suppressed email ${context.params.mailId} because communication mode is ${communicationMode}.`);
                await admin.firestore().collection('emailAudit').doc(context.params.mailId).set({
                    ...data,
                    mailId: context.params.mailId,
                    status: 'SUPPRESSED',
                    recipientType: recipientType || 'UNKNOWN',
                    communicationMode,
                    suppressedReason: `Communication mode ${communicationMode} suppressed outbound delivery`,
                    createdAt: new Date().toISOString()
                }, { merge: true });

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

            await admin.firestore().collection('emailAudit').doc(context.params.mailId).set({
                ...data,
                mailId: context.params.mailId,
                status: 'SENT',
                communicationMode,
                sentAt: new Date().toISOString(),
                createdAt: data.createdAt || new Date().toISOString()
            }, { merge: true });

            // Update the status in the Firestore document
            return snap.ref.update({
                delivery: {
                    state: 'SUCCESS',
                    communicationMode,
                    sentAt: new Date().toISOString()
                }
            });
        } catch (error: any) {
            await admin.firestore().collection('emailAudit').doc(context.params.mailId).set({
                ...data,
                mailId: context.params.mailId,
                status: 'ERROR',
                error: String(error?.message || 'Unknown email delivery error'),
                errorAt: new Date().toISOString(),
                createdAt: data.createdAt || new Date().toISOString()
            }, { merge: true }).catch(() => undefined);
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
