'use client';

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from '@/components/ui/button';
import {
  Loader2, CheckCircle, XCircle, CreditCard, ArrowUpRight,
  User, Mail, Phone, MapPin, Building2, Hash, Globe, Shield
} from 'lucide-react';

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboardingHint, setShowOnboardingHint] = useState(false);
  const [whatsappSpend, setWhatsappSpend] = useState(null);
  const [spendLoading, setSpendLoading] = useState(false);

  const META_SIGNUP_URL = user?.email
    ? `https://www.facebook.com/v18.0/dialog/oauth?client_id=1578488926445019&redirect_uri=https%3A%2F%2Fehi-lab.it%2Fapi%2Fwebhook&state=${encodeURIComponent(user.email)}`
    : "";

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    (async () => {
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        setUserData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (error) {
        console.error("Errore nel recupero dati utente:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!userData?.waba_id) return;
    const accessToken = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return;
    setSpendLoading(true);
    fetch(`https://graph.facebook.com/v18.0/${userData.waba_id}/insights/message_template?fields=spend,currency&access_token=${accessToken}`)
      .then(res => res.json())
      .then(data => { if (data?.data?.[0]) setWhatsappSpend(data.data[0]); })
      .catch(err => console.error("Errore fetch spend:", err))
      .finally(() => setSpendLoading(false));
  }, [userData]);

  const whatsappNum = userData?.whatsappNumber || userData?.numeroWhatsapp || "";
  const isConnected = userData?.waba_id && userData?.phone_number_id && whatsappNum;

  const handleOpenOnboarding = () => {
    window.open(META_SIGNUP_URL, '_blank', 'noopener,noreferrer');
    setShowOnboardingHint(true);
    setTimeout(() => setShowOnboardingHint(false), 8000);
  };

  const infoFields = [
    { label: 'Nome', value: userData?.firstName || userData?.nome, icon: User },
    { label: 'Cognome', value: userData?.lastName || userData?.cognome, icon: User },
    { label: 'Email', value: userData?.email, icon: Mail },
    { label: 'Telefono', value: userData?.personalPhone || userData?.telefono, icon: Phone },
    { label: 'WhatsApp', value: whatsappNum, icon: Phone },
    { label: 'Codice Fiscale', value: userData?.taxCode || userData?.cf, icon: Hash },
    { label: 'Partita IVA', value: userData?.vat || userData?.piva, icon: Hash },
    { label: 'Azienda', value: userData?.company || userData?.azienda, icon: Building2 },
    { label: 'Indirizzo', value: userData?.address || userData?.indirizzo, icon: MapPin },
    { label: 'CAP', value: userData?.cap, icon: MapPin },
    { label: 'Città', value: userData?.citta, icon: Globe },
    { label: 'Provincia', value: userData?.provincia, icon: Globe },
    { label: 'Paese', value: userData?.paese, icon: Globe },
  ];

  const technicalFields = [
    { label: 'Phone Number ID', value: userData?.phone_number_id },
    { label: 'WABA ID', value: userData?.waba_id },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-[Montserrat]">
      {/* Header */}
      <div className="mb-8">
        <span className="badge-premium bg-emerald-100 text-emerald-700 mb-3 inline-flex">Account</span>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Info Utente</h1>
        <p className="text-sm text-slate-400 mt-1">Gestisci il tuo profilo e la connessione WhatsApp</p>
      </div>

      {/* WhatsApp Status Card */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">WhatsApp Business</h2>
          {loading ? (
            <span className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Verifica...
            </span>
          ) : isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
              <CheckCircle size={13} /> Connesso
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-semibold border border-red-200">
              <XCircle size={13} /> Non connesso
            </span>
          )}
        </div>

        {isConnected && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 mb-4">
            <Phone size={16} className="text-emerald-600 shrink-0" />
            <span className="text-sm font-mono text-slate-700">{whatsappNum}</span>
          </div>
        )}

        {!isConnected && !loading && (
          <div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center gap-2"
              onClick={handleOpenOnboarding}
              disabled={!user?.email}
            >
              <ArrowUpRight size={16} /> Connetti WhatsApp
            </Button>
            {showOnboardingHint && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                <strong>Nota:</strong> La procedura si apre in una nuova scheda. Una volta completata, torna qui e aggiorna.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spend KPI */}
      <div className="surface-card p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <CreditCard size={20} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Spesa WhatsApp Business</p>
            {spendLoading ? (
              <span className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                <Loader2 size={13} className="animate-spin" /> Caricamento...
              </span>
            ) : whatsappSpend ? (
              <span className="text-xl font-extrabold text-slate-900">{whatsappSpend.spend} {whatsappSpend.currency}</span>
            ) : (
              <span className="text-sm text-slate-400 mt-1">Nessun dato disponibile</span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Calcolata da Meta su base mensile. Si aggiorna automaticamente.</p>
      </div>

      {/* User Info */}
      <div className="surface-card p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Dati personali</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {infoFields.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <Icon size={14} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm text-slate-800 truncate">{value || '—'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical */}
      <div className="surface-card p-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield size={14} /> Dati tecnici
        </h2>
        <div className="space-y-2">
          {technicalFields.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <span className="text-xs font-mono text-slate-700">{value || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
