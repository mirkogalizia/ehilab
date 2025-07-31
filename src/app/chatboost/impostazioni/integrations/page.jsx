'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Copy, Loader2, Check } from "lucide-react";

function generateToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    async function fetchOrCreateToken() {
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
            token: newToken,
            attivo: true,
            user_email: user.email || "",
            createdAt: new Date()
          });
        }
        setToken(newToken);
        setWebhookUrl(
          `${BASE_URL}/api/webhook/shopify/${user.uid}/${newToken}`
        );
      } catch (err) {
        setError("Errore durante la generazione del link. Riprova.");
      } finally {
        setLoading(false);
      }
    }
    fetchOrCreateToken();
  }, [user, authLoading]);

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <p>Per generare il link devi effettuare il login.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-green-50 via-white to-blue-50 py-10 px-2 font-[Montserrat]">
      {/* Hero / Header */}
      <div className="max-w-2xl mx-auto mb-6 relative">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-xl bg-green-100 px-3 py-1 text-green-700 font-semibold tracking-wide shadow">
              <img src="/shopify.svg" alt="Shopify" className="w-7 h-7 mr-2" />
              Integrazione Shopify
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mt-2 mb-2 text-center drop-shadow-lg">
            Collega il tuo Store in <span className="text-green-600">1 click</span>
          </h1>
          <p className="text-gray-600 max-w-xl text-center text-lg mb-3">
            Automatizza notifiche WhatsApp su ordini, spedizioni e pagamenti in tempo reale su Chat Boost.<br />
            Ricevi aggiornamenti istantanei e migliora l'esperienza dei tuoi clienti.
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="max-w-2xl mx-auto shadow-2xl rounded-3xl bg-white/80 border border-gray-200 p-7 pb-5 flex flex-col gap-7">
        {/* Webhook */}
        <div>
          <label className="block font-bold text-gray-700 mb-1 text-base">
            Il tuo <span className="text-green-700">webhook personale</span>:
          </label>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="animate-spin" /> Generazione link...
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                className="w-full border border-gray-300 bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono tracking-wide outline-none select-all shadow"
                value={webhookUrl}
                readOnly
                spellCheck={false}
              />
              <Button size="icon" variant={copied ? "success" : "outline"} onClick={handleCopy}>
                {copied ? <Check className="w-5 h-5 text-green-700" /> : <Copy className="w-5 h-5" />}
              </Button>
              {copied && <span className="text-green-600 text-sm ml-1 font-bold">Copiato!</span>}
            </div>
          )}
          {error && <div className="text-red-600 mt-2">{error}</div>}
        </div>

        {/* Steps */}
        <div className="bg-gradient-to-tr from-green-50 via-white to-blue-50 border border-green-200 rounded-xl shadow-inner px-5 py-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-green-600/90 text-white font-bold text-xs px-2 py-1 rounded">Onboarding Shopify</span>
            <span className="text-gray-400 text-xs ml-auto">1 min ⏱️</span>
          </div>
          <ol className="list-decimal pl-5 text-[15px] space-y-2 text-gray-800 font-medium">
            <li>
              Vai in <span className="font-semibold">Impostazioni &rarr; Notifiche &rarr; Webhook</span> nel pannello Shopify.
            </li>
            <li>
              Clicca su <span className="font-semibold">Crea webhook</span>.
            </li>
            <li>
              Incolla il link qui sopra come <span className="font-semibold text-blue-700">URL di consegna</span>.
            </li>
            <li>
              Scegli l’<span className="font-semibold">evento</span> da collegare (puoi ripetere per tutti):<br />
              <div className="bg-white/60 border border-gray-100 rounded-xl px-4 py-2 mt-2">
                <ul className="space-y-1 font-normal">
                  <li>🟢 <span className="font-mono">Ordine creato</span> <span className="text-gray-400 text-xs">(orders/create)</span></li>
                  <li>🟢 <span className="font-mono">Ordine aggiornato</span> <span className="text-gray-400 text-xs">(orders/updated)</span></li>
                  <li>🟢 <span className="font-mono">Ordine annullato</span> <span className="text-gray-400 text-xs">(orders/cancelled)</span></li>
                  <li>🟢 <span className="font-mono">Pagamento ricevuto</span> <span className="text-gray-400 text-xs">(orders/paid)</span></li>
                  <li>🟢 <span className="font-mono">Ordine evaso</span> <span className="text-gray-400 text-xs">(fulfillments/create)</span></li>
                  <li>🟢 <span className="font-mono">Carrello abbandonato</span> <span className="text-gray-400 text-xs">(carts/update)</span></li>
                </ul>
              </div>
            </li>
            <li>
              Formato dati: <span className="font-semibold">JSON</span>
            </li>
            <li>
              Versione API: <span className="font-semibold">2024-07 (ultima disponibile)</span>
            </li>
            <li>
              Clicca <span className="font-semibold">Salva webhook</span>.
            </li>
          </ol>
        </div>
        <div className="text-xs text-gray-500 mt-1 leading-tight px-1">
          Puoi riutilizzare questo link per più eventi webhook su Shopify.
          <br />
          <span className="text-rose-600 font-bold">Non condividere questo link pubblicamente!</span>
        </div>
      </div>
    </div>
  );
}
