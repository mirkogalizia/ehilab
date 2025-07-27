'use client';

import { useEffect, useState } from "react";
import { db } from "@/firebase.js";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!user || !user.email) return;

    const fetchUserData = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const match = allUsers.find((u) => u.email === user.email);
        if (match) {
          setUserData(match);
        } else {
          console.warn("⚠️ Nessun utente trovato con email:", user.email);
        }
      } catch (error) {
        console.error("❌ Errore nel recupero dati utente:", error);
      }
    };

    fetchUserData();
  }, [user]);

  if (user === undefined || userData === null) {
    return <div className="p-6 text-gray-500">⏳ Caricamento dati utente...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-green-700">📄 Info Utente</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-white p-6 rounded-lg shadow">
        <div><strong>Nome:</strong> {userData.nome}</div>
        <div><strong>Cognome:</strong> {userData.cognome}</div>
        <div><strong>Email:</strong> {userData.email}</div>
        <div><strong>Telefono:</strong> {userData.telefono}</div>
        <div><strong>Numero WhatsApp:</strong> {userData.numeroWhatsapp}</div>
        <div><strong>CF:</strong> {userData.cf}</div>
        <div><strong>Partita IVA:</strong> {userData.piva}</div>
        <div><strong>Azienda:</strong> {userData.azienda}</div>
        <div><strong>Indirizzo:</strong> {userData.indirizzo}</div>
        <div><strong>CAP:</strong> {userData.cap}</div>
        <div><strong>Città:</strong> {userData.citta}</div>
        <div><strong>Provincia:</strong> {userData.provincia}</div>
        <div><strong>Paese:</strong> {userData.paese}</div>
        <div><strong>Phone Number ID:</strong> {userData.phone_number_id}</div>
        <div><strong>WABA ID:</strong> {userData.waba_id}</div>
      </div>
    </div>
  );
}


