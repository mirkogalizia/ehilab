import { adminAuth } from './firebase-admin';

export async function getUidFromAuthHeader(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header');
  }
  const idToken = authHeader.slice(7);
  const decoded = await adminAuth.verifyIdToken(idToken);
  return decoded.uid;
}