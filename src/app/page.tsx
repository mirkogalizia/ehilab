''use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

// ICONS SVG INLINE — palette Google
const icons = {
  ecommerce: (
    <svg width={44} height={44} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#4285F4"/>
      <path d="M16 32V20C16 18.8954 16.8954 18 18 18H30C31.1046 18 32 18.8954 32 20V32" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      <rect x="18" y="24" width="12" height="8" rx="2" fill="#fff"/>
      <circle cx="20.5" cy="28.5" r="1.5" fill="#4285F4"/>
      <circle cx="27.5" cy="28.5" r="1.5" fill="#4285F4"/>
    </svg>
  ),
  automation: (
    <svg width={44} height={44} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#34A853"/>
      <rect x="17" y="17" width="14" height="14" rx="2" fill="#fff"/>
      <circle cx="24" cy="24" r="4" fill="#34A853"/>
      <path d="M24 17V13M24 35V31M17 24H13M35 24H31" stroke="#fff" strokeWidth="2"/>
    </svg>
  ),
  menu: (
    <svg width={44} height={44} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#FBBC05"/>
      <rect x="16" y="17" width="16" height="3" rx="1.5" fill="#fff"/>
      <rect x="16" y="23" width="16" height="3" rx="1.5" fill="#fff"/>
      <rect x="16" y="29" width="16" height="3" rx="1.5" fill="#fff"/>
    </svg>
  ),
  chat: (
    <svg width={44} height={44} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#EA4335"/>
      <rect x="13" y="16" width="22" height="16" rx="4" fill="#fff"/>
      <path d="M19 32L17 36" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="19" cy="24" r="2" fill="#EA4335"/>
      <circle cx="24" cy="24" r="2" fill="#EA4335"/>
      <circle cx="29" cy="24" r="2" fill="#EA4335"/>
    </svg>
  ),
};

const services = [
  {
    icon: icons.ecommerce,
    color: "from-blue-500/80 via-blue-400/90 to-blue-300/80",
    title: "Siti Web & E-commerce",
    text: "Realizziamo siti professionali e store Shopify tailor made, ottimizzati per la crescita.",
  },
  {
    icon: icons.automation,
    color: "from-green-500/80 via-green-400/90 to-green-300/80",
    title: "Automazioni & Dashboard",
    text: "App web, CRM, API, automazioni e flussi smart per aziende moderne.",
  },
  {
    icon: icons.menu,
    color: "from-yellow-400/80 via-yellow-300/90 to-yellow-200/80",
    title: "Smart Menu & Prenotazioni",
    text: "Menù digitali QR, booking avanzati, gestione clienti per ristoranti e locali.",
  },
  {
    icon: icons.chat,
    color: "from-red-500/80 via-red-400/90 to-orange-300/80",
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
    <main className="min-h-screen w-full flex flex-col bg-pattern bg-white overflow-x-hidden font-[Montserrat]">
      {/* HEADER */}
      <header className="w-full flex justify-between items-center py-6 px-6 md:px-20 absolute top-0 left-0 z-20">
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
        {/* sfondo gradient */}
        <div className="absolute inset-0 z-[-1] bg-gradient-to-b from-blue-50/80 via-white/90 to-white/95 pointer-events-none" />
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
          {services.map(({ icon, color, title, text }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.12 }}
              className={`
                rounded-3xl border-0
                shadow-2xl hover:shadow-[0_10px_80px_0_rgba(0,0,0,0.12)]
                hover:scale-105 group transition
                p-10 flex flex-col items-center backdrop-blur-md
                bg-gradient-to-br ${color}
              `}
            >
              <div className="mb-6 drop-shadow-xl group-hover:scale-110 transition">{icon}</div>
              <h3 className="font-bold text-lg md:text-2xl text-white text-center mb-3 drop-shadow-md group-hover:text-yellow-200 transition">
                {title}
              </h3>
              <div className="text-white/80 text-base text-center drop-shadow-sm">{text}</div>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}


