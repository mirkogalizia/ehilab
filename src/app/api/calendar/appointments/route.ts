import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp, adminFieldValue } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from'); // ISO
  const to   = sp.get('to');   // ISO
  const staffId = sp.get('staff_id'); // opzionale

  let q = adminDB.collection('appointments')
    .where('user_uid','==', uid);

  if (from) q = q.where('start','>=', adminTimestamp.fromDate(new Date(from)));
  if (to)   q = q.where('start','<=', adminTimestamp.fromDate(new Date(to)));

  const snap = await q.get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter((a:any) => !staffId || a.staff_id === staffId);

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const body = await req.json();

  const { customer, service_id, staff_id, start, notes } = body;
  if (!customer?.name || !customer?.phone || !service_id || !staff_id || !start) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // durata da config
  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};
  const service = (cfg.services || []).find((s:any)=> s.id === service_id);
  const duration = Number(service?.duration || 30);
  const buffer = Number(service?.buffer || 0);
  const end = new Date(new Date(start).getTime() + (duration+buffer)*60000);

  // conflitto semplice
  const conflictQ = await adminDB.collection('appointments')
    .where('user_uid','==', uid)
    .where('staff_id','==', staff_id)
    .where('status','in',['pending','confirmed','done'])
    .where('start','<=', adminTimestamp.fromDate(end))
    .get();

  const hasOverlap = conflictQ.docs.some(d => {
    const a:any = d.data();
    const aEnd = a.end.toDate ? a.end.toDate() : new Date(a.end);
    const aStart = a.start.toDate ? a.start.toDate() : new Date(a.start);
    return aStart < end && aEnd > new Date(start);
  });
  if (hasOverlap) return NextResponse.json({ error: 'Time overlap' }, { status: 409 });

  // crea appuntamento
  const docRef = adminDB.collection('appointments').doc();
  const data = {
    user_uid: uid,
    customer,
    service_id,
    staff_id,
    start: adminTimestamp.fromDate(new Date(start)),
    end: adminTimestamp.fromDate(end),
    status: 'pending',
    source: 'manual',
    notes: notes || '',
    createdAt: adminTimestamp.now(),
    updatedAt: adminTimestamp.now(),
  };

  await docRef.set(data);

  // Sync Google (se attivo)
  let google_event_id: string | undefined;
  if (cfg.syncToGoogle) {
    try {
      const calendarId =
        (cfg.staff || []).find((s:any)=> s.id===staff_id)?.googleCalendarId ||
        cfg.defaultGoogleCalendarId;
      if (calendarId) {
        const ev = await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          body: JSON.stringify({
            summary: `${(cfg.services||[]).find((s:any)=>s.id===service_id)?.name || 'Appuntamento'} – ${customer.name}`,
            description: notes || '',
            start: { dateTime: new Date(start).toISOString() },
            end:   { dateTime: end.toISOString() }
          })
        });
        google_event_id = ev.id;
        await docRef.update({ google_event_id });
      }
    } catch(e) {
      // non blocchiamo la creazione locale
      await docRef.update({ google_event_id: null });
    }
  }

  const finalSnap = await docRef.get();
  return NextResponse.json({ id: docRef.id, ...finalSnap.data() });
}

export async function PATCH(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const body = await req.json();
  const { id, patch } = body;
  if (!id || !patch) return NextResponse.json({ error: 'Missing id/patch' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt:any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // gestisci eventuale cambio orario → ricalcolo end
  let updates:any = { ...patch, updatedAt: adminTimestamp.now() };
  if (patch.start || patch.service_id) {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};
    const serviceId = patch.service_id || appt.service_id;
    const service = (cfg.services || []).find((s:any)=> s.id === serviceId);
    const duration = Number(service?.duration || 30);
    const buffer = Number(service?.buffer || 0);
    const start = new Date((patch.start || appt.start.toDate()).toString());
    const end = new Date(start.getTime() + (duration+buffer)*60000);
    updates.start = adminTimestamp.fromDate(start);
    updates.end = adminTimestamp.fromDate(end);
  }

  await ref.update(updates);

  // sync Google: se abbiamo google_event_id e cambia orario o status
  const after = (await ref.get()).data() as any;
  if (after.google_event_id) {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};
    const calendarId =
      (cfg.staff || []).find((s:any)=> s.id===after.staff_id)?.googleCalendarId ||
      cfg.defaultGoogleCalendarId;

    if (calendarId) {
      try {
        await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${after.google_event_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            summary: `${(cfg.services||[]).find((s:any)=>s.id===after.service_id)?.name || 'Appuntamento'} – ${after.customer?.name || ''}`,
            start: { dateTime: after.start.toDate().toISOString() },
            end:   { dateTime: after.end.toDate().toISOString() },
            description: after.notes || ''
          })
        });
      } catch {}
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt:any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // cancella Google se presente
  if (appt.google_event_id) {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};
    const calendarId =
      (cfg.staff || []).find((s:any)=> s.id===appt.staff_id)?.googleCalendarId ||
      cfg.defaultGoogleCalendarId;
    if (calendarId) {
      try {
        await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}`, {
          method: 'DELETE',
        });
      } catch {}
    }
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}