import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center bg-gradient-to-b from-[#f5f7fa] to-[#e4ecf7] bg-pattern font-sans px-2 overflow-x-hidden relative">
      {/* Pattern grid in overlay */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40">
        {/* Grid pattern SVG, leggerissimo */}
        <svg width="100%" height="100%" className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dde6f4" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex flex-col items-center py-16">
        <Image
          src="/logo.png"
          alt="EHI! Lab Logo"
          width={400}
          height={400}
          className="mb-8 drop-shadow-xl rounded-3xl"
          priority
        />
        <h1 className="text-5xl sm:text-6xl font-extrabold text-neutral-900 tracking-tight mb-6 text-center leading-tight drop-shadow-[0_2px_12px_rgba(100,149,237,0.08)]">
          L&apos;automazione<br />
          <span className="text-blue-700 bg-blue-100 rounded-full px-2 py-1">che si fa sentire</span>
        </h1>
        <p className="text-2xl text-neutral-700 max-w-2xl text-center mb-6 font-semibold">
          Digitalizza il tuo business, con stile.<br />
          <span className="text-blue-700 font-bold">
            Soluzioni su misura, pronte in 48h.
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-4 justify-center">
          <a
            href="/wa/login"
            className="px-8 py-3 bg-blue-700 text-white font-bold rounded-full shadow-lg hover:bg-blue-900 transition text-lg"
          >
            Prova Chat Boost
          </a>
          <a
            href="#servizi"
            className="px-8 py-3 bg-white text-blue-700 font-bold rounded-full border border-blue-700 hover:bg-blue-50 transition text-lg"
          >
            Scopri i servizi
          </a>
        </div>
      </header>

      {/* Servizi */}
      <section id="servizi" className="w-full max-w-7xl mx-auto mt-12 px-2 relative z-10">
        <h2 className="text-3xl font-extrabold text-center mb-14 tracking-tight">
          I nostri servizi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              icon: "🛒",
              title: "Siti Web & E-commerce",
              text: "Realizzazione siti professionali e store Shopify su misura. Design, sviluppo, SEO e automazioni su richiesta.",
            },
            {
              icon: "🤖",
              title: "Automazioni & Dashboard",
              text: "App web personalizzate, integrazione API, automazione processi e dashboard di controllo avanzate.",
            },
            {
              icon: "🍽️",
              title: "Smart Menu & Prenotazioni",
              text: "Menù digitali QR, prenotazioni e sistemi smart per ristoranti e locali. Ordini rapidi e gestione clienti.",
            },
            {
              icon: "💬",
              title: "EHI! Chat Boost",
              text: "Automazione WhatsApp, CRM integrato, gestione customer care e campagne marketing multicanale.",
            },
          ].map(({ icon, title, text }) => (
            <div
              key={title}
              className="flex flex-col items-center rounded-3xl bg-white/80 backdrop-blur-xl border border-blue-100 shadow-[0_8px_32px_0_rgba(31,38,135,0.13)] px-8 py-12 transition hover:shadow-2xl hover:scale-[1.04] hover:bg-white/95 group"
            >
              <span className="text-5xl mb-5 drop-shadow-[0_2px_12px_rgba(100,149,237,0.09)]">{icon}</span>
              <h3 className="font-bold text-xl mb-3 text-neutral-800 text-center group-hover:text-blue-700 transition">
                {title}
              </h3>
              <div className="text-gray-700 text-base text-center leading-relaxed font-medium">
                {text}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section trust */}
      <section className="w-full max-w-5xl mx-auto mt-24 mb-16 px-2 relative z-10">
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
          <div className="flex-1 bg-blue-50/70 rounded-3xl p-8 shadow-xl border border-blue-100 text-center">
            <h4 className="font-bold text-xl mb-2 text-blue-700">Tecnologia 100% Cloud</h4>
            <p className="text-gray-700">
              Tutti i servizi sono ospitati su server sicuri, scalabili e super-veloci.
              <br />
              <b>No installazioni. Sempre disponibili, ovunque.</b>
            </p>
          </div>
          <div className="flex-1 bg-green-50/60 rounded-3xl p-8 shadow-xl border border-green-100 text-center">
            <h4 className="font-bold text-xl mb-2 text-green-700">Supporto umano &amp; smart</h4>
            <p className="text-gray-700">
              Parla direttamente con il nostro team.<br />
              Supporto, formazione e consulenza inclusi.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t bg-white py-10 text-center text-gray-500 text-sm mt-12 relative z-20">
        &copy; {new Date().getFullYear()} EHI! Lab · Digital automation by MM GROUP SRL
      </footer>
    </main>
  );
}

