'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* -------------------- Helpers date -------------------- */
function ymd(d: Date | string | number) {
  const z = new Date(d);
  const off = new Date(z.getTime() - z.getTimezoneOffset() * 60000); // local->UTC safe
  return off.toISOString().slice(0, 10);
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function fmtDateTime(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}
function toDate(v: any): Date {
  if (!v) return new Date();
  if (v?.toDate) return v.toDate();
  if (typeof v === 'string') return new Date(v);
  if (v?.seconds) return new Date(v.seconds * 1000);
  return new Date(v);
}
function monthGrid(current: Date, weekStartsOnMonday = true) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const startIdx = weekStartsOnMonday ? (first.getDay() + 6) % 7 : first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startIdx);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return { first, last, cells };
}

export default function CalendarioPage() {
  const { user } = useAuth();

  /* -------------------- Stato base -------------------- */
  const [cfg, setCfg] = useState<any>(null);
  const [staffId, setStaffId] = useState<string>('');
  const [serviceId, setServiceId] = useState<string>('');
  const [monthRef, setMonthRef] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [appts, setAppts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  /* -------------------- Google block -------------------- */
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
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
    setGoogleCalendars(j.items || []);
  };
  const saveDefaultCalendar = async (calendarId: string) => {
    if (!user) return;
    const idt = await user.getIdToken();
    await fetch('/api/calendar/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultGoogleCalendarId: calendarId, syncToGoogle: true }),
    });
    alert('Calendario di default salvato');
  };

  /* -------------------- Carica config -------------------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idt = await user.getIdToken();
      const res = await fetch('/api/calendar/config', { headers: { Authorization: `Bearer ${idt}` } });
      const json = await res.json();
      setCfg(json || {});
      if (json?.staff?.length) setStaffId((s) => s || json.staff[0].id);
      if (json?.services?.length) setServiceId((s) => s || json.services[0].id);
    })();
  }, [user]);

  /* -------------------- Fetch appuntamenti mese -------------------- */
  const { cells, first, last } = useMemo(() => monthGrid(monthRef), [monthRef]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        const idt = await user.getIdToken();
        const from = startOfDay(new Date(first)).toISOString();
        const to = endOfDay(new Date(last)).toISOString();
        const qs = new URLSearchParams({ from, to });
        if (staffId) qs.set('staff_id', staffId);
        const r = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${idt}` },
        });
        const data = await r.json();
        setAppts(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, first, last, staffId]);

  /* -------------------- Mappa per giorno -------------------- */
  const apptsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of appts) {
      const start = toDate(a.start);
      const key = ymd(start);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    // ordina per ora
    for (const k of Object.keys(map)) {
      map[k].sort((x, y) => +toDate(x.start) - +toDate(y.start));
    }
    return map;
  }, [appts]);

  /* -------------------- Modal Nuovo appuntamento -------------------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDay, setModalDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState({ name: '', phone: '', notes: '' });

  const openNewForDay = async (day: Date) => {
    if (!user || !serviceId) {
      alert('Seleziona un servizio (e opzionalmente staff) prima di creare.');
      return;
    }
    setModalDay(day);
    setModalOpen(true);
    // carico slot disponibili del giorno
    try {
      const idt = await user.getIdToken();
      const qs = new URLSearchParams({ date: ymd(day), service_id: serviceId });
      if (staffId) qs.set('staff_id', staffId);
      const r = await fetch(`/api/calendar/available?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${idt}` },
      });
      const j = await r.json();
      setSlots(j.slots || []);
    } catch {
      setSlots([]);
    }
  };

  const createFromSlot = async (slot: any) => {
    if (!user) return;
    if (!customer.name || !customer.phone || !serviceId || !staffId) {
      alert('Compila nome, telefono, servizio e staff');
      return;
    }
    setCreating(true);
    try {
      const idt = await user.getIdToken();
      const r = await fetch('/api/calendar/appointments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer,
          service_id: serviceId,
          staff_id: staffId,
          start: slot.start, // il backend calcola la fine in base alla durata servizio (come fai già)
          notes: customer.notes || '',
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || 'Errore creazione');
      } else {
        // aggiorno lista mese (push ottimistico opzionale)
        setModalOpen(false);
        setCustomer({ name: '', phone: '', notes: '' });
        // ricarico mese
        const from = startOfDay(new Date(first)).toISOString();
        const to = endOfDay(new Date(last)).toISOString();
        const qs = new URLSearchParams({ from, to });
        if (staffId) qs.set('staff_id', staffId);
        const r2 = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${idt}` },
        });
        setAppts(await r2.json());
      }
    } finally {
      setCreating(false);
    }
  };

  /* -------------------- UI -------------------- */
  if (!user) return <div className="p-6">Devi effettuare il login.</div>;
  if (!cfg) return <div className="p-6">Caricamento calendario…</div>;

  const monthLabel = monthRef.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
  const todayKey = ymd(new Date());
  const firstMonth = monthRef.getMonth();

  return (
    <div className="p-6 space-y-6 font-[Montserrat]">
      <h1 className="text-2xl font-bold">Calendario</h1>

      {/* Google connect */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <Button onClick={connectGoogle} variant="outline">Collega Google Calendar</Button>
        <Button onClick={loadGoogleCalendars} variant="outline">Lista calendari Google</Button>
        {googleCalendars.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Calendari:</span>
            <select
              className="border rounded px-2 py-1"
              onChange={(e) => saveDefaultCalendar(e.target.value)}
            >
              <option value="">-- Seleziona calendario --</option>
              {googleCalendars.map((c) => (
                <option key={c.id} value={c.id}>{c.summary}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filtri */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Staff</label>
          <select className="border rounded px-2 py-1" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {(cfg.staff || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Servizio</label>
          <select className="border rounded px-2 py-1" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {(cfg.services || []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.duration}’)</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setMonthRef(new Date())}
            title="Vai ad oggi"
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            onClick={() => setMonthRef((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            ←
          </Button>
          <div className="min-w-[180px] text-center font-semibold capitalize">{monthLabel}</div>
          <Button
            variant="outline"
            onClick={() => setMonthRef((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            →
          </Button>
        </div>
      </div>

      {/* Griglia mese */}
      <div className="rounded-xl border bg-white p-3">
        {/* header giorni settimana */}
        <div className="grid grid-cols-7 text-xs font-semibold text-gray-500 px-2">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
            <div key={d} className="px-2 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((d, i) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === firstMonth;
            const isToday = key === todayKey;
            const dayAppts = apptsByDay[key] || [];
            const show = dayAppts.slice(0, 3);
            const rest = dayAppts.length - show.length;

            return (
              <div
                key={i}
                className={`border rounded-lg p-2 min-h-[118px] flex flex-col gap-1 hover:shadow-sm transition
                  ${inMonth ? 'bg-white' : 'bg-gray-50'}
                  ${isToday ? 'ring-2 ring-emerald-500' : ''}`}
                onClick={() => { setSelectedDay(d); }}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-sm ${inMonth ? 'text-gray-800' : 'text-gray-400'}`}>
                    {d.getDate()}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); openNewForDay(d); }}
                  >
                    + Nuovo
                  </Button>
                </div>

                {/* chip appuntamenti */}
                <div className="flex flex-col gap-1 mt-1">
                  {show.map((a, idx) => {
                    const s = toDate(a.start);
                    const label = `${s.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} • ${a.customer?.name || 'Senza nome'}`;
                    return (
                      <div
                        key={idx}
                        className="truncate text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                        title={`${label}\n${a.service_id || ''}`}
                      >
                        {label}
                      </div>
                    );
                  })}
                  {rest > 0 && (
                    <div className="text-[11px] text-gray-500">+{rest} altri…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pannello “Appuntamenti del giorno” */}
      <div className="rounded-xl border p-4 bg-white">
        <h3 className="font-semibold mb-3">
          Appuntamenti del {selectedDay.toLocaleDateString('it-IT')}
        </h3>
        <div className="space-y-2">
          {(apptsByDay[ymd(selectedDay)] || []).length === 0 ? (
            <div className="text-gray-500 text-sm">Nessun appuntamento</div>
          ) : (
            (apptsByDay[ymd(selectedDay)] || []).map((a) => (
              <div key={a.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {a.customer?.name || '—'} • {a.service_id}
                  </div>
                  <div className="text-sm text-gray-600">
                    {fmtDateTime(toDate(a.start))} → {fmtDateTime(toDate(a.end))}
                  </div>
                  <div className="text-xs text-gray-500">Staff: {a.staff_id} • Stato: {a.status}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const idt = await user.getIdToken();
                      await fetch('/api/calendar/appointments', {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: a.id, patch: { status: a.status === 'confirmed' ? 'done' : 'confirmed' } }),
                      });
                      // refresh locale
                      const from = startOfDay(new Date(first)).toISOString();
                      const to = endOfDay(new Date(last)).toISOString();
                      const qs = new URLSearchParams({ from, to });
                      if (staffId) qs.set('staff_id', staffId);
                      const r2 = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
                        headers: { Authorization: `Bearer ${idt}` },
                      });
                      setAppts(await r2.json());
                    }}
                  >
                    {a.status === 'confirmed' ? 'Chiudi' : 'Conferma'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm('Eliminare appuntamento?')) return;
                      const idt = await user.getIdToken();
                      const qs = new URLSearchParams({ id: a.id });
                      await fetch(`/api/calendar/appointments?${qs.toString()}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${idt}` },
                      });
                      // refresh locale
                      const from = startOfDay(new Date(first)).toISOString();
                      const to = endOfDay(new Date(last)).toISOString();
                      const qs2 = new URLSearchParams({ from, to });
                      if (staffId) qs2.set('staff_id', staffId);
                      const r2 = await fetch(`/api/calendar/appointments?${qs2.toString()}`, {
                        headers: { Authorization: `Bearer ${idt}` },
                      });
                      setAppts(await r2.json());
                    }}
                  >
                    Cancella
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Nuovo appuntamento (slot del giorno) */}
      {modalOpen && modalDay && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Nuovo appuntamento – {modalDay.toLocaleDateString('it-IT')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Input
                placeholder="Nome cliente"
                value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              />
              <Input
                placeholder="Telefono"
                value={customer.phone}
                onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
              />
              <Input
                placeholder="Note (opzionale)"
                value={customer.notes}
                onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))}
              />
            </div>

            <div className="text-sm text-gray-600 mb-2">Slot disponibili:</div>
            {slots.length === 0 ? (
              <div className="text-sm text-gray-500">Nessuno slot libero per servizio/staff in questa data.</div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                {slots.map((s: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => createFromSlot(s)}
                    disabled={creating}
                    className="border rounded-lg px-3 py-2 hover:bg-blue-50 text-left"
                    title={`Termina: ${fmtDateTime(new Date(s.end))}`}
                  >
                    <div className="font-medium">
                      {new Date(s.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(s.start).toLocaleDateString('it-IT')}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Annulla</Button>
              <Button disabled>Seleziona uno slot per creare</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}