'use client';

import { useState } from "react";
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function IntegrationsPage() {
  const [shop, setShop] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopifyStatus, setShopifyStatus] = useState(null);

  const CLIENT_ID = "898b7911f0e76349a4c79352098ef2a2";
  const REDIRECT_URI = "https://ehi-lab.it/api/shopify/callback";
  const SCOPES = "read_orders,read_customers";

  // Verifica se shop è plausibile (opzionale)
  const isValidShop = shop && /^[a-zA-Z0-9\-]+\.myshopify\.com$/.test(shop);

  const handleConnect = () => {
    if (!shop.endsWith('.myshopify.com')) {
      alert('Devi inserire il dominio completo (es: nome-negozio.myshopify.com)');
      return;
    }
    const url = `https://${shop}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = url;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-blue-700">🛒 Integrazione Shopify</h1>
      <div className="bg-white shadow-lg rounded-2xl p-6 mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-lg text-gray-800">Shopify</span>
          {loading ? (
            <span className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="animate-spin" /> Caricamento stato...
            </span>
          ) : shopifyStatus ? (
            <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Connesso
            </span>
          ) : (
            <span className="flex items-center gap-2 text-red-500 text-sm font-medium">
              <XCircle className="w-4 h-4" /> Non connesso
            </span>
          )}
        </div>
        {/* Input shop domain */}
        {!shopifyStatus && (
          <div className="mt-4 flex flex-col gap-2">
            <label className="font-semibold text-sm mb-1">
              Dominio Shopify <span className="text-gray-400">(es: nome-negozio.myshopify.com)</span>
            </label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              placeholder="Inserisci dominio negozio..."
              value={shop}
              onChange={e => setShop(e.target.value.trim())}
            />
            <Button
              className="mt-2 w-fit font-bold"
              onClick={handleConnect}
              disabled={!shop.endsWith('.myshopify.com')}
            >
              Connetti Shopify
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

