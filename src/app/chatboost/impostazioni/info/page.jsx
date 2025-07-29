'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  // Costruzione URL Meta signup (passa email via state)
  const META_SIGNUP_URL = user?.email
    ? `https://www.facebook.com/v18.0/dialog/oauth?client_id=1578488926445019&redirect_uri=https%3A%2F%2Fehi-lab.it%2Fapi%2Fwebhook&state=${encodeURIComponent(user.email)}`
    : "";

  // Recupero dati utente Firestore SOLO by UID
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

  // Aggiorna stato WhatsApp
  const renderWhatsAppStatus = () => {
    if (loading) {
      return (
        <span className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin" /> Caricamento stato WhatsApp...
        </span>
      );
    }
    if (userData?.waba_id && userData?.phone_number_id && userData?.numeroWhatsapp) {
      return (
        <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Connesso - {userData.numeroWhatsapp}
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
        {/* Bottone signup solo se non connesso */}
        {(!userData?.waba_id || !userData?.phone_number_id || !userData?.numeroWhatsapp) && (
          <Button
            className="mt-2 w-fit font-bold"
            onClick={() => setShowSignup(true)}
            disabled={!user?.email}
          >
            Connetti WhatsApp
          </Button>
        )}
        {/* Modal embedded signup */}
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

      {/* DATI UTENTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 bg-white p-6 rounded-2xl shadow">
        <div><strong>Nome:</strong> {userData?.nome}</div>
        <div><strong>Cognome:</strong> {userData?.cognome}</div>
        <div><strong>Email:</strong> {userData?.email}</div>
        <div><strong>Telefono:</strong> {userData?.telefono}</div>
        <div><strong>Numero WhatsApp:</strong> {userData?.numeroWhatsapp}</div>
        <div><strong>CF:</strong> {userData?.cf}</div>
        <div><strong>Partita IVA:</strong> {userData?.piva}</div>
        <div><strong>Azienda:</strong> {userData?.azienda}</div>
        <div><strong>Indirizzo:</strong> {userData?.indirizzo}</div>
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

