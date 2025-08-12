'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar'; // <-- il tuo shadcn calendar

/* -------------------- Helpers -------------------- */
function ymd(d) {
  const z = new Date(d);
  const off = new Date(z.getTime() - z.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
}
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function fmtDateTime(dt) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}
function toDate(v) {
  if (!v) return new Date();
  if (v && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string') return new Date(v);
  if (v && typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  return new Date(v);
}

/* Costruisce la griglia mensile di riferimento per i fetch (primo/ultimo giorno) */
function monthWindow(current) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  return { first, last };
}

export default function CalendarioPage() {
  const { user } = useAuth();

  // config “interna” (staff/servizi) + selezioni
  const [cfg, setCfg] = useState(null);
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');

  // calendario selezione
  const [monthRef, setMonthRef] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  // dati: interni + google
  const [appts, setAppts] = useState([]);     // appuntamenti interni
  const [gEvents, setGEvents] = useState([]); // eventi google

  // google calendars
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalId, setGoogleCalId] = useState('');

  /* ───────────── Google OAuth e liste ───────────── */
  const connectGoogle = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const r = await fetch('/api/google/oauth/start', { headers: { Authorization: `Bearer ${idt}` } });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  };

  const loadGoogleCalendars = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const r = await fetch('/api/google/calendar/list', { headers: { Authorization: `Bearer ${idt}` } });
    const j = await r.json();
    const items = j.items || [];
    setGoogleCalendars(items);
    const preferred =
      (cfg?.defaultGoogleCalendarId) ||
      (items.find(c => c.primary)?.id) ||
      (items[0]?.id);
    if (preferred && !googleCalId) setGoogleCalId(preferred);
  };

  const saveDefaultCalendar = async (calendarId) => {
    if (!user || !calendarId) return;
    const idt = await user.getIdToken();
    await fetch('/api/calendar/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultGoogleCalendarId: calendarId, syncToGoogle: true }),
    });
  };

  const loadGoogleMonth = async (calendarId) => {
    if (!user || !calendarId) { setGEvents([]); return; }
    const idt = await user.getIdToken();
    const { first, last } = monthWindow(monthRef);
    const from = startOfDay(first).toISOString();
    const to   = endOfDay(last).toISOString();
    const qs = new URLSearchParams({ calendarId, from, to });
    const r = await fetch(`/api/google/calendar/events?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${idt}` },
    });
    const j = await r.json();
    setGEvents(r.ok ? (j.items || []) : []);
  };

  /* ───────────── Config interna (staff/servizi) ───────────── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idt = await user.getIdToken();
      const res = await fetch('/api/calendar/config', { headers: { Authorization: `Bearer ${idt}` } });
      const json = await res.json();
      setCfg(json || {});
      if (json?.staff?.length) setStaffId(s => s || json.staff[0].id);
      if (json?.services?.length) setServiceId(s => s || json.services[0].id);
    })();
  }, [user]);

  /* ───────────── Fetch appuntamenti interni del mese ───────────── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idt = await user.getIdToken();
      const { first, last } = monthWindow(monthRef);
      const qs = new URLSearchParams({
        from: startOfDay(first).toISOString(),
        to:   endOfDay(last).toISOString(),
      });
      if (staffId) qs.set('staff_id', staffId);
      const r = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${idt}` },
      });
      const data = await r.json();
      setAppts(Array.isArray(data) ? data : []);
    })();
  }, [user, monthRef, staffId]);

  /* ───────────── Fetch Google eventi del mese ───────────── */
  useEffect(() => { if (user && cfg) loadGoogleCalendars(); /* eslint-disable-next-line */ }, [user, cfg]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); /* eslint-disable-next-line */ }, [user, monthRef, googleCalId]);

  /* ───────────── Mappe per giorno ───────────── */
  const apptsByDay = useMemo(() => {
    const map = {};
    for (const a of appts) {
      const key = ymd(toDate(a.start));
      if (!map[key]) map[key] = [];
      map[key].push({ ...a, __type: 'internal' });
    }
    for (const k of Object.keys(map)) map[k].sort((x, y) => +toDate(x.start) - +toDate(y.start));
    return map;
  }, [appts]);

  const gByDay = useMemo(() => {
    const map = {};
    for (const ev of gEvents) {
      const startIso = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00' : null);
      if (!startIso) continue;
      const key = ymd(startIso);
      if (!map[key]) map[key] = [];
      map[key].push({ ...ev, __type: 'google' });
    }
    for (const k of Object.keys(map)) {
      map[k].sort((x, y) => new Date(x.start?.dateTime || x.start?.date).getTime() - new Date(y.start?.dateTime || y.start?.date).getTime());
    }
    return map;
  }, [gEvents]);

  // merge
  const mergedByDay = useMemo(() => {
    const keys = new Set([...Object.keys(apptsByDay), ...Object.keys(gByDay)]);
    const out = {};
    keys.forEach(k => { out[k] = [ ...(apptsByDay[k] || []), ...(gByDay[k] || []) ]; });
    return out;
  }, [apptsByDay, gByDay]);

  // giorni che hanno eventi → per “modifiers” del DayPicker
  const daysWithEvents = useMemo(() => {
    return Object.keys(mergedByDay).map(k => new Date(k + 'T12:00:00')); // T12:00 per evitare TZ edge
  }, [mergedByDay]);

  /* ───────────── UI ───────────── */
  if (!user) return <div className="p-6">Devi effettuare il login.</div>;
  if (!cfg) return <div className="p-6">Caricamento calendario…</div>;

  const selectedKey = ymd(selectedDay);
  const itemsOfDay = (mergedByDay[selectedKey] || []).sort((a, b) => {
    const getStart = (it) => (it.__type === 'internal')
      ? toDate(it.start)
      : new Date(it.start?.dateTime || (it.start?.date ? it.start.date + 'T00:00:00' : 0));
    return +getStart(a) - +getStart(b);
  });

  return (
    <div className="p-6 space-y-6 font-[Montserrat]">
      <h1 className="text-2xl font-bold">Calendario</h1>

      {/* Google connect + selezione calendario */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <Button onClick={connectGoogle} variant="outline">Collega Google Calendar</Button>
        <Button onClick={loadGoogleCalendars} variant="outline">Lista calendari Google</Button>
        {googleCalendars.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Calendario Google:</span>
            <select
              className="border rounded px-2 py-1"
              value={googleCalId}
              onChange={async (e) => {
                const id = e.target.value;
                setGoogleCalId(id);
                await saveDefaultCalendar(id);
                await loadGoogleMonth(id);
              }}
            >
              {googleCalendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Filtri base (interni) */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Staff</label>
          <select className="border rounded px-2 py-1" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {(cfg?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Servizio</label>
          <select className="border rounded px-2 py-1" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {(cfg?.services || []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration}’)</option>)}
          </select>
        </div>
      </div>

      {/* ------- SHADCN Calendar (react-day-picker) ------- */}
      <div className="rounded-xl border p-4 bg-white">
        <Calendar
          // selezione singolo giorno
          selected={selectedDay}
          onSelect={(d) => d && setSelectedDay(d)}
          // navigazione mese
          month={monthRef}
          onMonthChange={setMonthRef}
          captionLayout="label"
          showOutsideDays
          // evidenzia giorni con eventi (dot in basso)
          modifiers={{ hasEvents: daysWithEvents }}
          modifiersClassNames={{
            hasEvents: "after:content-[''] after:block after:mx-auto after:mt-1 after:h-1.5 after:w-1.5 after:rounded-full after:bg-emerald-500"
          }}
        />
      </div>

      {/* ------- Appuntamenti del giorno (interni + Google) ------- */}
      <div className="rounded-xl border p-4 bg-white">
        <h3 className="font-semibold mb-3">
          Appuntamenti del {selectedDay.toLocaleDateString('it-IT')}
        </h3>

        {itemsOfDay.length === 0 ? (
          <div className="text-gray-500 text-sm">Nessun evento</div>
        ) : (
          <div className="space-y-2">
            {itemsOfDay.map((item) => {
              if (item.__type === 'internal') {
                const s = toDate(item.start);
                const e = toDate(item.end);
                return (
                  <div key={item.id} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{item.customer?.name || '—'} • {item.service_id}</div>
                      <div className="text-sm text-gray-600">
                        {fmtDateTime(s)} → {fmtDateTime(e)}
                      </div>
                      <div className="text-xs text-gray-500">Staff: {item.staff_id} • Stato: {item.status}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const idt = await user.getIdToken();
                          await fetch('/api/calendar/appointments', {
                            method: 'PATCH',
                            headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: item.id, patch: { status: item.status === 'confirmed' ? 'done' : 'confirmed' } }),
                          });
                          // refresh mese
                          const idt2 = await user.getIdToken();
                          const { first, last } = monthWindow(monthRef);
                          const qs = new URLSearchParams({
                            from: startOfDay(first).toISOString(),
                            to:   endOfDay(last).toISOString(),
                          });
                          if (staffId) qs.set('staff_id', staffId);
                          const r2 = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
                            headers: { Authorization: `Bearer ${idt2}` },
                          });
                          setAppts(await r2.json());
                        }}
                      >
                        {item.status === 'confirmed' ? 'Chiudi' : 'Conferma'}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!confirm('Eliminare appuntamento?')) return;
                          const idt = await user.getIdToken();
                          const qs = new URLSearchParams({ id: item.id });
                          await fetch(`/api/calendar/appointments?${qs.toString()}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${idt}` },
                          });
                          // refresh mese
                          const idt2 = await user.getIdToken();
                          const { first, last } = monthWindow(monthRef);
                          const qs2 = new URLSearchParams({
                            from: startOfDay(first).toISOString(),
                            to:   endOfDay(last).toISOString(),
                          });
                          if (staffId) qs2.set('staff_id', staffId);
                          const r2 = await fetch(`/api/calendar/appointments?${qs2.toString()}`, {
                            headers: { Authorization: `Bearer ${idt2}` },
                          });
                          setAppts(await r2.json());
                        }}
                      >
                        Cancella
                      </Button>
                    </div>
                  </div>
                );
              }

              // Evento Google (sola lettura)
              const sRaw = item.start?.dateTime || (item.start?.date ? item.start.date + 'T00:00:00' : null);
              const eRaw = item.end?.dateTime   || (item.end?.date   ? item.end.date   + 'T23:59:59' : null);
              const s = sRaw ? new Date(sRaw) : null;
              const e = eRaw ? new Date(eRaw) : null;

              return (
                <div
                  key={`g-${item.id || sRaw}`}
                  className="border rounded-lg p-3 flex items-center justify-between bg-violet-50/50"
                >
                  <div>
                    <div className="font-semibold">{item.summary || '(Google, senza titolo)'}</div>
                    <div className="text-sm text-gray-600">
                      {s ? fmtDateTime(s) : '—'}{e ? ' → ' + fmtDateTime(e) : ''}
                    </div>
                    {item.location && <div className="text-xs text-gray-500">{item.location}</div>}
                  </div>
                  {item.htmlLink && (
                    <a href={item.htmlLink} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline">Apri su Google</Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}