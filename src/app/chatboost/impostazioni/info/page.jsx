'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, CreditCard } from 'lucide-react';

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

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
    // Serve sia waba_id che access token
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

  // WhatsApp number compatibilità nomi campo
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
          Connesso - {whatsappNum}
          <span className="ml-2 inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded-lg text-xs">Attivo</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 text-red-500 text-sm font-medium">
        <XCircle className="w-4 h-4" />
        Non connesso
        <span className="ml-2 inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded-lg text-xs">Assente</span>
      </span>
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-5 text-green-700">📄 Info Utente</h1>

      {/* Box WhatsApp stato e signup */}
      <div className="bg-white shadow-lg rounded-2xl p-6 mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-lg text-gray-800">WhatsApp</span>
          {renderWhatsAppStatus()}
        </div>
        {(!userData?.waba_id || !userData?.phone_number_id || !whatsappNum) && (
          <Button
            className="mt-2 w-fit font-bold"
            onClick={() => setShowSignup(true)}
            disabled={!user?.email}
          >
            Connetti WhatsApp
          </Button>
        )}
        {showSignup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl relative">
              <button
                className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-2xl"
                onClick={() => setShowSignup(false)}
                aria-label="Chiudi"
              >
                ×
              </button>
              <h3 className="text-xl font-bold mb-4">Onboarding WhatsApp</h3>
              <iframe
                src={META_SIGNUP_URL}
                width="100%"
                height={600}
                frameBorder={0}
                className="rounded-xl"
                title="Embedded WhatsApp Signup"
              />
              <div className="mt-2 text-center text-gray-400 text-xs">
                Completa la registrazione WhatsApp nella finestra qui sopra.
              </div>
            </div>
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
        <div><strong>Nome:</strong> {userData?.firstName || userData?.nome}</div>
        <div><strong>Cognome:</strong> {userData?.lastName || userData?.cognome}</div>
        <div><strong>Email:</strong> {userData?.email}</div>
        <div><strong>Telefono:</strong> {userData?.personalPhone || userData?.telefono}</div>
        <div><strong>Numero WhatsApp:</strong> {whatsappNum}</div>
        <div><strong>CF:</strong> {userData?.taxCode || userData?.cf}</div>
        <div><strong>Partita IVA:</strong> {userData?.vat || userData?.piva}</div>
        <div><strong>Azienda:</strong> {userData?.company || userData?.azienda}</div>
        <div><strong>Indirizzo:</strong> {userData?.address || userData?.indirizzo}</div>
        <div><strong>CAP:</strong> {userData?.cap}</div>
        <div><strong>Città:</strong> {userData?.citta}</div>
        <div><strong>Provincia:</strong> {userData?.provincia}</div>
        <div><strong>Paese:</strong> {userData?.paese}</div>
        <div><strong>Phone Number ID:</strong> {userData?.phone_number_id}</div>
        <div><strong>WABA ID:</strong> {userData?.waba_id}</div>
      </div>
    </div>
  );
}


