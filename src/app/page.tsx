import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white font-sans px-4 sm:px-8">
      {/* Logo grande e frase */}
      <Image
        src="/logo.png"
        alt="EHI! Lab Logo"
        width={320}
        height={320}
        className="mb-12"
        priority
      />
      <p className="text-3xl sm:text-4xl font-semibold text-neutral-900 max-w-3xl text-center tracking-tight mb-14 leading-snug">
        L’automazione che si fa sentire.<br />
        <span className="text-blue-600 font-extrabold">Digitalizza il tuo business, con stile.</span>
      </p>

      {/* Sezione servizi */}
      <section className="w-full max-w-6xl mx-auto">
        <h2 className="text-3xl font-extrabold text-center mb-12 tracking-tight text-neutral-900">
          I nostri servizi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
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
                    href="/wa/login"
                    className="inline font-semibold text-blue-600 hover:underline"
                  >
                    Accedi alla piattaforma
                  </a>
                </>
              ),
            },
          ].map(({ icon, title, text }) => (
            <article
              key={title}
              className="flex flex-col items-center rounded-3xl bg-white shadow-lg border border-neutral-200 p-8 hover:shadow-2xl transition-shadow duration-300"
            >
              <span className="text-5xl mb-5">{icon}</span>
              <h3 className="font-semibold text-xl mb-4 text-neutral-900 text-center">{title}</h3>
              <p className="text-gray-700 text-base text-center">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

