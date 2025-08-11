// /app/api/google/oauth/start/route.ts
export const runtime = 'nodejs';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    // 1) utente loggato
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));

    // 2) genera e salva nonce (anti-CSRF) sotto l’utente
    const nonce = crypto.randomBytes(24).toString('base64url');
    await adminDB.doc(`users/${uid}/oauth_states/${nonce}`).set({
      provider: 'google',
      createdAt: new Date(),
    });

    // 3) credenziali BYOG (se l'utente le ha salvate)
    const appSnap = await adminDB.doc(`users/${uid}/google/app`).get();
    const appCfg = appSnap.exists ? (appSnap.data() as any) : null;

    const client_id = appCfg?.client_id || process.env.GOOGLE_CLIENT_ID || '';
    const redirect_uri =
      appCfg?.redirect_uri ||
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/google/oauth/callback`;

    if (!client_id) {
      return NextResponse.json(
        { error: 'Missing GOOGLE_CLIENT_ID (env) o users/{uid}/google/app.client_id' },
        { status: 500 }
      );
    }

    // 4) scope richiesti
    const scope = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' ');

    // 5) state = { uid, nonce } codificato
    const state = Buffer.from(JSON.stringify({ uid, nonce })).toString('base64url');

    // 6) costruisci URL autorizzazione Google
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', client_id);
    url.searchParams.set('redirect_uri', redirect_uri);
    url.searchParams.set('scope', scope);
    url.searchParams.set('access_type', 'offline');           // per ottenere refresh_token
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');                // forza schermata e refresh_token
    url.searchParams.set('state', state);

    // 7) ritorna l’URL da aprire lato client
    return NextResponse.json({ url: url.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'OAuth start error' }, { status: 400 });
  }
}