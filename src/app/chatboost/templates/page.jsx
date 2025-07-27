'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/useAuth';

export default function SubmitTemplatePage() {
  const { user } = useAuth(); // recupera l'utente loggato (email già disponibile)
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('it');
  const [bodyText, setBodyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!user?.email || !name || !category || !language || !bodyText) {
      alert('Compila tutti i campi');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/submit-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          language,
          bodyText,
          email: user.email, // 🔥 usa l’email del loggato
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: JSON.stringify(data.error || data) });
      } else {
        setResult({ success: true, message: 'Template inviato con successo ✅' });
      }
    } catch (err) {
      setResult({ success: false, message: err.message });
    }

    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-md space-y-4 border border-gray-200">
      <h1 className="text-2xl font-bold text-center">📨 Invia Template WhatsApp</h1>

      <Input placeholder="Nome del template" value={name} onChange={(e) => setName(e.target.value)} />
      
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full p-2 border rounded-md bg-white text-sm"
      >
        <option value="MARKETING">MARKETING</option>
        <option value="UTILITY">UTILITY</option>
        <option value="TRANSACTIONAL">TRANSACTIONAL</option>
      </select>

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="w-full p-2 border rounded-md bg-white text-sm"
      >
        <option value="it">🇮🇹 Italiano</option>
        <option value="en">🇬🇧 English</option>
        <option value="es">🇪🇸 Español</option>
        <option value="fr">🇫🇷 Français</option>
      </select>

      <textarea
        className="w-full border p-2 rounded-md text-sm"
        rows="6"
        placeholder="Testo del messaggio (usa {{1}}, {{2}} per i parametri dinamici)"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
      />

      <Button onClick={handleSubmit} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
        {loading ? 'Invio in corso...' : 'Invia Template'}
      </Button>

      {result && (
        <div className={`text-sm p-2 mt-2 rounded-md ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}

