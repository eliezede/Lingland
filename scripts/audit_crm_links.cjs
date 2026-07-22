const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { collection, getDocs, getFirestore } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyCfBa6peqcv6hel5fzvU87KU_9bLyZNrM0',
  authDomain: 'lingland-2e52f.firebaseapp.com',
  projectId: 'lingland-2e52f',
  storageBucket: 'lingland-2e52f.firebasestorage.app',
  messagingSenderId: '405261345311',
  appId: '1:405261345311:web:72fa726b4e89aca42aeb2a',
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : '';
};

const values = (name) => argumentValue(name)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRef = (value) => String(value || '').trim().toUpperCase();
const list = (value) => Array.isArray(value) ? value.map(String) : [String(value || '')].filter(Boolean);

const clientEmails = (data) => [
  data.email,
  data.bookingEmail,
  data.primaryContactEmail,
  data.invoiceEmail,
  data.financeEmail,
  ...list(data.contactEmails),
].flatMap(value => String(value || '').split(/[;,]/)).map(normalizeEmail).filter(Boolean);

const clientRefs = (data) => [
  data.sageAccountRef,
  data.airtableClientKey,
  data.sourceKey,
  data.clientKey,
  data.accountCode,
  data.accountRef,
  ...list(data.accountAliases),
].map(normalizeRef).filter(Boolean);

const compactClient = (item) => ({
  id: item.id,
  companyName: item.data.companyName || item.data.name || '',
  canonicalClientId: item.data.canonicalClientId || '',
  mergedIntoClientId: item.data.mergedIntoClientId || '',
  refs: clientRefs(item.data),
  emails: clientEmails(item.data),
  status: item.data.status || '',
});

const compactInterpreter = (item) => ({
  id: item.id,
  name: item.data.name || '',
  email: normalizeEmail(item.data.email),
  sourceRecordId: item.data.sourceRecordId || '',
  airtableRecordIds: list(item.data.airtableRecordIds),
  status: item.data.status || '',
  userId: item.data.userId || '',
});

const main = async () => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is required.');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL || 'admin@lingland.net', password);

  const [clientSnapshot, interpreterSnapshot, userSnapshot] = await Promise.all([
    getDocs(collection(db, 'clients')),
    getDocs(collection(db, 'interpreters')),
    getDocs(collection(db, 'users')),
  ]);
  const clients = clientSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  const interpreters = interpreterSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  const users = userSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

  const accountRefs = values('--account-refs').map(normalizeRef);
  const emails = values('--emails').map(normalizeEmail);
  const sourceRecordIds = values('--source-records');

  const report = {
    counts: { clients: clients.length, interpreters: interpreters.length, users: users.length },
    accountRefs: Object.fromEntries(accountRefs.map(ref => [ref, clients
      .filter(item => clientRefs(item.data).includes(ref))
      .map(compactClient)])),
    emails: Object.fromEntries(emails.map(email => [email, {
      clients: clients.filter(item => clientEmails(item.data).includes(email)).map(compactClient),
      interpreters: interpreters.filter(item => normalizeEmail(item.data.email) === email).map(compactInterpreter),
      users: users.filter(item => normalizeEmail(item.data.email) === email).map(item => ({
        id: item.id,
        displayName: item.data.displayName || item.data.name || '',
        role: item.data.role || '',
        status: item.data.status || '',
        profileId: item.data.profileId || '',
      })),
    }])),
    sourceRecordIds: Object.fromEntries(sourceRecordIds.map(recordId => [recordId, interpreters
      .filter(item => item.data.sourceRecordId === recordId || list(item.data.airtableRecordIds).includes(recordId))
      .map(compactInterpreter)])),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
