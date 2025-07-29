'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const services = [
  {
    icon: '/icons/web.svg',
    bg: 'from-[#5eead4] via-[#38bdf8] to-[#6366f1]',
    title: 'Siti Web & E-commerce',
    text: 'Realizzazione siti professionali e store Shopify su misura. Design responsive, UX premium e conversioni garantite.',
  },
  {
    icon: '/icons/robot.svg',
    bg: 'from-[#fbbf24] via-[#fb7185] to-[#6366f1]',
    title: 'Automazioni & Dashboard',
    text: 'App web personalizzate, integrazione API e automazione processi aziendali. Tutto su misura, tutto automatizzato.',
  },
  {
    icon: '/icons/menu.svg',
    bg: 'from-[#a7f3d0] via-[#fde68a] to-[#60a5fa]',
    title: 'Smart Menu & Prenotazioni',
    text: 'Menù digitali QR, ordini smart e sistemi per la gestione clienti. Esperienza moderna per ristoranti e locali.',
  },
  {
    icon: '/icons/whatsapp.svg',
    bg: 'from-[#4ade80] via-[#fbbf24] to-[#818cf8]',
    title: 'EHI! Chat Boost',
    text: (
      <>
        Automazione WhatsApp, CRM integrato e campagne marketing.<br />
        <a
          href="/wa/login"
          className="inline font-semibold text-blue-600 hover:underline transition"
        >
          Accedi alla piattaforma
        </a>
      </>
    ),
  },
];

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#f5f6ff] via-[#e0e7ff] to-[#e0f2fe] font-[Montserrat]">
      {/* Logo + headline */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, type: "spring" }}
        className="flex flex-col items-center mt-8 mb-4"
      >
        <Image
          src="/logo.png"
          alt="EHI! Lab Logo"
          width={600}
          height={600}
          className="mb-6"
          priority
        />
        <motion.h1
          className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.7 }}
        >
          L’automazione che si fa sentire.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-400 to-purple-600">
            Digitalizza il tuo business, con stile.
          </span>
        </motion.h1>
        <p className="text-lg sm:text-xl text-neutral-700 text-center max-w-2xl mb-4">
          Siamo la <span className="font-semibold text-sky-600">web agency</span> specializzata in soluzioni digitali, marketing, automazione e CRM WhatsApp per aziende che vogliono davvero distinguersi.
        </p>
        <motion.a
          href="#servizi"
          className="mt-2 px-6 py-3 rounded-full bg-black text-white font-semibold text-base shadow-lg hover:scale-105 hover:bg-sky-800 transition active:scale-95"
          whileHover={{ scale: 1.05 }}
        >
          Scopri i nostri servizi
        </motion.a>
      </motion.div>

      {/* Sezione servizi */}
      <section
        id="servizi"
        className="w-full max-w-6xl mx-auto mt-12 px-2 flex-1"
      >
        <motion.h2
          className="text-2xl sm:text-3xl font-bold text-center mb-10 tracking-tight"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.8 }}
        >
          I nostri servizi
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
          {services.map(({ icon, bg, title, text }) => (
            <motion.div
              key={title}
              className={`flex flex-col items-center rounded-3xl shadow-xl border border-neutral-200 px-7 py-10 bg-gradient-to-br ${bg} hover:scale-[1.04] transition cursor-pointer min-h-[340px]`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, type: "spring" }}
            >
              <div className="w-16 h-16 flex items-center justify-center mb-4 bg-white/70 rounded-full shadow-xl border border-white">
                <Image
                  src={icon}
                  width={40}
                  height={40}
                  alt=""
                  className="object-contain"
                />
              </div>
              <h3 className="font-semibold text-lg mb-3 text-neutral-900 text-center drop-shadow-sm">
                {title}
              </h3>
              <div className="text-gray-800 text-[15px] text-center">{text}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-20 mb-8 text-center text-neutral-500 text-sm w-full">
        © {new Date().getFullYear()} <b>EHI! Lab</b> · Digital automation & web agency – P.IVA 03970420364
      </footer>
    </main>
  );
}


