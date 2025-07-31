'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";

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
    <div className="max-w-2xl mx-auto p-6 mt-10 bg-white shadow-2xl rounded-2xl font-[Montserrat]">
      <div className="flex items-center gap-3 mb-6">
        <img src="/shopify.svg" alt="Shopify" className="w-8 h-8" />
        <h1 className="text-2xl font-bold text-green-700">Collega Shopify</h1>
      </div>

      <div className="mb-5 text-gray-800 text-base leading-snug">
        Collega il tuo store Shopify e automatizza le notifiche WhatsApp per ordini, spedizioni e altro direttamente su Chat Boost.
      </div>

      <div className="mb-8">
        <label className="block font-semibold mb-1 text-gray-700">
          Il tuo link webhook personale:
        </label>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="animate-spin text-gray-500" />
            <span className="text-gray-500">Generazione link...</span>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono outline-none select-all"
              value={webhookUrl}
              readOnly
              spellCheck={false}
            />
            <Button size="icon" variant="outline" onClick={handleCopy}>
              <Copy className="w-5 h-5" />
            </Button>
            {copied && <span className="text-green-600 text-sm ml-1">Copiato!</span>}
          </div>
        )}
        {error && <div className="text-red-600 mt-2">{error}</div>}
      </div>

      {/* Istruzioni Shopify */}
      <div className="bg-gray-50 rounded-xl p-5 mb-4 border border-gray-200 shadow-sm">
        <h2 className="font-semibold mb-2 text-base text-green-800">Istruzioni Shopify:</h2>
        <ol className="list-decimal pl-5 text-[15px] space-y-1 text-gray-700">
          <li>
            Vai in <span className="font-semibold">Impostazioni &rarr; Notifiche &rarr; Webhook</span> nel pannello Shopify.
          </li>
          <li>
            Clicca su <span className="font-semibold">Crea webhook</span>.
          </li>
          <li>
            Incolla il link qui sopra come <span className="font-semibold">URL di consegna</span>.
          </li>
          <li>
            Seleziona l’<span className="font-semibold">evento</span> che vuoi monitorare (puoi ripetere per ognuno):<br />
            <span className="ml-2 block mt-1">
              • <span className="font-mono">Ordine creato</span> (<span className="italic">orders/create</span>)<br />
              • <span className="font-mono">Ordine aggiornato</span> (<span className="italic">orders/updated</span>)<br />
              • <span className="font-mono">Ordine annullato</span> (<span className="italic">orders/cancelled</span>)<br />
              • <span className="font-mono">Pagamento ricevuto</span> (<span className="italic">orders/paid</span>)<br />
              • <span className="font-mono">Ordine evaso</span> (<span className="italic">fulfillments/create</span>)<br />
              • <span className="font-mono">Carrello abbandonato</span> (<span className="italic">carts/update</span>)
            </span>
          </li>
          <li>
            Scegli formato: <span className="font-semibold">JSON</span>
          </li>
          <li>
            Versione API consigliata: <span className="font-semibold">2024-07 (ultima disponibile)</span>
          </li>
          <li>
            Clicca <span className="font-semibold">Salva webhook</span>.
          </li>
        </ol>
      </div>

      <div className="text-xs text-gray-400 mt-2 leading-tight">
        Puoi riutilizzare questo link per più eventi webhook su Shopify.
        <br />
        <span className="text-rose-500 font-bold">Non condividere questo link pubblicamente!</span>
      </div>
    </div>
  );
}
