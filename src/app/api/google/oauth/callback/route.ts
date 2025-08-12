// src/app/api/google/oauth/callback/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { loadAppCredsForUser } from '@/lib/google-app-creds';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  const stateStr = sp.get('state');
  if (!code || !stateStr) return NextResponse.json({ error: 'Missing code/state' }, { status: 400 });

  let uid = '', nonce = '';
  try {
    ({ uid, nonce } = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8')));
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  const stateRef = adminDB.doc(`users/${uid}/oauth_states/${nonce}`);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) return NextResponse.json({ error: 'State not found/expired' }, { status: 400 });

  const { redirect_uri } = (stateSnap.data() || {}) as any;
  await stateRef.delete();

  const app = await loadAppCredsForUser(uid);
  const ru = redirect_uri || app.redirect_uri || `${req.nextUrl.origin}/api/google/oauth/callback`;

  const params = new URLSearchParams({
    code,
    client_id: app.client_id,
    client_secret: app.client_secret,
    redirect_uri: ru,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Token exchange failed', details: json }, { status: 400 });
  }

  await adminDB.doc(`users/${uid}/google/oauth`).set({
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expiry_date: Date.now() + (json.expires_in || 3600) * 1000,
    scope: json.scope,
    token_type: json.token_type,
    updatedAt: new Date(),
  }, { merge: true });

  const okUrl = new URL('/chatboost/impostazioni/automazioni', req.nextUrl.origin);
  okUrl.searchParams.set('google', 'connected');
  return NextResponse.redirect(okUrl.toString(), { status: 302 });
}