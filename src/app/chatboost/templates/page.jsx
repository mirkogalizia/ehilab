'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/useAuth';

export default function TemplatesPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('it');
  const [bodyText, setBodyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const submitTemplate = async () => {
    if (!name || !bodyText || !user) return;

    setLoading(true);

    try {
      const response = await fetch('/api/submit-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          category,
          language,
          bodyText,
          uid: user.uid,
        }),
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Errore invio template:', error);
      setResult('Errore invio template');
    }

    setLoading(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">📄 Nuovo Template WhatsApp</h1>

      <Input
        placeholder="Nome interno template"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <select
        className="w-full border rounded p-2"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="MARKETING">Marketing</option>
        <option value="TRANSACTIONAL">Transazionale</option>
        <option value="UTILITY">Utility</option>
      </select>

      <select
        className="w-full border rounded p-2"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="it">Italiano</option>
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>

      <Textarea
        placeholder="Corpo del messaggio es: Ciao {{1}}, il tuo ordine è pronto!"
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        rows={5}
      />

      <Button onClick={submitTemplate} disabled={loading}>
        {loading ? 'Invio in corso...' : 'Richiedi approvazione'}
      </Button>

      {result && (
        <pre className="bg-gray-100 text-sm p-4 mt-4 rounded whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
