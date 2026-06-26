/**
 * Airtable Sync Runner: Triggers the syncAirtableData cloud function
 * 
 * Usage:
 *   node run_airtable_sync.cjs [--dry-run] [--modules clients,redbook] [--limit 500]
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

const firebaseConfig = {
  apiKey: "AIzaSyCfBa6peqcv6hel5fzvU87KU_9bLyZNrM0",
  authDomain: "lingland-2e52f.firebaseapp.com",
  projectId: "lingland-2e52f",
  storageBucket: "lingland-2e52f.firebasestorage.app",
  messagingSenderId: "405261345311",
  appId: "1:405261345311:web:72fa726b4e89aca42aeb2a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const DRY_RUN = process.argv.includes('--dry-run');

// Parse --modules argument
const modulesIdx = process.argv.indexOf('--modules');
let modules = 'full';
if (modulesIdx !== -1 && modulesIdx + 1 < process.argv.length) {
  const rawModules = process.argv[modulesIdx + 1];
  if (rawModules !== 'full') {
    modules = rawModules.split(',').map(m => m.trim());
  }
}

// Parse --limit argument
const limitIdx = process.argv.indexOf('--limit');
let limitRecords = 500;
if (limitIdx !== -1 && limitIdx + 1 < process.argv.length) {
  limitRecords = parseInt(process.argv[limitIdx + 1], 10) || 500;
}

async function main() {
  console.log('Logging in as admin...');
  const email = process.env.ADMIN_EMAIL || 'admin@lingland.net';
  const password = process.env.ADMIN_PASSWORD || '*1234567';

  if (!password) {
    console.error('ERROR: ADMIN_PASSWORD is required');
    process.exit(1);
  }

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated as', email);

  console.log('\n' + '='.repeat(60));
  console.log(DRY_RUN ? '  AIRTABLE SYNC — DRY RUN' : '  AIRTABLE SYNC — LIVE SYNC');
  console.log(`  Modules: ${Array.isArray(modules) ? modules.join(', ') : modules}`);
  console.log(`  Record Limit: ${limitRecords}`);
  console.log('='.repeat(60));

  console.log('Calling syncAirtableData Cloud Function...');
  const syncFn = httpsCallable(functions, 'syncAirtableData', { timeout: 540000 });
  
  const res = await syncFn({
    dryRun: DRY_RUN,
    modules: modules,
    limitRecords: limitRecords
  });

  console.log('\nResponse received:');
  console.log(JSON.stringify(res.data, null, 2));

  console.log('\n✅ Sync process completed successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL ERROR:', err.message || err);
  if (err.details) {
    console.error('Details:', err.details);
  }
  process.exit(1);
});
