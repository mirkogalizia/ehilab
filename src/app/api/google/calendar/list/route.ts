export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const data = await googleApi(uid, 'https://www.googleapis.com/calendar/v3/users/me/calendarList', { method: 'GET' });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}