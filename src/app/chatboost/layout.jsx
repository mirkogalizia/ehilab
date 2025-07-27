'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState } from 'react';

export default function ChatBoostLayout({ children }) {
  const router = useRouter();
  const [openSettings, setOpenSettings] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login'); // 🔁 Torna alla pagina di login
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r p-4 space-y-6 shadow-md">
        <h2 className="text-2xl font-bold text-green-600">EHI! Chat Boost</h2>
        <nav className="space-y-2">
          <Link href="/chatboost/dashboard" className="block px-3 py-2 rounded hover:bg-gray-100 transition">
            💬 Conversazioni
          </Link>
          <Link href="/chatboost/templates" className="block px-3 py-2 rounded hover:bg-gray-100 transition">
            📄 Template
          </Link>

          {/* Menu Impostazioni */}
          <div>
            <button
              onClick={() => setOpenSettings(!openSettings)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition"
            >
              ⚙️ Impostazioni
            </button>
            {openSettings && (
              <div className="pl-4 mt-1 space-y-1">
                <Link href="/chatboost/settings/info" className="block px-3 py-2 rounded hover:bg-gray-100 transition">
                  ℹ️ Info
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 rounded hover:bg-red-100 text-red-600 transition"
                >
                  🔓 Logout
                </button>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Contenuto dinamico */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">
        {children}
      </main>
    </div>
  );
}
