'use client';

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import {
  Copy, Loader2, Check, ShoppingBag, Link2, AlertCircle,
  ChevronRight, Shield, Webhook
} from "lucide-react";

function generateToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback più sicuro di Math.random
  const arr = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(arr);
  }
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export default function ShopifyIntegrationPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  const BASE_URL = "https://ehi-lab.it";

  useEffect(() => {
    if (!user || authLoading) return;
    (async () => {
      setLoading(true);
      try {
        const ref = doc(db, "shopify_merchants", user.uid);
        const snap = await getDoc(ref);
        let newToken = "";
        if (snap.exists() && snap.data().token) {
          newToken = snap.data().token;
        } else {
          newToken = generateToken();
          await setDoc(ref, {
            token: newToken, attivo: true,
            user_email: user.email || "",
            createdAt: new Date().toISOString()
          });
        }
        setToken(newToken);
        setWebhookUrl(`${BASE_URL}/api/webhook/shopify/${user.uid}/${newToken}`);
      } catch (err) {
        setError("Errore durante la generazione del link. Riprova.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = webhookUrl; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-400">Effettua il login per continuare.</p>
      </div>
    );
  }

  const webhookEvents = [
    { event: 'Ordine creato', code: 'orders/create' },
    { event: 'Ordine aggiornato', code: 'orders/updated' },
    { event: 'Ordine annullato', code: 'orders/cancelled' },
    { event: 'Pagamento ricevuto', code: 'orders/paid' },
    { event: 'Ordine evaso', code: 'fulfillments/create' },
    { event: 'Carrello abbandonato', code: 'carts/update' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-[Montserrat]">
      {/* Header */}
      <div className="mb-8">
        <span className="badge-premium bg-emerald-100 text-emerald-700 mb-3 inline-flex">Integrazioni</span>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Integrazione Shopify</h1>
        <p className="text-sm text-slate-400 mt-1">Automatizza notifiche WhatsApp su ordini, spedizioni e pagamenti</p>
      </div>

      {/* Webhook URL Card */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Webhook size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Webhook personale</h2>
            <p className="text-xs text-slate-400">Copia e incolla nel pannello Shopify</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> Generazione link...
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              className="input-premium flex-1 font-mono text-xs px-3 py-2.5 bg-slate-50"
              value={webhookUrl}
              readOnly
              spellCheck={false}
              onClick={e => e.target.select()}
            />
            <button
              onClick={handleCopy}
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        )}

        {copied && (
          <p className="text-xs text-emerald-600 font-medium mt-2">Link copiato negli appunti</p>
        )}

        {error && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-red-50/50 border border-red-100">
          <Shield size={13} className="text-red-400 shrink-0" />
          <p className="text-[11px] text-red-500 font-medium">Non condividere questo link pubblicamente</p>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <ShoppingBag size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Configurazione Shopify</h2>
            <p className="text-xs text-slate-400">Segui questi passaggi (1 minuto)</p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { step: 1, text: <>Vai in <strong>Impostazioni</strong> <ChevronRight size={12} className="inline" /> <strong>Notifiche</strong> <ChevronRight size={12} className="inline" /> <strong>Webhook</strong></> },
            { step: 2, text: <>Clicca su <strong>Crea webhook</strong></> },
            { step: 3, text: <>Incolla il link qui sopra come <strong className="text-emerald-600">URL di consegna</strong></> },
            { step: 4, text: <>Scegli l&apos;evento da collegare (vedi lista sotto)</>, sub: true },
            { step: 5, text: <>Formato dati: <strong>JSON</strong></> },
            { step: 6, text: <>Versione API: <strong>2024-07</strong></> },
            { step: 7, text: <>Clicca <strong>Salva webhook</strong></> },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Events */}
      <div className="surface-card p-6">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Eventi supportati</h3>
        <div className="space-y-2">
          {webhookEvents.map(({ event, code }) => (
            <div key={code} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-slate-700">{event}</span>
              </div>
              <code className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">{code}</code>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-4">Puoi riutilizzare lo stesso link per tutti gli eventi.</p>
      </div>
    </div>
  );
}
