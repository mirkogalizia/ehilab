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
      router.push('/chatboost/dashboard');
    } catch (err) {
      setError('❌ Credenziali non valide');
    }
  };

  return (
    <div className="flex h-screen bg-[#f7f7f7] items-center justify-center px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 space-y-8">
        {/* Logo e titolo */}
        <div className="text-center space-y-2">
          <img src="/logo.png" alt="Logo EHI Lab" className="mx-auto w-20 h-20" />
          <h1 className="text-3xl font-bold text-green-600">EHI! Chat Boost</h1>
          <p className="text-gray-500 text-sm">
            La piattaforma per automatizzare WhatsApp e far crescere il tuo business 🚀
          </p>
        </div>

        {/* Form di login */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <input
              type="email"
              placeholder="Email"
              className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-green-500 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="Password"
              className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-green-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
          >
            🚪 Accedi
          </button>
        </form>

        {/* Sezione highlight marketing */}
        <div className="grid grid-cols-3 gap-4 text-center mt-6">
          <div>
            <span className="text-2xl">📈</span>
            <p className="text-sm mt-1 font-medium">Aumenta vendite</p>
          </div>
          <div>
            <span className="text-2xl">⚡</span>
            <p className="text-sm mt-1 font-medium">Automatizza processi</p>
          </div>
          <div>
            <span className="text-2xl">💬</span>
            <p className="text-sm mt-1 font-medium">Fidelizza clienti</p>
          </div>
        </div>
      </div>
    </div>
  );
}

