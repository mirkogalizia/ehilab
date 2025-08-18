// src/app/api/calendar/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to   = sp.get('to');
  const staffId = sp.get('staff_id'); // opzionale, ora non vincola

  let q = adminDB.collection('appointments').where('user_uid','==', uid);
  if (from) q = q.where('start','>=', adminTimestamp.fromDate(new Date(from)));
  if (to)   q = q.where('start','<=', adminTimestamp.fromDate(new Date(to)));

  const snap = await q.get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }))
    .filter(a => !staffId || a.staff_id === staffId);

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const body = await req.json();

  // 🔸 Ora service_id e staff_id sono opzionali. Aggiunto "party" (array di contatti).
  const { customer, start, notes, service_id = null, staff_id = null, durationMin, party } = body;

  if (!customer?.name || !customer?.phone || !start) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Config e default duration/buffer
  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};

  const fallbackDuration = Number(cfg?.defaultDuration ?? 90);
  const fallbackBuffer   = Number(cfg?.defaultBuffer   ?? 0);

  const duration = Number(durationMin ?? fallbackDuration);
  const buffer   = Number(fallbackBuffer);

  const startDate = new Date(start);
  const end = new Date(startDate.getTime() + (duration + buffer) * 60000);

  // 🔸 Conflict check SOLO se c’è uno staff esplicito (altrimenti “resource-less”)
  let conflictQ = adminDB.collection('appointments')
    .where('user_uid','==', uid)
    .where('status','in',['pending','confirmed','done'])
    .where('start','<=', adminTimestamp.fromDate(end));

  if (staff_id) conflictQ = conflictQ.where('staff_id','==', staff_id);
  const snapC = await conflictQ.get();
  const hasOverlap = snapC.docs.some(d => {
    const a:any = d.data();
    const aEnd = a.end.toDate ? a.end.toDate() : new Date(a.end);
    const aStart = a.start.toDate ? a.start.toDate() : new Date(a.start);
    return aStart < end && aEnd > startDate;
  });
  if (hasOverlap) return NextResponse.json({ error: 'Time overlap' }, { status: 409 });

  // 🔸 Salvo appuntamento (service_id/staff_id possono essere null) + party opzionale
  const docRef = adminDB.collection('appointments').doc();
  const data = {
    user_uid: uid,
    customer,              // { name, phone, ... }
    service_id,            // null ok
    staff_id,              // null ok
    start: adminTimestamp.fromDate(startDate),
    end: adminTimestamp.fromDate(end),
    status: 'pending',
    source: 'manual',
    notes: notes || '',
    party: Array.isArray(party) ? party : [], // [{id,name,phone,email}] opzionale
    createdAt: adminTimestamp.now(),
    updatedAt: adminTimestamp.now(),
  };

  await docRef.set(data);

  // 🔸 Sync Google con defaultGoogleCalendarId (senza staff mapping)
  if (cfg.syncToGoogle) {
    try {
      const calendarId = cfg.defaultGoogleCalendarId;
      if (calendarId) {
        // Includo i nominativi del party in description
        const partyLine =
          (data.party?.length ? `\nPartecipanti:\n${data.party.map((p:any)=>`- ${p.name || p.phone || p.email || p.id || ''}`).join('\n')}` : '');
        const ev = await googleApi(
          uid,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: 'POST',
            body: JSON.stringify({
              summary: `${customer.name}`,
              description: `${notes || ''}${partyLine}`,
              start: { dateTime: startDate.toISOString() },
              end:   { dateTime: end.toISOString() }
            })
          }
        );
        await docRef.update({ google_event_id: ev.id });
      }
    } catch {
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

  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};
  const fallbackDuration = Number(cfg?.defaultDuration ?? 90);
  const fallbackBuffer   = Number(cfg?.defaultBuffer   ?? 0);

  // Se cambia start o durationMin ricalcolo end
  let updates:any = { ...patch, updatedAt: adminTimestamp.now() };
  if (patch.start || patch.durationMin) {
    const start = new Date(patch.start || (appt.start.toDate ? appt.start.toDate() : new Date(appt.start)));
    const duration = Number(patch.durationMin ?? fallbackDuration);
    const end = new Date(start.getTime() + (duration + fallbackBuffer) * 60000);
    updates.start = adminTimestamp.fromDate(start);
    updates.end   = adminTimestamp.fromDate(end);
  }

  await ref.update(updates);

  // Sync Google se presente l’evento
  const after = (await ref.get()).data() as any;
  if (after.google_event_id && cfg.defaultGoogleCalendarId) {
    try {
      await googleApi(
        uid,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.defaultGoogleCalendarId)}/events/${after.google_event_id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            summary: `${after.customer?.name || ''}`,
            start: { dateTime: (after.start.toDate ? after.start.toDate() : new Date(after.start)).toISOString() },
            end:   { dateTime: (after.end.toDate ? after.end.toDate() : new Date(after.end)).toISOString() },
            description: after.notes || ''
          })
        }
      );
    } catch {}
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

  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg:any = cfgSnap.exists ? cfgSnap.data() : {};

  if (appt.google_event_id && cfg.defaultGoogleCalendarId) {
    try {
      await googleApi(
        uid,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.defaultGoogleCalendarId)}/events/${appt.google_event_id}`,
        { method: 'DELETE' }
      );
    } catch {}
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}