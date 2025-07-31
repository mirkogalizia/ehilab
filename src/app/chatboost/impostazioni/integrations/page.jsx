'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth"; // La tua custom hook Firebase Auth
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";

function generateToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback se manca crypto.randomUUID
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ShopifyIntegrationPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  // Sostituisci con il tuo dominio reale!
  const BASE_URL = "https://ehi-lab.it"; // <-- metti qui il dominio della tua app

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
    <div className="max-w-lg mx-auto p-8 rounded-2xl shadow-xl bg-white mt-8">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <img src="/shopify.svg" alt="Shopify" className="w-7 h-7" />
        Integrazione Shopify
      </h1>
      <p className="mb-3">
        Collega il tuo store Shopify per attivare le automazioni WhatsApp su Chat Boost!
      </p>

      <div className="mb-6">
        <label className="block font-semibold mb-2">Il tuo link webhook personale:</label>
        {loading ? (
          <Loader2 className="animate-spin text-gray-500" />
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <input
                className="w-full border rounded-lg px-2 py-2 text-xs"
                value={webhookUrl}
                readOnly
              />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                <Copy className="w-5 h-5" />
              </Button>
              {copied && <span className="text-green-600 text-sm ml-2">Copiato!</span>}
            </div>
          </>
        )}
        {error && <div className="text-red-600 mt-2">{error}</div>}
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-3 border">
        <h2 className="font-semibold mb-1 text-base">Istruzioni per Shopify:</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>
            Vai su <strong>Shopify &gt; Impostazioni &gt; Notifiche &gt; Webhook</strong>
          </li>
          <li>
            Clicca su <strong>Crea webhook</strong>
          </li>
          <li>
            Incolla il link qui sopra come <strong>“URL di consegna”</strong>
          </li>
          <li>
            Scegli gli eventi da monitorare:<br />
            <span className="ml-2">
              - Ordine creato<br />
              - Ordine aggiornato<br />
              - Ordine spedito<br />
              - Pagamento ordine<br />
              - Carrello abbandonato<br />
              - Evasione ordini
            </span>
          </li>
          <li>
            Formato: <strong>JSON</strong>, Versione API: <strong>2024-07</strong>
          </li>
          <li>
            Salva e ripeti per ogni evento che vuoi monitorare.
          </li>
        </ol>
      </div>
      <div className="text-xs text-gray-400 mt-2">
        Puoi riutilizzare questo link per più eventi webhook su Shopify.  
        <br />
        <span className="text-rose-500 font-bold">
          Non condividere questo link pubblicamente!
        </span>
      </div>
    </div>
  );
}

