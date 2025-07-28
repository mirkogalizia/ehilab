'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const services = [
  {
    icon: "💬",
    title: "WhatsApp Marketing Platform",
    text: "Automazione completa: reminder, campagne, raccolta recensioni, funnel e CRM.",
  },
  {
    icon: "🛒",
    title: "Siti Web & E-commerce",
    text: "Realizzazione siti moderni e shop Shopify con automazioni integrate.",
  },
  {
    icon: "🤖",
    title: "Automazioni Business",
    text: "App web, integrazioni API e processi digitali su misura per la tua azienda.",
  },
  {
    icon: "🍽️",
    title: "Smart Menu QR",
    text: "Menù digitali per ristoranti, prenotazioni e ordini touch-free.",
  },
  {
    icon: "⭐",
    title: "Dashboard Recensioni",
    text: "Raccolta recensioni a pagamento, landing e area VIP con missioni.",
  },
  {
    icon: "🚀",
    title: "Performance Ads & Analytics",
    text: "Gestione campagne Google & Meta, dashboard analytics e lead generation locale.",
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center bg-[#f7f8fa] overflow-x-hidden font-[Geist,sans-serif]">

      {/* HERO SECTION */}
      <section className="relative flex flex-col items-center justify-center w-full min-h-[70vh] pt-16 px-4 md:pt-24 select-none z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center"
        >
          <Image
            src="/logo.png"
            alt="EHI! Lab"
            width={128}
            height={128}
            priority
            className="mb-8 drop-shadow-2xl"
          />
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-gray-900 text-center leading-tight mb-6">
            L'automazione <span className="text-blue-600">che si fa sentire</span>
          </h1>
          <p className="text-lg md:text-2xl text-gray-700 text-center mb-6 max-w-2xl">
            Digitalizza il tuo business, <span className="font-semibold text-blue-600">con stile</span>.<br />
            Soluzioni professionali per marketing, customer care e automazioni aziendali.
          </p>
          <div className="flex gap-4 mt-2">
            <a
              href="/wa/login"
              className="rounded-full bg-blue-600 hover:bg-blue-700 transition px-7 py-3 text-white text-base font-semibold shadow-lg"
            >
              Prova Chat Boost
            </a>
            <a
              href="#servizi"
              className="rounded-full bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 transition px-7 py-3 text-base font-semibold shadow"
            >
              Scopri i servizi
            </a>
          </div>
        </motion.div>

        {/* sfondo animato */}
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="blur-[80px] w-[70vw] h-[40vw] md:w-[45vw] md:h-[22vw] bg-gradient-to-tr from-blue-100/60 via-blue-300/20 to-purple-100/30 rounded-full opacity-90" />
        </div>
      </section>

      {/* SERVIZI */}
      <section id="servizi" className="relative w-full py-20 px-4 md:px-0 z-10">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-3xl md:text-4xl font-bold text-center mb-12 text-gray-900 tracking-tight"
        >
          I nostri servizi
        </motion.h2>
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((srv, i) => (
            <motion.div
              key={srv.title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="flex flex-col items-center bg-white rounded-3xl border border-neutral-200 shadow-xl hover:shadow-2xl transition p-8 group"
            >
              <span className="text-4xl mb-5 group-hover:scale-110 transition-transform">{srv.icon}</span>
              <h3 className="font-semibold text-lg mb-3 text-neutral-900 text-center">{srv.title}</h3>
              <div className="text-gray-600 text-sm text-center">{srv.text}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* VANTAGGI/INFO */}
      <section className="w-full py-14 px-4 md:px-0 bg-gradient-to-tr from-blue-50 via-white to-blue-100 border-t border-b border-blue-100">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 items-center">
          <div>
            <h3 className="font-bold text-lg mb-2 text-blue-700">Veloce, modulare, su misura</h3>
            <p className="text-gray-600 text-base">
              Sviluppiamo soluzioni personalizzate per ogni esigenza: dalla semplice automazione WhatsApp a CRM e dashboard avanzate.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-2 text-blue-700">Automatizza, semplifica, scala</h3>
            <p className="text-gray-600 text-base">
              Dimentica processi manuali e sprechi di tempo: digitalizza la gestione clienti, vendite e marketing.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-2 text-blue-700">Supporto diretto & locale</h3>
            <p className="text-gray-600 text-base">
              Lavoriamo da Modena: appuntamenti, consulenza, formazione, assistenza tecnica rapida.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full flex flex-col items-center py-16 px-4 md:px-0 bg-white">
        <motion.h3
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-2xl md:text-3xl font-bold text-center mb-6"
        >
          Porta il tuo business <span className="text-blue-600">nel futuro</span>
        </motion.h3>
        <a
          href="/wa/login"
          className="rounded-full bg-blue-600 hover:bg-blue-700 transition px-9 py-4 text-white text-lg font-semibold shadow-lg"
        >
          Inizia ora
        </a>
      </section>

      {/* FOOTER */}
      <footer className="w-full text-center text-xs text-gray-400 py-8 px-2">
        © {new Date().getFullYear()} EHI! Lab - MM GROUP SRL | P.IVA 03970420364 | Modena
      </footer>
    </main>
  );
}

