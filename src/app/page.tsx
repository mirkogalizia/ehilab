'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const services = [
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
];

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col bg-pattern bg-white overflow-x-hidden">

      {/* HEADER */}
      <header className="w-full flex justify-between items-center py-6 px-8 md:px-20 absolute top-0 left-0 z-20">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="EHI! Lab" width={48} height={48} />
          <span className="font-bold text-xl tracking-tight text-gray-900">EHI! Lab</span>
        </div>
        <a
          href="#servizi"
          className="px-5 py-2 rounded-full bg-black text-white font-semibold hover:bg-gray-900 transition"
        >
          I nostri servizi
        </a>
      </header>

      {/* HERO */}
      <section className="flex flex-col items-center justify-center flex-1 pt-36 md:pt-48 pb-14 px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <Image
            src="/logo.png"
            alt="EHI! Lab Logo"
            width={180}
            height={180}
            className="mx-auto mb-8 drop-shadow-lg"
            priority
          />
          <h1 className="text-3xl md:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight">
            L’automazione che <span className="text-blue-700 bg-blue-50 px-2 rounded">si fa sentire</span>.
          </h1>
          <p className="text-lg md:text-2xl text-gray-700 font-medium mb-8 max-w-2xl mx-auto">
            Digitalizza il tuo business con stile. Dashboard, WhatsApp, automazioni, gestione ordini.<br />
            <span className="text-blue-600 font-bold">Scopri come portiamo la tua azienda su un altro livello.</span>
          </p>
          <a
            href="#servizi"
            className="px-8 py-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold shadow-lg transition"
          >
            Inizia ora
          </a>
        </motion.div>
        {/* sfondo gradient + grid */}
        <div className="absolute inset-0 z-[-1] bg-gradient-to-b from-blue-50/60 via-white/90 to-white/90 pointer-events-none" />
      </section>

      {/* SERVIZI */}
      <section
        id="servizi"
        className="w-full max-w-6xl mx-auto px-4 pb-24"
      >
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="text-2xl md:text-4xl font-bold text-center mb-16 tracking-tight"
        >
          I nostri servizi
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {services.map(({ icon, title, text }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.15 }}
              className="rounded-3xl bg-white/80 border border-blue-100 shadow-xl hover:scale-[1.03] hover:shadow-2xl transition p-10 flex flex-col items-center group backdrop-blur-md"
            >
              <span className="text-5xl mb-6 drop-shadow">{icon}</span>
              <h3 className="font-bold text-xl md:text-2xl text-neutral-900 text-center mb-3 group-hover:text-blue-600 transition">{title}</h3>
              <div className="text-gray-600 text-base text-center">{text}</div>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}


