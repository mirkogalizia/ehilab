// src/app/chatboost/calendario/page.jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, Send as SendIcon, Search, Plus as PlusIcon,
  X, Clock, Users, Phone, Mail, CalendarDays, Link2,
  ChevronRight, Loader2, MapPin, FileText, User
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, setDoc, doc, getDocs
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';

/* ────────────────── Helpers ────────────────── */
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
const composeStartISO = (dateObj, hhmm) => {
  const [hh='00', mm='00'] = String(hhmm || '').split(':');
  const d = new Date(dateObj);
  d.setHours(parseInt(hh,10)||0, parseInt(mm,10)||0, 0, 0);
  return d.toISOString();
};

export default function CalendarioPage() {
  const { user } = useAuth();

  const [date, setDate] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());

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

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null);
  const [contactSearch, setContactSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createTime, setCreateTime] = useState('20:00');
  const [createDuration, setCreateDuration] = useState(90);
  const [createNotes, setCreateNotes] = useState('');
  const [searchPick, setSearchPick] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // Mobile: mostra dettaglio giorno
  const [showDayDetail, setShowDayDetail] = useState(false);

  const refreshTimer = useRef(null);

  /* ──── Google OAuth & calendars ──── */
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
      to: endOfDay(last).toISOString(),
    });
    const r = await fetch(`/api/google/calendar/events?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${idt}` },
    });
    const j = await r.json();
    setGEvents(r.ok ? (j.items || []) : []);
  };

  /* ──── Config + templates + contacts + userData ──── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const tRes = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const t = await tRes.json();
        if (Array.isArray(t)) setTemplates(t.filter(x => x.status === 'APPROVED'));
      } catch {}

      const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
      const unsub = onSnapshot(qContacts, snap => {
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const usersSnap = await getDocs(collection(db, 'users'));
      const me = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);

      return () => unsub();
    })();
  }, [user]);

  /* ──── Internal appointments ──── */
  const loadInternalMonth = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const { first, last } = monthWindow(monthRef);
    const qs = new URLSearchParams({
      from: startOfDay(first).toISOString(),
      to: endOfDay(last).toISOString(),
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
  useEffect(() => { if (user) loadGoogleCalendars(); }, [user]);
  useEffect(() => { if (user && googleCalId) loadGoogleMonth(googleCalId); }, [user, monthRef, googleCalId]);

  /* ──── Links event↔contact ──── */
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

  /* ──── Merge events by day ──── */
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

  /* ──── Send template ──── */
  const sendTemplate = async (phone, templateName) => {
    if (!userData?.phone_number_id) return alert('Config WhatsApp mancante.');
    if (!templateName) return alert('Seleziona un template.');
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
            messaging_product: 'whatsapp', to: phone, type: 'template',
            template: { name: templateName, language: { code: 'it' }, components: [{ type: 'BODY', parameters: [] }] }
          }),
        }
      );
      const txt = await resp.text();
      let data; try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
      if (resp.ok && data?.messages) alert('Template inviato con successo');
      else alert('Errore: ' + (data?.error?.message || JSON.stringify(data)));
    } catch (e) { alert('Errore: ' + (e?.message || e)); }
  };

  /* ──── Resolve contact for event ──── */
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

  /* ──── Auto refresh ──── */
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

  /* ──── Create appointment ──── */
  const handleCreate = async () => {
    const all = [...selectedPeople];
    if (manualName && normalizePhone(manualPhone)) {
      all.unshift({
        id: `manual:${normalizePhone(manualPhone)}`,
        firstName: manualName, lastName: '',
        phone: normalizePhone(manualPhone), email: ''
      });
    }
    if (all.length === 0) return alert('Seleziona almeno un contatto o inserisci manualmente nome e telefono.');

    const main = all[0];
    const mainName = [main.firstName, main.lastName].filter(Boolean).join(' ') || '—';
    const mainPhone = normalizePhone(main.phone);
    if (!mainPhone) return alert('Il contatto principale deve avere un telefono valido.');

    const party = all.slice(1).map(p => ({
      id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(' '),
      phone: normalizePhone(p.phone), email: p.email || ''
    }));

    try {
      const idt = await user.getIdToken();
      const r = await fetch('/api/calendar/appointments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name: mainName, phone: mainPhone },
          start: composeStartISO(date, createTime),
          durationMin: Number(createDuration) || 60,
          notes: createNotes, party, service_id: null, staff_id: null
        }),
      });
      const txt = await r.text();
      let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {}
      if (!r.ok) return alert(j?.error || txt || 'Errore creazione');

      await loadInternalMonth();
      if (googleCalId) await loadGoogleMonth(googleCalId);
      setCreateOpen(false); setCreateNotes(''); setCreateDuration(90);
      setCreateTime('20:00'); setSearchPick(''); setSelectedPeople([]);
      setManualName(''); setManualPhone('');
    } catch (e) { alert('Errore: ' + (e?.message || e)); }
  };

  /* ════════════════════════════════════════════
     UI
     ════════════════════════════════════════════ */
  if (!user) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-slate-400 text-sm">Devi effettuare il login.</p>
    </div>
  );

  const formattedDate = date?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Day detail panel (shared between mobile overlay and desktop side) ──
  const DayDetailContent = () => (
    <>
      {/* Day header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 capitalize">{formattedDate}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {eventsOfDay.length} event{eventsOfDay.length !== 1 ? 'i' : 'o'}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shadow-sm"
          title="Nuovo appuntamento"
        >
          <PlusIcon size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* Events list */}
      {eventsOfDay.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <CalendarDays size={20} className="text-slate-300" />
          </div>
          <p className="text-sm text-slate-400">Nessun evento per questa data</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-3 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Crea appuntamento
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {eventsOfDay.map((ev, idx) => {
            const isInternal = ev.__type === 'internal';
            const s = isInternal ? toDate(ev.start) : new Date(ev.start?.dateTime || ev.start?.date || Date.now());
            const e = isInternal ? toDate(ev.end) : new Date(ev.end?.dateTime || ev.end?.date || s);

            const contact = resolveContactForEvent(ev);
            const contactName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '';
            const contactPhone = contact?.phone || '';

            const title = isInternal ? `${ev.customer?.name || '—'}` : (ev.summary || '(Senza titolo)');
            const evKey = `${isInternal ? 'i' : 'g'}:${ev.id || idx}`;

            return (
              <div
                key={`${ev.__type}-${ev.id || idx}`}
                className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Top row: indicator + title + time */}
                <div className="flex items-start gap-3">
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${isInternal ? 'bg-emerald-500' : 'bg-violet-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{title}</h4>
                      {!isInternal && ev.htmlLink && (
                        <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer"
                          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors shrink-0">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                      <Clock size={11} className="shrink-0" />
                      <span>{fmtRange(s, e)}</span>
                      {isInternal && ev.status && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                          <span>{ev.status}</span>
                        </>
                      )}
                      <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${isInternal ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'}`}>
                        {isInternal ? 'Interno' : 'Google'}
                      </span>
                    </div>

                    {/* Contact info */}
                    <div className="mt-2.5">
                      {contact ? (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <User size={13} className="text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-slate-800 truncate block">{contactName || 'Contatto'}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              {contact.phone && <span>{contact.phone}</span>}
                              {contact.email && (
                                <><span className="w-0.5 h-0.5 rounded-full bg-slate-300" /><span className="truncate">{contact.email}</span></>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setLinkTarget({ kind: isInternal ? 'internal' : 'google', id: ev.id });
                            setLinkModalOpen(true);
                          }}
                          className="flex items-center gap-2 text-xs text-slate-400 hover:text-emerald-600 transition-colors py-1"
                        >
                          <Link2 size={12} /> Abbina contatto
                        </button>
                      )}
                    </div>

                    {/* Template send */}
                    {contactPhone && templates.length > 0 && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                        <select
                          className="select-premium flex-1 text-xs py-1.5"
                          value={tplChoice[evKey] || ''}
                          onChange={(e) => setTplChoice(prev => ({ ...prev, [evKey]: e.target.value }))}
                        >
                          <option value="">Template...</option>
                          {templates.map(t => (
                            <option key={t.name} value={t.name}>
                              {t.components?.find(c => c.type === 'BODY')?.text?.slice(0, 40) || t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => sendTemplate(contactPhone, tplChoice[evKey])}
                          disabled={!tplChoice[evKey]}
                          className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-emerald-600 shrink-0"
                          title="Invia template"
                        >
                          <SendIcon size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="h-full flex flex-col font-[Montserrat] bg-[var(--surface-1)] overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <div className="bg-white border-b border-slate-200/60 px-5 py-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="badge-premium bg-emerald-100 text-emerald-700 mb-2 inline-flex">Calendario</span>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Appuntamenti</h1>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <PlusIcon size={16} /> Nuovo
          </button>
        </div>

        {/* Google Calendar controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={connectGoogle} className="rounded-lg text-xs h-8">
            <CalendarDays size={14} className="mr-1.5" /> Google Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={loadGoogleCalendars} className="rounded-lg text-xs h-8">
            Ricarica
          </Button>
          {googleCalendars.length > 0 && (
            <select
              className="select-premium text-xs h-8 py-0"
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
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Calendar panel */}
        <div className="shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200/60 p-4 lg:p-5 overflow-y-auto">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                setDate(d);
                setShowDayDetail(true);
              }
            }}
            className="bg-transparent p-0"
            required
            month={monthRef}
            onMonthChange={setMonthRef}
            modifiers={{ hasEvents: daysWithEvents }}
            modifiersClassNames={{
              hasEvents:
                "after:content-[''] after:block after:mx-auto after:mt-0.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-emerald-500"
            }}
          />
          {/* Legend + selected date info (desktop) */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-4 text-[11px] text-slate-400 mb-3">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Interno</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" /> Google</span>
            </div>
            <div className="text-sm font-medium text-slate-700 capitalize">{formattedDate}</div>
            <p className="text-xs text-slate-400 mt-0.5">{eventsOfDay.length} evento/i</p>
          </div>
        </div>

        {/* Day detail panel — desktop */}
        <div className="hidden lg:flex flex-1 flex-col overflow-y-auto p-5">
          <DayDetailContent />
        </div>

        {/* Day detail panel — mobile/tablet (below calendar) */}
        <div className="lg:hidden flex-1 overflow-y-auto p-4">
          <DayDetailContent />
        </div>
      </div>

      {/* ═══ MOBILE FAB ═══ */}
      <button
        onClick={() => setCreateOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center z-30 active:scale-95 transition-all"
      >
        <PlusIcon size={24} />
      </button>

      {/* ═══ MODAL: Abbina contatto ═══ */}
      {linkModalOpen && (
        <div className="modal-overlay p-4" onClick={() => { setLinkModalOpen(false); setLinkTarget(null); }}>
          <div className="modal-content max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Link2 size={18} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Abbina contatto</h3>
              </div>
              <button
                onClick={() => { setLinkModalOpen(false); setLinkTarget(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Cerca per nome, telefono, email..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                className="input-premium w-full pl-9 pr-4 py-2.5 text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
              {contacts
                .filter(c => {
                  if (!contactSearch) return true;
                  const s = contactSearch.toLowerCase();
                  return [c.firstName, c.lastName, c.phone, c.email, (c.tags||[]).join(' ')]
                    .filter(Boolean).some(v => String(v).toLowerCase().includes(s));
                })
                .slice(0, 200)
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => linkContact(linkTarget.kind, linkTarget.id, c.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <User size={14} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate block">{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-slate-400">{c.phone} {c.email && `· ${c.email}`}</span>
                    </div>
                  </button>
                ))}
              {contacts.length === 0 && (
                <div className="text-sm text-slate-400 p-6 text-center">Rubrica vuota</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Nuovo appuntamento ═══ */}
      {createOpen && (
        <div className="modal-overlay p-4" onClick={() => setCreateOpen(false)}>
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <PlusIcon size={18} className="text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Nuovo appuntamento</h3>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Date / Time / Duration */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Data</label>
                <input type="date" value={ymd(date)} onChange={e => setDate(new Date(e.target.value + 'T12:00:00'))}
                  className="input-premium w-full px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Ora</label>
                <input type="time" value={createTime} onChange={e => setCreateTime(e.target.value)}
                  className="input-premium w-full px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Durata (min)</label>
                <input type="number" min={10} step={5} value={createDuration} onChange={e => setCreateDuration(e.target.value)}
                  className="input-premium w-full px-3 py-2.5 text-sm" />
              </div>
            </div>

            {/* Contact picker */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Contatti dalla rubrica</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Cerca nome, telefono, email..."
                  value={searchPick}
                  onChange={e => setSearchPick(e.target.value)}
                  className="input-premium w-full pl-9 pr-4 py-2.5 text-sm"
                />
              </div>
              {searchPick && (
                <div className="mt-2 max-h-[160px] overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
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
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User size={13} className="text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-800">{c.firstName} {c.lastName}</span>
                            <span className="text-xs text-slate-400 ml-2">{c.phone}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}

              {/* Selected chips */}
              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedPeople.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                      {(p.firstName || '') + ' ' + (p.lastName || '')}
                      <button
                        className="text-emerald-500 hover:text-emerald-800 transition-colors"
                        onClick={() => setSelectedPeople(arr => arr.filter(x => x.id !== p.id))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Manual entry */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Nome (manuale)</label>
                <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Es. Mario Rossi"
                  className="input-premium w-full px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Telefono (manuale)</label>
                <input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="+39..."
                  className="input-premium w-full px-3 py-2.5 text-sm" />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Note</label>
              <textarea
                className="input-premium w-full resize-none px-3.5 py-2.5 text-sm !rounded-xl min-h-[80px]"
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
                placeholder="Note per la prenotazione..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Annulla</Button>
              <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6">
                Crea appuntamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
