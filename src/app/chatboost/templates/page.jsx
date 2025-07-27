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
  const [templates, setTemplates] = useState([]);
  const [userData, setUserData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) return;
      const snapshot = await getDocs(collection(db, 'users'));
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const matched = allUsers.find(u => u.email === user.email);
      if (matched) {
        setUserData(matched);
        fetchTemplates(matched.uid);
      }
    };
    fetchUserData();
  }, [user]);

  const fetchTemplates = async (uid) => {
    const res = await fetch(`/api/list-templates?uid=${uid}`);
    const data = await res.json();
    if (data?.data) {
      setTemplates(data.data);
    }
  };

  const handleSubmit = async () => {
    if (!userData || !userData.waba_id || !userData.phone_number_id || !userData.uid) {
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
        email: userData.email, // necessario per API
      }),
    });

    const data = await res.json();
    setResponse(data);
    fetchTemplates(userData.uid); // aggiorna lista template
  };

  if (!userData) {
    return <div className="text-gray-500 p-6">⏳ Caricamento dati...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">📄 Crea nuovo Template</h1>

      <Input placeholder="Nome template (es. promo_estate)" value={name} onChange={(e) => setName(e.target.value)} />

      <select
        className="border px-3 py-2 rounded w-full"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="MARKETING">Marketing</option>
        <option value="TRANSACTIONAL">Transazionale</option>
        <option value="OTP">OTP</option>
      </select>

      <Input placeholder="Lingua (es. it, en_US)" value={language} onChange={(e) => setLanguage(e.target.value)} />

      <textarea
        placeholder="Corpo del messaggio"
        rows={5}
        className="border px-3 py-2 rounded w-full"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
      />

      <Button onClick={handleSubmit}>📤 Invia Template</Button>

      {response && (
        <pre className="bg-gray-100 p-4 rounded text-sm mt-4">{JSON.stringify(response, null, 2)}</pre>
      )}

      <h2 className="text-xl font-bold mt-8">📋 Template inviati</h2>
      <div className="space-y-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="p-3 border rounded bg-white shadow-sm">
            <div className="font-semibold">{tpl.name}</div>
            <div className="text-sm text-gray-600">Categoria: {tpl.category}</div>
            <div className="text-sm">
              Stato:{' '}
              <span
                className={`font-bold ${
                  tpl.status === 'APPROVED'
                    ? 'text-green-600'
                    : tpl.status === 'REJECTED'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}
              >
                {tpl.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

