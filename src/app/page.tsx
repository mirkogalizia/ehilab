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

      {/* Sezione servizi */}
      <section className="w-full max-w-3xl mx-auto mt-4">
        <h2 className="text-2xl font-bold text-center mb-8">I nostri servizi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="rounded-2xl bg-neutral-50 shadow p-6 text-center">
            <span className="text-3xl mb-2 inline-block">🛒</span>
            <h3 className="font-semibold text-lg mb-1">Siti Web & E-commerce</h3>
            <p className="text-gray-600 text-sm">
              Realizzazione siti professionali e store Shopify su misura.
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 shadow p-6 text-center">
            <span className="text-3xl mb-2 inline-block">🤖</span>
            <h3 className="font-semibold text-lg mb-1">Automazioni & Dashboard</h3>
            <p className="text-gray-600 text-sm">
              App web personalizzate, integrazione API e automazione processi.
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 shadow p-6 text-center">
            <span className="text-3xl mb-2 inline-block">🍽️</span>
            <h3 className="font-semibold text-lg mb-1">Smart Menu & Prenotazioni</h3>
            <p className="text-gray-600 text-sm">
              Menù digitali QR e sistemi smart per la gestione clienti.
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 shadow p-6 text-center">
            <span className="text-3xl mb-2 inline-block">💬</span>
            <h3 className="font-semibold text-lg mb-1">EHI! Chat Boost</h3>
            <p className="text-gray-600 text-sm">
              Automazione WhatsApp, CRM integrato e campagne marketing.<br />
              Rispondi ai clienti, invia offerte e gestisci tutto da una dashboard unica.
            </p>
            <a
              href="/chat-boost"
              className="mt-3 inline-block font-semibold text-blue-600 hover:underline"
            >
              Scopri la piattaforma
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
