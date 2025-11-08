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
  Store, ShoppingCart, CalendarDays, Plug, RefreshCcw, LogOut, ArrowRight, AlertCircle, CheckCircle2
} from "lucide-react";

export default function AutomazioniPage() {
  const { user } = useAuth();

  // ------- SHOPIFY ORDINE EVASO (ESISTENTE) -------
  const [enabled, setEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // ------- SHOPIFY CARRELLO ABBANDONATO (NUOVO) 🆕 -------
  const [enabledAbandonedCart, setEnabledAbandonedCart] = useState(false);
  const [templateAbandonedCart, setTemplateAbandonedCart] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(60);

  // ------- TEMPLATE LIST (CONDIVISO) -------
  const [templateList, setTemplateList] = useState([]);
  const [loadingShopify, setLoadingShopify] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ------- CALENDARIO (INVARIATO) -------
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
        
        if (snap.exists()) {
          const data = snap.data();
          
          // ✅ ORDINE EVASO (esistente)
          const automation = data?.automation?.order_fulfilled || {};
          setEnabled(!!automation.enabled);
          setSelectedTemplate(automation.template_id || '');

          // 🆕 CARRELLO ABBANDONATO (nuovo)
          const automationCart = data?.automation?.abandoned_cart || {};
          setEnabledAbandonedCart(!!automationCart.enabled);
          setTemplateAbandonedCart(automationCart.template_id || '');
          setDelayMinutes(automationCart.delay_minutes || 60);

          console.log("✅ Configurazioni caricate:", {
            order_fulfilled: automation,
            abandoned_cart: automationCart
          });
        }

        // Carica lista template approvati
        const res = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const dataTpl = await res.json();
        setTemplateList(Array.isArray(dataTpl) ? dataTpl.filter(t => t.status === 'APPROVED') : []);
      } catch (error) {
        console.error("Errore caricamento automazioni:", error);
      } finally {
        setLoadingShopify(false);
      }
    })();
  }, [user]);

  // ✅ Salva impostazioni Shopify (ENTRAMBE le automazioni)
  async function saveAutomazione() {
    if (!user) return;
    setLoadingShopify(true);
    setSaveSuccess(false);
    try {
      const merchantRef = doc(db, "shopify_merchants", user.uid);
      
      const updateData = {
        // Ordine evaso (esistente)
        "automation.order_fulfilled": { 
          enabled, 
          template_id: selectedTemplate 
        },
        // 🆕 Carrello abbandonato (nuovo)
        "automation.abandoned_cart": { 
          enabled: enabledAbandonedCart, 
          template_id: templateAbandonedCart,
          delay_minutes: parseInt(delayMinutes) || 60
        }
      };
      
      await updateDoc(merchantRef, updateData);
      
      console.log("✅ Automazioni salvate:", updateData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
    } catch (error) {
      console.error("❌ Errore salvataggio automazioni:", error);
      alert("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoadingShopify(false);
    }
  }

  // Calendario: helper (INVARIATO)
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

      {/* ========== SHOPIFY ========== */}
      <section className="bg-white border rounded-2xl p-6 shadow-sm space-y-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700"><Store size={18} /></div>
          <h2 className="text-xl font-semibold">Shopify</h2>
        </div>

        {/* --- 1. ORDINE EVASO (ESISTENTE) --- */}
        <div className="border-b pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-50 text-green-700">📦</div>
            <h3 className="text-lg font-semibold">Ordine Evaso</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Switch 
                checked={enabled} 
                onCheckedChange={setEnabled} 
                id="auto-switch" 
              />
              <label htmlFor="auto-switch" className="text-base font-medium cursor-pointer">
                Invia messaggio WhatsApp quando l'ordine è evaso
              </label>
              {enabled && selectedTemplate && (
                <CheckCircle2 size={18} className="text-green-600 ml-auto" />
              )}
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
              {enabled && !selectedTemplate && (
                <div className="flex items-center gap-2 mt-2 text-orange-600 text-sm">
                  <AlertCircle size={16} />
                  <span>Seleziona un template per attivare l'automazione</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- 2. CARRELLO ABBANDONATO (NUOVO) 🆕 --- */}
        <div className="border-b pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-50 text-orange-700"><ShoppingCart size={18} /></div>
            <h3 className="text-lg font-semibold">Carrello Abbandonato</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Switch 
                checked={enabledAbandonedCart} 
                onCheckedChange={setEnabledAbandonedCart} 
                id="abandoned-cart-switch" 
              />
              <label htmlFor="abandoned-cart-switch" className="text-base font-medium cursor-pointer">
                Invia messaggio per recuperare carrelli abbandonati
              </label>
              {enabledAbandonedCart && templateAbandonedCart && (
                <CheckCircle2 size={18} className="text-green-600 ml-auto" />
              )}
            </div>

            <div>
              <label className="block mb-2 text-base font-medium">Template messaggio:</label>
              <select
                className="border rounded-lg px-4 py-2 w-full"
                value={templateAbandonedCart}
                onChange={e => setTemplateAbandonedCart(e.target.value)}
                disabled={!enabledAbandonedCart || loadingShopify}
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
              {enabledAbandonedCart && !templateAbandonedCart && (
                <div className="flex items-center gap-2 mt-2 text-orange-600 text-sm">
                  <AlertCircle size={16} />
                  <span>Seleziona un template per attivare l'automazione</span>
                </div>
              )}
            </div>

            <div>
              <label className="block mb-2 text-base font-medium">
                Ritardo invio (minuti dopo abbandono):
              </label>
              <Input
                type="number"
                min="1"
                max="1440"
                value={delayMinutes}
                onChange={e => setDelayMinutes(parseInt(e.target.value) || 60)}
                disabled={!enabledAbandonedCart || loadingShopify}
                className="w-32"
              />
              <p className="text-xs text-gray-500 mt-1">
                Consigliato: 60 min (1 ora) - Max: 1440 min (24 ore)
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-900 mb-1">ℹ️ Come funziona:</p>
              <ul className="text-blue-800 space-y-1 ml-4 list-disc">
                <li>Quando un cliente abbandona il checkout, viene salvato automaticamente</li>
                <li>Dopo il ritardo impostato, viene inviato il messaggio WhatsApp</li>
                <li>Se il cliente completa l'ordine nel frattempo, il messaggio non viene inviato</li>
              </ul>
            </div>
          </div>
        </div>

        {/* --- BOTTONE SALVATAGGIO --- */}
        <div className="pt-2">
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
              <CheckCircle2 size={18} />
              <span>Automazioni Shopify aggiornate con successo!</span>
            </div>
          )}
          <Button 
            disabled={loadingShopify} 
            onClick={saveAutomazione}
            className="w-full sm:w-auto"
          >
            {loadingShopify ? 'Salvataggio...' : 'Salva impostazioni Shopify'}
          </Button>
        </div>
      </section>

      {/* ========== CALENDARIO (INVARIATO) ========== */}
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
