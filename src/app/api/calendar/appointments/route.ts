// src/app/api/calendar/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';
import { googleApi } from '@/lib/google';

function toDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'string') return new Date(v);
  if (v && typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  return new Date(v);
}

/** ---------------- GET: lista appuntamenti (range + staff opzionale) ---------------- */
export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from');
    const to = sp.get('to');
    const staffId = sp.get('staff_id');

    let q: FirebaseFirestore.Query = adminDB.collection('appointments')
      .where('user_uid', '==', uid);

    if (from) q = q.where('start', '>=', adminTimestamp.fromDate(new Date(from)));
    if (to)   q = q.where('start', '<=', adminTimestamp.fromDate(new Date(to)));

    const snap = await q.get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((a: any) => !staffId || a.staff_id === staffId);

    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error', details: String(e?.message || e) }, { status: 500 });
  }
}

/** ---------------- POST: crea appuntamento (service/staff NON obbligatori) ---------------- */
export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));

    // Leggiamo come testo per evitare errori di parse su body vuoti
    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    const {
      customer,          // { name, phone }
      start,             // ISO string
      durationMin,       // opzionale (minuti), default 60
      notes,
      party = [],        // opzionale: array di { id?, name?, phone?, email? }
      service_id = null, // opzionale
      staff_id = null,   // opzionale
    } = body;

    if (!customer?.name || !customer?.phone || !start) {
      return NextResponse.json(
        { error: 'Missing fields (customer.name, customer.phone, start)' },
        { status: 400 }
      );
    }

    // Carica config per fallback (durata/buffer/default calendar)
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};

    // Priorità durata: durationMin → durata servizio → default (60)
    let duration = Number(durationMin);
    if (!duration || Number.isNaN(duration)) {
      if (service_id) {
        const service = (cfg.services || []).find((s: any) => s.id === service_id);
        duration = Number(service?.duration || 60);
      } else {
        duration = Number(cfg.defaultDuration || 60);
      }
    }
    const buffer = Number(cfg.defaultBuffer || 0);

    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (duration + buffer) * 60000);

    // Crea doc Firestore
    const docRef = adminDB.collection('appointments').doc();
    const data = {
      user_uid: uid,
      customer,
      service_id,
      staff_id,
      start: adminTimestamp.fromDate(startDate),
      end: adminTimestamp.fromDate(endDate),
      durationMin: duration,
      status: 'pending',
      source: 'manual',
      notes: notes || '',
      party: Array.isArray(party) ? party : [],
      createdAt: adminTimestamp.now(),
      updatedAt: adminTimestamp.now(),
    };
    await docRef.set(data);

    // Sync Google (se attivo)
    let google_event_id: string | null = null;
    if (cfg.syncToGoogle) {
      try {
        const calendarId =
          (cfg.staff || []).find((s: any) => s.id === staff_id)?.googleCalendarId ||
          cfg.defaultGoogleCalendarId;

        if (calendarId) {
          const descriptionParts: string[] = [];
          if (notes) descriptionParts.push(`Note: ${notes}`);
          if (data.party?.length) {
            descriptionParts.push(
              'Partecipanti:\n' +
              data.party.map((p: any) =>
                `- ${(p.name || '').trim()} ${p.phone || ''} ${p.email || ''}`.trim()
              ).join('\n')
            );
          }

          const ev = await googleApi(
            uid,
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: 'POST',
              body: JSON.stringify({
                summary: `${customer.name} — Prenotazione`,
                description: descriptionParts.join('\n\n'),
                start: { dateTime: startDate.toISOString() },
                end:   { dateTime: endDate.toISOString() },
              }),
            }
          );
          google_event_id = ev?.id || null;
          await docRef.update({ google_event_id });
        }
      } catch (e: any) {
        await docRef.update({ google_event_id: null, google_sync_error: String(e?.message || e) });
      }
    }

    const finalSnap = await docRef.get();
    return NextResponse.json({ id: docRef.id, ...finalSnap.data() });
  } catch (e: any) {
    console.error('POST /api/calendar/appointments error:', e);
    return NextResponse.json({ error: 'Internal error', details: String(e?.message || e) }, { status: 500 });
  }
}

/** ---------------- PATCH: aggiorna (ricalcola end se cambia start/durationMin) ---------------- */
export async function PATCH(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const body = await req.json();
    const { id, patch } = body || {};
    if (!id || !patch) return NextResponse.json({ error: 'Missing id/patch' }, { status: 400 });

    const ref = adminDB.collection('appointments').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const appt: any = snap.data();
    if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
    const buffer = Number(cfg.defaultBuffer || 0);

    let updates: any = { ...patch, updatedAt: adminTimestamp.now() };

    if (patch.start || patch.durationMin) {
      const start = patch.start ? new Date(patch.start) : toDate(appt.start);
      const duration = Number(
        patch.durationMin ??
        appt.durationMin ??
        60
      );
      const end = new Date(start.getTime() + (duration + buffer) * 60000);
      updates.start = adminTimestamp.fromDate(start);
      updates.end   = adminTimestamp.fromDate(end);
      updates.durationMin = duration;
    }

    await ref.update(updates);

    // Sync Google se presente
    const after = (await ref.get()).data() as any;
    if (after?.google_event_id) {
      const calendarId =
        (cfg.staff || []).find((s: any) => s.id === after.staff_id)?.googleCalendarId ||
        cfg.defaultGoogleCalendarId;

      if (calendarId) {
        try {
          await googleApi(
            uid,
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${after.google_event_id}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                summary: `${after.customer?.name || ''} — Prenotazione`,
                start: { dateTime: toDate(after.start).toISOString() },
                end:   { dateTime: toDate(after.end).toISOString() },
                description: after.notes || '',
              }),
            }
          );
        } catch {}
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error', details: String(e?.message || e) }, { status: 500 });
  }
}

/** ---------------- DELETE: elimina (anche Google se agganciato) ---------------- */
export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const ref = adminDB.collection('appointments').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const appt: any = snap.data();
    if (appt.user_uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // cancella su Google se presente
    const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
    const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
    const calendarId =
      (cfg.staff || []).find((s: any) => s.id === appt.staff_id)?.googleCalendarId ||
      cfg.defaultGoogleCalendarId;

    if (appt.google_event_id && calendarId) {
      try {
        await googleApi(
          uid,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}`,
          { method: 'DELETE' }
        );
      } catch {}
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error', details: String(e?.message || e) }, { status: 500 });
  }
}