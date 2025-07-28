'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/chatboost/dashboard'); // vai in dashboard
    } catch (err) {
      setError('❌ Email o password errati');
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-green-50 to-green-100 items-center justify-center">
      <div className="max-w-lg w-full bg-white shadow-xl rounded-2xl p-10 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-green-600">EHI! Chat Boost</h1>
          <p className="mt-2 text-gray-500">
            🚀 Aumenta il tuo fatturato con l’automazione WhatsApp
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-lg px-4 py-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border rounded-lg px-4 py-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition"
          >
            🚪 Accedi
          </button>
        </form>

        <div className="text-center text-gray-500 text-sm">
          Nessun account? <a href="#" className="text-green-600 font-medium hover:underline">Contattaci</a>
        </div>

        {/* Sezione marketing */}
        <div className="grid grid-cols-3 gap-4 text-center mt-6">
          <div>
            <span className="text-2xl">📈</span>
            <p className="text-sm mt-2 font-semibold">Incrementa vendite</p>
          </div>
          <div>
            <span className="text-2xl">⚡</span>
            <p className="text-sm mt-2 font-semibold">Automatizza processi</p>
          </div>
          <div>
            <span className="text-2xl">💬</span>
            <p className="text-sm mt-2 font-semibold">Fidelizza clienti</p>
          </div>
        </div>
      </div>
    </div>
  );
}

