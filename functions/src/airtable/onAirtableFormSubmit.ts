import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { createHash, timingSafeEqual } from 'crypto';

const db = admin.firestore();
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

const validToken = (provided: unknown, expected: string) => {
  const providedBuffer = Buffer.from(text(provided, 2048));
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
};

/**
 * Compatibility endpoint for the retired Airtable automation bridge.
 * REDBOOK sync is the only writer for Airtable jobs; this endpoint records a
 * receipt so old automations can be observed without creating duplicates.
 */
export const onAirtableFormSubmit = functions.runWith({
  secrets: ['AIRTABLE_SECRET_TOKEN'],
  timeoutSeconds: 30,
  memory: '256MB',
}).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST').status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const expectedToken = process.env.AIRTABLE_SECRET_TOKEN || '';
  const providedToken = req.get('X-Airtable-Token') || req.query.token;
  if (!expectedToken || !validToken(providedToken, expectedToken)) {
    console.warn('[Airtable bridge] Rejected unauthorised compatibility request.');
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const sourceRecordId = text(
    payload.recordId
      || payload.id
      || payload.airtableRecordId
      || payload['Record ID'],
    160,
  );
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  const receivedAt = new Date().toISOString();

  await db.collection('airtableWebhookReceipts').add({
    source: 'LEGACY_AIRTABLE_AUTOMATION',
    sourceRecordId,
    payloadHash,
    action: 'DEFERRED_TO_REDBOOK_SYNC',
    jobCreated: false,
    clientCreated: false,
    communicationSent: false,
    receivedAt,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  res.status(202).json({
    success: true,
    accepted: true,
    sourceRecordId,
    processing: 'REDBOOK_SYNC',
    jobCreated: false,
    communicationSent: false,
  });
});
