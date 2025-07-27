'use client';

import { useAuth } from '@/lib/useAuth';

export default function ChatBoostLayout({ children }) {
  const { user } = useAuth();

  return (
    <div className="flex h-screen">
      {/* Sidebar solo se loggato */}
      {user && (
        <aside className="w-64 bg-white border-r p-4 space-y-6 shadow-md">
          <h2 className="text-2xl font-bold text-green-600">EHI! Chat Boost</h2>
          <nav className="space-y-2">
            <a href="/chatboost/dashboard" className="block px-3 py-2 rounded hover:bg-gray-100 transition">
              💬 Conversazioni
            </a>
            <a href="/chatboost/templates" className="block px-3 py-2 rounded hover:bg-gray-100 transition">
              📄 Template
            </a>
            <details className="group">
              <summary className="px-3 py-2 rounded cursor-pointer hover:bg-gray-100 transition">
                ⚙️ Impostazioni
              </summary>
              <div className="ml-4 mt-2 space-y-1">
                <a href="/chatboost/settings/info" className="block text-sm hover:underline">Info</a>
              </div>
            </details>
            <button
              onClick={() => {
                localStorage.removeItem('firebaseAuthToken');
                window.location.href = '/login';
              }}
              className="mt-4 block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded"
            >
              🚪 Logout
            </button>
          </nav>
        </aside>
      )}

      {/* Contenuto dinamico */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">{children}</main>
    </div>
  );
}

