import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const snap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  return NextResponse.json(snap.exists ? snap.data() : {});
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const body = await req.json();
  await adminDB.doc(`users/${uid}/calendar/config`).set(body, { merge: true });
  return NextResponse.json({ ok: true });
}