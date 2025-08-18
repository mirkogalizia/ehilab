// src/app/chatboost/calendario/page.jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link as LinkIcon, Send as SendIcon, Search, Plus as PlusIcon, X } from 'lucide-react';
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
const normalizePhone = (phoneRaw = '') => {
  let phone = String(phoneRaw).trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (!phone) return '';
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (String(phoneRaw).startsWith('+')) return String(phoneRaw).trim();
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
// compone ISO locale partendo da data + "HH:MM"
const composeStartISO = (dateObj, hhmm) => {
  const [hh='00', mm='00'] = String(hhmm || '').split(':');
  const d = new Date(dateObj);
  d.setHours(parseInt(hh,10)||0, parseInt(mm,10)||0, 0, 0);
  return d.toISOString();
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
  const contactsById = useMemo(() => {
    const m = new Map();
    for (const c of contacts) m.set(c.id || c.phone, c);
    return m;
  }, [contacts]);

  // mappa evento↔contatto salvata
  const [linksMap, setLinksMap] = useState(new Map()); // key: `${kind}:${eventId}` -> contactId

  // template WhatsApp
  const [templates, setTemplates] = useState([]);
  const [tplChoice, setTplChoice] = useState({}); // { [eventKey]: templateName }

  // userData per WhatsApp (phone_number_id)
  const [userData, setUserData] = useState(null);

  // modale abbinamento contatto
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null);
  const [contactSearch, setContactSearch] = useState('');

  // modale NUOVO appuntamento
  const [createOpen, setCreateOpen] = useState(false);
  const [createTime, setCreateTime] = useState('20:00');
  const [createDuration, setCreateDuration] = useState(90);
  const [createNotes, setCreateNotes] = useState('');
  const [searchPick, setSearchPick] = useState(''); // ricerca nella rubrica
  const [selectedPeople, setSelectedPeople] = useState([]); // multiselezione rubrica
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  const refreshTimer = useRef(null);

  /* ---------------- Google OAuth & liste ---------------- */
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

  /* ---------------- Config + templates + rubrica + userData ---------------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
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

  /* ---------------- Appuntamenti interni del mese ---------------- */
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
    const txt = await r.text();
    let data = [];
    try { data = txt ? JSON.parse(txt) : []; } catch { data = []; }
    setAppts(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (user) loadInternalMonth(); }, [user, monthRef]);

  /* ---------------- Eventi Google del mese ---------------- */
  useEffect(() => { if (user) loadGoogleCalendars(); }, [user]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); }, [user, monthRef, googleCalId]);

  /* ---------------- Link evento↔contatto (Firestore) ---------------- */
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
    setLinkModalOpen(false);
    setLinkTarget(null);
  };

  /* ---------------- Merge per giorno (interni + Google) ---------------- */
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
        const as = a.__type === 'internal' ? toDate(a.start) : new Date(a.start?.dateTime || a.start?.date || 0);
        const bs = b.__type === 'internal' ? toDate(b.start) : new Date(b.start?.dateTime || b.start?.date || 0);
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

  /* ---------------- Invio template (manuale con bottone) ---------------- */
  const sendTemplate = async (phone, templateName) => {
    if (!userData?.phone_number_id) {
      alert('Config WhatsApp mancante (phone_number_id).');
      return;
    }
    if (!templateName) {
      alert('Seleziona un template.');
      return;
    }
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v19.0/${userData.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: { name: templateName, language: { code: 'it' }, components: [{ type: 'BODY', parameters: [] }] }
          }),
        }
      );
      const txt = await resp.text();
      let data; try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
      if (resp.ok && data?.messages) alert('Template inviato ✅');
      else alert('Invio KO: ' + (data?.error?.message || JSON.stringify(data)));
    } catch (e) { alert('Invio KO: ' + (e?.message || e)); }
  };

  /* ---------------- Deriva contatto per evento ---------------- */
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
      const byEmail = Array.from(contactsById.values())
        .find(c => (c.email || '').toLowerCase() === att.email.toLowerCase());
      if (byEmail) return byEmail;
    }
    const guess = guessContactFromText(`${ev.description || ''} ${ev.location || ''} ${ev.summary || ''}`);
    if (guess.phone && contactsById.get(guess.phone)) return contactsById.get(guess.phone);
    if (guess.email) {
      const byE = Array.from(contactsById.values())
        .find(c => (c.email || '').toLowerCase() === guess.email.toLowerCase());
      if (byE) return byE;
    }
    return null;
  };

  /* ---------------- Auto refresh (60s) ---------------- */
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
  }, [user, monthRef, googleCalId]);

  /* ---------------- UI ---------------- */
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
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Nuovo appuntamento"
                onClick={() => setCreateOpen(true)}
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
                const s = isInternal ? toDate(ev.start) : new Date(ev.start?.dateTime || ev.start?.date || Date.now());
                const e = isInternal ? toDate(ev.end)   : new Date(ev.end?.dateTime   || ev.end?.date   || s);

                const contact = resolveContactForEvent(ev);
                const contactName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '';
                const contactPhone = contact?.phone || '';

                const title = isInternal
                  ? `${ev.customer?.name || '—'}`
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
                          {fmtRange(s, e)} {isInternal && ev.status ? `• Stato: ${ev.status}` : ''}
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
                            variant="outline" size="sm"
                            className="flex items-center gap-1"
                            onClick={() => {
                              const id = ev.id;
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nuovo appuntamento</h3>
              <button className="text-2xl leading-none" onClick={() => setCreateOpen(false)}>×</button>
            </div>

            {/* riga data/ora/durata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500">Data</label>
                <Input type="date" value={ymd(date)} onChange={e => setDate(new Date(e.target.value + 'T12:00:00'))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Ora</label>
                <Input type="time" value={createTime} onChange={e => setCreateTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Durata (min)</label>
                <Input type="number" min={10} step={5} value={createDuration} onChange={e => setCreateDuration(e.target.value)} />
              </div>
            </div>

            {/* Selezione multipla dalla rubrica */}
            <div className="mb-3">
              <label className="text-xs text-gray-500">Cerca in rubrica (selezione multipla)</label>
              <Input
                placeholder="Cerca nome / telefono / email…"
                value={searchPick}
                onChange={e => setSearchPick(e.target.value)}
                className="mb-2"
              />
              {searchPick && (
                <div className="max-h-40 overflow-auto border rounded-md">
                  {contacts
                    .filter(c => {
                      const s = searchPick.toLowerCase();
                      return [c.firstName, c.lastName, c.phone, c.email].filter(Boolean)
                        .some(v => String(v).toLowerCase().includes(s));
                    })
                    .slice(0, 50)
                    .map(c => {
                      const already = selectedPeople.some(p => p.id === c.id);
                      return (
                        <button
                          key={c.id}
                          disabled={already}
                          onClick={() => setSelectedPeople(prev => [...prev, c])}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${already ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span className="font-medium">{c.firstName} {c.lastName}</span>
                          <span className="text-xs text-gray-500 ml-2">{c.phone} {c.email && `• ${c.email}`}</span>
                        </button>
                      );
                    })}
                  {contacts.length === 0 && (
                    <div className="p-2 text-sm text-gray-500">Rubrica vuota.</div>
                  )}
                </div>
              )}

              {/* Chips selezionati */}
              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedPeople.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm">
                      {(p.firstName || '') + ' ' + (p.lastName || '')}
                      <button
                        className="text-emerald-900/60 hover:text-emerald-900"
                        onClick={() => setSelectedPeople(arr => arr.filter(x => x.id !== p.id))}
                        title="Rimuovi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Aggiunta manuale 1 contatto (se non presente in rubrica) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500">Nome (manuale)</label>
                <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Es. Mario Rossi" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Telefono (manuale)</label>
                <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="+39…" />
              </div>
            </div>

            {/* Note */}
            <div className="mb-4">
              <label className="text-xs text-gray-500">Note (opzionale)</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 min-h-[80px]"
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
                placeholder="Note per la prenotazione…"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
              <Button
                onClick={async () => {
                  // costruisci lista finale: selezionati + eventuale manuale
                  const all = [...selectedPeople];
                  if (manualName && normalizePhone(manualPhone)) {
                    all.unshift({
                      id: `manual:${normalizePhone(manualPhone)}`,
                      firstName: manualName, lastName: '',
                      phone: normalizePhone(manualPhone), email: ''
                    });
                  }

                  if (all.length === 0) {
                    alert('Seleziona almeno un contatto o inserisci manualmente nome e telefono.');
                    return;
                  }

                  const main = all[0];
                  const mainName = [main.firstName, main.lastName].filter(Boolean).join(' ') || '—';
                  const mainPhone = normalizePhone(main.phone);
                  if (!mainPhone) {
                    alert('Il contatto principale deve avere un telefono valido.');
                    return;
                  }

                  const party = all.slice(1).map(p => ({
                    id: p.id,
                    name: [p.firstName, p.lastName].filter(Boolean).join(' '),
                    phone: normalizePhone(p.phone),
                    email: p.email || ''
                  }));

                  const startISO = composeStartISO(date, createTime);

                  try {
                    const idt = await user.getIdToken();
                    const r = await fetch('/api/calendar/appointments', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customer: { name: mainName, phone: mainPhone },
                        start: startISO,
                        durationMin: Number(createDuration) || 60,
                        notes: createNotes,
                        party,
                        service_id: null,
                        staff_id: null
                      }),
                    });
                    const txt = await r.text();
                    let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {}
                    if (!r.ok) {
                      alert(j?.error || txt || 'Errore creazione');
                      return;
                    }
                    // refresh
                    await loadInternalMonth();
                    if (googleCalId) await loadGoogleMonth(googleCalId);

                    // reset e chiudi
                    setCreateOpen(false);
                    setCreateNotes('');
                    setCreateDuration(90);
                    setCreateTime('20:00');
                    setSearchPick('');
                    setSelectedPeople([]);
                    setManualName('');
                    setManualPhone('');
                  } catch (e) {
                    alert('Errore creazione: ' + (e?.message || e));
                  }
                }}
                className="bg-black text-white"
              >
                Crea
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}