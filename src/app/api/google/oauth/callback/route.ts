// /app/api/google/oauth/callback/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get('code');
  const state = sp.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code/state' }, { status: 400 });
  }

  // Decodifica state → { uid, nonce }
  let uid = '';
  let nonce = '';
  try {
    ({ uid, nonce } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')));
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  // Verifica ed elimina lo state (anti-CSRF)
  const stateRef = adminDB.doc(`users/${uid}/oauth_states/${nonce}`);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) {
    return NextResponse.json({ error: 'State not found/expired' }, { status: 400 });
  }
  await stateRef.delete();

  // Leggi eventuali credenziali BYOG dell'utente
  const appSnap = await adminDB.doc(`users/${uid}/google/app`).get();
  const appCfg = appSnap.exists ? (appSnap.data() as any) : null;

  const redirectUri =
    appCfg?.redirect_uri ||
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/google/oauth/callback`;

  const clientId = appCfg?.client_id || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = appCfg?.client_secret || process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing OAuth client credentials' }, { status: 500 });
  }

  // Scambio code → tokens
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json({ error: 'Token exchange failed', details: text }, { status: 400 });
  }

  const json = await tokenRes.json();

  // Salva token per-utente
  await adminDB.doc(`users/${uid}/google/oauth`).set(
    {
      access_token: json.access_token,
      refresh_token: json.refresh_token || null, // può mancare se già concesso in passato
      expiry_date: Date.now() + (json.expires_in || 3600) * 1000,
      scope: json.scope,
      token_type: json.token_type,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  // Redirect alla pagina impostazioni/automazioni della tua app
  const okUrl = new URL('/chatboost/impostazioni/automazioni', process.env.NEXT_PUBLIC_BASE_URL);
  okUrl.searchParams.set('google', 'connected');
  return NextResponse.redirect(okUrl.toString(), { status: 302 });
}