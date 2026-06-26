/**
 * Cleanup Script: Remove all Airtable-imported data from Firestore
 * Uses the Firebase client SDK (same as the web app) with admin credentials
 * 
 * Run with: node cleanup_airtable_jobs.cjs [--dry-run]
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, writeBatch, doc, deleteDoc, getCountFromServer, getDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyCfBa6peqcv6hel5fzvU87KU_9bLyZNrM0",
  authDomain: "lingland-2e52f.firebaseapp.com",
  projectId: "lingland-2e52f",
  storageBucket: "lingland-2e52f.firebasestorage.app",
  messagingSenderId: "405261345311",
  appId: "1:405261345311:web:72fa726b4e89aca42aeb2a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

function buildQuery(collectionName, filter) {
  const colRef = collection(db, collectionName);
  if (filter.op === '==') {
    return query(colRef, where(filter.field, '==', filter.value));
  } else if (filter.op === 'prefix') {
    return query(
      colRef,
      where(filter.field, '>=', filter.value),
      where(filter.field, '<=', filter.value + '\uf8ff')
    );
  }
  throw new Error(`Unsupported operator: ${filter.op}`);
}

async function deleteCollectionDocs(collectionName, filter) {
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const q = buildQuery(collectionName, filter);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would delete ${snapshot.size} docs from ${collectionName}`);
      snapshot.docs.slice(0, 3).forEach(d => {
        const data = d.data();
        console.log(`    - ${d.id} | ${data.bookingRef || data.jobNumber || data.invoiceNumber || data.companyName || data.sourceRecordId || '(no ref)'}`);
      });
      totalDeleted += snapshot.size;
      hasMore = false;
    } else {
      // Delete in sub-batches
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        totalDeleted += chunk.length;
        console.log(`  Deleted ${chunk.length} from ${collectionName} (total: ${totalDeleted})`);
      }
    }
  }

  return totalDeleted;
}

async function main() {
  // Login as admin
  console.log('Logging in as admin...');
  const email = process.env.ADMIN_EMAIL || 'admin@lingland.net';
  const password = process.env.ADMIN_PASSWORD;
  
  if (!password) {
    console.error('ERROR: Set ADMIN_PASSWORD environment variable.');
    console.error('Example: $env:ADMIN_PASSWORD="yourpass"; node cleanup_airtable_jobs.cjs --dry-run');
    process.exit(1);
  }

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated as', email);

  console.log('\n' + '='.repeat(60));
  console.log(DRY_RUN ? '  AIRTABLE CLEANUP — DRY RUN' : '  AIRTABLE CLEANUP — LIVE DELETE');
  console.log('='.repeat(60));

  const targets = [
    { name: 'clientInvoices', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
    { name: 'clientInvoiceLines', filter: { field: 'invoiceId', op: 'prefix', value: 'airtable_' } },
    { name: 'interpreterInvoices', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
    { name: 'interpreterInvoiceLines', filter: { field: 'invoiceId', op: 'prefix', value: 'airtable_' } },
    { name: 'bookingAssignments', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
    { name: 'bookings', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
    { name: 'timesheets', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
    { name: 'jobEvents', filter: { field: 'source', op: '==', value: 'airtable' } },
    { name: 'clients', filter: { field: 'sourceSystem', op: '==', value: 'AIRTABLE' } },
  ];

  // Count first
  console.log('\nCounting documents...');
  for (const t of targets) {
    const q = buildQuery(t.name, t.filter);
    const snap = await getCountFromServer(q);
    console.log(`  ${t.name}: ${snap.data().count}`);
  }

  // Delete
  console.log('\nDeleting...');
  const results = {};
  for (const t of targets) {
    console.log(`\n--- ${t.name} ---`);
    results[t.name] = await deleteCollectionDocs(t.name, t.filter);
  }

  // Reset checkpoint
  console.log('\n--- Sync Checkpoint ---');
  const checkRef = doc(db, 'system', 'airtableSyncCenter');
  const checkSnap = await getDoc(checkRef);
  if (checkSnap.exists()) {
    if (DRY_RUN) {
      console.log('  [DRY RUN] Would delete sync checkpoint');
    } else {
      await deleteDoc(checkRef);
      console.log('  Deleted sync checkpoint');
    }
  } else {
    console.log('  No checkpoint found');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  Object.entries(results).forEach(([name, count]) => {
    console.log(`  ${name}: ${count} ${DRY_RUN ? '(would delete)' : 'deleted'}`);
  });
  console.log('\n' + (DRY_RUN ? '✅ Dry run complete. Nothing deleted.' : '✅ Cleanup done. Ready for re-sync.'));
  
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
