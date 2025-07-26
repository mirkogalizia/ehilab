import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white font-sans">
      {/* Logo grande e frase */}
      <Image
        src="/logo.png"
        alt="EHI! Lab Logo"
        width={400}
        height={400}
        className="mb-10"
        priority
      />
      <p className="text-2xl font-semibold text-neutral-800 max-w-xl text-center tracking-tight mb-10">
        L’automazione che si fa sentire.<br />
        <span className="text-blue-600 font-bold">
          Digitalizza il tuo business, con stile.
        </span>
      </p>

      {/* Sezione servizi uniforme */}
      <section className="w-full max-w-5xl mx-auto mt-8 px-2">
        <h2 className="text-2xl font-bold text-center mb-10 tracking-tight">I nostri servizi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: "🛒",
              title: "Siti Web & E-commerce",
              text: "Realizzazione siti professionali e store Shopify su misura.",
            },
            {
              icon: "🤖",
              title: "Automazioni & Dashboard",
              text: "App web personalizzate, integrazione API e automazione processi.",
            },
            {
              icon: "🍽️",
              title: "Smart Menu & Prenotazioni",
              text: "Menù digitali QR e sistemi smart per la gestione clienti.",
            },
            {
              icon: "💬",
              title: "EHI! Chat Boost",
              text: (
                <>
                  Automazione WhatsApp, CRM integrato e campagne marketing.<br />
                  <a
                    href="/chat-boost"
                    className="inline font-semibold text-blue-600 hover:underline"
                  >
                    Scopri la piattaforma
                  </a>
                </>
              ),
            },
          ].map(({ icon, title, text }) => (
            <div
              key={title}
              className="flex flex-col items-center rounded-3xl bg-white shadow-xl border border-neutral-200 px-6 py-8 transition hover:shadow-2xl"
            >
              <span className="text-4xl mb-4">{icon}</span>
              <h3 className="font-semibold text-lg mb-3 text-neutral-800 text-center">{title}</h3>
              <div className="text-gray-600 text-sm text-center">{text}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

