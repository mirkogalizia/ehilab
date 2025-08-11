// src/app/api/google/oauth/disconnect/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    await adminDB.doc(`users/${uid}/google/oauth`).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}