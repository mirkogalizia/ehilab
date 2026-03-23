'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/useAuth';
import { Loader2, Trash2, Image as ImageIcon, FileText, Video, Link as LinkIcon, Plus, Send, X, Check } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const STATUS_CONFIG = {
  APPROVED: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Approvato' },
  REJECTED: { color: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500', label: 'Rifiutato' },
  PENDING: { color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'In attesa' },
  IN_REVIEW: { color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'In revisione' },
  DRAFT: { color: 'bg-slate-50 text-slate-500 border-slate-200', dot: 'bg-slate-400', label: 'Bozza' },
};

const DYNAMIC_FIELDS = [
  { label: 'Nome', value: '{{1}}' },
  { label: 'Cognome', value: '{{2}}' },
  { label: 'Telefono', value: '{{3}}' },
  { label: 'Email', value: '{{4}}' }
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
  const { user } = useAuth();

  const [headerType, setHeaderType] = useState('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerFile, setHeaderFile] = useState(null);
  const [headerFilePreview, setHeaderFilePreview] = useState('');
  const [headerFileUrl, setHeaderFileUrl] = useState('');
  const [headerUploadLoading, setHeaderUploadLoading] = useState(false);

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
    // eslint-disable-next-line
  }, [userData]);

  const insertVariable = v => {
    const textarea = document.getElementById("body-textarea");
    if (!textarea) {
      setBodyText(prev => prev + v);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBodyText(prev => prev.substring(0, start) + v + prev.substring(end));
    setTimeout(() => {
      textarea.focus();
      textarea.selectionEnd = start + v.length;
    }, 10);
  };

  const handleFileChange = async e => {
    const file = e.target.files[0] || null;
    setHeaderFile(file);
    setHeaderFilePreview('');
    setHeaderFileUrl('');
    if (!file) return;
    if (headerType === 'IMAGE') {
      setHeaderFilePreview(URL.createObjectURL(file));
    }
    setHeaderUploadLoading(true);
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `templates/${userData.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setHeaderFileUrl(downloadUrl);
    } catch (err) {
      alert('Errore upload file: ' + err.message);
    }
    setHeaderUploadLoading(false);
  };

  const handleSubmit = async () => {
    if (!userData) {
      alert('Dati utente mancanti');
      return;
    }
    let headerPayload = null;
    if (headerType !== 'NONE') {
      if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(headerType)) {
        if (!headerFile || !headerFileUrl) {
          alert('Seleziona e carica un file per l\'intestazione!');
          return;
        }
        headerPayload = { type: headerType, url: headerFileUrl, fileName: headerFile.name };
      } else if (headerType === 'TEXT') {
        if (!headerText) {
          alert('Inserisci un testo per l\'intestazione!');
          return;
        }
        headerPayload = { type: 'TEXT', text: headerText };
      }
    }

    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category, language, bodyText,
      user_uid: userData.id,
      header: headerPayload
    };
    setLoading(true);
    const res = await fetch('/api/submit-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setResponse(data);
    setName(''); setBodyText(''); setHeaderText('');
    setHeaderType('NONE'); setHeaderFile(null);
    setHeaderFilePreview(''); setHeaderFileUrl('');
    setLoading(false);
    loadTemplates();
  };

  const handleDelete = async (templateName) => {
    if (!userData?.id) return;
    const res = await fetch('/api/delete-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_uid: userData.id, template_name: templateName }),
    });
    if (res.ok) {
      loadTemplates();
    } else {
      const data = await res.json();
      alert('Errore eliminazione: ' + JSON.stringify(data));
    }
  };

  const filteredTemplates = templateList.filter(tpl => !tpl.name.startsWith('sample_'));
  const grouped = filteredTemplates.reduce((acc, tpl) => {
    if (!acc[tpl.status]) acc[tpl.status] = [];
    acc[tpl.status].push(tpl);
    return acc;
  }, {});

  const renderHeaderInput = () => {
    if (headerType === 'NONE') return null;
    if (headerType === 'TEXT') {
      return (
        <input
          placeholder="Testo intestazione"
          value={headerText}
          onChange={e => setHeaderText(e.target.value)}
          className="input-premium w-full px-3.5 py-2.5 text-sm mt-2"
        />
      );
    }
    if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(headerType)) {
      return (
        <div className="flex flex-col gap-2 mt-3">
          <label className="relative inline-flex items-center px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition font-medium text-slate-700 w-fit text-sm">
            <span className="inline-flex items-center gap-2">
              {headerType === 'IMAGE' && <ImageIcon size={16} />}
              {headerType === 'DOCUMENT' && <FileText size={16} />}
              {headerType === 'VIDEO' && <Video size={16} />}
              {headerUploadLoading ? "Caricamento..." : "Sfoglia file"}
            </span>
            <input
              type="file"
              accept={
                headerType === 'IMAGE' ? 'image/*'
                : headerType === 'DOCUMENT' ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
                : 'video/*'
              }
              className="hidden"
              onChange={handleFileChange}
              disabled={headerUploadLoading}
            />
          </label>
          {headerFile && (
            <div className="flex items-center gap-3">
              {headerType === 'IMAGE' && headerFilePreview && (
                <img src={headerFilePreview} alt="Preview" className="h-14 w-14 object-cover rounded-lg border border-slate-200 shadow-sm" />
              )}
              {headerType !== 'IMAGE' && (
                <span className="flex items-center text-sm text-slate-600 font-mono">
                  {headerType === 'DOCUMENT' && <FileText size={14} className="mr-1.5 text-slate-400" />}
                  {headerType === 'VIDEO' && <Video size={14} className="mr-1.5 text-slate-400" />}
                  {headerFile.name}
                </span>
              )}
              <button
                onClick={() => { setHeaderFile(null); setHeaderFilePreview(''); setHeaderFileUrl(''); }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                disabled={headerUploadLoading}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {headerFileUrl && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <Check size={14} />
              <span>File caricato</span>
            </div>
          )}
          {!headerFileUrl && headerUploadLoading && (
            <span className="text-slate-400 text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Caricamento file...
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  // ═══ RENDER ═══
  return (
    <div className="min-h-screen w-full bg-[var(--surface-1)] py-8 px-4 font-[Montserrat]">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="animate-fade-in-up">
          <span className="badge-premium bg-emerald-100 text-emerald-700 mb-3 inline-flex">Template</span>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            Gestione Template WhatsApp
          </h1>
          <p className="text-slate-500 text-sm mt-1">Crea, gestisci e invia i tuoi template</p>
        </div>

        {/* ═══ FORM ═══ */}
        <div className="surface-card px-6 py-7 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <h2 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Plus size={16} className="text-emerald-600" />
            </div>
            Crea nuovo Template
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                placeholder="Nome template"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-premium md:col-span-2 px-3.5 py-2.5 text-sm"
              />
              <select
                className="select-premium w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="MARKETING">Marketing</option>
                <option value="TRANSACTIONAL">Transazionale</option>
                <option value="OTP">OTP</option>
              </select>
            </div>

            <input
              placeholder="Lingua (es. it, en_US)"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input-premium w-full px-3.5 py-2.5 text-sm"
            />

            {/* Header */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Intestazione (header)
              </label>
              <select
                value={headerType}
                onChange={e => {
                  setHeaderType(e.target.value);
                  setHeaderFile(null); setHeaderText('');
                  setHeaderFilePreview(''); setHeaderFileUrl('');
                }}
                className="select-premium w-full md:w-1/2"
              >
                <option value="NONE">Nessuna</option>
                <option value="IMAGE">Immagine</option>
                <option value="DOCUMENT">Documento</option>
                <option value="VIDEO">Video</option>
                <option value="TEXT">Testo</option>
              </select>
              {renderHeaderInput()}
            </div>

            {/* Dynamic fields */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Campi dinamici
              </label>
              <div className="flex flex-wrap gap-2">
                {DYNAMIC_FIELDS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => insertVariable(f.value)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
                  >
                    {f.label} <span className="ml-1.5 text-slate-400 font-mono">{f.value}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <textarea
              id="body-textarea"
              placeholder="Corpo del messaggio (puoi inserire variabili come {{1}})"
              rows={4}
              className="input-premium w-full resize-none px-3.5 py-3 text-sm !rounded-xl"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />

            <Button
              onClick={handleSubmit}
              className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-xl font-semibold transition text-sm w-full md:w-auto h-11"
              disabled={loading || !name || !bodyText || headerUploadLoading}
            >
              {headerUploadLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Upload file...
                </>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Invia Template
                </>
              )}
            </Button>

            {response && (
              <pre className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs whitespace-pre-wrap font-mono text-slate-600">
                {JSON.stringify(response, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* ═══ TEMPLATE LIST ═══ */}
        <section className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <h2 className="text-xl font-bold text-slate-900 mb-5">Template Inviati</h2>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin text-emerald-600" />
                <span className="text-sm text-slate-400">Caricamento template...</span>
              </div>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <FileText size={24} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">Nessun template trovato</p>
              <p className="text-xs text-slate-400 mt-1">Crea il tuo primo template sopra</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {Object.entries(grouped).map(([status, templates]) => {
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
                return (
                  <div key={status}>
                    {/* Status badge */}
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-lg border text-xs font-semibold uppercase tracking-wider ${config.color}`}>
                      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                      {config.label}
                      <span className="text-[10px] font-normal opacity-60 ml-1">({templates.length})</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {templates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="surface-card p-5 group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-base font-bold text-slate-800 capitalize truncate max-w-[200px]">
                              {tpl.name}
                            </span>
                            <button
                              onClick={() => handleDelete(tpl.name)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                              title="Elimina template"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                            <span className="font-medium">{tpl.language}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                            <span className="capitalize">{tpl.category}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                            <span className="font-mono text-[10px]">ID: {tpl.id}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm text-slate-600 min-h-[60px] leading-relaxed">
                            {tpl.components?.[0]?.text || tpl.bodyText || <span className="text-slate-300 italic">Nessun contenuto</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
