export default function ChatBoostLayout({ children }) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
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
        </nav>
      </aside>

      {/* Contenuto dinamico */}
      <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">{children}</main>
    </div>
  );
}
