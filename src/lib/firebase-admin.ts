// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY (JSON del service account).');
  }

  let creds: Record<string, any>;
  try {
    creds = JSON.parse(raw);
    if (creds.private_key && typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY deve essere una stringa JSON valida.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(creds as admin.ServiceAccount),
    // opzionale ma utile se usi Storage
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'ehilab.appspot.com',
  });
}

export const adminDB = admin.firestore();
export const adminAuth = admin.auth();
export const adminTimestamp = admin.firestore.Timestamp;
export const adminFieldValue = admin.firestore.FieldValue;
// opzionale: export anche il bucket se ti serve
export const adminBucket = admin.storage ? admin.storage().bucket() : (undefined as any);