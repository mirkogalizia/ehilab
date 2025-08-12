import { adminDB } from './firebase-admin';

export async function loadAppCredsForUser(uid: string) {
  // 1) BYOG per-utente (se esiste)
  const perUser = await adminDB.doc(`users/${uid}/google/app`).get();
  if (perUser.exists) {
    const d = perUser.data() as any;
    if (d?.client_id && d?.client_secret) return d;
  }
  // 2) Fallback globale
  const globalDoc = await adminDB.doc('config/google/app').get();
  if (globalDoc.exists) {
    const g = globalDoc.data() as any;
    if (g?.client_id && g?.client_secret) return g;
  }
  throw new Error('Credenziali OAuth app non trovate (né utente né globali).');
}