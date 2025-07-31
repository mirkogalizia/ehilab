'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, FileText, Settings, LogOut, Users, Plug, Info } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login');
    }
  }, [loading, user, router]);

  const handleLogout = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      await signOut(auth);
      router.push('/wa/login');
    } catch (err) {
      console.error('Errore logout:', err);
      router.push('/wa/login');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 text-lg font-[Montserrat]">
        ⏳ Verifica login...
      </div>
    );
  }
  if (!user) {
    return null;
  }

  const navItems = [
    { label: 'Chat',      icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template',  icon: FileText,      path: '/chatboost/templates' },
    { label: 'Contatti',  icon: Users,         path: '/chatboost/contacts' },
    { label: 'Impostaz.', icon: Settings,      path: '/chatboost/impostazioni' },
  ];

  // Sottomenu impostazioni (solo se su /chatboost/impostazioni)
  const isSettingsActive = pathname.startsWith('/chatboost/impostazioni');
  const settingsSubnav = [
    { label: 'Info', path: '/chatboost/impostazioni/info', icon: Info },
    { label: 'Integrazioni', path: '/chatboost/impostazioni/integrations', icon: Plug },
  ];

  const hideBottomNav = pathname.startsWith('/chatboost/dashboard/chat/');

  return (
    <div className="h-screen w-screen flex font-[Montserrat] bg-gray-50 overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-24 bg-white border-r flex-col items-center py-8 shadow-md">
        <div
          onClick={() => router.push('/chatboost/dashboard')}
          className="text-xl font-extrabold text-gray-900 mb-12 cursor-pointer hover:scale-105 transition-transform"
        >
          EHI!
        </div>
        <nav className="flex flex-col gap-10 items-center flex-1">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <div key={path} className="w-full flex flex-col items-center">
                <button
                  onClick={() => router.push(path === '/chatboost/impostazioni' ? '/chatboost/impostazioni/info' : path)}
                  className={`flex flex-col items-center text-sm font-medium transition-all w-full ${
                    active ? 'text-black' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon size={22} className={active ? 'scale-110' : ''} />
                  <span className="text-[11px] mt-1">{label}</span>
                </button>
                {/* SUBMENU SOLO SE ATTIVO SU IMPOSTAZIONI */}
                {label === 'Impostaz.' && isSettingsActive && (
                  <div className="flex flex-col items-start w-full pl-4 mt-3 gap-2">
                    {settingsSubnav.map(({ label, path, icon: SubIcon }) => (
                      <button
                        key={path}
                        onClick={() => router.push(path)}
                        className={`flex items-center gap-2 text-xs py-1 px-2 rounded-md transition-all w-full text-left ${
                          pathname === path
                            ? 'bg-gray-900 text-white font-semibold'
                            : 'hover:bg-gray-200 text-gray-500'
                        }`}
                      >
                        <SubIcon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-red-500 transition flex flex-col items-center"
        >
          <LogOut size={22} />
          <span className="text-[11px] mt-1">Logout</span>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-[#f7f7f7]">
        {children}
      </main>

      {/* Bottom Nav mobile */}
      {!hideBottomNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around items-center py-3 shadow-lg md:hidden z-50">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => router.push(path === '/chatboost/impostazioni' ? '/chatboost/impostazioni/info' : path)}
                className={`flex flex-col items-center text-xs transition-all ${
                  active ? 'text-black' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon size={22} className={active ? 'scale-110' : ''} />
                <span className="text-[10px] mt-1">{label}</span>
              </button>
            );
          })}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center text-xs text-gray-500 hover:text-red-500"
          >
            <LogOut size={22} />
            <span className="text-[10px] mt-1">Logout</span>
          </button>
        </nav>
      )}
    </div>
  );
}

