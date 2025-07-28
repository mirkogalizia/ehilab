'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/chatboost/dashboard');
    } catch (err) {
      console.error('Errore login:', err);
      setError('❌ Credenziali non valide');
    }
  };

  return (
    <div className="flex h-screen bg-[#f7f7f7] items-center justify-center px-4 font-[Montserrat]">
      <div className="w-full max-w-md bg-white shadow-2xl rounded-3xl p-10 space-y-8">
        {/* Logo */}
        <div className="text-center space-y-4">
          <img
            src="/logo.png"
            alt="Logo EHI Lab"
            className="mx-auto w-24 h-24 drop-shadow-md"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <h1 className="text-2xl font-bold text-gray-900">EHI! Chat Boost</h1>
          <p className="text-gray-600 text-sm">
            Automatizza WhatsApp e fai crescere il tuo business 🚀
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-black outline-none transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-black outline-none transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition transform hover:scale-[1.02] shadow-md"
          >
            🚪 Accedi
          </button>
        </form>

        {/* Mini highlight marketing */}
        <div className="grid grid-cols-3 gap-6 text-center pt-4">
          <div>
            <span className="text-2xl">📈</span>
            <p className="text-xs mt-1 text-gray-700">Più vendite</p>
          </div>
          <div>
            <span className="text-2xl">⚡</span>
            <p className="text-xs mt-1 text-gray-700">Processi rapidi</p>
          </div>
          <div>
            <span className="text-2xl">💬</span>
            <p className="text-xs mt-1 text-gray-700">Clienti fedeli</p>
          </div>
        </div>
      </div>
    </div>
  );
}

