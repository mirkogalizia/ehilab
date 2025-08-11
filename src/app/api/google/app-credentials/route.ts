// src/app/api/google/app-credentials/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

const APP_DOC = (uid: string) => `users/${uid}/google/app`;

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const snap = await adminDB.doc(APP_DOC(uid)).get();
    if (!snap.exists) return NextResponse.json({ hasCredentials: false });
    const data = snap.data() as { client_id?: string };
    const masked = (data.client_id || '').replace(/.(?=.{4})/g, '•');
    return NextResponse.json({ hasCredentials: true, client_id_masked: masked });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const { client_id, client_secret, redirect_uri } = await req.json();
    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'client_id e client_secret sono obbligatori' }, { status: 400 });
    }
    const origin = req.nextUrl.origin;
    const ru = redirect_uri || `${origin}/api/google/oauth/callback`;

    await adminDB.doc(APP_DOC(uid)).set({
      client_id,
      client_secret,
      redirect_uri: ru,
      updatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({ ok: true, redirect_uri: ru });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    await adminDB.doc(APP_DOC(uid)).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}