'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowRight, Globe, Zap, UtensilsCrossed, MessageCircle } from 'lucide-react';

const services = [
  {
    icon: Globe,
    gradient: 'from-emerald-400 via-teal-400 to-cyan-500',
    iconBg: 'bg-emerald-500',
    title: 'Siti Web & E-commerce',
    text: 'Realizzazione siti professionali e store Shopify su misura. Design responsive, UX premium e conversioni garantite.',
  },
  {
    icon: Zap,
    gradient: 'from-amber-400 via-orange-400 to-rose-500',
    iconBg: 'bg-amber-500',
    title: 'Automazioni & Dashboard',
    text: 'App web personalizzate, integrazione API e automazione processi aziendali. Tutto su misura, tutto automatizzato.',
  },
  {
    icon: UtensilsCrossed,
    gradient: 'from-lime-400 via-emerald-400 to-teal-500',
    iconBg: 'bg-lime-500',
    title: 'Smart Menu & Prenotazioni',
    text: 'Menù digitali QR, ordini smart e sistemi per la gestione clienti. Esperienza moderna per ristoranti e locali.',
  },
  {
    icon: MessageCircle,
    gradient: 'from-green-400 via-emerald-400 to-cyan-500',
    iconBg: 'bg-green-500',
    title: 'EHI! Chat Boost',
    text: 'Automazione WhatsApp, CRM integrato e campagne marketing.',
    cta: { label: 'Accedi alla piattaforma', href: '/wa/login' },
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center bg-[var(--surface-1)] font-[Montserrat] overflow-hidden relative">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-emerald-200/40 via-cyan-200/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-[400px] h-[400px] bg-gradient-to-br from-indigo-200/30 via-purple-200/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-gradient-to-br from-amber-200/25 via-rose-200/15 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-5xl mx-auto px-4 pt-12 pb-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex flex-col items-center"
        >
          <Image
            src="/logo.png"
            alt="EHI! Lab Logo"
            width={280}
            height={280}
            className="mb-8 drop-shadow-lg"
            priority
          />

          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 text-center leading-[1.1]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
          >
            L&apos;automazione che
            <br />
            <span className="gradient-text">si fa sentire.</span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-slate-600 text-center max-w-2xl mb-8 leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Siamo la{' '}
            <span className="font-semibold text-emerald-600">web agency</span>{' '}
            specializzata in soluzioni digitali, marketing, automazione e CRM
            WhatsApp per aziende che vogliono davvero distinguersi.
          </motion.p>

          <motion.a
            href="#servizi"
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-slate-900 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-300 hover:bg-slate-800"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Scopri i nostri servizi
            <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
          </motion.a>
        </motion.div>
      </div>

      {/* Services Section */}
      <section
        id="servizi"
        className="relative z-10 w-full max-w-6xl mx-auto mt-16 px-4 flex-1 pb-8"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="badge-premium bg-emerald-100 text-emerald-700 mb-4 inline-flex">
            Servizi
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Tutto ciò di cui hai bisogno
          </h2>
          <p className="mt-3 text-slate-500 text-lg max-w-xl mx-auto">
            Soluzioni digitali complete per far crescere il tuo business
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {services.map(({ icon: Icon, gradient, iconBg, title, text, cta }) => (
            <motion.div
              key={title}
              variants={cardVariants}
              className="group relative flex flex-col rounded-2xl bg-white border border-slate-200/80 p-6 pt-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden"
            >
              {/* Gradient top accent */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} opacity-80 group-hover:opacity-100 transition-opacity`} />

              {/* Icon */}
              <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${iconBg} text-white shadow-md mb-5`}>
                <Icon size={24} strokeWidth={2} />
              </div>

              {/* Content */}
              <h3 className="font-bold text-lg mb-2 text-slate-900">
                {title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed flex-1">
                {text}
              </p>

              {/* CTA link */}
              {cta && (
                <a
                  href={cta.href}
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  {cta.label}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </a>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full py-8 mt-12 border-t border-slate-200/60">
        <div className="text-center text-slate-400 text-sm">
          © {new Date().getFullYear()}{' '}
          <span className="font-bold text-slate-600">EHI! Lab</span> · Digital
          automation &amp; web agency – P.IVA 03970420364
        </div>
      </footer>
    </main>
  );
}
