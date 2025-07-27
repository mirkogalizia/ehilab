'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '@/lib/useAuth';

export default function TemplatePage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('it');
  const [bodyText, setBodyText] = useState('');
  const [response, setResponse] = useState(null);
  const [userData, setUserData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserDataByEmail = async () => {
      if (!user?.email) return;
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const currentUserData = allUsers.find((u) => u.email === user.email);

      if (currentUserData) {
        setUserData(currentUserData);
      } else {
        console.warn('⚠️ Nessun utente trovato con email:', user.email);
      }
    };

    fetchUserDataByEmail();
  }, [user]);

  const handleSubmit = async () => {
    if (!userData?.waba_id || !userData?.phone_number_id || !user?.email) {
      alert('Dati utente mancanti');
      return;
    }

    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category,
        language,
        bodyText,
        email: user.email, // passiamo la mail per cercare lo user nel backend
      }),
    });

    const data = await res.json();
    setResponse(data);
  };

  if (!userData) {
    return <div className="text-gray-500 p-6">⏳ Caricamento dati utente...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">📄 Crea nuovo Template</h1>

      <Input
        placeholder="Nome template (es. promo_estate)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <select
        className="border px-3 py-2 rounded w-full"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="MARKETING">Marketing</option>
        <option value="TRANSACTIONAL">Transazionale</option>
        <option value="OTP">OTP</option>
      </select>

      <Input
        placeholder="Lingua (es. it, en_US)"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      />

      <textarea
        placeholder="Corpo del messaggio"
        rows={5}
        className="border px-3 py-2 rounded w-full"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
      />

      <Button onClick={handleSubmit}>📤 Invia Template</Button>

      {response && (
        <pre className="bg-gray-100 p-4 rounded text-sm">
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </div>
  );
}

