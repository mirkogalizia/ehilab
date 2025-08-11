'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/useAuth";
import {
  Store, CalendarDays, Plug, RefreshCcw, LogOut, ArrowRight
} from "lucide-react";

export default function AutomazioniPage() {
  const { user } = useAuth();

  // ------- SHOPIFY -------
  const [enabled, setEnabled] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loadingShopify, setLoadingShopify] = useState(false);

  // ------- CALENDARIO -------
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState('');
  const [events, setEvents] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const today = new Date();
  const toIsoDate = (d) => new Date(d).toISOString().slice(0,10);
  const [range, setRange] = useState({
    from: toIsoDate(today),
    to: toIsoDate(new Date(today.getTime() + 7*24*3600*1000))
  });

  // Shopify: carica impostazioni + template
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingShopify(true);
      try {
        const merchantRef = doc(db, "shopify_merchants", user.uid);
        const snap = await getDoc(merchantRef);
        const data = snap.data();
        const automation = data?.automation?.order_fulfilled || {};
        setEnabled(!!automation.enabled);
        setSelectedTemplate(automation.template_id || '');

        const res = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const dataTpl = await res.json();
        setTemplateList(Array.isArray(dataTpl) ? dataTpl.filter(t => t.status === 'APPROVED') : []);
      } finally {
        setLoadingShopify(false);
      }
    })();
  }, [user]);

  async function saveAutomazione() {
    if (!user) return;
    setLoadingShopify(true);
    try {
      const merchantRef = doc(db, "shopify_merchants", user.uid);
      await updateDoc(merchantRef, {
        "automation.order_fulfilled": { enabled, template_id: selectedTemplate }
      });
      alert("Automazione Shopify aggiornata!");
    } finally {
      setLoadingShopify(false);
    }
  }

  // Calendario: helper
  const fmtDT = (dt) => {
    const d = new Date(dt);
    const hasTime = /\d{2}:\d{2}/.test(d.toTimeString());
    return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: hasTime ? 'short' : undefined });
  };

  const connectGoogle = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const r = await fetch('/api/google/oauth/start', { headers:{ Authorization:`Bearer ${idt}` }});
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  };

  const disconnectGoogle = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    await fetch('/api/google/oauth/disconnect', { method:'DELETE', headers:{ Authorization:`Bearer ${idt}` }});
    setGoogleConnected(false);
    setCalendars([]); setCalendarId(''); setEvents([]);
  };

  const saveDefaultCalendar = async (id) => {
    if (!user) return;
    const idt = await user.getIdToken();
    await fetch('/api/calendar/config', {
      method:'POST',
      headers:{ Authorization:`Bearer ${idt}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ defaultGoogleCalendarId: id, syncToGoogle: true })
    });
  };

  const loadCalendars = async () => {
    if (!user) return;
    setLoadingCalendars(true);
    try {
      const idt = await user.getIdToken();
      const r = await fetch('/api/google/calendar/list', { headers:{ Authorization:`Bearer ${idt}` }});
      const j = await r.json();
      if (r.ok){
        setGoogleConnected(true);
        setCalendars(j.items || []);
        const primary = (j.items || []).find(c => c.primary) || (j.items || [])[0];
        const id = primary?.id || 'primary';
        setCalendarId(prev => prev || id);
      } else {
        setGoogleConnected(false);
        setCalendars([]);
      }
    } finally {
      setLoadingCalendars(false);
    }
  };

  const loadEvents = async (calId) => {
    if (!user || !calId) return;
    setLoadingEvents(true);
    try {
      const idt = await user.getIdToken();
      const qs = new URLSearchParams({
        calendarId: calId,
        from: new Date(range.from+'T00:00:00').toISOString(),
        to:   new Date(range.to  +'T23:59:59').toISOString(),
      });
      const r = await fetch(`/api/google/calendar/events?${qs.toString()}`, {
        headers:{ Authorization:`Bearer ${idt}` }
      });
      const j = await r.json();
      setEvents(r.ok ? (j.items || []) : []);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => { if (user) loadCalendars(); }, [user]);
  useEffect(() => { if (user && calendarId) { saveDefaultCalendar(calendarId); loadEvents(calendarId); }}, [calendarId]);
  useEffect(() => { if (user && calendarId) loadEvents(calendarId); }, [range.from, range.to]);

  return (
    <div className="max-w-5xl mx-auto p-8 font-[Montserrat] space-y-10">
      <header className="space-y-1">
        <h1 className="font-bold text-2xl">Automazioni</h1>
        <p className="text-gray-500">Configura le automazioni per Shopify e collega il tuo Google Calendar.</p>
      </header>

      {/* Shopify */}
      <section className="bg-white border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700"><Store size={18} /></div>
          <h2 className="text-xl font-semibold">Shopify</h2>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="auto-switch" />
            <label htmlFor="auto-switch" className="text-base font-medium cursor-pointer">
              Invia messaggio WhatsApp quando l’ordine è evaso
            </label>
          </div>

          <div>
            <label className="block mb-2 text-base font-medium">Template messaggio:</label>
            <select
              className="border rounded-lg px-4 py-2 w-full"
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              disabled={!enabled || loadingShopify}
            >
              <option value="">Seleziona un template</option>
              {templateList.map(t => (
                <option key={t.name} value={t.name}>
                  {t.components?.[0]?.text
                    ? t.components[0].text.slice(0, 60) + (t.components[0].text.length > 60 ? '...' : '')
                    : t.name}
                </option>
              ))}
            </select>
          </div>

          <Button disabled={loadingShopify} onClick={saveAutomazione}>Salva impostazioni Shopify</Button>
        </div>
      </section>

      {/* Calendario */}
      <section className="bg-white border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays size={18} /></div>
          <h2 className="text-xl font-semibold">Calendario</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className={`px-2 py-1 rounded text-sm ${googleConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {googleConnected ? 'Google Calendar connesso' : 'Non connesso'}
          </div>

          {!googleConnected ? (
            <Button onClick={connectGoogle} className="flex items-center gap-2">
              <Plug size={16}/> Collega Google Calendar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={loadCalendars} className="flex items-center gap-2" disabled={loadingCalendars}>
                <RefreshCcw size={16} className={loadingCalendars ? 'animate-spin' : ''}/> Ricarica calendari
              </Button>
              <Button variant="destructive" onClick={disconnectGoogle} className="flex items-center gap-2">
                <LogOut size={16}/> Disconnetti
              </Button>
              {/* 👇 link corretto */}
              <Link href="/chatboost/calendario" className="ml-auto">
                <Button variant="outline" className="flex items-center gap-2">
                  Vai al Calendario <ArrowRight size={16}/>
                </Button>
              </Link>
            </>
          )}
        </div>

        {googleConnected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Calendario di default</span>
                <select
                  className="border rounded px-2 py-1"
                  value={calendarId}
                  onChange={(e)=> setCalendarId(e.target.value)}
                  disabled={loadingCalendars}
                >
                  {calendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Dal</span>
                <Input
                  type="date"
                  value={range.from}
                  onChange={e => setRange(s => ({ ...s, from: e.target.value }))}
                  className="w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Al</span>
                <Input
                  type="date"
                  value={range.to}
                  onChange={e => setRange(s => ({ ...s, to: e.target.value }))}
                  className="w-auto"
                />
              </div>
              <Button variant="outline" onClick={() => loadEvents(calendarId)} disabled={loadingEvents}>
                Aggiorna eventi
              </Button>
            </div>

            <div className="rounded-lg border p-4">
              <div className="font-semibold mb-2">Eventi nel periodo {loadingEvents && <span className="text-gray-400 text-sm">(caricamento…)</span>}</div>
              {!loadingEvents && events.length === 0 && (
                <div className="text-sm text-gray-500">Nessun evento nel periodo selezionato</div>
              )}
              {!loadingEvents && events.length > 0 && (
                <ul className="divide-y">
                  {events.map(ev => {
                    const start = ev.start?.dateTime || ev.start?.date;
                    const end   = ev.end?.dateTime   || ev.end?.date;
                    return (
                      <li key={ev.id} className="py-2">
                        <div className="font-medium">{ev.summary || '(Senza titolo)'}</div>
                        <div className="text-sm text-gray-600">
                          {start ? fmtDT(start) : '—'} {end ? '→ '+fmtDT(end) : ''}
                        </div>
                        {ev.location && <div className="text-xs text-gray-500">{ev.location}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}