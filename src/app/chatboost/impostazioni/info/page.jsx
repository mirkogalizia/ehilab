'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';

export default function InfoPage() {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem('chatboostUser');
    if (stored) {
      setUserData(JSON.parse(stored));
    }
  }, [user]);

  if (!userData) return <div className="p-6">⏳ Caricamento dati...</div>;

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold">ℹ️ Info utente</h1>
      <p><strong>Email:</strong> {user?.email}</p>
      <p><strong>UID:</strong> {userData.uid}</p>
      <p><strong>WABA ID:</strong> {userData.waba_id}</p>
      <p><strong>Phone Number ID:</strong> {userData.phone_number_id}</p>
      <p><strong>Numero WhatsApp:</strong> {userData.numeroWhatsapp}</p>
    </div>
  );
}
