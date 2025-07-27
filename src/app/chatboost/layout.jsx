'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase';

export default function ChatBoostLayout({ children }) {
  const router = useRouter();
  const [openSettings, setOpenSettings] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('chatboostUser');
    router.push('/chatboost/login');
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r p-4 space-y-6 shadow-md">
        <h2 className="text-2xl font-bold text-green-600">EHI! Chat Boost</h2>
        <nav className="space-y-2">
          <Link
            href="/chatboost/dashboard"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            💬 Conversazioni
          </Link>

          <Link
            href="/chatboost/templates"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            📄 Template
          </Link>

          {/* Impostazioni */}
          <div>
            <button
              onClick={() => setOpenSettings(!openSettings)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
              ⚙️ Impostazioni
            </button>
            {openSettings && (
              <div className="ml-4 space-y-1">
                <Link
                  href="/chatboost/impostazioni/info"
                  className="block px-3 py-2 rounded hover:bg-gray-100 transition"
                >
                  ℹ️ Info
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="block w-full text-left px-3 py-2 mt-4 rounded hover:bg-red-100 text-red-600 font-semibold transition"
          >
            🚪 Logout
          </button>
        </nav>
      </aside>

      {/* Contenuto dinamico */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">{children}</main>
    </div>
  );
}
