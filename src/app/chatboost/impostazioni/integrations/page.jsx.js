'use client';

import { useState, useEffect } from "react";
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [shopifyStatus, setShopifyStatus] = useState(null);

  // Simula fetch stato integrazione (sostituisci con reale check Firestore)
  useEffect(() => {
    setLoading(true);
    // Qui dovresti leggere da Firestore se l'utente ha collegato Shopify
    // Esempio mock
    setTimeout(() => {
      setShopifyStatus(null); // O un oggetto con dati shopify se connesso
      setLoading(false);
    }, 800);
  }, [user]);

  // URL per OAuth Shopify (DAI TUO CLIENT_ID e endpoint callback reale)
  const SHOPIFY_OAUTH_URL = `https://shopify.com/admin/oauth/authorize?client_id=898b7911f0e76349a4c79352098ef2a2&scope=read_orders,read_customers&redirect_uri=https://ehi-lab.it/api/shopify/callback`;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-blue-700">🛒 Integrazione Shopify</h1>
      <div className="bg-white shadow-lg rounded-2xl p-6 mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-lg text-gray-800">Shopify</span>
          {/* Stato connessione */}
          {loading ? (
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="animate-spin" /> Caricamento stato...
            </span>
          ) : shopifyStatus ? (
            <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Connesso
              <span className="ml-2 inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded-lg text-xs">
                {shopifyStatus.shopDomain || 'Attivo'}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-red-500 text-sm font-medium">
              <XCircle className="w-4 h-4" /> Non connesso
              <span className="ml-2 inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded-lg text-xs">
                Assente
              </span>
            </span>
          )}
        </div>
        {/* Bottone OAuth Shopify */}
        {!loading && !shopifyStatus && (
          <Button
            className="mt-2 w-fit font-bold"
            onClick={() => window.location.href = SHOPIFY_OAUTH_URL}
          >
            Connetti Shopify
          </Button>
        )}
        {/* Mostra dati negozio collegato se esistenti */}
        {shopifyStatus && (
          <div className="mt-4 bg-gray-50 rounded-lg p-3">
            <div><strong>Negozio:</strong> {shopifyStatus.shopDomain}</div>
            <div><strong>Email admin:</strong> {shopifyStatus.shopEmail}</div>
            {/* ...altri dati */}
          </div>
        )}
      </div>
    </div>
  );
}
