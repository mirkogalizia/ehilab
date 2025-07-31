'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, FileText, Settings, LogOut, Users, Plug, Info } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const subnavRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login');
    }
  }, [loading, user, router]);

  // Chiudi il sub-menu se clicchi fuori
  useEffect(() => {
    function handleClickOutside(e) {
      if (subnavRef.current && !subnavRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
    }
    if (showSettingsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettingsMenu]);

  useEffect(() => {
    // Mostra sub-menu automaticamente se si entra in impostazioni
    setShowSettingsMenu(pathname.startsWith('/chatboost/impostazioni'));
  }, [pathname]);

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

  const settingsSubnav = [
    { label: 'Info', path: '/chatboost/impostazioni/info', icon: Info },
    { label: 'Integrazioni', path: '/chatboost/impostazioni/integrations', icon: Plug },
  ];

  const isSettingsActive = pathname.startsWith('/chatboost/impostazioni');
  const hideBottomNav = pathname.startsWith('/chatboost/dashboard/chat/');

  return (
    <div className="h-screen w-screen flex font-[Montserrat] bg-gray-50 overflow-hidden relative">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-24 bg-white border-r flex-col items-center py-8 shadow-md z-20">
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
              <div key={path} className="w-full flex flex-col items-center relative">
                <button
                  onClick={() => {
                    if (label === 'Impostaz.') {
                      setShowSettingsMenu(true);
                      router.push('/chatboost/impostazioni/info');
                    } else {
                      router.push(path);
                    }
                  }}
                  className={`flex flex-col items-center text-sm font-medium transition-all w-full group ${
                    active ? 'text-black' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon size={22} className={active ? 'scale-110' : ''} />
                  <span className="text-[11px] mt-1">{label}</span>
                  {label === 'Impostaz.' && isSettingsActive && (
                    <span className="absolute right-0 top-1 w-2 h-2 bg-blue-600 rounded-full shadow"></span>
                  )}
                </button>
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

      {/* Mini-sidebar settings (Apple style) */}
      {showSettingsMenu && (
        <div
          ref={subnavRef}
          className="hidden md:block fixed left-24 top-0 h-full w-64 z-30"
          style={{
            backdropFilter: "blur(10px)",
            background: "rgba(255,255,255,0.78)",
            boxShadow: "8px 0 24px -4px rgba(0,0,0,0.11)",
            borderRight: "1px solid #e5e7eb",
            transition: "all 0.28s cubic-bezier(.4,0,.2,1)"
          }}
        >
          <div className="flex flex-col gap-4 pt-16 pl-6 pr-3">
            <span className="uppercase tracking-widest text-gray-400 text-[11px] mb-2 ml-1">IMPOSTAZIONI</span>
            {settingsSubnav.map(({ label, path, icon: SubIcon }) => (
              <button
                key={path}
                onClick={() => {
                  router.push(path);
                  setShowSettingsMenu(false);
                }}
                className={`flex items-center gap-3 py-2 px-3 rounded-xl text-base transition-all mb-1 font-medium
                  ${pathname === path
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'hover:bg-gray-200 text-gray-700'}`}
              >
                <SubIcon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay per chiudere la mini-sidebar cliccando fuori */}
      {showSettingsMenu && (
        <div
          className="hidden md:block fixed inset-0 z-10"
          style={{ background: "transparent" }}
          onClick={() => setShowSettingsMenu(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-[#f7f7f7] z-10">{children}</main>

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

