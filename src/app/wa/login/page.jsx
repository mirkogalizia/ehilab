'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2, ArrowRight, Utensils, Star, Heart } from 'lucide-react';
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
      setError('Credenziali non valide. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--surface-1)] items-center justify-center px-4 py-12 font-[Montserrat] relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-gradient-to-br from-emerald-200/30 via-teal-200/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-32 w-[350px] h-[350px] bg-gradient-to-br from-indigo-200/25 via-cyan-200/15 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Card */}
        <div className="bg-white border border-slate-200/80 shadow-xl rounded-2xl p-8 sm:p-10 space-y-7">
          {/* Logo + Intro */}
          <div className="text-center space-y-4">
            <img
              src="/ristochattext.png"
              alt="RistoChat by EHI Lab"
              className="mx-auto w-[170px] h-auto"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Bentornato
              </h1>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-xs mx-auto">
                Accedi alla piattaforma per gestire prenotazioni, clienti e campagne WhatsApp.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="nome@esempio.it"
                  className="input-premium w-full px-4 py-3 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="La tua password"
                  className="input-premium w-full px-4 py-3 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group w-full flex justify-center items-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-semibold transition-all duration-200 hover:bg-slate-800 hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  Accedi
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Feature highlights */}
          <div className="grid grid-cols-3 gap-4 pt-3">
            {[
              { icon: Utensils, label: 'Prenotazioni smart', color: 'text-emerald-600 bg-emerald-50' },
              { icon: Star, label: 'Recensioni Google', color: 'text-amber-600 bg-amber-50' },
              { icon: Heart, label: 'Promo mirate', color: 'text-rose-500 bg-rose-50' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon size={16} />
                </div>
                <span className="text-[11px] font-medium text-slate-500 text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>

          {/* Register link */}
          <div className="text-center pt-1">
            <span className="text-slate-400 text-sm">
              Non hai un account?{' '}
              <Link href="/wa/register" className="text-emerald-600 hover:text-emerald-700 font-semibold transition-colors">
                Registrati
              </Link>
            </span>
          </div>
        </div>

        {/* Sub-footer */}
        <p className="text-center text-[11px] text-slate-400 mt-4">
          Ufficiale WhatsApp Business · GDPR-ready · Niente complicazioni
        </p>
      </div>
    </div>
  );
}
