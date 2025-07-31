'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, CreditCard, ArrowUpRight } from 'lucide-react';

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboardingHint, setShowOnboardingHint] = useState(false);

  // KPI WhatsApp Spend
  const [whatsappSpend, setWhatsappSpend] = useState(null);
  const [spendLoading, setSpendLoading] = useState(false);

  // Meta signup URL
  const META_SIGNUP_URL = user?.email
    ? `https://www.facebook.com/v18.0/dialog/oauth?client_id=1578488926445019&redirect_uri=https%3A%2F%2Fehi-lab.it%2Fapi%2Fwebhook&state=${encodeURIComponent(user.email)}`
    : "";

  // Load user data
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const fetchUserData = async () => {
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        setUserData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (error) {
        console.error("Errore nel recupero dati utente:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user]);

  // Load WhatsApp spend KPI via Meta API
  useEffect(() => {
    if (!userData?.waba_id) return;
    const accessToken = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return;
    setSpendLoading(true);
    fetch(
      `https://graph.facebook.com/v18.0/${userData.waba_id}/insights/message_template?fields=spend,currency&access_token=${accessToken}`
    )
      .then(res => res.json())
      .then(data => {
        if (data && data.data && data.data[0]) {
          setWhatsappSpend(data.data[0]);
        }
      })
      .catch((err) => {
        console.error("Errore fetch spend WhatsApp:", err);
      })
      .finally(() => setSpendLoading(false));
  }, [userData]);

  const whatsappNum = userData?.whatsappNumber || userData?.numeroWhatsapp || "";

  // Stato WhatsApp
  const renderWhatsAppStatus = () => {
    if (loading) {
      return (
        <span className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin" /> Caricamento stato WhatsApp...
        </span>
      );
    }
    if (userData?.waba_id && userData?.phone_number_id && whatsappNum) {
      return (
        <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Connesso
          <span className="ml-2 text-gray-700 font-normal">{whatsappNum}</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 text-red-500 text-sm font-medium">
        <XCircle className="w-4 h-4" />
        Non connesso
      </span>
    );
  };

  // Onboarding WhatsApp: sempre nuova scheda!
  const handleOpenOnboarding = () => {
    window.open(META_SIGNUP_URL, '_blank', 'noopener,noreferrer');
    setShowOnboardingHint(true);
    setTimeout(() => setShowOnboardingHint(false), 8000);
  };

  return (
    <div className="max-w-2xl mx-auto px-2 py-8 sm:py-10">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-green-700 flex items-center gap-2">
        <span>📄</span> Info Utente
      </h1>

      {/* Box WhatsApp stato e signup */}
      <div className="bg-white shadow-lg rounded-2xl p-6 mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <span className="font-semibold text-lg text-gray-800">WhatsApp</span>
          {renderWhatsAppStatus()}
        </div>
        {(!userData?.waba_id || !userData?.phone_number_id || !whatsappNum) && (
          <div>
            <Button
              className="mt-2 w-fit font-bold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleOpenOnboarding}
              disabled={!user?.email}
            >
              <ArrowUpRight size={18} /> Connetti WhatsApp
            </Button>
            {showOnboardingHint && (
              <div className="text-sm mt-3 text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 shadow-sm">
                <b>Nota:</b> la procedura di collegamento si apre sempre in una nuova scheda per motivi di sicurezza Meta.<br />
                Una volta completata, torna su questa pagina e aggiorna per vedere lo stato.
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI WhatsApp Spend */}
      <div className="bg-gradient-to-r from-green-50 via-emerald-100 to-white rounded-2xl shadow flex items-center gap-4 px-5 py-4 mb-8 border border-emerald-200">
        <CreditCard className="w-8 h-8 text-emerald-500 drop-shadow" />
        <div className="flex flex-col">
          <span className="text-sm text-gray-500 font-semibold mb-1">Spesa WhatsApp Business</span>
          {spendLoading ? (
            <span className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="animate-spin w-4 h-4" /> Caricamento...
            </span>
          ) : whatsappSpend ? (
            <span className="text-xl font-bold text-emerald-700">
              {whatsappSpend.spend} {whatsappSpend.currency}
            </span>
          ) : (
            <span className="text-gray-500 text-sm">Nessun dato disponibile</span>
          )}
        </div>
      </div>
      <div className="mb-8 text-xs text-gray-400 px-2">
        La spesa è calcolata da Meta/WhatsApp su base mensile e include i costi dei messaggi a pagamento inviati tramite questa piattaforma.
        <br />
        <span className="text-emerald-600 font-semibold">Il valore si aggiorna automaticamente dalle API Meta.</span>
      </div>

      {/* DATI UTENTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 bg-white p-6 rounded-2xl shadow">
        <div><strong>Nome:</strong> {userData?.firstName || userData?.nome || "-"}</div>
        <div><strong>Cognome:</strong> {userData?.lastName || userData?.cognome || "-"}</div>
        <div><strong>Email:</strong> {userData?.email || "-"}</div>
        <div><strong>Telefono:</strong> {userData?.personalPhone || userData?.telefono || "-"}</div>
        <div><strong>Numero WhatsApp:</strong> {whatsappNum || "-"}</div>
        <div><strong>CF:</strong> {userData?.taxCode || userData?.cf || "-"}</div>
        <div><strong>Partita IVA:</strong> {userData?.vat || userData?.piva || "-"}</div>
        <div><strong>Azienda:</strong> {userData?.company || userData?.azienda || "-"}</div>
        <div><strong>Indirizzo:</strong> {userData?.address || userData?.indirizzo || "-"}</div>
        <div><strong>CAP:</strong> {userData?.cap || "-"}</div>
        <div><strong>Città:</strong> {userData?.citta || "-"}</div>
        <div><strong>Provincia:</strong> {userData?.provincia || "-"}</div>
        <div><strong>Paese:</strong> {userData?.paese || "-"}</div>
        <div><strong>Phone Number ID:</strong> {userData?.phone_number_id || "-"}</div>
        <div><strong>WABA ID:</strong> {userData?.waba_id || "-"}</div>
      </div>
    </div>
  );
}

