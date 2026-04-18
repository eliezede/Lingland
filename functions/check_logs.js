const admin = require('firebase-admin');

// Note: This script assumes you have FIREBASE_CONFIG or are in a environment 
// where admin.initializeApp() works (like a local terminal with firebase login)
// Or we can just use the Service Account if provided.

// Since I am an agent, I'll try to use the project ID from the config
const projectId = 'lingland-interpreter-app'; // From app.json

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: projectId,
  });
}

const db = admin.firestore();

async function getLogs() {
  console.log('--- FETCHING RECENT APP LOGS ---');
  const snap = await db.collection('app_logs')
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();

  if (snap.empty) {
    console.log('No logs found.');
    return;
  }

  snap.docs.forEach(doc => {
    const data = doc.data();
    const time = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A';
    console.log(`[${time}] [${data.level}] ${data.message}`);
    if (data.level === 'ERROR' || data.level === 'FATAL') {
      console.log('  Data:', JSON.stringify(data.data, null, 2));
      if (data.stack) console.log('  Stack:', data.stack);
    }
    console.log('---');
  });
}

getLogs().catch(console.error);
