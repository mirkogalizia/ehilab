import * as admin from 'firebase-admin';

function resolveServiceAccount(): admin.ServiceAccount | null {
  // 1) Preferisci FIREBASE_SERVICE_ACCOUNT (JSON completo)
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (jsonEnv && jsonEnv.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(jsonEnv);
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed as admin.ServiceAccount;
    } catch {
      // se non è JSON valido, continuo con l’opzione 2
    }
  }

  // 2) Variante "chiave privata split" (serve anche PROJECT_ID + CLIENT_EMAIL)
  const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n');
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (privateKey && projectId && clientEmail) {
    return { projectId, clientEmail, privateKey } as unknown as admin.ServiceAccount;
  }

  return null;
}

if (!admin.apps.length) {
  const sa = resolveServiceAccount();
  if (!sa) {
    throw new Error(
      'Firebase Admin: credenziali mancanti. Imposta FIREBASE_SERVICE_ACCOUNT (JSON) ' +
      'oppure FIREBASE_SERVICE_ACCOUNT_KEY (JSON o private key) + FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL.'
    );
  }
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

export const adminDB = admin.firestore();
export const adminAuth = admin.auth();
export const adminTimestamp = admin.firestore.Timestamp;
export const adminFieldValue = admin.firestore.FieldValue;