import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center bg-gradient-to-br from-[#e1eaff] to-[#faf6ff] pb-16 font-[Montserrat]">
      {/* HERO */}
      <section className="pt-12 pb-6 flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="EHI! Lab Logo"
          width={120}
          height={120}
          className="mb-5 drop-shadow-lg animate-bounce-slow"
          priority
        />
        <h1 className="text-3xl sm:text-5xl font-extrabold text-center tracking-tight text-neutral-900 mb-2">
          L’automazione che <span className="text-blue-600 animate-pulse">si fa sentire</span>
        </h1>
        <p className="text-lg sm:text-2xl text-center text-neutral-700 font-semibold mb-6 max-w-xl">
          Digitalizza il tuo business, <span className="text-blue-600 font-bold">con stile.</span>
        </p>
        <Link href="#contattaci">
          <button className="bg-blue-600 text-white text-lg px-7 py-3 rounded-full font-bold shadow-lg hover:bg-blue-700 transition-all animate-pop-in">
            Prenota una demo gratuita
          </button>
        </Link>
      </section>

      {/* SERVIZI */}
      <section className="w-full max-w-6xl mx-auto mt-6 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 tracking-tight">
          I nostri servizi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
          {[
            {
              icon: "🛒",
              title: "Siti Web & E-commerce",
              text: "Realizzazione siti professionali e store Shopify su misura.",
            },
            {
              icon: "🤖",
              title: "Automazioni & Dashboard",
              text: "Automazioni WhatsApp, dashboard su misura, integrazione API.",
            },
            {
              icon: "🍽️",
              title: "Smart Menu & Prenotazioni",
              text: "Menu digitali QR, prenotazioni smart e gestione clienti.",
            },
            {
              icon: "💬",
              title: "EHI! Chat Boost",
              text: (
                <>
                  Customer care WhatsApp e campagne marketing automatizzate.<br />
                  <a
                    href="/wa/login"
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Accedi alla piattaforma
                  </a>
                </>
              ),
            },
          ].map(({ icon, title, text }) => (
            <div
              key={title}
              className="flex flex-col items-center bg-white rounded-3xl shadow-xl border border-neutral-200 px-6 py-8 transition hover:shadow-2xl hover:-translate-y-1 hover:scale-105 duration-200 animate-fade-in"
            >
              <span className="text-5xl mb-3 animate-wiggle">{icon}</span>
              <h3 className="font-semibold text-lg mb-2 text-neutral-800 text-center">{title}</h3>
              <div className="text-gray-600 text-sm text-center">{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SHOWCASE */}
      <section className="w-full max-w-4xl mx-auto mt-16 mb-8 px-4">
        <h3 className="text-xl font-bold mb-6 text-center text-neutral-900">Guarda cosa puoi fare con EHI! Lab</h3>
        {/* Qui metti carousel con screenshot, esempio: */}
        <div className="flex flex-row justify-center gap-6 overflow-x-auto">
          <Image src="/mockup1.png" alt="Dashboard EHI" width={240} height={160} className="rounded-xl shadow-lg" />
          <Image src="/mockup2.png" alt="Menu QR" width={240} height={160} className="rounded-xl shadow-lg" />
          <Image src="/mockup3.png" alt="Chat WhatsApp" width={240} height={160} className="rounded-xl shadow-lg" />
        </div>
      </section>

      {/* PERCHÉ SCEGLIERCI */}
      <section className="w-full max-w-3xl mx-auto mb-14 px-4">
        <div className="rounded-3xl bg-white shadow-2xl border border-blue-100 p-7 flex flex-col items-center text-center gap-3 animate-pop-in">
          <span className="text-2xl font-extrabold text-blue-600 mb-2">Perché scegliere EHI! Lab?</span>
          <ul className="flex flex-wrap justify-center gap-6 mt-2">
            {[
              "Automazione facile e su misura",
              "Gestione umana e reale (niente bot invadenti)",
              "Integrazione con Shopify, WhatsApp, ristoranti e molto altro",
              "Supporto italiano sempre presente",
            ].map(x => (
              <li key={x} className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg font-medium shadow">
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA FINALE */}
      <section id="contattaci" className="w-full flex flex-col items-center mt-4">
        <div className="bg-blue-600 rounded-full py-6 px-10 shadow-2xl flex flex-col items-center gap-2 animate-fade-in">
          <span className="text-2xl font-bold text-white">Contattaci ora!</span>
          <a
            href="https://wa.me/393664116232"
            target="_blank"
            rel="noopener"
            className="mt-2 bg-white text-blue-700 px-8 py-2 rounded-full font-bold shadow hover:bg-blue-100 transition"
          >
            Scrivici su WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
