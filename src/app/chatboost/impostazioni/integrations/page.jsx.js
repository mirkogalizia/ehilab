'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function IntegrationsPage() {
  const router = useRouter();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Integrazioni</h1>
      <div className="bg-white rounded-xl shadow p-6 flex flex-col gap-6">
        {/* Esempio integrazione Shopify */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/shopify.svg" alt="Shopify" className="h-10 w-10" />
            <span className="font-medium text-lg">Shopify</span>
          </div>
          <Button onClick={() => router.push('/api/shopify/auth')}>
            Collega Shopify
          </Button>
        </div>
        {/* Puoi aggiungere altre integrazioni qui */}
      </div>
    </div>
  );
}
