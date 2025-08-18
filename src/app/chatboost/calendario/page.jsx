'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link as LinkIcon, Send as SendIcon, Search, PlusIcon, X as CloseIcon } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, setDoc, doc, getDocs
} from 'firebase/firestore';

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

  // selezione calendario e mese
  const [date, setDate] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

  // configurazione interna (staff/servizi)
  const [cfg, setCfg] = useState(null);
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');

  // dati: interni (Firestore) + Google
  const [appts, setAppts] = useState([]);     // interni
  const [gEvents, setGEvents] = useState([]); // google

  // google calendars
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleCalId, setGoogleCalId] = useState('');

  // rubrica
  const [contacts, setContacts] = useState([]);
  const contactsById = useMemo(() => {
    const m = new Map();
    for (const c of contacts) m.set(c.id || c.phone, c);
    return m;
  }, [contacts]);

  // mappa evento↔contatto
  const [linksMap, setLinksMap] = useState(new Map()); // key: `${kind}:${eventId}` -> contactId

  // template WhatsApp
  const [templates, setTemplates] = useState([]);

  // scelte template per-evento (key → templateName)
  const [tplChoice, setTplChoice] = useState({}); // { [eventKey]: string }

  // userData per prendere phone_number_id come in ChatPage
  const [userData, setUserData] = useState(null);

  // modale abbinamento contatto
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null); // { kind:'internal'|'google', id:string }
  const [contactSearch, setContactSearch] = useState('');

  // modale creazione appuntamento
  const [createOpen, setCreateOpen] = useState(false);
  const [createTime, setCreateTime] = useState('10:00');
  const [createNotes, setCreateNotes] = useState('');
  const [createContactManual, setCreateContactManual] = useState({ name: '', phone: '', email: '' });
  const [createContactPicked, setCreateContactPicked] = useState(null); // contact object
  const [contactQuickSearch, setContactQuickSearch] = useState('');

  // auto-refresh
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
    const preferred =
      saved ||
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
      // config
      const idt = await user.getIdToken();
      const res = await fetch('/api/calendar/config', { headers: { Authorization: `Bearer ${idt}` } });
      const json = await res.json();
      setCfg(json || {});
      if (json?.staff?.length) setStaffId(s => s || json.staff[0].id);
      if (json?.services?.length) setServiceId(s => s || json.services[0].id);

      // templates approvati
      try {
        const tRes = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const t = await tRes.json();
        if (Array.isArray(t)) setTemplates(t.filter(x => x.status === 'APPROVED'));
      } catch {}

      // rubrica realtime
      const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
      const unsub = onSnapshot(qContacts, snap => {
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

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
    if (staffId) qs.set('staff_id', staffId);
    const r = await fetch(`/api/calendar/appointments?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${idt}` },
    });
    const data = await r.json();
    setAppts(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (user) loadInternalMonth(); }, [user, monthRef, staffId]);

  /* -------------------- Eventi Google del mese -------------------- */
  useEffect(() => { if (user && cfg) loadGoogleCalendars(); /* eslint-disable-next-line */ }, [user, cfg]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); /* eslint-disable-next-line */ }, [user, monthRef, googleCalId]);

  /* -------------------- Link evento↔contatto (Firestore) -------------------- */
  const loadLinks = async () => {
    if (!user) return;
    const qLinks = query(
      collection(db, 'calendar_links'),
      where('user_uid', '==', user.uid)
    );
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
      user_uid: user.uid,
      kind,
      eventId,
      contactId,
      linkedAt: new Date()
    }, { merge: true });
    setLinksMap(m => new Map(m).set(`${kind}:${eventId}`, contactId));
    setLinkModalOpen(false);
    setLinkTarget(null);
  };

  /* -------------------- Merge per giorno -------------------- */
  const mergedByDay = useMemo(() => {
    const map = {};
    for (const a of appts) {
      const k = ymd(toDate(a.start));
      (map[k] ||= []).push({ __type: 'internal', ...a });
    }
    for (const ev of gEvents) {
      const s = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00' : null);
      if (!s) continue;
      const k = ymd(s);
      (map[k] ||= []).push({ __type: 'google', ...ev });
    }
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

  /* -------------------- Invio template (come ChatPage: selezione + bottone) -------------------- */
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
        template: {
          name: templateName,
          language: { code: 'it' },
          components: [{ type: 'BODY', parameters: [] }],
        },
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
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (resp.ok && data?.messages) {
        alert('Template inviato ✅');
      } else {
        const reason = data?.error?.message || JSON.stringify(data);
        alert('Invio KO: ' + reason);
      }
    } catch (e) {
      alert('Invio KO: ' + (e?.message || e));
    }
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

    const att = (ev.attendees || []).find(a => a.email);
    if (att) {
      const byEmail = Array.from(contactsById.values()).find(c => (c.email || '').toLowerCase() === att.email.toLowerCase());
      if (byEmail) return byEmail;
    }
    const guess = guessContactFromText(`${ev.description || ''} ${ev.location || ''} ${ev.summary || ''}`);
    if (guess.phone && contactsById.get(guess.phone)) return contactsById.get(guess.phone);
    if (guess.email) {
      const byE = Array.from(contactsById.values()).find(c => (c.email || '').toLowerCase() === guess.email.toLowerCase());
      if (byE) return byE;
    }
    return null;
  };

  /* -------------------- Auto refresh (60s) quando visibile -------------------- */
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
  }, [user, monthRef, googleCalId, staffId]);

  /* -------------------- Creazione appuntamento -------------------- */
  const filteredQuick = useMemo(() => {
    const s = contactQuickSearch.trim().toLowerCase();
    if (!s) return contacts.slice(0, 50);
    return contacts.filter(c => {
      return [c.firstName, c.lastName, c.phone, c.email]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(s));
    }).slice(0, 50);
  }, [contacts, contactQuickSearch]);

  const openCreate = () => {
    setCreateOpen(true);
    setCreateTime('10:00');
    setCreateNotes('');
    setCreateContactManual({ name: '', phone: '', email: '' });
    setCreateContactPicked(null);
    setContactQuickSearch('');
  };

  const createAppointment = async () => {
    if (!user) return;

    const baseDate = ymd(date);
    if (!baseDate || !createTime) {
      alert('Seleziona data e orario.');
      return;
    }

    // contatto: priorità pick rubrica → manuale
    const picked = createContactPicked;
    const manualName = createContactManual.name?.trim();
    const manualPhone = normalizePhone(createContactManual.phone);

    let customer;
    if (picked) {
      customer = {
        name: `${picked.firstName || ''} ${picked.lastName || ''}`.trim() || (picked.phone || ''),
        phone: normalizePhone(picked.phone) || '',
        email: picked.email || ''
      };
    } else if (manualName && manualPhone) {
      customer = {
        name: manualName,
        phone: manualPhone,
        email: (createContactManual.email || '').trim()
      };
    } else {
      alert('Seleziona un contatto dalla rubrica o inserisci nome e telefono.');
      return;
    }

    if (!serviceId || !staffId) {
      alert('Seleziona servizio e staff.');
      return;
    }

    const startISO = new Date(`${baseDate}T${createTime}:00`).toISOString();

    try {
      const idt = await user.getIdToken();
      const res = await fetch('/api/calendar/appointments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer,
          service_id: serviceId,
          staff_id: staffId,
          start: startISO,
          notes: createNotes,
          syncToGoogle: true
        })
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || 'Errore creazione');
        return;
      }
      // refresh mese e giorno
      await loadInternalMonth();
      if (googleCalId) await loadGoogleMonth(googleCalId);
      setCreateOpen(false);
    } catch (e) {
      alert(e?.message || String(e));
    }
  };

  /* -------------------- UI -------------------- */
  if (!user) return <div className="p-6">Devi effettuare il login.</div>;

  const currentService = (cfg?.services || []).find(s => s.id === serviceId);
  const serviceDuration = currentService?.duration ? `• Durata ${currentService.duration}’` : '';

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
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Nuovo appuntamento"
                onClick={openCreate}
              >
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
                const s = isInternal
                  ? toDate(ev.start)
                  : new Date(ev.start?.dateTime || ev.start?.date || Date.now());
                const e = isInternal
                  ? toDate(ev.end)
                  : new Date(ev.end?.dateTime || ev.end?.date || s);

                const contact = resolveContactForEvent(ev);
                const contactName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '';
                const contactPhone = contact?.phone || '';

                const title = isInternal
                  ? `${ev.customer?.name || '—'} • ${ev.service_id}`
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
                          {fmtRange(s, e)} {isInternal && `• Staff: ${ev.staff_id} • Stato: ${ev.status}`}
                        </div>

                        {/* Contatto */}
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
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => {
                              const id = isInternal ? ev.id : ev.id;
                              setLinkTarget({ kind: isInternal ? 'internal' : 'google', id });
                              setLinkModalOpen(true);
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
                              onChange={(e) =>
                                setTplChoice((prev) => ({ ...prev, [evKey]: e.target.value }))
                              }
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
                              title="Invia template"
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

      {/* Modal abbinamento contatto */}
      {linkModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Abbina contatto</h3>
              <button className="text-2xl leading-none" onClick={()=>{ setLinkModalOpen(false); setLinkTarget(null); }}>×</button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-gray-500" />
              <Input
                placeholder="Cerca per nome, cognome, telefono, email…"
                value={contactSearch}
                onChange={e=>setContactSearch(e.target.value)}
              />
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {contacts
                .filter(c => {
                  if (!contactSearch) return true;
                  const s = contactSearch.toLowerCase();
                  return [
                    c.firstName, c.lastName, c.phone, c.email, (c.tags||[]).join(' ')
                  ].filter(Boolean).some(v => String(v).toLowerCase().includes(s));
                })
                .slice(0, 200)
                .map(c => (
                <button
                  key={c.id}
                  onClick={()=> linkContact(linkTarget.kind, linkTarget.id, c.id)}
                  className="w-full text-left py-2 px-1 hover:bg-gray-50"
                >
                  <div className="font-medium">{c.firstName} {c.lastName}</div>
                  <div className="text-xs text-gray-500">{c.phone} {c.email && `• ${c.email}`}</div>
                </button>
              ))}
              {contacts.length === 0 && (
                <div className="text-sm text-gray-500 p-2">Rubrica vuota.</div>
              )}
            </div>
            <div className="mt-4 text-right">
              <Button variant="outline" onClick={()=>{ setLinkModalOpen(false); setLinkTarget(null); }}>
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal NUOVO APPUNTAMENTO */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">Nuovo appuntamento</h3>
              <button
                className="p-1 rounded hover:bg-gray-100"
                onClick={() => setCreateOpen(false)}
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Colonna sx: Data/Orario/Servizio/Staff */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Data</label>
                  <Input value={ymd(date)} readOnly className="bg-gray-50" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Orario</label>
                  <Input type="time" value={createTime} onChange={e=>setCreateTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Servizio <span className="text-gray-400">{serviceDuration && `(${serviceDuration})`}</span></label>
                  <select
                    className="border rounded px-2 py-2 w-full"
                    value={serviceId}
                    onChange={(e)=>setServiceId(e.target.value)}
                  >
                    {(cfg?.services || []).length === 0 && <option value="">— Nessun servizio configurato —</option>}
                    {(cfg?.services || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.duration ? ` • ${s.duration}’` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Staff</label>
                  <select
                    className="border rounded px-2 py-2 w-full"
                    value={staffId}
                    onChange={(e)=>setStaffId(e.target.value)}
                  >
                    {(cfg?.staff || []).length === 0 && <option value="">— Nessuno —</option>}
                    {(cfg?.staff || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Note</label>
                  <textarea
                    rows={4}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Note per l’appuntamento (opzionale)"
                    value={createNotes}
                    onChange={e=>setCreateNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Colonna dx: Contatto (rubrica o manuale) */}
              <div className="space-y-3">
                <div className="p-3 border rounded-lg">
                  <div className="font-medium mb-2">Cerca in rubrica</div>
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="w-4 h-4 text-gray-500" />
                    <Input
                      placeholder="Nome, cognome, telefono o email…"
                      value={contactQuickSearch}
                      onChange={e=>setContactQuickSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-40 overflow-auto divide-y rounded border bg-white">
                    {filteredQuick.length === 0 && (
                      <div className="text-sm text-gray-500 p-2">Nessun contatto</div>
                    )}
                    {filteredQuick.map(c => {
                      const selected = createContactPicked?.id === c.id;
                      return (
                        <button
                          type="button"
                          key={c.id}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selected ? 'bg-emerald-50' : ''}`}
                          onClick={() => {
                            setCreateContactPicked(c);
                            setCreateContactManual({ name:'', phone:'', email:'' });
                          }}
                        >
                          <div className="font-medium">{c.firstName} {c.lastName}</div>
                          <div className="text-xs text-gray-500">{c.phone} {c.email && `• ${c.email}`}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 border rounded-lg">
                  <div className="font-medium mb-2">Oppure inserisci manualmente</div>
                  <div className="grid grid-cols-1 gap-2">
                    <Input
                      placeholder="Nome e cognome"
                      value={createContactManual.name}
                      onChange={e=>{
                        setCreateContactManual(m=>({ ...m, name: e.target.value }));
                        setCreateContactPicked(null);
                      }}
                    />
                    <Input
                      placeholder="Telefono (es: +39333...)"
                      value={createContactManual.phone}
                      onChange={e=>{
                        setCreateContactManual(m=>({ ...m, phone: e.target.value }));
                        setCreateContactPicked(null);
                      }}
                    />
                    <Input
                      placeholder="Email (opzionale)"
                      value={createContactManual.email}
                      onChange={e=>{
                        setCreateContactManual(m=>({ ...m, email: e.target.value }));
                        setCreateContactPicked(null);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setCreateOpen(false)}>Annulla</Button>
              <Button onClick={createAppointment} className="bg-black text-white hover:bg-gray-800">
                Crea e sincronizza
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}