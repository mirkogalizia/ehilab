'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link as LinkIcon, Send as SendIcon, Search, PlusIcon, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
const normalizePhone = (phoneRaw='') => {
  let phone = String(phoneRaw).trim().replace(/^[+]+/,'').replace(/^00/,'').replace(/[\s\-().]/g,'');
  if (!phone) return '';
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3')  && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  return phoneRaw.startsWith('+') ? phoneRaw : '';
};

export default function CalendarioPage() {
  const { user } = useAuth();

  // selezione calendario e mese
  const [date, setDate] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

  // dati: interni (Firestore) + Google
  const [appts, setAppts] = useState([]);     // interni
  const [gEvents, setGEvents] = useState([]); // google

  // google calendars
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalId, setGoogleCalId] = useState('');

  // rubrica
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');

  // template WhatsApp
  const [templates, setTemplates] = useState([]);
  // scelta template per-evento
  const [tplChoice, setTplChoice] = useState({}); // { [evKey]: templateName }

  // userData per invio template diretto (come ChatPage)
  const [userData, setUserData] = useState(null);

  // modal create
  const [createOpen, setCreateOpen] = useState(false);
  const [createTime, setCreateTime] = useState('20:00');
  const [createDuration, setCreateDuration] = useState(90);
  const [createNotes, setCreateNotes] = useState('');
  const [selContacts, setSelContacts] = useState([]); // [{id, firstName, lastName, phone, email}]

  const refreshTimer = useRef(null);

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

    const saved = localStorage.getItem('defaultGoogleCalendarId');
    const preferred = saved || (items.find(c => c.primary)?.id) || (items[0]?.id);
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
    localStorage.setItem('defaultGoogleCalendarId', calendarId);
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

  /* -------------------- Load base: contatti, templates, userData -------------------- */
  useEffect(() => {
    if (!user) return;

    (async () => {
      // rubrica realtime
      const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
      const unsub = onSnapshot(qContacts, snap => {
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      // templates
      try {
        const tRes = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const t = await tRes.json();
        if (Array.isArray(t)) setTemplates(t.filter(x => x.status === 'APPROVED'));
      } catch {}

      // userData (per phone_number_id)
      const usersSnap = await getDocs(collection(db, 'users'));
      const me = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);

      return () => unsub();
    })();
  }, [user]);

  /* -------------------- Appuntamenti interni del mese -------------------- */
  const loadInternalMonth = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const { first, last } = monthWindow(monthRef);
    const qs = new URLSearchParams({
      from: startOfDay(first).toISOString(),
      to:   endOfDay(last).toISOString(),
    });
    const r = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${idt}` },
    });
    const data = await r.json();
    setAppts(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (user) loadInternalMonth(); }, [user, monthRef]);

  /* -------------------- Eventi Google del mese -------------------- */
  useEffect(() => { if (user) loadGoogleCalendars(); }, [user]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); }, [user, monthRef, googleCalId]);

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
    // ordina per ora
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

  const daysWithEvents = useMemo(
    () => Object.keys(mergedByDay).map(k => new Date(k + 'T12:00:00')),
    [mergedByDay]
  );

  const selectedKey = ymd(date);
  const eventsOfDay = mergedByDay[selectedKey] || [];

  /* -------------------- Invio template: a tutti i contatti dell'evento -------------------- */
  const sendTemplateBulk = async (phones, templateName) => {
    if (!userData?.phone_number_id) {
      alert('Configurazione WhatsApp mancante (phone_number_id).');
      return;
    }
    if (!templateName) {
      alert('Seleziona un template.');
      return;
    }
    let ok = 0, ko = 0;
    for (const raw of phones) {
      const phone = normalizePhone(raw);
      if (!phone) { ko++; continue; }
      try {
        const payload = {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: { name: templateName, language: { code: 'it' }, components: [{ type:'BODY', parameters: [] }] }
        };
        const resp = await fetch(`https://graph.facebook.com/v19.0/${userData.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const txt = await resp.text();
        const json = txt ? JSON.parse(txt) : {};
        if (resp.ok && json?.messages) ok++; else ko++;
      } catch { ko++; }
    }
    alert(`Inviati: ${ok} • Falliti: ${ko}`);
  };

  /* -------------------- Delete evento interno -------------------- */
  const deleteAppt = async (id) => {
    if (!user || !id) return;
    if (!confirm('Eliminare questo evento?')) return;
    const idt = await user.getIdToken();
    const qs = new URLSearchParams({ id });
    await fetch(`/api/calendar/appointments?${qs.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idt}` },
    });
    // ricarica
    loadInternalMonth();
  };

  /* -------------------- Create modal helpers -------------------- */
  const filteredContacts = useMemo(() => {
    const s = contactSearch.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter(c =>
      [c.firstName, c.lastName, c.phone, c.email, (c.tags||[]).join(' ')].filter(Boolean)
      .some(v => String(v).toLowerCase().includes(s))
    );
  }, [contactSearch, contacts]);

  const toggleSelectContact = (c) => {
    setSelContacts((arr) => {
      const exists = arr.find(x => x.id === c.id);
      if (exists) return arr.filter(x => x.id !== c.id);
      return [...arr, c];
    });
  };

  const createEvent = async () => {
    if (!user) return;
    if (!selContacts.length) { alert('Seleziona almeno un contatto'); return; }
    if (!createTime) { alert('Scegli un orario'); return; }

    // costruisci ISO UTC preservando l'orario locale selezionato
    const base = new Date(`${ymd(date)}T${createTime}:00`);
    const startISO = new Date(base.getTime() - base.getTimezoneOffset()*60000).toISOString();

    const contactsPayload = selContacts.map(c => ({
      contactId: c.id,
      name: `${c.firstName||''} ${c.lastName||''}`.trim() || null,
      phone: c.phone || null,
      email: c.email || null,
    }));

    const idt = await user.getIdToken();
    const res = await fetch('/api/calendar/appointments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: startISO,
        durationMinutes: Number(createDuration || 90),
        notes: createNotes || '',
        contacts: contactsPayload,
      })
    });
    const j = await res.json();
    if (!res.ok) {
      alert(j?.error || 'Errore creazione');
      return;
    }
    // reset & chiudi
    setCreateOpen(false);
    setSelContacts([]);
    setCreateNotes('');
    // ricarica eventi
    loadInternalMonth();
  };

  /* -------------------- UI -------------------- */
  if (!user) return <div className="p-6">Devi effettuare il login.</div>;

  return (
    <div className="p-6 font-[Montserrat] h-full">
      <h1 className="text-2xl font-bold mb-4">Calendario</h1>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <Button variant="outline" onClick={connectGoogle}>Collega Google Calendar</Button>
        <Button variant="outline" onClick={loadGoogleCalendars}>Ricarica calendari</Button>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Calendar (sx) */}
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
                {date?.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <Button variant="ghost" size="icon" className="size-6" title="Nuovo appuntamento" onClick={() => setCreateOpen(true)}>
                <PlusIcon />
                <span className="sr-only">Add Event</span>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground px-1">
              I giorni con puntino verde hanno eventi (interni o Google).
            </div>
          </CardFooter>
        </Card>

        {/* Lista appuntamenti del giorno (dx) */}
        <div className="rounded-xl border p-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Appuntamenti del giorno</h3>
            <div className="text-sm text-gray-500">{eventsOfDay.length} eventi</div>
          </div>

          {eventsOfDay.length === 0 ? (
            <div className="text-gray-500 text-sm">Nessun evento</div>
          ) : (
            <div className="space-y-2">
              {eventsOfDay.map((ev, idx) => {
                const isInternal = ev.__type === 'internal';
                const s = isInternal ? toDate(ev.start) : new Date(ev.start?.dateTime || ev.start?.date || Date.now());
                const e = isInternal ? toDate(ev.end)   : new Date(ev.end?.dateTime   || ev.end?.date   || s);

                // contatti dell'evento (interni) → array
                const guests = isInternal ? (ev.guests || []) : [];
                const phones = guests.map(g => g.phone).filter(Boolean);

                const title = isInternal
                  ? (guests[0]?.name || guests[0]?.phone || 'Prenotazione')
                    + (guests.length > 1 ? ` (+${guests.length-1})` : '')
                  : (ev.summary || '(Google, senza titolo)');

                const rightTagColor = isInternal ? 'bg-emerald-600' : 'bg-violet-600';

                const evKey = `${isInternal ? 'i' : 'g'}:${ev.id || idx}`;

                return (
                  <div key={`${ev.__type}-${ev.id || idx}`} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-2">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${rightTagColor}`} />
                          {title}
                          {!isInternal && ev.htmlLink && (
                            <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" title="Apri su Google">
                              <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                            </a>
                          )}
                        </div>

                        <div className="text-xs text-gray-600 mt-1">
                          {fmtRange(s, e)}
                          {isInternal && ev.status ? ` • Stato: ${ev.status}` : ''}
                        </div>

                        {/* Chip contatti interni */}
                        {isInternal && guests.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {guests.map((g, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                                {(g.name || g.phone || g.email || 'Contatto')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 items-end">
                        {/* Elimina solo per interni */}
                        {isInternal && (
                          <Button variant="ghost" size="sm" onClick={() => deleteAppt(ev.id)} title="Elimina">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Invio template a TUTTI i numeri dell'evento interno */}
                        {isInternal && phones.length > 0 && templates.length > 0 && (
                          <div className="flex items-center gap-2">
                            <select
                              className="border rounded px-2 py-1 text-sm"
                              value={tplChoice[evKey] || ''}
                              onChange={(e) => setTplChoice((prev) => ({ ...prev, [evKey]: e.target.value }))}
                            >
                              <option value="">Template…</option>
                              {templates.map(t => (
                                <option key={t.name} value={t.name}>
                                  {t.components?.[0]?.text
                                    ? t.components[0].text.slice(0, 40) + (t.components[0].text.length > 40 ? '…' : '')
                                    : t.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Invia template a tutti i contatti"
                              onClick={() => sendTemplateBulk(phones, tplChoice[evKey])}
                              disabled={!tplChoice[evKey]}
                            >
                              <SendIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Crea Evento */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCreateOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuovo evento – {date.toLocaleDateString('it-IT')}</h3>
              <button className="text-2xl leading-none" onClick={()=>setCreateOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Orario</label>
                <Input type="time" value={createTime} onChange={e=>setCreateTime(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Durata (min)</label>
                <Input type="number" min={15} step={15} value={createDuration} onChange={e=>setCreateDuration(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Note</label>
                <Input value={createNotes} onChange={e=>setCreateNotes(e.target.value)} placeholder="opzionale" />
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm text-gray-600 mb-2">Cerca in rubrica</label>
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Nome, cognome, telefono, email…"
                  value={contactSearch}
                  onChange={e=>setContactSearch(e.target.value)}
                />
              </div>

              {/* Selezionati (chip) */}
              {selContacts.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {selContacts.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 px-2 py-1 rounded-full">
                      {(c.firstName||'') + ' ' + (c.lastName||'')}
                      <button className="ml-1" onClick={() => toggleSelectContact(c)}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Lista contatti */}
              <div className="max-h-64 overflow-y-auto rounded border bg-white">
                {filteredContacts.map(c => {
                  const selected = !!selContacts.find(x => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50 ${selected ? 'bg-gray-100' : ''}`}
                      onClick={() => toggleSelectContact(c)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{(c.firstName||'') + ' ' + (c.lastName||'')}</div>
                        <div className="text-xs text-gray-500 truncate">{c.phone} {c.email ? `• ${c.email}` : ''}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${selected ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {selected ? 'Selezionato' : 'Scegli'}
                      </span>
                    </button>
                  );
                })}
                {filteredContacts.length === 0 && <div className="p-3 text-sm text-gray-500">Nessun contatto</div>}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setCreateOpen(false)}>Annulla</Button>
              <Button onClick={createEvent} className="bg-black text-white">Crea evento</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}