'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export default function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'MARKETING', language: 'it', bodyText: '' });
  const [result, setResult] = useState('');

  const fetchTemplates = async () => {
    const res = await fetch('/api/list-templates');
    const data = await res.json();
    setTemplates(data.data || []);
  };

  useEffect(() => fetchTemplates(), []);

  const handleSubmit = async () => {
    setResult('Invio in corso...');
    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, uid: user.uid }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult('Template inviato ✔️');
      fetchTemplates();
    } else setResult(JSON.stringify(data));
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Crea Template</h1>
      <Input placeholder="Nome template" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input placeholder="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
      <Input placeholder="Lingua" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} />
      <Textarea placeholder="Corpo del messaggio" value={form.bodyText} onChange={e => setForm({ ...form, bodyText: e.target.value })} />
      <Button onClick={handleSubmit}>Richiedi approvazione</Button>
      {result && <pre>{result}</pre>}

      <h2 className="mt-8 text-xl">Template esistenti</h2>
      <ul className="list-disc list-inside">
        {templates.map(t => (
          <li key={t.name}>
            <strong>{t.name}</strong> – {t.status} ({t.category})
          </li>
        ))}
      </ul>
    </div>
  );
}
