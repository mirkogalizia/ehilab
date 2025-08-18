export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

/* Helpers */
const toDate = (v: any) => (typeof v === 'string' ? new Date(v) : new Date(v));
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get('from'); // ISO
  const to   = sp.get('to');   // ISO
  const staffId = sp.get('staff_id'); // opzionale

  let q: FirebaseFirestore.Query = adminDB
    .collection('appointments')
    .where('user_uid', '==', uid);

  if (from) q = q.where('start', '>=', adminTimestamp.fromDate(new Date(from)));
  if (to)   q = q.where('start', '<=', adminTimestamp.fromDate(new Date(to)));

  const snap = await q.get();
  const items = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((a: any) => !staffId || a.staff_id === staffId);

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const {
    customer,               // { name, phone, email? }
    service_id,
    staff_id,
    start,                  // ISO
    notes,
    // opzionali per override per-call
    syncToGoogle: syncOverride,
    calendarId: calendarOverride
  } = body;

  if (!customer?.name || !customer?.phone || !service_id || !staff_id || !start) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Config calendario utente
  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
  const tz = cfg.timezone || 'Europe/Rome';

  // durata/buffer dal servizio
  const service = (cfg.services || []).find((s: any) => s.id === service_id);
  const duration = Number(service?.duration || 30);
  const buffer = Number(service?.buffer || 0);

  const startDate = toDate(start);
  const endDate = addMinutes(startDate, duration + buffer);

  // Overlap semplice sullo staff
  const conflictQ = await adminDB.collection('appointments')
    .where('user_uid','==', uid)
    .where('staff_id','==', staff_id)
    .where('status','in',['pending','confirmed','done'])
    .where('start','<=', adminTimestamp.fromDate(endDate))
    .get();

  const hasOverlap = conflictQ.docs.some(d => {
    const a: any = d.data();
    const aStart = a.start.toDate ? a.start.toDate() : new Date(a.start);
    const aEnd   = a.end.toDate   ? a.end.toDate()   : new Date(a.end);
    return aStart < endDate && aEnd > startDate;
  });
  if (hasOverlap) return NextResponse.json({ error: 'Time overlap' }, { status: 409 });

  // Crea appuntamento locale
  const docRef = adminDB.collection('appointments').doc();
  const toSave = {
    user_uid: uid,
    customer,
    service_id,
    staff_id,
    start: adminTimestamp.fromDate(startDate),
    end: adminTimestamp.fromDate(endDate),
    status: 'pending',
    source: 'manual',
    notes: notes || '',
    createdAt: adminTimestamp.now(),
    updatedAt: adminTimestamp.now(),
  };
  await docRef.set(toSave);

  // Sync Google se attivo (config o override)
  let google_event_id: string | null = null;
  const syncFlag = typeof syncOverride === 'boolean' ? syncOverride : !!cfg.syncToGoogle;

  if (syncFlag) {
    try {
      const calendarId =
        calendarOverride ||
        (cfg.staff || []).find((s: any) => s.id === staff_id)?.googleCalendarId ||
        cfg.defaultGoogleCalendarId ||
        'primary';

      if (calendarId) {
        const serviceName =
          (cfg.services || []).find((s: any) => s.id === service_id)?.name || 'Appuntamento';

        // descrizione/attendees/extendedProperties utili per riconciliazione
        const descriptionLines = [
          `Cliente: ${customer.name}`,
          `Telefono: ${customer.phone}`,
          notes ? `Note: ${notes}` : '',
          `AppID: ${docRef.id}`,
        ].filter(Boolean);

        const payload = {
          summary: `${serviceName} – ${customer.name}`,
          description: descriptionLines.join('\n'),
          start: { dateTime: startDate.toISOString(), timeZone: tz },
          end:   { dateTime: endDate.toISOString(),   timeZone: tz },
          attendees: customer.email ? [{ email: customer.email }] : undefined,
          extendedProperties: {
            private: {
              appointmentId: docRef.id,
              customerPhone: customer.phone
            }
          }
        };

        const ev = await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        google_event_id = ev?.id || null;
        await docRef.update({ google_event_id: google_event_id ?? null });
      }
    } catch (e) {
      // non blocco la creazione locale
      await docRef.update({ google_event_id: null, google_error: String(e) });
    }
  }

  const finalSnap = await docRef.get();
  return NextResponse.json({ id: docRef.id, ...finalSnap.data() });
}

export async function PATCH(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, patch } = body;
  if (!id || !patch) return NextResponse.json({ error: 'Missing id/patch' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt: any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
  const tz = cfg.timezone || 'Europe/Rome';

  const updates: any = { ...patch, updatedAt: adminTimestamp.now() };

  // ricalcolo end se cambia start o service
  if (patch.start || patch.service_id) {
    const serviceId = patch.service_id || appt.service_id;
    const service = (cfg.services || []).find((s: any) => s.id === serviceId);
    const duration = Number(service?.duration || 30);
    const buffer = Number(service?.buffer || 0);

    const newStart = patch.start ? toDate(patch.start) : (appt.start.toDate ? appt.start.toDate() : new Date(appt.start));
    const newEnd = addMinutes(newStart, duration + buffer);

    updates.start = adminTimestamp.fromDate(newStart);
    updates.end   = adminTimestamp.fromDate(newEnd);
  }

  await ref.update(updates);

  // sync Google (se esiste un evento e cambia qualcosa di rilevante)
  const after = (await ref.get()).data() as any;

  if (after.google_event_id) {
    const calendarId =
      (cfg.staff || []).find((s: any) => s.id === after.staff_id)?.googleCalendarId ||
      cfg.defaultGoogleCalendarId ||
      'primary';

    if (calendarId) {
      try {
        // se stato cancellato → elimina anche su Google
        if (patch.status && ['cancelled', 'canceled', 'deleted'].includes(String(patch.status).toLowerCase())) {
          await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${after.google_event_id}`, {
            method: 'DELETE',
          });
          await ref.update({ google_event_id: null });
        } else {
          const serviceName =
            (cfg.services || []).find((s: any) => s.id === after.service_id)?.name || 'Appuntamento';

          const startDate = after.start.toDate ? after.start.toDate() : new Date(after.start);
          const endDate   = after.end.toDate   ? after.end.toDate()   : new Date(after.end);

          await googleApi(uid, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${after.google_event_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              summary: `${serviceName} – ${after.customer?.name || ''}`,
              description: after.notes || '',
              start: { dateTime: startDate.toISOString(), timeZone: tz },
              end:   { dateTime: endDate.toISOString(),   timeZone: tz },
            })
          });
        }
      } catch (e) {
        // no-op
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const ref = adminDB.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const appt: any = snap.data();
  if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // cancella su Google se presente
  if (appt.google_event_id) {
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
    const calendarId =
      (cfg.staff || []).find((s: any) => s.id === appt.staff_id)?.googleCalendarId ||
      cfg.defaultGoogleCalendarId ||
      'primary';
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