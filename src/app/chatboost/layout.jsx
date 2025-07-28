'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MessageSquare, FileText, Settings, LogOut } from 'lucide-react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login'); // redirect verso login dedicato
    }
  }, [user, loading, router]);

  // Loader mentre verifica login
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 text-lg font-[Montserrat]">
        ⏳ Verifica login...
      </div>
    );
  }

  // Se non loggato → niente sidebar
  if (!user) {
    return null;
  }

  const navItems = [
    { label: 'Chat', icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template', icon: FileText, path: '/chatboost/templates' },
    { label: 'Impostaz.', icon: Settings, path: '/chatboost/impostazioni/info' },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-[Montserrat]">
      {/* Sidebar */}
      <aside className="w-24 bg-white border-r flex flex-col items-center py-8 shadow-lg">
        {/* Logo */}
        <div
          onClick={() => router.push('/chatboost/dashboard')}
          className="text-xl font-extrabold text-green-600 mb-12 cursor-pointer tracking-tight hover:scale-105 transition-transform"
        >
          EHI!
        </div>

        {/* Menu */}
        <nav className="flex flex-col gap-10 items-center flex-1">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => router.push(path)}
                className={`flex flex-col items-center text-sm font-medium transition-all ${
                  active
                    ? 'text-green-600'
                    : 'text-gray-500 hover:text-green-500'
                }`}
              >
                <Icon size={22} className={`${active ? 'scale-110' : ''}`} />
                <span className="text-[11px] mt-1">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={() => {
            localStorage.removeItem('firebaseAuthToken');
            router.push('/wa/login');
          }}
          className="text-red-500 hover:text-red-600 transition flex flex-col items-center"
        >
          <LogOut size={22} />
          <span className="text-[11px] mt-1">Logout</span>
        </button>
      </aside>

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7] p-6">
        {children}
      </main>
    </div>
  );
}


