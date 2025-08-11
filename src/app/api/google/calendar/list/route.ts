// src/app/api/google/calendar/list/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

async function getAccessToken(uid: string): Promise<string> {
  const oauthRef = adminDB.doc(`users/${uid}/google/oauth`);
  const appRef = adminDB.doc(`users/${uid}/google/app`);
  const [oauthSnap, appSnap] = await Promise.all([oauthRef.get(), appRef.get()]);
  if (!oauthSnap.exists) throw new Error('Non connesso a Google');
  const oauth = oauthSnap.data() as any;

  // valido?
  if (oauth.expiry_date && Date.now() < oauth.expiry_date - 30_000) {
    return oauth.access_token as string;
  }

  if (!appSnap.exists) throw new Error('App BYOG mancante');
  const app = appSnap.data() as any;
  if (!oauth.refresh_token) throw new Error('refresh_token mancante');

  const params = new URLSearchParams({
    client_id: app.client_id,
    client_secret: app.client_secret,
    grant_type: 'refresh_token',
    refresh_token: oauth.refresh_token,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Refresh token fallito');

  await oauthRef.set({
    access_token: j.access_token,
    expiry_date: Date.now() + (j.expires_in || 3600) * 1000,
    updatedAt: new Date(),
  }, { merge: true });

  return j.access_token as string;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const token = await getAccessToken(uid);
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json(json, { status: res.status });
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}