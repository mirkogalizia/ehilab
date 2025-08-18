import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

type Guest = { contactId?: string|null; name?: string|null; phone?: string|null; email?: string|null };

function toDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v === 'string') return new Date(v);
  if (v?.toDate) return v.toDate();
  if (v?.seconds != null) return new Date(v.seconds * 1000);
  return new Date(v);
}

/* ---------- LIST ---------- */
export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to   = sp.get('to');

  let q: FirebaseFirestore.Query = adminDB.collection('appointments').where('user_uid','==', uid);
  if (from) q = q.where('start','>=', adminTimestamp.fromDate(new Date(from)));
  if (to)   q = q.where('start','<=', adminTimestamp.fromDate(new Date(to)));

  const snap = await q.get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json(items);
}

/* ---------- CREATE (multi-contatto) ---------- */
export async function POST(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  // input attesi: start(ISO), durationMinutes(number), notes(string), contacts: Guest[]
  const startISO: string = body.start;
  const durationMinutes: number = Number(body.durationMinutes || 90);
  const notes: string = body.notes || '';
  const contacts: Guest[] = Array.isArray(body.contacts) ? body.contacts : [];

  if (!startISO || !contacts.length) {
    return NextResponse.json({ error: 'Missing start or contacts' }, { status: 400 });
  }

  const start = new Date(startISO);
  const end   = new Date(start.getTime() + durationMinutes * 60000);

  // (facoltativo) controllo sovrapposizioni
  const overlQ = await adminDB.collection('appointments')
    .where('user_uid','==', uid)
    .where('start','<=', adminTimestamp.fromDate(end))
    .get();

  const hasOverlap = overlQ.docs.some(d => {
    const a: any = d.data();
    const aStart = toDate(a.start);
    const aEnd   = toDate(a.end);
    return aStart < end && aEnd > start;
  });
  if (hasOverlap) {
    return NextResponse.json({ error: 'Time overlap' }, { status: 409 });
  }

  const docRef = adminDB.collection('appointments').doc();
  const payload: any = {
    user_uid: uid,
    guests: contacts.map(g => ({
      contactId: g.contactId || null,
      name: g.name || null,
      phone: g.phone || null,
      email: g.email || null,
    })),
    start: adminTimestamp.fromDate(start),
    end:   adminTimestamp.fromDate(end),
    durationMinutes,
    notes,
    status: 'pending',
    source: 'manual',
    createdAt: adminTimestamp.now(),
    updatedAt: adminTimestamp.now(),
  };

  await docRef.set(payload);

  // Google sync (se attivo)
  try {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
    if (cfg.syncToGoogle && cfg.defaultGoogleCalendarId) {
      const first = contacts[0];
      const more = contacts.length > 1 ? ` (+${contacts.length - 1})` : '';
      const summary = `Prenotazione – ${(first?.name || first?.phone || 'Ospite')}${more}`;
      const description =
        `Creato da EHI!\n` +
        contacts.map((g, i) => `Ospite ${i+1}: ${(g.name||'')}${g.phone ? ' • '+g.phone : ''}${g.email ? ' • '+g.email : ''}`).join('\n') +
        (notes ? `\nNote: ${notes}` : '');

      const ev = await googleApi(uid,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.defaultGoogleCalendarId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify({
            summary,
            description,
            start: { dateTime: start.toISOString() },
            end:   { dateTime: end.toISOString() },
          })
        }
      );
      if (ev?.id) await docRef.update({ google_event_id: ev.id });
    } else {
      await docRef.update({ google_event_id: null });
    }
  } catch {
    await docRef.update({ google_event_id: null });
  }

  const final = await docRef.get();
  return NextResponse.json({ id: docRef.id, ...final.data() });
}

/* ---------- UPDATE ---------- */
export async function PATCH(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { id, patch } = body || {};
  if (!id || !patch) return NextResponse.json({ error: 'Missing id/patch' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt: any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const upd: any = { ...patch, updatedAt: adminTimestamp.now() };
  if (patch.start || patch.durationMinutes) {
    const start = toDate(patch.start || appt.start);
    const dur   = Number(patch.durationMinutes || appt.durationMinutes || 90);
    upd.start = adminTimestamp.fromDate(start);
    upd.end   = adminTimestamp.fromDate(new Date(start.getTime() + dur * 60000));
    upd.durationMinutes = dur;
  }
  await ref.update(upd);

  // sync google se presente
  const after = (await ref.get()).data() as any;
  if (after?.google_event_id) {
    try {
      const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
      const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
      if (cfg.defaultGoogleCalendarId) {
        const guests: Guest[] = after.guests || [];
        const first = guests[0];
        const more = guests.length > 1 ? ` (+${guests.length - 1})` : '';
        const summary = `Prenotazione – ${(first?.name || first?.phone || 'Ospite')}${more}`;

        await googleApi(uid,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.defaultGoogleCalendarId)}/events/${after.google_event_id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              summary,
              description: after.notes || '',
              start: { dateTime: toDate(after.start).toISOString() },
              end:   { dateTime: toDate(after.end).toISOString() },
            })
          }
        );
      }
    } catch {}
  }

  return NextResponse.json({ ok: true });
}

/* ---------- DELETE ---------- */
export async function DELETE(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt: any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
    if (appt.google_event_id && cfg.defaultGoogleCalendarId) {
      await googleApi(uid,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.defaultGoogleCalendarId)}/events/${appt.google_event_id}`,
        { method: 'DELETE' }
      );
    }
  } catch {}

  await ref.delete();
  return NextResponse.json({ ok: true });
}