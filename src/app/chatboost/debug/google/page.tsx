'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase'; // 👈 usiamo direttamente Firebase Auth client

export default function GoogleOAuthDebugPage() {
  const [log, setLog] = useState<string>('');
  const [lastUrl, setLastUrl] = useState<string>('');

  const append = (msg: any) =>
    setLog((p) => p + (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');

  const clear = () => {
    setLog('');
    setLastUrl('');
  };

  const getIdTokenSafe = async (): Promise<string | null> => {
    const u = auth.currentUser;
    if (!u) return null;
    try {
      return await u.getIdToken();
    } catch (e: any) {
      append({ step: 'getIdToken', error: e?.message || String(e) });
      return null;
    }
  };

  const checkAppCreds = async () => {
    const idt = await getIdTokenSafe();
    if (!idt) return append('⚠️ Nessun utente loggato o ID token non disponibile');
    try {
      const r = await fetch('/api/google/app-credentials', {
        headers: { Authorization: `Bearer ${idt}` },
      });
      const j = await r.json();
      append({ step: 'GET /api/google/app-credentials', status: r.status, body: j });
    } catch (e: any) {
      append({ step: 'GET app-credentials', error: e?.message || String(e) });
    }
  };

  const startOAuth = async () => {
    const idt = await getIdTokenSafe();
    if (!idt) return append('⚠️ Nessun utente loggato o ID token non disponibile');
    try {
      const r = await fetch('/api/google/oauth/start', {
        headers: { Authorization: `Bearer ${idt}` },
      });
      const j = await r.json();
      append({ step: 'GET /api/google/oauth/start', status: r.status, body: j });
      if (r.ok && j.url) setLastUrl(j.url);
    } catch (e: any) {
      append({ step: 'GET oauth/start', error: e?.message || String(e) });
    }
  };

  const goToGoogle = () => {
    if (!lastUrl) return;
    window.location.href = lastUrl;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto font-[Montserrat] space-y-4">
      <h1 className="text-2xl font-bold">Google OAuth – Debug</h1>

      <div className="flex gap-2 flex-wrap">
        <button onClick={clear} className="px-3 py-2 border rounded">Pulisci</button>
        <button onClick={checkAppCreds} className="px-3 py-2 border rounded bg-white">1) Verifica credenziali BYOG</button>
        <button onClick={startOAuth} className="px-3 py-2 border rounded bg-white">2) Avvia OAuth (mostra JSON)</button>
        <button
          onClick={goToGoogle}
          disabled={!lastUrl}
          className={`px-3 py-2 border rounded ${lastUrl ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
          title={lastUrl ? lastUrl : 'Nessun URL ricevuto'}
        >
          3) Apri Google OAuth
        </button>
      </div>

      <pre className="bg-gray-900 text-green-200 text-xs p-3 rounded max-h-[60vh] overflow-auto whitespace-pre-wrap">
        {log || 'Log vuoto…'}
      </pre>
    </div>
  );
}