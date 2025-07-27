// 1. 📁 app/chatboost/templates/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TemplatePage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('it');
  const [bodyText, setBodyText] = useState('');
  const [response, setResponse] = useState(null);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('chatboostUser');
    if (stored) {
      setUserData(JSON.parse(stored));
    }
  }, []);

  const handleSubmit = async () => {
    if (!userData || !userData.waba_id || !userData.phone_number_id) {
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
        uid: userData.uid,
        waba_id: userData.waba_id,
        phone_number_id: userData.phone_number_id
      })
    });
    const data = await res.json();
    setResponse(data);
  };

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

