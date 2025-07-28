import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center bg-white font-sans px-2 overflow-x-hidden">
      {/* Header super bold */}
      <header className="w-full flex flex-col items-center py-12 bg-gradient-to-b from-blue-50/70 to-white relative">
        {/* Logo centrale */}
        <Image
          src="/logo.png"
          alt="EHI! Lab Logo"
          width={120}
          height={120}
          className="mb-7 drop-shadow-xl rounded-2xl"
          priority
        />
        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight mb-6 text-center leading-tight">
          L&apos;automazione<br />
          <span className="text-blue-700">
            che si fa sentire.
          </span>
        </h1>
        <p className="text-lg sm:text-2xl text-neutral-700 max-w-2xl text-center mb-4">
          Digitalizza il tuo business, con stile.<br />
          <span className="text-blue-700 font-semibold">
            Soluzioni su misura per aziende, creator e ristoranti.
          </span>
        </p>
        {/* Call to action */}
        <div className="mt-4 flex flex-wrap gap-4 justify-center">
          <a
            href="/wa/login"
            className="px-8 py-3 bg-blue-700 text-white font-bold rounded-full shadow-lg hover:bg-blue-900 transition text-lg"
          >
            Prova EHI! Chat Boost
          </a>
          <a
            href="#servizi"
            className="px-8 py-3 bg-white text-blue-700 font-bold rounded-full border border-blue-700 hover:bg-blue-50 transition text-lg"
          >
            Scopri i servizi
          </a>
        </div>
      </header>

      {/* Sezione servizi */}
      <section id="servizi" className="w-full max-w-7xl mx-auto mt-16 px-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-14 tracking-tight">
          I nostri servizi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              icon: "🛒",
              title: "Siti Web & E-commerce",
              text: (
                <>
                  Realizzazione siti professionali e store <b>Shopify</b> su misura.<br />
                  Design, sviluppo, SEO e integrazioni custom.
                </>
              ),
            },
            {
              icon: "🤖",
              title: "Automazioni & Dashboard",
              text: (
                <>
                  App web personalizzate, integrazione API, <b>automazione processi</b>.<br />
                  Dashboard di controllo e gestione avanzata.
                </>
              ),
            },
            {
              icon: "🍽️",
              title: "Smart Menu & Prenotazioni",
              text: (
                <>
                  Menù digitali QR e sistemi per <b>ristoranti e locali</b>.<br />
                  Ordini, prenotazioni e marketing clienti.
                </>
              ),
            },
            {
              icon: "💬",
              title: "EHI! Chat Boost",
              text: (
                <>
                  Automazione WhatsApp, <b>CRM integrato</b> e campagne marketing.<br />
                  <a
                    href="/wa/login"
                    className="inline font-semibold text-blue-700 hover:underline"
                  >
                    Accedi alla piattaforma
                  </a>
                </>
              ),
            },
          ].map(({ icon, title, text }) => (
            <div
              key={title}
              className="flex flex-col items-center rounded-3xl bg-white shadow-xl border border-neutral-200 px-7 py-10 transition hover:shadow-2xl hover:scale-[1.03] hover:border-blue-100 group"
            >
              <span className="text-5xl mb-4">{icon}</span>
              <h3 className="font-semibold text-lg mb-3 text-neutral-800 text-center group-hover:text-blue-700">
                {title}
              </h3>
              <div className="text-gray-600 text-base text-center leading-relaxed">
                {text}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section: About / Trust / Tech */}
      <section className="w-full max-w-5xl mx-auto mt-24 mb-16 px-2">
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
          {/* Block */}
          <div className="flex-1 bg-blue-50/70 rounded-3xl p-8 shadow-xl border border-blue-100 text-center">
            <h4 className="font-bold text-xl mb-2 text-blue-700">Tecnologia 100% Cloud</h4>
            <p className="text-gray-700">
              Tutti i nostri servizi sono ospitati su server sicuri, scalabili e super-veloci.<br />
              <b>No installazioni. Sempre disponibili, ovunque.</b>
            </p>
          </div>
          {/* Block */}
          <div className="flex-1 bg-green-50/60 rounded-3xl p-8 shadow-xl border border-green-100 text-center">
            <h4 className="font-bold text-xl mb-2 text-green-700">Supporto umano &amp; Smart</h4>
            <p className="text-gray-700">
              Parla direttamente con il nostro team.<br />
              Supporto, formazione e consulenza inclusi.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t bg-white py-10 text-center text-gray-500 text-sm mt-12">
        &copy; {new Date().getFullYear()} EHI! Lab · Digital automation by MM GROUP SRL
      </footer>
    </main>
  );
}

