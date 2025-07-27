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

  // Carica utente da Firestore
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

  // Carica lista template
  const fetchTemplates = async () => {
    if (!userData?.email) return;
    const res = await fetch(`/api/list-templates?uid=${userData.email}`);
    const data = await res.json();
    setTemplates(data.data || []);
  };

  useEffect(() => {
    if (userData?.email) {
      fetchTemplates();
    }
  }, [userData]);

  // Invio nuovo template
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
        email: userData.email
      })
    });

    const data = await res.json();
    setResponse(data);
    await fetchTemplates();
  };

  if (!userData) {
    return <div className="text-gray-500 p-6">⏳ Caricamento dati...</div>;
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

      {/* Lista Template */}
      {templates.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">📋 Template esistenti</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Nome</th>
                  <th className="px-4 py-2 text-left">Categoria</th>
                  <th className="px-4 py-2 text-left">Lingua</th>
                  <th className="px-4 py-2 text-left">Stato</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.name} className="border-t">
                    <td className="px-4 py-2">{tpl.name}</td>
                    <td className="px-4 py-2">{tpl.category}</td>
                    <td className="px-4 py-2">{tpl.language}</td>
                    <td className="px-4 py-2 font-semibold">
                      {tpl.status === 'APPROVED' && <span className="text-green-600">✅ Approvato</span>}
                      {tpl.status === 'REJECTED' && <span className="text-red-600">❌ Rifiutato</span>}
                      {tpl.status === 'IN_REVIEW' && <span className="text-yellow-600">⏳ In revisione</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


