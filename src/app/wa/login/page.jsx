'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/chatboost/dashboard');
    } catch (err) {
      console.error('Errore login:', err);
      setError('❌ Credenziali non valide. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-100 via-white to-gray-50 items-center justify-center px-4 font-[Montserrat]">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-10 space-y-8 border border-gray-200">
        {/* Logo + Intro */}
        <div className="text-center space-y-4">
          <img
            src="/ristochattext.png"
            alt="RistoChat by EHI Lab"
            className="mx-auto w-[190px] h-auto drop-shadow-md"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <h1 className="text-3xl font-bold text-gray-900">RistoChat</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            Riempie i tavoli e fidelizza i clienti con <span className="font-semibold">WhatsApp</span>:
            prenotazioni automatiche, conferme e reminder, promozioni mirate,
            richieste recensione Google e recupero clienti inattivi. Tutto in pochi click.
          </p>
          <p className="text-[11px] text-gray-400">
            Ufficiale WhatsApp Business • GDPR‑ready • Niente complicazioni, solo risultati.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-gray-800 outline-none transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-gray-800 outline-none transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="text-red-500 text-sm animate-pulse">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-3 bg-black text-white rounded-xl font-semibold hover:bg-neutral-800 transition transform hover:scale-[1.02] shadow-md disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : 'Accedi'}
          </button>
        </form>

        {/* Highlights per ristoranti */}
        <div className="grid grid-cols-3 gap-6 text-center pt-4">
          <div>
            <span className="text-2xl">🍽️</span>
            <p className="text-xs mt-1 text-gray-600">Prenotazioni smart</p>
          </div>
          <div>
            <span className="text-2xl">⭐</span>
            <p className="text-xs mt-1 text-gray-600">Recensioni Google</p>
          </div>
          <div>
            <span className="text-2xl">💌</span>
            <p className="text-xs mt-1 text-gray-600">Promo mirate</p>
          </div>
        </div>

        {/* Link registrati */}
        <div className="mt-6 flex items-center justify-center">
          <span className="text-gray-500 text-sm">
            Non hai un account?{' '}
            <Link href="/wa/register" className="text-green-700 hover:underline font-semibold">
              Registrati
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

