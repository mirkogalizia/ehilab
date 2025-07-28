'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Se sei nella pagina login → non mostrare mai sidebar
  if (pathname.startsWith('/chatboost/login')) {
    return <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">{children}</main>;
  }

  // Redirect automatico se non loggato
  useEffect(() => {
    if (!loading && !user) {
      router.push('/chatboost/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">⏳ Verifica login...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-white border-r p-4 space-y-6 shadow-md">
        <h2 className="text-2xl font-bold text-green-600">EHI! Chat Boost</h2>
        <nav className="space-y-2">
          <a
            href="/chatboost/dashboard"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            💬 Conversazioni
          </a>
          <a
            href="/chatboost/templates"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            📄 Template
          </a>
          <details className="group">
            <summary className="px-3 py-2 rounded cursor-pointer hover:bg-gray-100 transition">
              ⚙️ Impostazioni
            </summary>
            <div className="ml-4 mt-2 space-y-1">
              <a
                href="/chatboost/impostazioni/info"
                className="block text-sm hover:underline"
              >
                Info
              </a>
            </div>
          </details>
          <button
            onClick={() => {
              localStorage.removeItem('firebaseAuthToken');
              router.push('/chatboost/login');
            }}
            className="mt-4 block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded"
          >
            🚪 Logout
          </button>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">{children}</main>
    </div>
  );
}

