import { NextRequest, NextResponse } from 'next/server';
import { adminDB, adminTimestamp } from '@/lib/firebase-admin';
import { getUidFromAuthHeader } from '@/lib/auth-server';

const dayMap: Record<number, string> = {0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat'};

function toMinutes(hhmm: string) {
  const [h,m] = hhmm.split(':').map(Number);
  return h*60 + (m||0);
}
function addMinutes(date: Date, m: number) {
  return new Date(date.getTime() + m*60000);
}

export async function GET(req: NextRequest) {
  const uid = await getUidFromAuthHeader(req.headers.get('authorization'));
  const sp = req.nextUrl.searchParams;
  const dateStr = sp.get('date');         // '2025-08-12'
  const serviceId = sp.get('service_id')!;
  const staffId = sp.get('staff_id');     // opzionale

  if (!dateStr || !serviceId) {
    return NextResponse.json({ error: 'Missing date or service_id' }, { status: 400 });
  }

  const cfgSnap = await adminDB.doc(`users/${uid}/calendar/config`).get();
  const cfg: any = cfgSnap.exists ? cfgSnap.data() : {};
  const tz = cfg.timezone || 'Europe/Rome';
  const slotMinutes = Number(cfg.slotMinutes || 30);
  const services = cfg.services || [];
  const targetService = services.find((s: any) => s.id === serviceId);
  if (!targetService) return NextResponse.json({ error: 'service_id not found' }, { status: 400 });

  const duration = Number(targetService.duration || slotMinutes);
  const buffer = Number(targetService.buffer || 0);

  const staff = (cfg.staff || []).filter((s: any) => !staffId || s.id === staffId);

  // Orario di lavoro del giorno
  const dayKey = dayMap[new Date(dateStr + 'T00:00:00').getDay()];
  const dayRanges = (cfg.openingHours?.[dayKey] || []) as Array<{start:string,end:string}>;
  if (!dayRanges.length || !staff.length) return NextResponse.json({ slots: [] });

  // Leggi appuntamenti del giorno per lo staff scelto
  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59');
  const q = adminDB.collection('appointments')
    .where('user_uid', '==', uid)
    .where('start', '>=', adminTimestamp.fromDate(dayStart))
    .where('start', '<=', adminTimestamp.fromDate(dayEnd))
    .where('status', 'in', ['pending','confirmed','done']);

  const snaps = await q.get();
  const busy = snaps.docs.map(d => d.data()).filter(d => !staffId || d.staff_id === staffId);

  // Genera slot
  const slots: Array<{start:string,end:string,staff_id:string}> = [];
  for (const st of staff) {
    if (!st.workingDays?.includes(dayKey)) continue;

    for (const r of dayRanges) {
      const rangeStart = toMinutes(r.start);
      const rangeEnd = toMinutes(r.end);
      for (let t = rangeStart; t + duration <= rangeEnd; t += slotMinutes) {
        const s = new Date(`${dateStr}T00:00:00`);
        const slotStart = addMinutes(s, t);
        const slotEnd = addMinutes(slotStart, duration);

        // conflitti?
        const overlap = busy.some(b => {
          if (b.staff_id !== st.id) return false;
          const bs = b.start.toDate ? b.start.toDate() : new Date(b.start);
          const be = b.end.toDate ? b.end.toDate() : new Date(b.end);
          return bs < slotEnd && be > slotStart;
        });
        if (!overlap) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            staff_id: st.id
          });
        }
      }
    }
  }

  return NextResponse.json({ slots });
}