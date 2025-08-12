'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

/* -------------------- Helpers -------------------- */
const ymd = (d) => {
  const z = new Date(d);
  const off = new Date(z.getTime() - z.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
};
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const toDate = (v) => {
  if (!v) return new Date();
  if (v && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string') return new Date(v);
  if (v && typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  return new Date(v);
};
const fmtTime = (d) => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const fmtRange = (from, to) => `${fmtTime(from)} – ${fmtTime(to)}`;
const monthWindow = (current) => {
  const y = current.getFullYear();
  const m = current.getMonth();
  return { first: new Date(y, m, 1), last: new Date(y, m + 1, 0) };
};

export default function CalendarioPage() {
  const { user } = useAuth();

  // selezione calendario e mese
  const [date, setDate] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

  // configurazione interna (staff/servizi opzionale)
  const [cfg, setCfg] = useState(null);
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');

  // dati: interni (Firestore) + Google
  const [appts, setAppts] = useState([]);     // interni
  const [gEvents, setGEvents] = useState([]); // google

  // google calendars
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalId, setGoogleCalId] = useState('');

  /* -------------------- Google OAuth & liste -------------------- */
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
    const qs = new URLSearchParams({
      calendarId,
      from: startOfDay(first).toISOString(),
      to:   endOfDay(last).toISOString(),
    });
    const r = await fetch(`/api/google/calendar/events?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${idt}` },
    });
    const j = await r.json();
    setGEvents(r.ok ? (j.items || []) : []);
  };

  /* -------------------- Config interna (staff/servizi) -------------------- */
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

  /* -------------------- Appuntamenti interni del mese -------------------- */
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

  /* -------------------- Eventi Google del mese -------------------- */
  useEffect(() => { if (user && cfg) loadGoogleCalendars(); /* eslint-disable-next-line */ }, [user, cfg]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); /* eslint-disable-next-line */ }, [user, monthRef, googleCalId]);

  /* -------------------- Merge per giorno -------------------- */
  const mergedByDay = useMemo(() => {
    const map = {};
    // interni
    for (const a of appts) {
      const k = ymd(toDate(a.start));
      (map[k] ||= []).push({ __type: 'internal', ...a });
    }
    // google
    for (const ev of gEvents) {
      const s = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00' : null);
      if (!s) continue;
      const k = ymd(s);
      (map[k] ||= []).push({ __type: 'google', ...ev });
    }
    // sort
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const as = a.__type === 'internal'
          ? toDate(a.start)
          : new Date(a.start?.dateTime || a.start?.date || 0);
        const bs = b.__type === 'internal'
          ? toDate(b.start)
          : new Date(b.start?.dateTime || b.start?.date || 0);
        return +as - +bs;
      });
    }
    return map;
  }, [appts, gEvents]);

  // giorni con eventi → dot nel calendario
  const daysWithEvents = useMemo(
    () => Object.keys(mergedByDay).map(k => new Date(k + 'T12:00:00')),
    [mergedByDay]
  );

  const selectedKey = ymd(date);
  const eventsOfDay = mergedByDay[selectedKey] || [];

  /* -------------------- UI -------------------- */
  if (!user) return <div className="p-6">Devi effettuare il login.</div>;

  return (
    <div className="p-6 font-[Montserrat]">
      <h1 className="text-2xl font-bold mb-4">Calendario</h1>

      {/* Azioni Google */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={connectGoogle}>Collega Google Calendar</Button>
        <Button variant="outline" onClick={loadGoogleCalendars}>Lista calendari Google</Button>
        {googleCalendars.length > 0 && (
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
        )}
      </div>

      {/* Calendar31-style card */}
      <Card className="w-fit py-4">
        <CardContent className="px-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && setDate(d)}
            className="bg-transparent p-0"
            required
            month={monthRef}
            onMonthChange={setMonthRef}
            modifiers={{ hasEvents: daysWithEvents }}
            modifiersClassNames={{
              hasEvents:
                "after:content-[''] after:block after:mx-auto after:mt-1 after:h-1.5 after:w-1.5 after:rounded-full after:bg-emerald-500"
            }}
          />
        </CardContent>

        <CardFooter className="flex flex-col items-start gap-3 border-t px-4 !pt-4 w-[360px]">
          <div className="flex w-full items-center justify-between px-1">
            <div className="text-sm font-medium">
              {date?.toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="Nuovo appuntamento"
              onClick={() => {
                // TODO: apri una modal per creare un appuntamento interno
                // usando /api/calendar/available e /api/calendar/appointments
                alert('Prossimo step: modal creazione appuntamento 😉');
              }}
            >
              <PlusIcon />
              <span className="sr-only">Add Event</span>
            </Button>
          </div>

          <div className="flex w-full flex-col gap-2">
            {eventsOfDay.length === 0 && (
              <div className="text-sm text-gray-500 px-1">Nessun evento</div>
            )}

            {eventsOfDay.map((ev, idx) => {
              if (ev.__type === 'internal') {
                const s = toDate(ev.start); const e = toDate(ev.end);
                const title = `${ev.customer?.name || '—'} • ${ev.service_id}`;
                return (
                  <div
                    key={`i-${ev.id}-${idx}`}
                    className="relative rounded-md p-2 pl-6 text-sm bg-muted after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full after:bg-emerald-600"
                  >
                    <div className="font-medium">{title}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtRange(s, e)} • Staff: {ev.staff_id} • Stato: {ev.status}
                    </div>
                  </div>
                );
              }

              // Google
              const sRaw = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00' : null);
              const eRaw = ev.end?.dateTime   || (ev.end?.date   ? ev.end.date   + 'T23:59:59' : null);
              const s = sRaw ? new Date(sRaw) : null;
              const e = eRaw ? new Date(eRaw) : null;
              return (
                <div
                  key={`g-${ev.id || idx}`}
                  className="relative rounded-md p-2 pl-6 text-sm bg-muted after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full after:bg-violet-600"
                >
                  <div className="font-medium flex items-center gap-2">
                    {ev.summary || '(Google, senza titolo)'}
                    {ev.htmlLink && (
                      <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" title="Apri su Google">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s ? fmtRange(s, e || s) : '—'}
                    {ev.location ? ` • ${ev.location}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}