// src/lib/auth-server.ts
import { adminAuth } from './firebase-admin';

export async function getUidFromAuthHeader(authorization?: string | null) {
  if (!authorization) throw new Error('Missing Authorization header');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing Bearer token');
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}