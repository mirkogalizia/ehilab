'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/useAuth";
import {
  Store, ShoppingCart, CalendarDays, Plug, RefreshCcw, LogOut, ArrowRight,
  AlertCircle, CheckCircle2, Bot, Zap, Package, Clock, Save,
  Link2, ExternalLink, Loader2, Info
} from "lucide-react";

export default function AutomazioniPage() {
  const { user } = useAuth();

  // Shopify
  const [enabled, setEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [enabledAbandonedCart, setEnabledAbandonedCart] = useState(false);
  const [templateAbandonedCart, setTemplateAbandonedCart] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [templateList, setTemplateList] = useState([]);
  const [loadingShopify, setLoadingShopify] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI
  const [aiEnabled, setAiEnabled] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [saveSuccessAI, setSaveSuccessAI] = useState(false);

  // Shopify OAuth
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyShop, setShopifyShop] = useState('');
  const [connectingShopify, setConnectingShopify] = useState(false);

  // Calendar
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState('');
  const [events, setEvents] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const today = new Date();
  const toIsoDate = (d) => new Date(d).toISOString().slice(0, 10);
  const [range, setRange] = useState({
    from: toIsoDate(today),
    to: toIsoDate(new Date(today.getTime() + 7 * 24 * 3600 * 1000))
  });

  // Load configurations
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingShopify(true);
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const auto = data?.automation?.order_fulfilled || {};
          setEnabled(!!auto.enabled);
          setSelectedTemplate(auto.template_id || '');
          const cart = data?.automation?.abandoned_cart || {};
          setEnabledAbandonedCart(!!cart.enabled);
          setTemplateAbandonedCart(cart.template_id || '');
          setDelayMinutes(cart.delay_minutes ?? 60);
          const ai = data?.ai_config || {};
          setAiEnabled(!!ai.enabled);
          setCustomPrompt(ai.custom_prompt || '');
          const shopify = data?.shopify_config || {};
          setShopifyConnected(!!shopify.admin_token);
          setShopifyShop(shopify.store_url || '');
        }
        const res = await fetch('/api/list-templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const tpls = await res.json();
        setTemplateList(Array.isArray(tpls) ? tpls.filter(t => t.status === 'APPROVED') : []);
      } catch (err) {
        console.error("Errore caricamento:", err);
      } finally {
        setLoadingShopify(false);
      }
    })();
  }, [user]);

  // Save Shopify automations
  const saveAutomazione = async () => {
    if (!user) return;
    setLoadingShopify(true); setSaveSuccess(false);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        "automation.order_fulfilled": { enabled, template_id: selectedTemplate },
        "automation.abandoned_cart": {
          enabled: enabledAbandonedCart,
          template_id: templateAbandonedCart,
          delay_minutes: Math.max(1, parseInt(delayMinutes) || 60)
        }
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Errore salvataggio:", err);
      alert("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoadingShopify(false);
    }
  };

  // Save AI config
  const saveAIConfig = async () => {
    if (!user) return;
    if (aiEnabled && !shopifyConnected) {
      alert("Connetti prima Shopify per permettere all'AI di gestire gli ordini.");
      return;
    }
    setLoadingAI(true); setSaveSuccessAI(false);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        ai_config: {
          enabled: aiEnabled, custom_prompt: customPrompt,
          auto_reply_enabled: true, ticket_tracking: true,
          updated_at: new Date().toISOString()
        }
      });
      setSaveSuccessAI(true);
      setTimeout(() => setSaveSuccessAI(false), 3000);
    } catch (err) {
      console.error("Errore salvataggio AI:", err);
      alert("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoadingAI(false);
    }
  };

  // OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('shopify');
    if (status === 'success') {
      alert('Shopify connesso con successo!');
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
    } else if (status === 'error') {
      const reasons = { missing_params: 'Parametri mancanti', invalid_state: 'State non valido', invalid_hmac: 'Verifica fallita', token_exchange: 'Errore token', user_not_found: 'Utente non trovato', exception: 'Errore generico' };
      alert(`Errore Shopify: ${reasons[params.get('reason')] || 'Sconosciuto'}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Calendar
  const fmtDT = (dt) => new Date(dt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

  const connectGoogle = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    const r = await fetch('/api/google/oauth/start', { headers: { Authorization: `Bearer ${idt}` } });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
  };

  const disconnectGoogle = async () => {
    if (!user) return;
    const idt = await user.getIdToken();
    await fetch('/api/google/oauth/disconnect', { method: 'DELETE', headers: { Authorization: `Bearer ${idt}` } });
    setGoogleConnected(false); setCalendars([]); setCalendarId(''); setEvents([]);
  };

  const saveDefaultCalendar = async (id) => {
    if (!user) return;
    const idt = await user.getIdToken();
    await fetch('/api/calendar/config', {
      method: 'POST', headers: { Authorization: `Bearer ${idt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultGoogleCalendarId: id, syncToGoogle: true })
    });
  };

  const loadCalendars = async () => {
    if (!user) return;
    setLoadingCalendars(true);
    try {
      const idt = await user.getIdToken();
      const r = await fetch('/api/google/calendar/list', { headers: { Authorization: `Bearer ${idt}` } });
      const j = await r.json();
      if (r.ok) {
        setGoogleConnected(true);
        setCalendars(j.items || []);
        const primary = (j.items || []).find(c => c.primary) || (j.items || [])[0];
        setCalendarId(prev => prev || primary?.id || 'primary');
      } else { setGoogleConnected(false); setCalendars([]); }
    } finally { setLoadingCalendars(false); }
  };

  const loadEvents = async (calId) => {
    if (!user || !calId) return;
    setLoadingEvents(true);
    try {
      const idt = await user.getIdToken();
      const qs = new URLSearchParams({
        calendarId: calId,
        from: new Date(range.from + 'T00:00:00').toISOString(),
        to: new Date(range.to + 'T23:59:59').toISOString(),
      });
      const r = await fetch(`/api/google/calendar/events?${qs}`, { headers: { Authorization: `Bearer ${idt}` } });
      const j = await r.json();
      setEvents(r.ok ? (j.items || []) : []);
    } finally { setLoadingEvents(false); }
  };

  useEffect(() => { if (user) loadCalendars(); }, [user]);
  useEffect(() => { if (user && calendarId) { saveDefaultCalendar(calendarId); loadEvents(calendarId); } }, [calendarId]);
  useEffect(() => { if (user && calendarId) loadEvents(calendarId); }, [range.from, range.to]);

  // Template select component
  const TemplateSelect = ({ value, onChange, disabled }) => (
    <select className="select-premium w-full" value={value} onChange={onChange} disabled={disabled}>
      <option value="">Seleziona un template</option>
      {templateList.map(t => {
        const body = t.components?.find(c => c.type === 'BODY')?.text;
        return (
          <option key={t.name} value={t.name}>
            {body ? body.slice(0, 50) + (body.length > 50 ? '...' : '') : t.name}
          </option>
        );
      })}
    </select>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-[Montserrat] space-y-8">
      {/* Header */}
      <div>
        <span className="badge-premium bg-emerald-100 text-emerald-700 mb-3 inline-flex">Configurazione</span>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Automazioni</h1>
        <p className="text-sm text-slate-400 mt-1">Configura automazioni Shopify, risposte AI e Google Calendar</p>
      </div>

      {/* ═══ SHOPIFY ═══ */}
      <section className="surface-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Store size={18} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Shopify</h2>
        </div>

        {/* Ordine Evaso */}
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Package size={15} className="text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Ordine Evaso</h3>
          </div>

          <div className="flex items-center gap-4">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="auto-switch" />
            <label htmlFor="auto-switch" className="text-sm font-medium text-slate-700 cursor-pointer flex-1">
              Invia messaggio WhatsApp quando l'ordine è evaso
            </label>
            {enabled && selectedTemplate && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Template messaggio</label>
            <TemplateSelect value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} disabled={!enabled || loadingShopify} />
            {enabled && !selectedTemplate && (
              <div className="flex items-center gap-2 mt-2 text-amber-600 text-xs">
                <AlertCircle size={13} /> Seleziona un template per attivare
              </div>
            )}
          </div>
        </div>

        {/* Carrello Abbandonato */}
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <ShoppingCart size={15} className="text-amber-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Carrello Abbandonato</h3>
          </div>

          <div className="flex items-center gap-4">
            <Switch checked={enabledAbandonedCart} onCheckedChange={setEnabledAbandonedCart} id="cart-switch" />
            <label htmlFor="cart-switch" className="text-sm font-medium text-slate-700 cursor-pointer flex-1">
              Recupera carrelli abbandonati via WhatsApp
            </label>
            {enabledAbandonedCart && templateAbandonedCart && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Template messaggio</label>
            <TemplateSelect value={templateAbandonedCart} onChange={e => setTemplateAbandonedCart(e.target.value)} disabled={!enabledAbandonedCart || loadingShopify} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
              <Clock size={11} className="inline mr-1" /> Ritardo invio (minuti)
            </label>
            <input
              type="number" min="1" max="1440"
              value={delayMinutes}
              onChange={e => {
                const v = parseInt(e.target.value);
                setDelayMinutes(isNaN(v) ? '' : Math.max(1, v));
              }}
              disabled={!enabledAbandonedCart || loadingShopify}
              className="input-premium w-32 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Save */}
        {saveSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <CheckCircle2 size={16} /> Automazioni Shopify salvate
          </div>
        )}
        <Button onClick={saveAutomazione} disabled={loadingShopify} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10">
          {loadingShopify ? <><Loader2 size={14} className="animate-spin mr-2" /> Salvataggio...</> : <><Save size={14} className="mr-2" /> Salva Shopify</>}
        </Button>
      </section>

      {/* ═══ AI ASSISTANT ═══ */}
      <section className="surface-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Bot size={18} className="text-violet-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Assistente AI</h2>
        </div>

        {/* Toggle */}
        <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Risposte Automatiche</h3>
              <p className="text-xs text-slate-400 mt-0.5">L'AI risponde automaticamente ai clienti su WhatsApp</p>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} id="ai-toggle" />
          </div>
          {aiEnabled ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <Zap size={14} /> AI attiva — risposte automatiche abilitate
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-xs">
              <Info size={14} /> AI disattivata — rispondi manualmente
            </div>
          )}
        </div>

        {/* Custom prompt */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Prompt personalizzato</label>
          <Textarea
            placeholder="Esempio: Rispondi in modo cordiale, usa il tu, firma come 'Team NomeAzienda'..."
            value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
            rows={3} disabled={loadingAI} className="resize-none input-premium !rounded-xl text-sm"
          />
          <p className="text-[11px] text-slate-400 mt-1">Lascia vuoto per il comportamento predefinito</p>
        </div>

        {/* Shopify OAuth for AI */}
        <div className="p-5 rounded-xl border border-slate-200/80 bg-slate-50 space-y-3">
          <div className="flex items-center gap-2">
            <Store size={15} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Integrazione Shopify</h3>
            <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-md ml-1">Richiesto</span>
          </div>

          {!shopifyConnected ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Connetti Shopify per permettere all'AI di gestire domande su ordini e tracking.</p>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">URL store Shopify</label>
                <input placeholder="tuostore.myshopify.com" value={shopifyShop} onChange={e => setShopifyShop(e.target.value)}
                  disabled={connectingShopify} className="input-premium w-full px-3 py-2.5 text-sm" />
                <p className="text-[11px] text-slate-400 mt-1">Senza https://</p>
              </div>
              <Button
                onClick={() => {
                  if (!shopifyShop || !shopifyShop.includes('myshopify.com')) return alert('URL Shopify non valido.');
                  setConnectingShopify(true);
                  window.location.href = `/api/shopify/oauth/start?user_id=${encodeURIComponent(user.uid)}&shop=${encodeURIComponent(shopifyShop)}`;
                }}
                disabled={connectingShopify || !shopifyShop}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl w-full h-10 text-sm"
              >
                {connectingShopify ? <><Loader2 size={14} className="animate-spin mr-2" /> Connessione...</> : <><Link2 size={14} className="mr-2" /> Connetti Shopify</>}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700">Connesso</span>
                </div>
                <code className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{shopifyShop}</code>
              </div>
              <Button variant="outline" size="sm" className="rounded-lg text-xs"
                onClick={async () => {
                  if (!confirm('Disconnettere Shopify? L\'AI non potrà gestire gli ordini.')) return;
                  await updateDoc(doc(db, 'users', user.uid), {
                    'shopify_config.store_url': '', 'shopify_config.admin_token': '',
                    'shopify_config.connected_at': null, 'ai_config.enabled': false
                  });
                  setShopifyConnected(false); setShopifyShop(''); setAiEnabled(false);
                }}>
                Disconnetti
              </Button>
            </div>
          )}
        </div>

        {/* Save AI */}
        {saveSuccessAI && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <CheckCircle2 size={16} /> Configurazione AI salvata
          </div>
        )}
        {aiEnabled && !shopifyConnected && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
            <AlertCircle size={14} /> Connetti Shopify per attivare l'AI
          </div>
        )}
        <Button onClick={saveAIConfig} disabled={loadingAI || (aiEnabled && !shopifyConnected)}
          className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-10">
          {loadingAI ? <><Loader2 size={14} className="animate-spin mr-2" /> Salvataggio...</> : <><Save size={14} className="mr-2" /> Salva AI</>}
        </Button>

        {/* Info box */}
        <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
          <p className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-1.5"><Info size={13} /> Come funziona</p>
          <ul className="text-xs space-y-1 ml-5 list-disc text-slate-600">
            <li>Inclusa nel piano EhiLab (nessun costo aggiuntivo)</li>
            <li>Risponde a: ordini, tracking, resi, FAQ</li>
            <li>Apre ticket per ordini in ritardo</li>
            <li>Disattivabile in qualsiasi momento</li>
          </ul>
        </div>
      </section>

      {/* ═══ CALENDAR ═══ */}
      <section className="surface-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CalendarDays size={18} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Google Calendar</h2>
          <span className={`ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
            googleConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
          }`}>
            {googleConnected ? 'Connesso' : 'Non connesso'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          {!googleConnected ? (
            <Button onClick={connectGoogle} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-9 text-sm">
              <Plug size={14} className="mr-2" /> Collega Google Calendar
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={loadCalendars} disabled={loadingCalendars} className="rounded-lg text-xs h-8">
                <RefreshCcw size={13} className={`mr-1.5 ${loadingCalendars ? 'animate-spin' : ''}`} /> Ricarica
              </Button>
              <Button variant="outline" size="sm" onClick={disconnectGoogle} className="rounded-lg text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                <LogOut size={13} className="mr-1.5" /> Disconnetti
              </Button>
              <Link href="/chatboost/calendario" className="ml-auto">
                <Button variant="outline" size="sm" className="rounded-lg text-xs h-8">
                  Vai al Calendario <ArrowRight size={13} className="ml-1.5" />
                </Button>
              </Link>
            </>
          )}
        </div>

        {googleConnected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Calendario</label>
                <select className="select-premium text-xs h-8 py-0" value={calendarId} onChange={e => setCalendarId(e.target.value)} disabled={loadingCalendars}>
                  {calendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Dal</label>
                <input type="date" value={range.from} onChange={e => setRange(s => ({ ...s, from: e.target.value }))}
                  className="input-premium text-xs h-8 px-2.5" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Al</label>
                <input type="date" value={range.to} onChange={e => setRange(s => ({ ...s, to: e.target.value }))}
                  className="input-premium text-xs h-8 px-2.5" />
              </div>
              <div className="pt-4">
                <Button variant="outline" size="sm" onClick={() => loadEvents(calendarId)} disabled={loadingEvents} className="rounded-lg text-xs h-8">
                  Aggiorna
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Eventi</span>
                {loadingEvents && <Loader2 size={13} className="animate-spin text-slate-400" />}
              </div>
              {!loadingEvents && events.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-400">Nessun evento nel periodo selezionato</div>
              )}
              {!loadingEvents && events.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {events.map(ev => {
                    const start = ev.start?.dateTime || ev.start?.date;
                    const end = ev.end?.dateTime || ev.end?.date;
                    return (
                      <div key={ev.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="text-sm font-medium text-slate-800">{ev.summary || '(Senza titolo)'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {start ? fmtDT(start) : '—'} {end ? ` — ${fmtDT(end)}` : ''}
                        </div>
                        {ev.location && <div className="text-[11px] text-slate-400 mt-0.5">{ev.location}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
