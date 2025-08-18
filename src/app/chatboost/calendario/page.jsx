'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link as LinkIcon, Send as SendIcon, Search, PlusIcon, X as XIcon } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, setDoc, doc, getDocs } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

/* -------------------- Helpers (JS) -------------------- */
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
  const y = current.getFullYear(); const m = current.getMonth();
  return { first: new Date(y, m, 1), last: new Date(y, m + 1, 0) };
};
const normalizePhone = (phoneRaw) => {
  if (!phoneRaw) return '';
  let phone = String(phoneRaw).trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (phoneRaw.startsWith('+')) return phoneRaw;
  return '';
};
const guessContactFromText = (text='') => {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/\+?\d[\d\s().-]{6,}\d/);
  return {
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? normalizePhone(phoneMatch[0]) : ''
  };
};

export default function CalendarioPage() {
  const { user } = useAuth();

  const [date, setDate] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

  const [cfg, setCfg] = useState(null);

  const [appts, setAppts] = useState([]);
  const [gEvents, setGEvents] = useState([]);

  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalId, setGoogleCalId] = useState('');

  const [contacts, setContacts] = useState([]);
  const contactsById = useMemo(() => {
    const m = new Map();
    for (const c of contacts) m.set(c.id || c.phone, c);
    return m;
  }, [contacts]);

  const [linksMap, setLinksMap] = useState(new Map());
  const [templates, setTemplates] = useState([]);
  const [tplChoice, setTplChoice] = useState({});

  const [userData, setUserData] = useState(null);

  // Modal create
  const [createOpen, setCreateOpen] = useState(false);
  const [createHour, setCreateHour] = useState('20:00');
  const [createDuration, setCreateDuration] = useState(90);
  const [createNotes, setCreateNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

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

    const saved = cfg?.defaultGoogleCalendarId || localStorage.getItem('defaultGoogleCalendarId');
    const preferred = saved || (items.find((c)=>c.primary)?.id) || (items[0]?.id);
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

  /* -------------------- Config + templates + rubrica + userData -------------------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const idt = await user.getIdToken();
      const res = await fetch('/api/calendar/config', { headers: { Authorization: `Bearer ${idt}` } });
      const json = await res.json();
      setCfg(json || {});

      try {
        const tRes = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const t = await tRes.json();
        if (Array.isArray(t)) setTemplates(t.filter((x) => x.status === 'APPROVED'));
      } catch {}

      const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
      const unsub = onSnapshot(qContacts, snap => {
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const usersSnap = await getDocs(collection(db, 'users'));
      const me = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).find((u) => u.email === user.email);
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
  useEffect(() => { if (user && cfg) loadGoogleCalendars(); /* eslint-disable-next-line */ }, [user, cfg]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); /* eslint-disable-next-line */ }, [user, monthRef, googleCalId]);

  /* -------------------- Link evento↔contatto (Firestore) -------------------- */
  const loadLinks = async () => {
    if (!user) return;
    const qLinks = query(collection(db, 'calendar_links'), where('user_uid', '==', user.uid));
    const snap = await getDocs(qLinks);
    const m = new Map();
    snap.forEach(d => {
      const data = d.data();
      m.set(`${data.kind}:${data.eventId}`, data.contactId);
    });
    setLinksMap(m);
  };
  useEffect(() => { if (user) loadLinks(); }, [user]);

  const linkContact = async (kind, eventId, contactId) => {
    if (!user) return;
    const id = `${user.uid}__${kind}__${eventId}`;
    await setDoc(doc(db, 'calendar_links', id), {
      user_uid: user.uid, kind, eventId, contactId, linkedAt: new Date()
    }, { merge: true });
    setLinksMap(m => new Map(m).set(`${kind}:${eventId}`, contactId));
  };

  /* -------------------- Merge per giorno -------------------- */
  const mergedByDay = useMemo(() => {
    const map = {};
    for (const a of appts) {
      const k = ymd(toDate(a.start)); (map[k] ||= []).push({ __type: 'internal', ...a });
    }
    for (const ev of gEvents) {
      const s = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00' : null);
      if (!s) continue;
      const k = ymd(s); (map[k] ||= []).push({ __type: 'google', ...ev });
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const as = a.__type === 'internal' ? toDate(a.start) : new Date(a.start?.dateTime || a.start?.date || 0);
        const bs = b.__type === 'internal' ? toDate(b.start) : new Date(b.start?.dateTime || b.start?.date || 0);
        return +as - +bs;
      });
    }
    return map;
  }, [appts, gEvents]);

  const daysWithEvents = useMemo(() => Object.keys(mergedByDay).map(k => new Date(k + 'T12:00:00')), [mergedByDay]);
  const selectedKey = ymd(date);
  const eventsOfDay = mergedByDay[selectedKey] || [];

  /* -------------------- Invio template -------------------- */
  const sendTemplate = async (phone, templateName) => {
    if (!userData?.phone_number_id) {
      alert('Configurazione WhatsApp mancante (phone_number_id).');
      return;
    }
    if (!templateName) {
      alert('Seleziona un template.');
      return;
    }
    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: templateName, language: { code: 'it' }, components: [{ type: 'BODY', parameters: [] }] },
      };
      const resp = await fetch(
        `https://graph.facebook.com/v19.0/${userData.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const text = await resp.text();
      let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (resp.ok && data?.messages) alert('Template inviato ✅');
      else alert('Invio KO: ' + (data?.error?.message || JSON.stringify(data)));
    } catch (e) { alert('Invio KO: ' + (e?.message || e)); }
  };

  /* -------------------- Derive: contatto per evento -------------------- */
  const resolveContactForEvent = (ev) => {
    const evKey = ev.__type === 'internal' ? `internal:${ev.id}` : `google:${ev.id}`;
    const linkedId = linksMap.get(evKey);
    if (linkedId && contactsById.get(linkedId)) return contactsById.get(linkedId);

    if (ev.__type === 'internal') {
      const ph = normalizePhone(ev.customer?.phone);
      if (ph && contactsById.get(ph)) return contactsById.get(ph);
      return null;
    }

    const att = (ev.attendees || []).find((a) => a.email);
    if (att) {
      const byEmail = Array.from(contactsById.values()).find((c) => (c.email || '').toLowerCase() === att.email.toLowerCase());
      if (byEmail) return byEmail;
    }
    const guess = guessContactFromText(`${ev.description || ''} ${ev.location || ''} ${ev.summary || ''}`);
    if (guess.phone && contactsById.get(guess.phone)) return contactsById.get(guess.phone);
    if (guess.email) {
      const byE = Array.from(contactsById.values()).find((c) => (c.email || '').toLowerCase() === guess.email.toLowerCase());
      if (byE) return byE;
    }
    return null;
  };

  /* -------------------- Auto refresh -------------------- */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      loadInternalMonth();
      if (googleCalId) loadGoogleMonth(googleCalId);
    };
    refreshTimer.current = setInterval(tick, 60000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      document.removeEventListener('visibilitychange', vis);
    };
    // eslint-disable-next-line
  }, [user, monthRef, googleCalId]);

  /* -------------------- Create modal helpers -------------------- */
  const toggleSelectContact = (c) => {
    setSelectedContacts(prev => {
      const exists = prev.find(p => (p.id || p.phone) === (c.id || c.phone));
      if (exists) return prev.filter(p => (p.id || p.phone) !== (c.id || c.phone));
      return [...prev, c];
    });
  };
  const removeSelected = (idOrPhone) => {
    setSelectedContacts(prev => prev.filter(p => (p.id || p.phone) !== idOrPhone));
  };

  const visibleContacts = contacts
    .filter(c => {
      if (!searchQuery.trim()) return true;
      const s = searchQuery.toLowerCase();
      return [c.firstName, c.lastName, c.phone, c.email, (c.tags||[]).join(' ')]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(s));
    })
    .slice(0, 200);

  const createAppointment = async () => {
    if (!user) return;
    let mainName = (manualName || '').trim();
    let mainPhone = normalizePhone(manualPhone || '');

    if (selectedContacts.length > 0) {
      const main = selectedContacts[0];
      mainName  = mainName || `${main.firstName || ''} ${main.lastName || ''}`.trim() || main.phone || main.email || 'Ospite';
      mainPhone = mainPhone || normalizePhone(main.phone || '');
    }

    if (!mainName || !mainPhone) {
      alert('Inserisci almeno un contatto (nome + telefono).');
      return;
    }

    const dayStr = ymd(date);
    if (!createHour) { alert('Seleziona un orario.'); return; }
    const startISO = new Date(`${dayStr}T${createHour}:00`).toISOString();

    const party = selectedContacts.map(c => ({
      id: c.id || c.phone,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone || c.email || '',
      phone: c.phone || '',
      email: c.email || ''
    }));

    try {
      const idt = await user.getIdToken();
      const r = await fetch('/api/calendar/appointments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name: mainName, phone: mainPhone },
          start: startISO,
          durationMin: createDuration,
          notes: createNotes,
          party,
          service_id: null,
          staff_id: null
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || 'Errore creazione');
        return;
      }
      await loadInternalMonth();
      if (googleCalId) await loadGoogleMonth(googleCalId);
      setCreateOpen(false);
      setSelectedContacts([]);
      setManualName(''); setManualPhone('');
      setCreateNotes('');
    } catch (e) {
      alert(e?.message || 'Errore');
    }
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
            {googleCalendars.map((c) => <option key={c.id} value={c.id}>{c.summary}</option>)}
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

                const contact = resolveContactForEvent(ev);
                const contactName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '';
                const contactPhone = contact?.phone || '';

                const title = isInternal ? `${ev.customer?.name || '—'}` : (ev.summary || '(Google, senza titolo)');
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
                          {fmtRange(s, e)} {isInternal && ev.party?.length ? `• ${ev.party.length} partecipanti` : ''}
                        </div>

                        <div className="mt-2 text-sm">
                          {contact ? (
                            <div className="text-gray-800">
                              <span className="font-medium">{contactName || contact.phone || contact.email || 'Contatto'}</span>
                              {contact.phone && <span className="text-gray-500"> • {contact.phone}</span>}
                              {contact.email && <span className="text-gray-500"> • {contact.email}</span>}
                            </div>
                          ) : (
                            <div className="text-gray-500 italic">Nessun contatto collegato</div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        {!contact && (
                          <Button
                            variant="outline" size="sm" className="flex items-center gap-1"
                            onClick={() => {
                              alert('Collega contatto: lasciata come nel tuo flusso attuale.');
                            }}
                          >
                            <LinkIcon className="w-4 h-4" /> Abbina
                          </Button>
                        )}
                        {contactPhone && templates.length > 0 && (
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
                              variant="outline" size="icon" title="Invia template"
                              onClick={() => sendTemplate(contactPhone, tplChoice[evKey])}
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

      {/* -------------------- MODAL: NUOVO APPUNTAMENTO -------------------- */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuova prenotazione</h3>
              <button onClick={()=>setCreateOpen(false)} className="text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm text-gray-600 mb-1">Data</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm">{date.toLocaleDateString('it-IT')}</div>

                <label className="block text-sm text-gray-600 mt-3 mb-1">Ora</label>
                <Input type="time" value={createHour} onChange={e=>setCreateHour(e.target.value)} step={300} />

                <label className="block text-sm text-gray-600 mt-3 mb-1">Durata (min)</label>
                <Input type="number" min={10} step={5} value={createDuration} onChange={e=>setCreateDuration(parseInt(e.target.value||'0',10)||90)} />

                <label className="block text-sm text-gray-600 mt-3 mb-1">Note</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 h-28"
                  placeholder="Es. Tavolo 5 persone, allergie..."
                  value={createNotes}
                  onChange={e=>setCreateNotes(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Cerca in rubrica</label>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Nome, cognome, telefono, email…"
                    value={searchQuery}
                    onChange={e=>setSearchQuery(e.target.value)}
                  />
                </div>

                {selectedContacts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedContacts.map(c => {
                      const id = c.id || c.phone;
                      const label = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone || c.email || id;
                      return (
                        <span key={id} className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm">
                          {label}
                          <button className="hover:text-red-600" onClick={()=>removeSelected(id)} title="Rimuovi">
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 max-h-64 overflow-y-auto border rounded-lg divide-y">
                  {contacts
                    .filter(c => {
                      if (!searchQuery.trim()) return true;
                      const s = searchQuery.toLowerCase();
                      return [c.firstName, c.lastName, c.phone, c.email, (c.tags||[]).join(' ')]
                        .filter(Boolean)
                        .some(v => String(v).toLowerCase().includes(s));
                    })
                    .slice(0, 200)
                    .map(c => {
                      const id = c.id || c.phone;
                      const label = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone || c.email || id;
                      const selected = !!selectedContacts.find(p => (p.id || p.phone) === (c.id || c.phone));
                      return (
                        <button
                          key={id}
                          onClick={()=>toggleSelectContact(c)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between ${selected ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                        >
                          <div>
                            <div className="font-medium">{label}</div>
                            <div className="text-xs text-gray-500">{c.phone} {c.email && `• ${c.email}`}</div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${selected ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                            {selected ? 'Selezionato' : 'Seleziona'}
                          </span>
                        </button>
                      );
                    })}
                  {contacts.length === 0 && (
                    <div className="p-3 text-sm text-gray-500">Rubrica vuota.</div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Nome (manuale)</label>
                    <Input placeholder="Mario Rossi" value={manualName} onChange={e=>setManualName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Telefono (manuale)</label>
                    <Input placeholder="+39…" value={manualPhone} onChange={e=>setManualPhone(e.target.value)} />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={()=>setCreateOpen(false)}>Annulla</Button>
                  <Button onClick={createAppointment} className="bg-black text-white">Crea appuntamento</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* -------------------- /MODAL -------------------- */}
    </div>
  );
}