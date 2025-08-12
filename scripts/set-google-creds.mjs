import admin from 'firebase-admin';

const service = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (service.private_key) service.private_key = service.private_key.replace(/\\n/g, '\n');
admin.initializeApp({ credential: admin.credential.cert(service) });

const db = admin.firestore();

const client_id = 'XXX.apps.googleusercontent.com';
const client_secret = 'YYY';
const redirect_uri = 'https://ehi-lab.it/api/google/oauth/callback';

await db.doc('config/google').set({ client_id, client_secret, redirect_uri, updatedAt: new Date() }, { merge: true });
console.log('✅ config/google creato/aggiornato');
process.exit(0);