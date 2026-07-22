/**
 * Airtable Sync Runner: Triggers the syncAirtableData cloud function
 * 
 * Usage:
 *   node run_airtable_sync.cjs --dry-run --modules clients,redbook --limit 500 --strategy FULL_AUDIT
 *   node run_airtable_sync.cjs --modules clients,redbook --limit 500 --strategy FULL_AUDIT --approve-run RUN_ID
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
const VERBOSE = process.argv.includes('--verbose');
const DIAGNOSTIC_SUMMARY = process.argv.includes('--diagnostic-summary');
const DIAGNOSTIC_COUNTS_ONLY = process.argv.includes('--diagnostic-counts-only');
const DIAGNOSTIC_CANONICAL_ACCOUNTS = process.argv.includes('--diagnostic-canonical-accounts');

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : '';
};

// Parse --modules argument
let modules = 'full';
const rawModules = argumentValue('--modules');
if (rawModules) {
  if (rawModules !== 'full') {
    modules = rawModules.split(',').map(m => m.trim());
  }
}

// Parse --limit argument
let limitRecords = 500;
const rawLimit = argumentValue('--limit');
if (rawLimit) limitRecords = parseInt(rawLimit, 10) || 500;

const allowedStrategies = new Set(['OPEN_WORKFLOW', 'UPDATED_SINCE_LAST_SYNC', 'RECENT_OPEN', 'FULL_AUDIT', 'CUSTOM_LIMIT']);
const syncStrategy = (argumentValue('--strategy') || 'OPEN_WORKFLOW').toUpperCase();
const expectedDryRunId = argumentValue('--approve-run');

if (!allowedStrategies.has(syncStrategy)) {
  console.error(`ERROR: Unsupported sync strategy ${syncStrategy}`);
  process.exit(1);
}

if (!DRY_RUN && !expectedDryRunId) {
  console.error('ERROR: --approve-run RUN_ID is required for every write sync.');
  process.exit(1);
}

const compactDiagnostics = (diagnostics) => {
  if (!diagnostics || typeof diagnostics !== 'object') return diagnostics;
  const canonicalAccounts = diagnostics.canonicalAccounts || {};
  const clientsBook = diagnostics.clientsBook || {};
  if (!diagnostics.canonicalAccounts && !diagnostics.clientsBook) return diagnostics;

  return {
    canonicalAccounts: {
      sourceRecords: canonicalAccounts.sourceRecords || 0,
      wouldCreateCanonicalAccounts: DIAGNOSTIC_COUNTS_ONLY && !DIAGNOSTIC_CANONICAL_ACCOUNTS
        ? (canonicalAccounts.wouldCreateCanonicalAccounts || []).length
        : (canonicalAccounts.wouldCreateCanonicalAccounts || []).map(candidate => ({
          companyName: candidate.companyName,
          sageAccountRef: candidate.sageAccountRef,
          clientId: candidate.clientId,
          groupKey: candidate.groupKey,
        })),
    },
    clientsBook: {
      clientsBookSourceRecords: clientsBook.clientsBookSourceRecords || 0,
      departmentSourceRecords: clientsBook.departmentSourceRecords || 0,
      exactOrganisationGroups: clientsBook.exactOrganisationGroups || 0,
      canonicalOrganisations: clientsBook.canonicalOrganisations || 0,
      resolutionMethods: clientsBook.resolutionMethods || {},
      ambiguousGroups: clientsBook.ambiguousGroups || 0,
      ambiguousSourceRecords: clientsBook.ambiguousSourceRecords || 0,
      conflictReasons: clientsBook.conflictReasons || {},
      projectedDepartments: clientsBook.projectedDepartments || 0,
      projectedAgents: clientsBook.projectedAgents || 0,
      projectedMemberships: clientsBook.projectedMemberships || 0,
      unresolvedContacts: clientsBook.unresolvedContacts || 0,
        conflictCandidates: DIAGNOSTIC_COUNTS_ONLY
          ? (clientsBook.conflictCandidates || []).length
          : (clientsBook.conflictCandidates || []).map(candidate => ({
          sourceTable: candidate.sourceTable,
          reason: candidate.reason,
          groupKey: candidate.groupKey,
          companyNames: candidate.companyNames,
        candidateClientIds: candidate.candidateClientIds,
        sourceRecordCount: Array.isArray(candidate.sourceRecordIds) ? candidate.sourceRecordIds.length : 0,
        recommendation: candidate.recommendation ? {
          canonicalClientId: candidate.recommendation.canonicalClientId,
          canonicalCompanyName: candidate.recommendation.canonicalCompanyName,
          confidence: candidate.recommendation.confidence,
          score: candidate.recommendation.score,
          autoReviewEligible: candidate.recommendation.autoReviewEligible,
          evidence: candidate.recommendation.evidence,
        } : null,
          })),
        newCanonicalOrganisationCandidates: DIAGNOSTIC_COUNTS_ONLY
          ? (clientsBook.newCanonicalOrganisationCandidates || []).length
          : (clientsBook.newCanonicalOrganisationCandidates || []).map(candidate => ({
          groupKey: candidate.groupKey,
          canonicalCompanyName: candidate.canonicalCompanyName,
          proposedClientId: candidate.proposedClientId,
        sourceRecordCount: candidate.sourceRecordCount,
        sourceNames: candidate.sourceNames,
        recommendation: candidate.recommendation ? {
          canonicalClientId: candidate.recommendation.canonicalClientId,
          canonicalCompanyName: candidate.recommendation.canonicalCompanyName,
          confidence: candidate.recommendation.confidence,
          score: candidate.recommendation.score,
          autoReviewEligible: candidate.recommendation.autoReviewEligible,
          evidence: candidate.recommendation.evidence,
        } : null,
          })),
    },
  };
};

async function main() {
  console.log('Logging in as admin...');
  const email = process.env.ADMIN_EMAIL || 'admin@lingland.net';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('ERROR: ADMIN_PASSWORD is required. Do not store it in this script.');
    process.exit(1);
  }

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated as', email);

  console.log('\n' + '='.repeat(60));
  console.log(DRY_RUN ? '  AIRTABLE SYNC — DRY RUN' : '  AIRTABLE SYNC — LIVE SYNC');
  console.log(`  Modules: ${Array.isArray(modules) ? modules.join(', ') : modules}`);
  console.log(`  Record Limit: ${limitRecords}`);
  console.log(`  Strategy: ${syncStrategy}`);
  if (expectedDryRunId) console.log(`  Approved by Dry Run: ${expectedDryRunId}`);
  console.log('='.repeat(60));

  console.log('Calling syncAirtableData Cloud Function...');
  const syncFn = httpsCallable(functions, 'syncAirtableData', { timeout: 540000 });
  
  const res = await syncFn({
    dryRun: DRY_RUN,
    modules: modules,
    limitRecords: limitRecords,
    syncStrategy,
    expectedDryRunId: expectedDryRunId || undefined,
  });

  console.log('\nResponse received:');
  const result = res.data;
  const summary = {
    success: result.success,
    syncRunId: result.syncRunId,
    mappingVersion: result.mappingVersion,
    syncStrategy: result.syncStrategy,
    limitRecords: result.limitRecords,
    dryRun: result.dryRun,
    importMode: result.importMode,
    stats: result.stats,
    writeApproval: result.writeApproval,
    modules: (result.moduleResults || []).map(module => ({
      module: module.module,
      records: module.records,
      stats: module.stats,
      identityEvidence: module.identityEvidence,
      diagnostics: DIAGNOSTIC_SUMMARY ? compactDiagnostics(module.diagnostics) : module.diagnostics,
    })),
  };
  console.log(JSON.stringify(VERBOSE ? result : summary, null, 2));

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
