'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MessageSquare, FileText, Settings, LogOut } from 'lucide-react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Stato per mostrare/nascondere lista contatti su mobile
  const [showContactsMobile, setShowContactsMobile] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 font-[Montserrat]">
        ⏳ Verifica login...
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    { label: 'Chat', icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template', icon: FileText, path: '/chatboost/templates' },
    { label: 'Impostaz.', icon: Settings, path: '/chatboost/impostazioni/info' },
  ];

  // Mostra/Nascondi sidebar full per mobile
  // Su desktop sidebar stretta + menu laterale
  return (
    <div className="flex h-screen font-[Montserrat]">
      {/* Sidebar desktop stretta */}
      <aside className="hidden md:flex flex-col w-16 bg-white border-r p-2 shadow-lg">
        <div
          onClick={() => router.push('/chatboost/dashboard')}
          className="text-xl font-extrabold text-black mb-8 cursor-pointer select-none"
        >
          EHI!
        </div>

        <nav className="flex flex-col gap-8 items-center flex-1">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => router.push(path)}
                className={`flex flex-col items-center text-sm transition-all ${
                  active ? 'text-black scale-110' : 'text-gray-400 hover:text-black'
                }`}
                aria-label={label}
              >
                <Icon size={24} />
                <span className="sr-only">{label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => {
            localStorage.removeItem('firebaseAuthToken');
            router.push('/wa/login');
          }}
          className="text-red-600 hover:text-red-800 transition flex flex-col items-center mb-2"
          aria-label="Logout"
        >
          <LogOut size={24} />
          <span className="sr-only">Logout</span>
        </button>
      </aside>

      {/* Lista contatti mobile full screen */}
      <div
        className={`
          fixed top-0 left-0 bottom-0 bg-white w-full max-w-xs z-50 p-4 md:hidden shadow-lg
          ${showContactsMobile ? 'block' : 'hidden'}
        `}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">Chat</h2>
          <button
            aria-label="Chiudi lista"
            className="text-2xl font-bold"
            onClick={() => setShowContactsMobile(false)}
          >
            ×
          </button>
        </div>
        {/* Qui il contenuto lista contatti sarà inserito dentro le pagine */}
        {/* Puoi aggiungere un prop/context per far gestire l'apertura/chiusura */}
        {/* oppure lasciare la gestione nel componente chat/dashboard */}
      </div>

      {/* Contenuto principale */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 p-4 md:p-6">
        {/* Se siamo su mobile e la lista contatti è aperta nascondiamo il main */}
        <div className={`${showContactsMobile ? 'hidden md:block' : 'block'}`}>
          {/* Qui dentro vengono renderizzati i figli (dashboard/chat/templates) */}
          {children({ setShowContactsMobile })}
        </div>
      </main>
    </div>
  );
}

