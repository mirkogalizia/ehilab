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
  const [templateList, setTemplateList] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) return;
      const snapshot = await getDocs(collection(db, 'users'));
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const matched = allUsers.find(u => u.email === user.email);
      if (matched) {
        setUserData(matched);
      }
    };
    fetchUserData();
  }, [user]);

  const handleSubmit = async () => {
    if (!userData || !userData.email) {
      alert('Dati utente mancanti');
      return;
    }

    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category,
      language,
      bodyText,
      email: userData.email,
    };

    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setResponse(data);
    loadTemplates();
  };

  const loadTemplates = async () => {
    if (!userData?.email) return;

    const res = await fetch('/api/list-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userData.email }),
    });

    const data = await res.json();
    if (Array.isArray(data)) {
      setTemplateList(data);
    }
  };

  const handleDelete = async (templateName) => {
    if (!userData?.email) return;

    const res = await fetch('/api/delete-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userData.email, template_name: templateName }),
    });

    const data = await res.json();
    if (res.ok) {
      alert('✅ Template eliminato con successo');
      loadTemplates();
    } else {
      alert('❌ Errore eliminazione: ' + JSON.stringify(data));
    }
  };

  useEffect(() => {
    if (userData?.email) {
      loadTemplates();
    }
  }, [userData]);

  const grouped = templateList.reduce((acc, tpl) => {
    if (!acc[tpl.status]) acc[tpl.status] = [];
    acc[tpl.status].push(tpl);
    return acc;
  }, {});

  if (!userData) {
    return <div className="text-gray-500 p-6">⏳ Caricamento dati...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">📄 Crea nuovo Template</h1>

      <Input
        placeholder="Nome template"
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

      <div className="pt-6">
        <h2 className="text-xl font-semibold">📬 Template inviati</h2>

        {Object.keys(grouped).length === 0 ? (
          <p className="text-gray-500 mt-2">Nessun template trovato.</p>
        ) : (
          Object.entries(grouped).map(([status, templates]) => (
            <div key={status} className="mt-4">
              <h3 className="text-lg font-bold capitalize">{status}</h3>
              <ul className="space-y-1 mt-2">
                {templates.map((tpl) => (
                  <li key={tpl.id} className="border rounded p-2 bg-white shadow-sm flex justify-between items-start">
                    <div>
                      <strong>{tpl.name}</strong> – {tpl.language} – {tpl.category}
                      <br />
                      <span className="text-xs text-gray-500">
                        {tpl.components?.[0]?.text}
                      </span>
                      <br />
                      <span className="text-[10px] text-gray-400">ID: {tpl.id}</span>
                    </div>
                    <button
                      className="text-red-500 hover:text-red-700 text-sm ml-4"
                      onClick={() => handleDelete(tpl.name)}
                    >
                      ❌
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

