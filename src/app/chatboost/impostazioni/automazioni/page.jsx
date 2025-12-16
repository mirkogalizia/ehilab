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
  AlertCircle, CheckCircle2, Bot, Zap
} from "lucide-react";

export default function AutomazioniPage() {
  const { user } = useAuth();

  // ------- SHOPIFY (ESISTENTE) -------
  const [enabled, setEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [enabledAbandonedCart, setEnabledAbandonedCart] = useState(false);
  const [templateAbandonedCart, setTemplateAbandonedCart] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [templateList, setTemplateList] = useState([]);
  const [loadingShopify, setLoadingShopify] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ------- 🆕 AI CONFIGURATION (SEMPLIFICATO) -------
  const [aiEnabled, setAiEnabled] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [saveSuccessAI, setSaveSuccessAI] = useState(false);

  // ------- 🆕 SHOPIFY OAUTH -------
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyShop, setShopifyShop] = useState('');
  const [connectingShopify, setConnectingShopify] = useState(false);

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

  // ===== CARICA CONFIGURAZIONI =====
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingShopify(true);
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
          const data = snap.data();
          
          // SHOPIFY AUTOMAZIONI
          const automation = data?.automation?.order_fulfilled || {};
          setEnabled(!!automation.enabled);
          setSelectedTemplate(automation.template_id || '');

          const automationCart = data?.automation?.abandoned_cart || {};
          setEnabledAbandonedCart(!!automationCart.enabled);
          setTemplateAbandonedCart(automationCart.template_id || '');
          setDelayMinutes(automationCart.delay_minutes || 60);

          // AI CONFIGURAZIONE (solo toggle + prompt)
          const aiConfig = data?.ai_config || {};
          setAiEnabled(!!aiConfig.enabled);
          setCustomPrompt(aiConfig.custom_prompt || '');

          // SHOPIFY OAUTH
          const shopifyConfig = data?.shopify_config || {};
          setShopifyConnected(!!shopifyConfig.admin_token);
          setShopifyShop(shopifyConfig.store_url || '');

          console.log("✅ Configurazioni caricate");
        }

        // Carica template WhatsApp
        const res = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const dataTpl = await res.json();
        setTemplateList(Array.isArray(dataTpl) ? dataTpl.filter(t => t.status === 'APPROVED') : []);
      } catch (error) {
        console.error("Errore caricamento:", error);
      } finally {
        setLoadingShopify(false);
      }
    })();
  }, [user]);

  // ===== SALVA AUTOMAZIONI SHOPIFY =====
  async function saveAutomazione() {
    if (!user) return;
    setLoadingShopify(true);
    setSaveSuccess(false);
    try {
      const userRef = doc(db, "users", user.uid);
      
      await updateDoc(userRef, {
        "automation.order_fulfilled": { enabled, template_id: selectedTemplate },
        "automation.abandoned_cart": { 
          enabled: enabledAbandonedCart, 
          template_id: templateAbandonedCart,
          delay_minutes: parseInt(delayMinutes) || 60
        }
      });
      
      console.log("✅ Automazioni Shopify salvate");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
    } catch (error) {
      console.error("❌ Errore salvataggio:", error);
      alert("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoadingShopify(false);
    }
  }

  // ===== 🆕 SALVA CONFIGURAZIONE AI (SEMPLIFICATO) =====
  async function saveAIConfig() {
    if (!user) return;

    if (aiEnabled && !shopifyConnected) {
      alert("⚠️ Connetti prima Shopify per permettere all'AI di gestire gli ordini");
      return;
    }

    setLoadingAI(true);
    setSaveSuccessAI(false);
    try {
      const userRef = doc(db, "users", user.uid);
      
      await updateDoc(userRef, {
        ai_config: {
          enabled: aiEnabled,
          custom_prompt: customPrompt,
          auto_reply_enabled: true,
          ticket_tracking: true,
          updated_at: new Date().toISOString()
        }
      });
      
      console.log("✅ Configurazione AI salvata");
      setSaveSuccessAI(true);
      setTimeout(() => setSaveSuccessAI(false), 3000);
      
    } catch (error) {
      console.error("❌ Errore salvataggio AI:", error);
      alert("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoadingAI(false);
    }
  }

  // ===== GESTISCI CALLBACK OAUTH SHOPIFY =====
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopifyStatus = params.get('shopify');
    const reason = params.get('reason');
    
    if (shopifyStatus === 'success') {
      alert('✅ Shopify connesso con successo!');
      window.history.replaceState({}, '', '/automations');
      window.location.reload();
    } else if (shopifyStatus === 'error') {
      const messages = {
        missing_params: 'Parametri OAuth mancanti',
        invalid_state: 'State non valido',
        invalid_hmac: 'Verifica sicurezza fallita',
        token_exchange: 'Errore ottenimento token',
        user_not_found: 'Utente non trovato',
        exception: 'Errore generico'
      };
      alert(`❌ Errore connessione Shopify: ${messages[reason] || 'Sconosciuto'}`);
      window.history.replaceState({}, '', '/automations');
    }
  }, []);

  // ===== CALENDARIO HELPERS (INVARIATO) =====
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
        <p className="text-gray-500">
          Configura automazioni Shopify, risposte AI automatiche e Google Calendar.
        </p>
      </header>

      {/* ========== SHOPIFY (INVARIATO) ========== */}
      <section className="bg-white border rounded-2xl p-6 shadow-sm space-y-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700"><Store size={18} /></div>
          <h2 className="text-xl font-semibold">Shopify</h2>
        </div>

        {/* Ordine Evaso */}
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

        {/* Carrello Abbandonato */}
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
            </div>

            <div>
              <label className="block mb-2 text-base font-medium">
                Ritardo invio (minuti):
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
            </div>
          </div>
        </div>

        {/* Bottone Salva Shopify */}
        <div className="pt-2">
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
              <CheckCircle2 size={18} />
              <span>Automazioni Shopify salvate!</span>
            </div>
          )}
          <Button 
            disabled={loadingShopify} 
            onClick={saveAutomazione}
            className="w-full sm:w-auto"
          >
            {loadingShopify ? 'Salvataggio...' : 'Salva Shopify'}
          </Button>
        </div>
      </section>

      {/* ========== 🆕 AI ASSISTENTE (SEMPLIFICATO) ========== */}
      <section className="bg-white border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-700"><Bot size={18} /></div>
          <h2 className="text-xl font-semibold">Assistente AI</h2>
        </div>

        {/* Toggle principale */}
        <div className="border-b pb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Risposte Automatiche AI</h3>
              <p className="text-sm text-gray-500">
                L'AI risponderà automaticamente ai clienti su WhatsApp
              </p>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
              id="ai-toggle"
            />
          </div>
          
          {aiEnabled && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <Zap size={18} className="text-green-600" />
              <span className="text-green-800 font-medium">✨ AI attiva - Risposte automatiche abilitate</span>
            </div>
          )}
          {!aiEnabled && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="text-gray-600">⏸️ AI disattivata - Dovrai rispondere manualmente</span>
            </div>
          )}
        </div>

        {/* Prompt personalizzato (opzionale) */}
        <div className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">
              Personalizza il comportamento dell'AI (opzionale)
            </label>
            <Textarea
              placeholder="Esempio: Rispondi sempre in modo molto cordiale e usa emoji..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              disabled={loadingAI}
              className="resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Lascia vuoto per usare il comportamento predefinito dell'AI
            </p>
          </div>
        </div>

        {/* Configurazione Shopify OAuth */}
        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Store size={16} className="text-gray-600" />
            <h3 className="font-semibold">Integrazione Shopify</h3>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Richiesto per AI</span>
          </div>

          {!shopifyConnected ? (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <p className="text-sm">
                🛍️ Connetti il tuo negozio Shopify per permettere all'AI di rispondere automaticamente alle domande sugli ordini.
              </p>
              
              <div>
                <label className="block mb-2 text-sm font-medium">
                  URL del tuo store Shopify <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="tuostore.myshopify.com"
                  value={shopifyShop}
                  onChange={(e) => setShopifyShop(e.target.value)}
                  disabled={connectingShopify}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Esempio: notforresale.myshopify.com (senza https://)
                </p>
              </div>
              
              <Button
                onClick={() => {
                  if (!shopifyShop || !shopifyShop.includes('myshopify.com')) {
                    alert('⚠️ Inserisci un URL Shopify valido (es: tuostore.myshopify.com)');
                    return;
                  }
                  
                  setConnectingShopify(true);
                  window.location.href = `/api/shopify/oauth/start?user_id=${user.uid}&shop=${shopifyShop}`;
                }}
                disabled={connectingShopify || !shopifyShop}
                className="w-full"
              >
                {connectingShopify ? 'Connessione...' : '🔗 Connetti Shopify (1 click)'}
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={18} className="text-green-600" />
                    <span className="font-medium text-green-800">Shopify connesso</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Store: <code className="bg-white px-2 py-1 rounded text-xs">{shopifyShop}</code>
                  </p>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Vuoi disconnettere Shopify? L\'AI non potrà più gestire gli ordini.')) return;
                    
                    const userRef = doc(db, 'users', user.uid);
                    await updateDoc(userRef, {
                      'shopify_config.store_url': '',
                      'shopify_config.admin_token': '',
                      'shopify_config.connected_at': null,
                      'ai_config.enabled': false  // Disabilita anche AI
                    });
                    
                    setShopifyConnected(false);
                    setShopifyShop('');
                    setAiEnabled(false);
                    alert('✅ Shopify disconnesso');
                  }}
                >
                  Disconnetti
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Bottone Salva AI */}
        <div className="pt-2">
          {saveSuccessAI && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
              <CheckCircle2 size={18} />
              <span>Configurazione AI salvata!</span>
            </div>
          )}

          {aiEnabled && !shopifyConnected && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2 text-orange-800">
              <AlertCircle size={18} />
              <span>Connetti Shopify per attivare l'AI</span>
            </div>
          )}

          <Button 
            disabled={loadingAI || (aiEnabled && !shopifyConnected)} 
            onClick={saveAIConfig}
            className="w-full sm:w-auto"
          >
            {loadingAI ? 'Salvataggio...' : '💾 Salva Configurazione AI'}
          </Button>
        </div>

        {/* Info box */}
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm font-semibold mb-2">ℹ️ Come funziona:</p>
          <ul className="text-sm space-y-1 ml-4 list-disc text-gray-700">
            <li>L'AI è inclusa nel tuo piano EhiLab (nessun costo aggiuntivo)</li>
            <li>Risponde automaticamente a: ordini, tracking, resi, FAQ</li>
            <li>Apre ticket automatici per ordini in ritardo</li>
            <li>Puoi disattivarla in qualsiasi momento con il toggle sopra</li>
          </ul>
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
                <RefreshCcw size={16} className={loadingCalendars ? 'animate-spin' : ''}/> Ricarica
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
                <span className="text-sm text-gray-600">Calendario</span>
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
                Aggiorna
              </Button>
            </div>

            <div className="rounded-lg border p-4">
              <div className="font-semibold mb-2">Eventi {loadingEvents && <span className="text-gray-400 text-sm">(caricamento…)</span>}</div>
              {!loadingEvents && events.length === 0 && (
                <div className="text-sm text-gray-500">Nessun evento nel periodo</div>
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

