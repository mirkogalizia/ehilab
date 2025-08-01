'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
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
    if (!user?.uid) return;
    (async () => {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) setUserData({ id: user.uid, ...userSnap.data() });
    })();
  }, [user]);

  // Carica SOLO template approvati NON sample
  const loadTemplates = async () => {
    if (!user?.uid) return;
    const res = await fetch('/api/list-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uid: user.uid }),
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      // Filtro: solo non sample_ e solo APPROVED o PENDING
      setTemplateList(
        data.filter(
          tpl =>
            tpl.name &&
            !tpl.name.startsWith('sample_') &&
            ['APPROVED', 'PENDING', 'REJECTED'].includes(tpl.status)
        )
      );
    }
  };

  useEffect(() => {
    if (userData?.id) loadTemplates();
    // eslint-disable-next-line
  }, [userData]);

  const handleSubmit = async () => {
    if (!userData) {
      alert('Dati utente mancanti');
      return;
    }
    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category,
      language,
      bodyText,
      user_uid: userData.id,
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

  const handleDelete = async (templateName) => {
    if (!userData?.id) return;
    const res = await fetch('/api/delete-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uid: userData.id, template_name: templateName }),
    });
    const data = await res.json();
    if (res.ok) {
      alert('✅ Template eliminato con successo');
      loadTemplates();
    } else {
      alert('❌ Errore eliminazione: ' + JSON.stringify(data));
    }
  };

  // Raggruppamento per stato (solo se ne rimangono dopo il filtro)
  const grouped = templateList.reduce((acc, tpl) => {
    if (!acc[tpl.status]) acc[tpl.status] = [];
    acc[tpl.status].push(tpl);
    return acc;
  }, {});

  if (!userData) {
    return (
      <div className="text-gray-500 p-6 font-[Montserrat] text-center">
        ⏳ Caricamento dati...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto font-[Montserrat] space-y-6">
      <h1 className="text-3xl font-bold">📄 Crea nuovo Template</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          placeholder="Nome template"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-1 md:col-span-2"
        />
        <select
          className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-gray-800"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="MARKETING">Marketing</option>
          <option value="TRANSACTIONAL">Transazionale</option>
          <option value="OTP">OTP</option>
        </select>
      </div>
      <Input
        placeholder="Lingua (es. it, en_US)"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      />
      <textarea
        placeholder="Corpo del messaggio"
        rows={5}
        className="border border-gray-300 rounded px-3 py-2 w-full resize-none focus:outline-none focus:ring-2 focus:ring-gray-800"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
      />
      <Button
        onClick={handleSubmit}
        className="bg-black text-white hover:bg-gray-800 px-6 py-3 rounded-md font-semibold transition"
      >
        📤 Invia Template
      </Button>
      {response && (
        <pre className="bg-gray-100 p-4 rounded text-sm whitespace-pre-wrap font-mono">
          {JSON.stringify(response, null, 2)}
        </pre>
      )}

      <section className="pt-6">
        <h2 className="text-2xl font-semibold mb-4">📬 Template inviati</h2>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-gray-500 mt-2">Nessun template trovato.</p>
        ) : (
          Object.entries(grouped).map(([status, templates]) => (
            <div key={status} className="mt-6">
              <h3 className="text-xl font-bold capitalize mb-2">{status}</h3>
              <ul className="space-y-3">
                {templates.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="border border-gray-300 rounded p-4 bg-white shadow-sm flex justify-between items-start"
                  >
                    <div>
                      <strong className="capitalize">{tpl.name}</strong> – {tpl.language} – {tpl.category}
                      <br />
                      <span className="text-xs text-gray-500 truncate max-w-xl block mt-1">
                        {tpl.components?.[0]?.text || '—'}
                      </span>
                      <br />
                      <span className="text-[10px] text-gray-400">ID: {tpl.id}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(tpl.name)}
                      className="text-red-500 hover:text-red-700 text-sm ml-4 mt-1"
                      title="Elimina template"
                    >
                      ❌
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
