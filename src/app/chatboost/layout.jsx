'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { MessageSquare, FileText, Settings, LogOut, Menu, X } from 'lucide-react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileView, setMobileView] = useState('list'); // 'list' or 'chat' for mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/wa/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600 text-lg font-[Montserrat]">⏳ Verifica login...</div>;
  }
  if (!user) return null;

  const navItems = [
    { label: 'Chat', icon: MessageSquare, path: '/chatboost/dashboard' },
    { label: 'Template', icon: FileText, path: '/chatboost/templates' },
    { label: 'Impostaz.', icon: Settings, path: '/chatboost/impostazioni/info' },
  ];

  // Mobile toggle handler
  const toggleView = () => setMobileView(mobileView === 'list' ? 'chat' : 'list');

  return (
    <div className="flex h-screen bg-gray-50 font-[Montserrat]">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-24 bg-white border-r flex flex-col items-center py-8 shadow-lg">
        <div
          onClick={() => router.push('/chatboost/dashboard')}
          className="text-xl font-extrabold text-black mb-12 cursor-pointer tracking-tight hover:scale-105 transition-transform"
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
                className={`flex flex-col items-center text-sm font-medium transition-all ${
                  active ? 'text-black scale-110' : 'text-gray-500 hover:text-black'
                }`}
              >
                <Icon size={22} />
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
          className="text-red-500 hover:text-red-600 transition flex flex-col items-center"
        >
          <LogOut size={22} />
          <span className="text-[11px] mt-1">Logout</span>
        </button>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between bg-white p-4 border-b shadow-md w-full">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-black">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="font-bold text-lg">EHI! Chat Boost</h1>
        <div />
      </header>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <aside className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setSidebarOpen(false)}>
          <nav
            className="absolute top-0 left-0 bg-white w-64 h-full p-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-8 text-2xl font-bold cursor-pointer" onClick={() => { router.push('/chatboost/dashboard'); setSidebarOpen(false); }}>
              EHI!
            </div>
            {navItems.map(({ label, icon: Icon, path }) => {
              const active = pathname.startsWith(path);
              return (
                <button
                  key={path}
                  onClick={() => {
                    router.push(path);
                    setSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 py-2 px-4 rounded transition ${
                    active ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'
                  }`}
                >
                  <Icon size={20} />
                  {label}
                </button>
              );
            })}
            <button
              onClick={() => {
                localStorage.removeItem('firebaseAuthToken');
                router.push('/wa/login');
              }}
              className="mt-auto text-red-600 hover:text-red-800 transition flex items-center gap-2"
            >
              <LogOut size={20} />
              Logout
            </button>
          </nav>
        </aside>
      )}

      {/* Content area: mostra solo lista contatti o chat su mobile */}
      <main className="flex-1 flex flex-col">
        {/* Mobile toggle nav */}
        <div className="md:hidden flex justify-center gap-4 bg-white border-b p-2 shadow-sm">
          <button
            onClick={() => setMobileView('list')}
            className={`px-4 py-2 rounded ${mobileView === 'list' ? 'bg-black text-white' : 'bg-gray-100'}`}
          >
            Lista
          </button>
          <button
            onClick={() => setMobileView('chat')}
            className={`px-4 py-2 rounded ${mobileView === 'chat' ? 'bg-black text-white' : 'bg-gray-100'}`}
            disabled={!mobileView === 'list'}
          >
            Chat
          </button>
        </div>

        {/* Contenuti responsive */}
        <div className="flex flex-1 overflow-hidden">
          {/* Lista contatti */}
          <div
            className={`bg-white border-r overflow-y-auto p-6 transition-all duration-300 ease-in-out ${
              mobileView === 'list' ? 'block w-full md:w-1/4' : 'hidden md:block md:w-1/4'
            }`}
          >
            {children.props.pageType === 'chat' && children.props.phoneListComponent}
          </div>

          {/* Chat e contenuti */}
          <div
            className={`flex-1 overflow-y-auto p-6 ${
              mobileView === 'chat' ? 'block' : 'hidden md:block'
            }`}
          >
            {children.props.pageType === 'chat' && children.props.chatComponent}
            {children.props.pageType !== 'chat' && children}
          </div>
        </div>
      </main>
    </div>
  );
}

