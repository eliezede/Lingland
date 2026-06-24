import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'lingland-2e52f';
const DATABASE_ID = '(default)';
const API_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

const DELETE_COLLECTIONS = [
  'bookings',
  'clients',
  'jobEvents',
  'timesheets',
  'assignments',
  'bookingAssignments',
  'clientInvoices',
  'clientInvoiceLines',
  'interpreterInvoices',
  'interpreterInvoiceLines'
];

const FILTERED_COLLECTIONS = {
  notifications: (doc) => {
    const link = readString(doc.fields?.link);
    const title = readString(doc.fields?.title);
    const message = readString(doc.fields?.message);
    return [link, title, message].some(value => /booking|job|timesheet|invoice|assignment/i.test(value));
  },
  chatThreads: (doc) => Boolean(readString(doc.fields?.bookingId)),
  messages: (doc) => Boolean(readString(doc.fields?.bookingId) || readString(doc.fields?.threadId))
};

function readString(value) {
  if (!value) return '';
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.integerValue === 'string') return value.integerValue;
  if (typeof value.doubleValue === 'number') return String(value.doubleValue);
  if (typeof value.booleanValue === 'boolean') return String(value.booleanValue);
  return '';
}

function getAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found. Run firebase login first.');
  return token;
}

async function request(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${text.slice(0, 500)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listCollection(token, collectionId) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`${API_ROOT}/${collectionId}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await request(token, url.toString());
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function deleteDoc(token, docName) {
  await request(token, `https://firestore.googleapis.com/v1/${docName}`, { method: 'DELETE' });
}

function backupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `operational-cleanup-${stamp}.json`);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const token = getAccessToken();
  const backup = {
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    mode: execute ? 'execute' : 'dry-run',
    collections: {}
  };
  const deleteQueue = [];

  for (const collectionId of DELETE_COLLECTIONS) {
    const docs = await listCollection(token, collectionId);
    backup.collections[collectionId] = docs;
    deleteQueue.push(...docs.map(doc => ({ collectionId, name: doc.name })));
  }

  for (const [collectionId, shouldDelete] of Object.entries(FILTERED_COLLECTIONS)) {
    const docs = await listCollection(token, collectionId);
    const matched = docs.filter(shouldDelete);
    backup.collections[collectionId] = matched;
    deleteQueue.push(...matched.map(doc => ({ collectionId, name: doc.name })));
  }

  const file = backupPath();
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));

  const counts = deleteQueue.reduce((acc, item) => {
    acc[item.collectionId] = (acc[item.collectionId] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    execute,
    backupFile: file,
    totalToDelete: deleteQueue.length,
    counts
  }, null, 2));

  if (!execute) return;

  for (let i = 0; i < deleteQueue.length; i += 1) {
    await deleteDoc(token, deleteQueue[i].name);
    if ((i + 1) % 50 === 0 || i + 1 === deleteQueue.length) {
      console.log(`Deleted ${i + 1}/${deleteQueue.length}`);
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
