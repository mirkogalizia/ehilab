'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MessageSquare, FileText, Settings, LogOut, Users } from 'lucide-react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push('/wa/login');
  }, [user, loading, router]);

  if (loading) return <div className="flex items-center justify-center h-screen">⏳ Verifica login...</div>;
  if (!user) return null;

  const navItems = [
    { label: 'Chat',       icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template',   icon: FileText,      path: '/chatboost/templates' },
    { label: 'Contatti',   icon: Users,         path: '/chatboost/contacts' },
    { label: 'Impostaz.',  icon: Settings,      path: '/chatboost/impostazioni/info' },
  ];

  // sul mobile, nascondi bottom nav quando sei in chat pieno schermo
  const hideBottomNav = pathname.startsWith('/chatboost/dashboard/chat/');

  return (
    <div className="h-screen w-screen flex font-[Montserrat] bg-gray-50 overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-24 bg-white border-r flex-col items-center py-8 shadow-md">
        <div
          onClick={() => router.push('/chatboost/dashboard')}
          className="text-xl font-extrabold mb-12 cursor-pointer hover:scale-105 transition"
        >
          EHI!
        </div>
        <nav className="flex flex-col gap-10 items-center flex-1">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => router.push(path)}
                className={`flex flex-col items-center text-sm transition ${
                  active ? 'text-black' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon size={22} className={active && 'scale-110'} />
                <span className="text-[11px] mt-1">{label}</span>
              </button>
            );
          })}
        </nav>
        <button
          onClick={() => {
            localStorage.removeItem('firebaseAuthToken');
            router.push('/wa/login');
          }}
          className="text-gray-500 hover:text-red-500 transition flex flex-col items-center"
        >
          <LogOut size={22} />
          <span className="text-[11px] mt-1">Logout</span>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Bottom Nav mobile */}
      {!hideBottomNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around items-center py-3 shadow-lg md:hidden">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => router.push(path)}
                className={`flex flex-col items-center text-xs transition ${
                  active ? 'text-black' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon size={22} className={active && 'scale-110'} />
                <span className="text-[10px] mt-1">{label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
