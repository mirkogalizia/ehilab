export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

export async function DELETE(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  await adminDB.doc(`users/${uid}/google/oauth`).delete(); // rimuove token locali
  return NextResponse.json({ ok: true });
}