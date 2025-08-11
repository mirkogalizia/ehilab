export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const sp = req.nextUrl.searchParams;
    const calendarId = sp.get('calendarId'); // opzionale: se assente, uso quello di default in config
    const from = sp.get('from') || new Date(Date.now() - 3*24*3600e3).toISOString(); // -3gg
    const to   = sp.get('to')   || new Date(Date.now() + 14*24*3600e3).toISOString(); // +14gg

    let calId = calendarId;
    if (!calId) {
      const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
      calId = (cfgSnap.exists ? (cfgSnap.data() as any)?.defaultGoogleCalendarId : null) || 'primary';
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId!)}/events`);
    url.searchParams.set('timeMin', from);
    url.searchParams.set('timeMax', to);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');

    const data = await googleApi(uid, url.toString(), { method: 'GET' });
    return NextResponse.json({ calendarId: calId, items: data.items || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}