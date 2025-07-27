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
    const fetchUser = async () => {
      if (!user?.email) return;
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const matched = users.find(u => u.email === user.email);
      if (matched) setUserData(matched);
    };
    fetchUser();
  }, [user]);

  const fetchTemplates = async () => {
    if (!userData?.email) return;
    const res = await fetch(`/api/list-templates?email=${encodeURIComponent(userData.email)}`);
    const json = await res.json();
    setTemplates(json.data || []);
  };

  useEffect(() => {
    if (userData?.email) fetchTemplates();
  }, [userData]);

  const handleSubmit = async () => {
    if (!userData?.waba_id) {
      alert('Dati utente mancanti');
      return;
    }
    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category,
      language,
      bodyText,
      email: userData.email,
      waba_id: userData.waba_id,
      phone_number_id: userData.phone_number_id
    };

    console.log('🛰️ Invia template:', payload);

    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setResponse(data);
    await fetchTemplates();
  };

  if (!userData) {
    return <div className="text-gray-500 p-6">⏳ Caricamento dati utente...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">📄 Crea Template</h1>
      <Input placeholder="Nome template" value={name} onChange={e => setName(e.target.value)} />
      <select className="border rounded p-2 w-full" value={category} onChange={e => setCategory(e.target.value)}>
        <option value="MARKETING">Marketing</option>
        <option value="TRANSACTIONAL">Transazionale</option>
        <option value="OTP">OTP</option>
      </select>
      <Input placeholder="Lingua (es. it, en_US)" value={language} onChange={e => setLanguage(e.target.value)} />
      <textarea
        placeholder="Corpo messaggio"
        rows={4}
        className="border rounded p-2 w-full"
        value={bodyText}
        onChange={e => setBodyText(e.target.value)}
      />
      <Button onClick={handleSubmit}>📤 Invia Template</Button>
      {response && <pre className="bg-gray-100 p-4 rounded">{JSON.stringify(response, null, 2)}</pre>}

      <h2 className="text-xl font-semibold">📋 Lista Template</h2>
      {templates.length === 0 ? (
        <div className="text-gray-500">Nessun template trovato.</div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="p-4 border rounded bg-white">
              <div className="font-bold">{t.name}</div>
              <div className="text-sm text-gray-600">Categoria: {t.category}</div>
              <div className="text-sm">
                Stato:{' '}
                <span
                  className={`font-semibold ${
                    t.status === 'APPROVED'
                      ? 'text-green-600'
                      : t.status === 'REJECTED'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                  }`}
                >
                  {t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button variant="link" onClick={fetchTemplates}>
        🔄 Ricarica lista
      </Button>
    </div>
  );
}

