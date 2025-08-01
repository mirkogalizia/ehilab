'use client';

import { useEffect, useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/useAuth';
import { Loader2, Trash2 } from 'lucide-react';

const STATUS_COLORS = {
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-rose-100 text-rose-600 border-rose-200',
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IN_REVIEW: 'bg-blue-100 text-blue-700 border-blue-200',
  DRAFT: 'bg-gray-100 text-gray-500 border-gray-200'
};

const HEADER_TYPES = [
  { value: '', label: 'Nessuno' },
  { value: 'IMAGE', label: 'Immagine' },
  { value: 'DOCUMENT', label: 'Documento' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'TEXT', label: 'Testo' }
];

const DYNAMIC_FIELDS = [
  { label: 'Nome', value: '{{1}}' },
  { label: 'Cognome', value: '{{2}}' },
  { label: 'Telefono', value: '{{3}}' },
  { label: 'Email', value: '{{4}}' },
  { label: 'Azienda', value: '{{5}}' },
  { label: 'Città', value: '{{6}}' },
  { label: 'Data', value: '{{7}}' },
  { label: 'Ordine', value: '{{8}}' },
  { label: 'Importo', value: '{{9}}' },
  { label: 'Custom', value: '{{10}}' }
];

export default function TemplatePage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('it');
  const [bodyText, setBodyText] = useState('');
  const [response, setResponse] = useState(null);
  const [userData, setUserData] = useState(null);
  const [templateList, setTemplateList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [headerType, setHeaderType] = useState('');
  const [headerContent, setHeaderContent] = useState('');
  const [headerFile, setHeaderFile] = useState(null);
  const { user } = useAuth();
  const textareaRef = useRef();

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) setUserData({ id: user.uid, ...userSnap.data() });
      setLoading(false);
    })();
  }, [user]);

  const loadTemplates = async () => {
    if (!user?.uid) return;
    setLoading(true);
    const res = await fetch('/api/list-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uid: user.uid }),
    });
    const data = await res.json();
    if (Array.isArray(data)) setTemplateList(data);
    setLoading(false);
  };

  useEffect(() => {
    if (userData?.id) loadTemplates();
  }, [userData]);

  // Inserisci campo dinamico dove c'è il cursore
  const insertVariable = (variable) => {
    const ref = textareaRef.current;
    if (!ref) return;
    const start = ref.selectionStart;
    const end = ref.selectionEnd;
    const before = bodyText.slice(0, start);
    const after = bodyText.slice(end);
    setBodyText(before + variable + after);
    setTimeout(() => {
      ref.focus();
      ref.selectionStart = ref.selectionEnd = start + variable.length;
    }, 50);
  };

  const handleHeaderFileChange = async (e) => {
    const file = e.target.files?.[0];
    setHeaderFile(file);
    setHeaderContent('');
  };

  const handleSubmit = async () => {
    if (!userData) {
      alert('Dati utente mancanti');
      return;
    }
    let headerData = null;

    if (headerType) {
      if (headerType === 'TEXT') {
        headerData = { type: 'TEXT', text: headerContent };
      } else if (headerType === 'IMAGE' && headerFile) {
        headerData = { type: 'IMAGE', fileName: headerFile.name };
      } else if (headerType === 'DOCUMENT' && headerFile) {
        headerData = { type: 'DOCUMENT', fileName: headerFile.name };
      } else if (headerType === 'VIDEO' && headerFile) {
        headerData = { type: 'VIDEO', fileName: headerFile.name };
      }
    }

    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category,
      language,
      bodyText,
      user_uid: userData.id,
      header: headerData,
    };
    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setResponse(data);
    setName('');
    setBodyText('');
    setHeaderType('');
    setHeaderContent('');
    setHeaderFile(null);
    setLoading(true);
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
      loadTemplates();
    } else {
      alert('❌ Errore eliminazione: ' + JSON.stringify(data));
    }
  };

  const filteredTemplates = templateList.filter(tpl => !tpl.name.startsWith('sample_'));
  const grouped = filteredTemplates.reduce((acc, tpl) => {
    if (!acc[tpl.status]) acc[tpl.status] = [];
    acc[tpl.status].push(tpl);
    return acc;
  }, {});

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-green-50 via-white to-blue-50 py-8 px-2 font-[Montserrat]">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mb-3 mt-3 drop-shadow-lg">
          📄 Gestione Template WhatsApp
        </h1>
        {/* --- FORM --- */}
        <div className="bg-white/90 border border-gray-200 shadow-xl rounded-3xl px-7 py-8 mb-4 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-green-700 mb-2 flex items-center gap-2">
            Crea nuovo Template
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
            <Input
              placeholder="Nome template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="md:col-span-2"
            />
            <select
              className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="MARKETING">Marketing</option>
              <option value="TRANSACTIONAL">Transazionale</option>
              <option value="OTP">OTP</option>
            </select>
          </div>

          {/* HEADER */}
          <div className="flex flex-col md:flex-row gap-4 mb-2">
            <div className="w-full md:w-1/2">
              <label className="block text-sm font-medium mb-1">Intestazione (opzionale):</label>
              <select
                className="border border-gray-300 rounded px-3 py-2 w-full bg-white"
                value={headerType}
                onChange={e => {
                  setHeaderType(e.target.value);
                  setHeaderContent('');
                  setHeaderFile(null);
                }}
              >
                {HEADER_TYPES.map(h => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-1/2">
              {headerType === 'IMAGE' && (
                <label className="block mt-2">
                  <span className="block mb-1 text-sm font-medium">Carica Immagine</span>
                  <input type="file" accept="image/*" onChange={handleHeaderFileChange} />
                  {headerFile && <span className="text-xs text-gray-500 mt-1">File selezionato: {headerFile.name}</span>}
                </label>
              )}
              {headerType === 'DOCUMENT' && (
                <label className="block mt-2">
                  <span className="block mb-1 text-sm font-medium">Carica Documento</span>
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.txt" onChange={handleHeaderFileChange} />
                  {headerFile && <span className="text-xs text-gray-500 mt-1">File selezionato: {headerFile.name}</span>}
                </label>
              )}
              {headerType === 'VIDEO' && (
                <label className="block mt-2">
                  <span className="block mb-1 text-sm font-medium">Carica Video</span>
                  <input type="file" accept="video/*" onChange={handleHeaderFileChange} />
                  {headerFile && <span className="text-xs text-gray-500 mt-1">File selezionato: {headerFile.name}</span>}
                </label>
              )}
              {headerType === 'TEXT' && (
                <Input
                  className="mt-2"
                  placeholder="Testo intestazione"
                  value={headerContent}
                  onChange={e => setHeaderContent(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* CAMPI DINAMICI */}
          <div>
            <div className="flex gap-2 mb-1 flex-wrap">
              {DYNAMIC_FIELDS.map(btn => (
                <Button
                  key={btn.value}
                  variant="outline"
                  size="sm"
                  type="button"
                  className="px-3 py-1 text-xs"
                  onClick={() => insertVariable(btn.value)}
                  tabIndex={-1}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              placeholder="Corpo del messaggio (usa i pulsanti sopra per inserire variabili dinamiche)"
              rows={4}
              className="border border-gray-300 rounded px-3 py-2 w-full resize-none focus:outline-none focus:ring-2 focus:ring-gray-800 mb-2"
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSubmit}
            className="bg-black text-white hover:bg-gray-800 px-6 py-3 rounded-xl font-semibold transition text-base w-full md:w-fit"
            disabled={loading || !name || !bodyText}
          >
            📤 Invia Template
          </Button>
          {response && (
            <pre className="bg-gray-100 p-4 rounded text-sm whitespace-pre-wrap font-mono mt-3">
              {JSON.stringify(response, null, 2)}
            </pre>
          )}
        </div>
        {/* --- LISTA TEMPLATES --- */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">📬 Template Inviati</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-lg px-2 py-12 justify-center">
              <Loader2 className="animate-spin" /> Caricamento...
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="text-gray-500 mt-2 px-2">Nessun template trovato.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(grouped).map(([status, templates]) => (
                <div key={status}>
                  <div
                    className={`
                      inline-flex items-center gap-2 px-4 py-1 mb-3 rounded-xl border font-bold text-xs uppercase tracking-wide
                      ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500 border-gray-200'}
                    `}
                  >
                    {status === 'APPROVED' && '🟢'} 
                    {status === 'REJECTED' && '🔴'} 
                    {status === 'PENDING' && '🟡'}
                    {status === 'IN_REVIEW' && '🔵'}
                    {status === 'DRAFT' && '⚪'}
                    {status}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className={`
                          flex flex-col border shadow-lg rounded-2xl p-5 bg-white transition
                          hover:shadow-2xl relative
                        `}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-lg font-bold text-gray-800 capitalize truncate max-w-xs">{tpl.name}</span>
                          <button
                            onClick={() => handleDelete(tpl.name)}
                            className="text-red-500 hover:text-red-700 transition ml-3"
                            title="Elimina template"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400 mb-2 flex gap-2">
                          <span>{tpl.language}</span>
                          <span>·</span>
                          <span className="capitalize">{tpl.category}</span>
                          <span>·</span>
                          <span>ID: {tpl.id}</span>
                        </div>
                        <div className="bg-gray-50 border border-gray-100 rounded p-3 font-mono text-sm text-gray-700 min-h-[70px]">
                          {tpl.components?.[0]?.text || tpl.bodyText || <span className="text-gray-400">— Nessun contenuto —</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}