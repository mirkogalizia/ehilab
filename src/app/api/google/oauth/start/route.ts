// src/app/api/google/oauth/start/route.ts
export const runtime = 'nodejs';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

const APP_DOC = (uid: string) => `users/${uid}/google/app`;

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));

    // prendo credenziali BYOG dallo user
    const appSnap = await adminDB.doc(APP_DOC(uid)).get();
    if (!appSnap.exists) {
      return NextResponse.json({ error: 'Mancano le credenziali OAuth per questo utente' }, { status: 400 });
    }
    const app = appSnap.data() as { client_id?: string; redirect_uri?: string };
    if (!app.client_id) {
      return NextResponse.json({ error: 'client_id mancante nello user' }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const redirect_uri = app.redirect_uri || `${origin}/api/google/oauth/callback`;

    // salvo uno state con redirect_uri per coerenza
    const nonce = crypto.randomBytes(24).toString('base64url');
    await adminDB.doc(`users/${uid}/oauth_states/${nonce}`).set({
      provider: 'google',
      redirect_uri,
      createdAt: new Date(),
    });

    const scope = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'openid', 'email', 'profile',
    ].join(' ');

    const state = Buffer.from(JSON.stringify({ uid, nonce })).toString('base64url');

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', app.client_id);
    url.searchParams.set('redirect_uri', redirect_uri);
    url.searchParams.set('scope', scope);
    url.searchParams.set('access_type', 'offline');         // refresh_token
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');              // forza refresh_token
    url.searchParams.set('state', state);

    return NextResponse.json({ url: url.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}