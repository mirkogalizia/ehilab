'use client';

import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MessageSquare, FileText, Settings, LogOut } from 'lucide-react';

export default function ChatBoostLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/chatboost/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 text-lg">
        ⏳ Verifica login...
      </div>
    );
  }

  if (!user) {
    return null; // evita flickering
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      {user && (
        <aside className="w-20 bg-white border-r flex flex-col items-center py-6 shadow-md">
          {/* Logo */}
          <div
            onClick={() => router.push('/chatboost/dashboard')}
            className="text-xl font-bold text-green-600 mb-10 cursor-pointer"
          >
            EHI!
          </div>

          {/* Menu */}
          <nav className="flex flex-col gap-8 items-center">
            <button
              onClick={() => router.push('/chatboost/dashboard')}
              className="flex flex-col items-center text-gray-600 hover:text-green-600 transition"
            >
              <MessageSquare size={22} />
              <span className="text-[10px] mt-1">Chat</span>
            </button>

            <button
              onClick={() => router.push('/chatboost/templates')}
              className="flex flex-col items-center text-gray-600 hover:text-green-600 transition"
            >
              <FileText size={22} />
              <span className="text-[10px] mt-1">Template</span>
            </button>

            <button
              onClick={() => router.push('/chatboost/impostazioni/info')}
              className="flex flex-col items-center text-gray-600 hover:text-green-600 transition"
            >
              <Settings size={22} />
              <span className="text-[10px] mt-1">Impostaz.</span>
            </button>
          </nav>

          {/* Logout */}
          <button
            onClick={() => {
              localStorage.removeItem('firebaseAuthToken');
              router.push('/chatboost/login');
            }}
            className="mt-auto text-red-500 hover:text-red-600 transition flex flex-col items-center"
          >
            <LogOut size={22} />
            <span className="text-[10px] mt-1">Logout</span>
          </button>
        </aside>
      )}

      {/* Contenuto dinamico */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7] p-6">{children}</main>
    </div>
  );
}


