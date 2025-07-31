'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shopify } from 'lucide-react'; // Usa un'icona Lucide o la tua SVG

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false); // TODO: leggi da backend/DB se vuoi

  // Avvia OAuth con redirect verso Shopify
  const handleConnect = async () => {
    setLoading(true);
    try {
      // Puoi chiedere il dominio via prompt o input, o usare un campo salvato in Firestore
      const shopDomain = prompt("Inserisci il dominio Shopify (es: miostore.myshopify.com):");
      if (!shopDomain || !shopDomain.endsWith('.myshopify.com')) {
        alert("Dominio non valido");
        setLoading(false);
        return;
      }
      // Chiamata alla tua API per iniziare OAuth (reindirizza!)
      window.location.href = `/api/shopify/auth?shop=${encodeURIComponent(shopDomain)}`;
    } catch (err) {
      alert("Errore: " + err.message);
      setLoading(false);
    }
  };

  // Potresti anche gestire lo stato "connected" controllando via fetch se è già collegato
  // qui lo lasciamo fisso come demo

  return (
    <div className="max-w-xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow flex flex-col items-center font-[Montserrat]">
      <div className="mb-6 flex flex-col items-center">
        <Shopify size={48} className="text-green-600 mb-2" />
        <h1 className="text-2xl font-bold mb-1">Collega Shopify</h1>
        <p className="text-gray-600 text-center">
          Collega il tuo store Shopify per importare ordini, clienti e automatizzare tutto dal pannello Chat Boost.
        </p>
      </div>

      {/* Stato connessione */}
      {connected ? (
        <div className="mb-4 text-green-700 font-semibold">
          ✅ Collegato a Shopify!
        </div>
      ) : (
        <Button
          onClick={handleConnect}
          disabled={loading}
          className="w-full px-6 py-3 text-lg bg-green-600 hover:bg-green-700 transition"
        >
          {loading ? "Reindirizzamento..." : "Collega Shopify"}
        </Button>
      )}
    </div>
  );
}
