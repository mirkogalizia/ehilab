'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function fmt(dt) {
  const d = new Date(dt);
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}
function ymd(d) {
  const z = new Date(d);
  return z.toISOString().slice(0,10);
}

export default function CalendarioPage() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [date, setDate] = useState(ymd(new Date()));
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState([]);
  const [appts, setAppts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState({ name:'', phone:'', notes:'' });
  const [googleCalendars, setGoogleCalendars] = useState([]);

  // Carica config
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/calendar/config', { headers: { Authorization: `Bearer ${idToken}` }});
      const json = await res.json();
      setCfg(json || {});
      if (json?.staff?.length && !staffId) setStaffId(json.staff[0].id);
      if (json?.services?.length && !serviceId) setServiceId(json.services[0].id);
    })();
  }, [user]);

  // Carica slot disponibili
  useEffect(() => {
    if (!user || !cfg || !serviceId) return;
    (async () => {
      const idToken = await user.getIdToken();
      const qs = new URLSearchParams({ date, service_id: serviceId });
      if (staffId) qs.set('staff_id', staffId);
      const res = await fetch(`/api/calendar/available?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const json = await res.json();
      setSlots(json.slots || []);
    })();
  }, [user, cfg, date, staffId, serviceId]);

  // Carica appuntamenti del giorno
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idToken = await user.getIdToken();
      const from = new Date(date + 'T00:00:00').toISOString();
      const to = new Date(date + 'T23:59:59').toISOString();
      const qs = new URLSearchParams({ from, to });
      if (staffId) qs.set('staff_id', staffId);
      const res = await fetch(`/api/calendar/appointments?${qs.toString()}`, { headers: { Authorization: `Bearer ${idToken}` }});
      setAppts(await res.json());
    })();
  }, [user, date, staffId, creating]);

  // Google calendars
  const loadGoogleCalendars = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const res = await fetch('/api/google/calendar/list', { headers: { Authorization: `Bearer ${idToken}` }});
    const data = await res.json();
    setGoogleCalendars(data.items || []);
  };

  const connectGoogle = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const r = await fetch('/api/google/oauth/start', { headers: { Authorization: `Bearer ${idToken}` }});
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  };

  const createAppt = async (slot) => {
    if (!user) return;
    if (!customer.name || !customer.phone || !serviceId || !staffId) {
      alert('Compila nome, telefono, servizio e staff');
      return;
    }
    setCreating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/calendar/appointments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type':'application/json'
        },
        body: JSON.stringify({
          customer,
          service_id: serviceId,
          staff_id: staffId,
          start: slot.start,
          notes: customer.notes || ''
        })
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'Errore creazione');
      else {
        setCustomer({ name:'', phone:'', notes:'' });
      }
    } finally {
      setCreating(false);
    }
  };

  if (!user) return <div className="p-6">Devi effettuare il login.</div>;
  if (!cfg) return <div className="p-6">Caricamento calendario…</div>;

  return (
    <div className="p-6 space-y-6 font-[Montserrat]">
      <h1 className="text-2xl font-bold">Calendario</h1>

      {/* Google connect + scelta calendario */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <Button onClick={connectGoogle} variant="outline">Collega Google Calendar</Button>
        <Button onClick={loadGoogleCalendars} variant="outline">Lista calendari Google</Button>
        {googleCalendars.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Calendari:</span>
            <select
              className="border rounded px-2 py-1"
              onChange={async (e) => {
                // salviamo come defaultCalendarId
                const idToken = await user.getIdToken();
                await fetch('/api/calendar/config', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type':'application/json' },
                  body: JSON.stringify({ defaultGoogleCalendarId: e.target.value, syncToGoogle: true })
                });
                alert('Calendario di default salvato');
              }}
            >
              <option value="">-- Seleziona calendario --</option>
              {googleCalendars.map(cal => (
                <option key={cal.id} value={cal.id}>{cal.summary}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filtri base */}
      <div className="rounded-xl border p-4 bg-white flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Data</label>
          <Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Staff</label>
          <select className="border rounded px-2 py-1" value={staffId} onChange={e=>setStaffId(e.target.value)}>
            {(cfg.staff||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Servizio</label>
          <select className="border rounded px-2 py-1" value={serviceId} onChange={e=>setServiceId(e.target.value)}>
            {(cfg.services||[]).map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration}’)</option>)}
          </select>
        </div>
      </div>

      {/* Form cliente rapido */}
      <div className="rounded-xl border p-4 bg-white grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input placeholder="Nome cliente" value={customer.name} onChange={e=>setCustomer(c=>({...c, name:e.target.value}))}/>
        <Input placeholder="Telefono" value={customer.phone} onChange={e=>setCustomer(c=>({...c, phone:e.target.value}))}/>
        <Input placeholder="Note (opzionale)" value={customer.notes} onChange={e=>setCustomer(c=>({...c, notes:e.target.value}))}/>
        <div className="text-sm text-gray-500 flex items-center">Compila e clicca su uno slot libero per prenotare</div>
      </div>

      {/* Vista giornata: slot liberi + appuntamenti */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border p-4 bg-white">
          <h3 className="font-semibold mb-3">Slot disponibili</h3>
          {slots.length === 0 ? (
            <div className="text-gray-500 text-sm">Nessuno slot libero per questa data/servizio/staff</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {slots.map((s,i)=>(
                <button
                  key={i}
                  onClick={()=>createAppt(s)}
                  disabled={creating}
                  className="border rounded-lg px-3 py-2 hover:bg-blue-50 text-left"
                  title={`Termina: ${fmt(s.end)}`}
                >
                  <div className="font-medium">{new Date(s.start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div>
                  <div className="text-xs text-gray-600">{new Date(s.start).toLocaleDateString('it-IT')}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <h3 className="font-semibold mb-3">Appuntamenti del giorno</h3>
          {appts.length === 0 ? (
            <div className="text-gray-500 text-sm">Nessun appuntamento</div>
          ) : (
            <div className="space-y-2">
              {appts
                .sort((a,b)=> a.start.seconds - b.start.seconds)
                .map(a=>(
                <div key={a.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{a.customer?.name} – {a.service_id}</div>
                    <div className="text-sm text-gray-600">
                      {fmt(a.start.toDate ? a.start.toDate() : a.start)} → {fmt(a.end.toDate ? a.end.toDate() : a.end)}
                    </div>
                    <div className="text-xs text-gray-500">Staff: {a.staff_id} • Stato: {a.status}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={async ()=>{
                        const idToken = await user.getIdToken();
                        await fetch('/api/calendar/appointments', {
                          method: 'PATCH',
                          headers: { Authorization:`Bearer ${idToken}`, 'Content-Type':'application/json' },
                          body: JSON.stringify({ id: a.id, patch: { status: a.status==='confirmed' ? 'done':'confirmed' } })
                        });
                      }}
                    >
                      {a.status==='confirmed' ? 'Chiudi' : 'Conferma'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async ()=>{
                        if (!confirm('Eliminare appuntamento?')) return;
                        const idToken = await user.getIdToken();
                        const qs = new URLSearchParams({ id: a.id });
                        await fetch(`/api/calendar/appointments?${qs.toString()}`, {
                          method:'DELETE',
                          headers: { Authorization:`Bearer ${idToken}` }
                        });
                        setAppts(x=>x.filter(y=>y.id!==a.id));
                      }}
                    >
                      Cancella
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}