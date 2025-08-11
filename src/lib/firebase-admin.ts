// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : undefined;

  admin.initializeApp(
    svc ? { credential: admin.credential.cert(svc as admin.ServiceAccount) }
        : { credential: admin.credential.applicationDefault() }
  );
}

export const adminDB = admin.firestore();
export const adminAuth = admin.auth();
export const adminTimestamp = admin.firestore.Timestamp;
export const adminFieldValue = admin.firestore.FieldValue;