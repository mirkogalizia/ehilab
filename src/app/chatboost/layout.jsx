// src/app/chatboost/layout.jsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import {
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  Users,
  Plug,
  Info,
  Menu,
  Zap,
  CalendarDays,
  LayoutGrid,
  ShoppingBag,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const subnavRef = useRef(null);

  // Redirect se non loggato
  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login');
    }
  }, [loading, user, router]);

  // Listener UNREAD
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let count = 0;
        snap.forEach((d) => {
          const msg = d.data();
          if (msg?.from !== 'operator') count += 1;
        });
        setTotalUnread(count);
      },
      (err) => {
        console.error('Unread listener error:', err);
        setTotalUnread(0);
      }
    );
    return () => unsub();
  }, [user]);

  // Chiudi sottomenu Impostazioni cliccando fuori
  useEffect(() => {
    function handleClickOutside(e) {
      if (subnavRef.current && !subnavRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
    }
    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsMenu]);

  useEffect(() => {
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

  // NAV principali — short: label sidebar compatta, label: label completa per drawer
  const navItems = [
    { label: 'Chat', short: 'Chat', icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template', short: 'Tmpl', icon: FileText, path: '/chatboost/templates' },
    { label: 'Contatti', short: 'Contatti', icon: Users, path: '/chatboost/contacts' },
    { label: 'Pipeline', short: 'Pipeline', icon: LayoutGrid, path: '/chatboost/pipeline' },
    { label: 'Prodotti', short: 'Prodotti', icon: ShoppingBag, path: '/chatboost/prodotti' },
    { label: 'Calendario', short: 'Calend.', icon: CalendarDays, path: '/chatboost/calendario' },
    { label: 'Impostazioni', short: 'Impost.', icon: Settings, path: '/chatboost/impostazioni' },
  ];

  // SUBNAV impostazioni
  const settingsSubnav = [
    { label: 'Info', path: '/chatboost/impostazioni/info', icon: Info },
    { label: 'Integrazioni', path: '/chatboost/impostazioni/integrations', icon: Plug },
    { label: 'Automazioni', path: '/chatboost/impostazioni/automazioni', icon: Zap },
  ];

  // ----- DRAWER (mobile) -----
  function MobileDrawer() {
    return (
      <div className="fixed inset-0 z-[999] flex md:hidden" style={{ animation: 'backdropFade 0.2s ease-out' }}>
        {/* Drawer panel */}
        <div
          className="bg-white w-[280px] max-w-[85vw] h-full flex flex-col shadow-2xl border-r border-slate-200/60"
          style={{ animation: 'slideDrawer 0.3s cubic-bezier(.4,0,.2,1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                <span className="text-white text-sm font-extrabold">E!</span>
              </div>
              <div>
                <span className="text-base font-extrabold text-slate-900 tracking-tight">Chat Boost</span>
              </div>
            </div>
            <button
              onClick={() => setShowDrawer(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col gap-1 flex-1 px-3 py-4 overflow-y-auto">
            {navItems.map(({ label, icon: Icon, path }) => {
              const active = pathname.startsWith(path);
              return (
                <button
                  key={path}
                  onClick={() => {
                    setShowDrawer(false);
                    router.push(
                      path === '/chatboost/impostazioni'
                        ? '/chatboost/impostazioni/info'
                        : path
                    );
                  }}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'nav-item-active'
                      : 'nav-item-idle hover:bg-slate-100'
                  }`}
                >
                  <Icon size={19} />
                  <span className="flex-1 text-left">{label}</span>
                  {label === 'Chat' && totalUnread > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold min-w-[20px] text-center">
                      {totalUnread}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Settings subnav */}
            {pathname.startsWith('/chatboost/impostazioni') && (
              <div className="ml-4 pl-3 mt-1 mb-1 border-l-2 border-slate-200 flex flex-col gap-0.5">
                {settingsSubnav.map(({ label, path, icon: SubIcon }) => (
                  <button
                    key={path}
                    onClick={() => {
                      setShowDrawer(false);
                      router.push(path);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      pathname === path
                        ? 'bg-slate-900 text-white font-medium'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <SubIcon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </nav>

          {/* Logout */}
          <div className="px-3 py-4 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>

        {/* Backdrop */}
        <div
          className="flex-1 bg-slate-900/30 backdrop-blur-sm"
          onClick={() => setShowDrawer(false)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--surface-1)]">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <Loader2 size={28} className="animate-spin text-emerald-600" />
          <span className="text-slate-500 text-sm font-medium">Caricamento...</span>
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row font-[Montserrat] bg-[var(--surface-1)] overflow-hidden relative">
      {/* ═══ Sidebar desktop ═══ */}
      <aside className="hidden md:flex w-[68px] bg-white border-r border-slate-200/60 flex-col items-center py-5 z-20 shadow-sm overflow-hidden">
        {/* Brand mark */}
        <button
          onClick={() => router.push('/chatboost/dashboard')}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 shrink-0"
        >
          <span className="text-white text-xs font-extrabold tracking-tight">E!</span>
        </button>

        {/* Nav icons */}
        <nav className="flex flex-col gap-0.5 items-center flex-1 w-full px-1.5">
          {navItems.map(({ label, short, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            const isSettings = label === 'Impostazioni';
            return (
              <div key={path} className="relative w-full flex flex-col items-center">
                <button
                  onClick={() => {
                    if (isSettings) {
                      setShowSettingsMenu(true);
                      router.push('/chatboost/impostazioni/info');
                    } else {
                      router.push(path);
                    }
                  }}
                  className={`group flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                  title={label}
                >
                  <div className="relative">
                    <Icon
                      size={19}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={`transition-all ${active ? 'text-emerald-600' : ''}`}
                    />
                    {label === 'Chat' && totalUnread > 0 && (
                      <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center shadow-sm">
                        {totalUnread}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] mt-0.5 leading-tight text-center w-full truncate ${active ? 'text-emerald-700 font-semibold' : 'font-medium'}`}>
                    {short}
                  </span>

                  {/* Active indicator */}
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-emerald-500" />
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-red-500 transition-colors py-2 shrink-0"
          title="Logout"
        >
          <LogOut size={17} />
          <span className="text-[9px] font-medium">Esci</span>
        </button>
      </aside>

      {/* ═══ Settings subnav panel (desktop) ═══ */}
      {showSettingsMenu && (
        <div
          ref={subnavRef}
          className="hidden md:flex fixed left-[68px] top-0 h-full w-[220px] z-30 flex-col bg-white/95 backdrop-blur-xl border-r border-slate-200/60 shadow-lg"
          style={{ animation: 'slideInRight 0.2s ease-out' }}
        >
          <div className="pt-7 pb-4 px-5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Impostazioni
            </span>
          </div>
          <div className="flex flex-col gap-1 px-3 flex-1">
            {settingsSubnav.map(({ label, path, icon: SubIcon }) => {
              const active = pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => {
                    router.push(path);
                    setShowSettingsMenu(false);
                  }}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm transition-all font-medium ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <SubIcon size={17} />
                  {label}
                  {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Mobile drawer ═══ */}
      {showDrawer && <MobileDrawer />}

      {/* ═══ Mobile header ═══ */}
      <header className="md:hidden fixed top-0 left-0 w-full z-30 bg-white/95 backdrop-blur-md flex items-center justify-between px-4 py-3 border-b border-slate-200/60 shadow-sm">
        <button
          onClick={() => setShowDrawer(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <span className="text-white text-xs font-extrabold">E!</span>
          </div>
          <span className="text-base font-extrabold tracking-tight text-slate-900">
            Chat Boost
          </span>
        </div>
        <span className="w-9" />
      </header>

      {/* ═══ Main content ═══ */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-[var(--surface-1)] z-10">
        {children}
      </main>
    </div>
  );
}
