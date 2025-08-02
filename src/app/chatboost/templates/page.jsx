'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/useAuth';
import { Loader2, Trash2, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const STATUS_COLORS = {
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-rose-100 text-rose-600 border-rose-200',
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IN_REVIEW: 'bg-blue-100 text-blue-700 border-blue-200',
  DRAFT: 'bg-gray-100 text-gray-500 border-gray-200'
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

  // Header state
  const [headerType, setHeaderType] = useState('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerFile, setHeaderFile] = useState(null);
  const [headerUploadLoading, setHeaderUploadLoading] = useState(false);

  // Carica userData con UID corretto!
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) setUserData({ id: user.uid, ...userSnap.data() });
      setLoading(false);
    })();
  }, [user]);

  // Caricamento e raggruppamento dei template
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

  // Insert dynamic variable into body
  const insertVariable = v => {
    // Inserisci dove è il cursore:
    const textarea = document.getElementById("body-textarea");
    if (!textarea) {
      setBodyText(prev => prev + v);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBodyText(prev =>
      prev.substring(0, start) + v + prev.substring(end)
    );
    setTimeout(() => {
      textarea.focus();
      textarea.selectionEnd = start + v.length;
    }, 10);
  };

  // Gestione file header
  const handleFileChange = e => {
    const file = e.target.files[0] || null;
    setHeaderFile(file);
  };

  // Submit template (con upload su Firebase Storage)
  const handleSubmit = async () => {
    if (!userData) {
      alert('Dati utente mancanti');
      return;
    }
    let headerPayload = null;

    if (headerType !== 'NONE') {
      if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(headerType)) {
        if (!headerFile) {
          alert('Seleziona e carica un file per l’intestazione!');
          return;
        }
        setHeaderUploadLoading(true);
        try {
          // Upload su Firebase Storage
          const storage = getStorage();
          const storageRef = ref(storage, `templates/${userData.id}/${Date.now()}_${headerFile.name}`);
          await uploadBytes(storageRef, headerFile);
          const downloadUrl = await getDownloadURL(storageRef);

          headerPayload = {
            type: headerType,
            url: downloadUrl,
            fileName: headerFile.name
          };
        } catch (err) {
          alert('Errore upload file: ' + err.message);
          setHeaderUploadLoading(false);
          return;
        }
        setHeaderUploadLoading(false);
      } else if (headerType === 'TEXT') {
        if (!headerText) {
          alert('Inserisci un testo per l’intestazione!');
          return;
        }
        headerPayload = { type: 'TEXT', text: headerText };
      }
    }

    const payload = {
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category,
      language,
      bodyText,
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
    setName('');
    setBodyText('');
    setHeaderText('');
    setHeaderType('NONE');
    setHeaderFile(null);
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
    const data = await res.json();
    if (res.ok) {
      loadTemplates();
    } else {
      alert('❌ Errore eliminazione: ' + JSON.stringify(data));
    }
  };

  // ----------- FILTRO PER NON MOSTRARE I SAMPLE -----------
  const filteredTemplates = templateList.filter(tpl => !tpl.name.startsWith('sample_'));
  const grouped = filteredTemplates.reduce((acc, tpl) => {
    if (!acc[tpl.status]) acc[tpl.status] = [];
    acc[tpl.status].push(tpl);
    return acc;
  }, {});

  // ----------- COMPONENTI UI HEADER -----------

  const renderHeaderInput = () => {
    if (headerType === 'NONE') return null;
    if (headerType === 'TEXT') {
      return (
        <Input
          placeholder="Testo intestazione"
          value={headerText}
          onChange={e => setHeaderText(e.target.value)}
          className="mb-2"
        />
      );
    }
    if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(headerType)) {
      return (
        <div className="flex items-center gap-3 mt-2">
          <label className="relative inline-flex items-center px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg shadow cursor-pointer hover:bg-gray-200 transition font-medium text-gray-700">
            <span>
              <span className="inline-flex items-center gap-1">
                {headerType === 'IMAGE' && <ImageIcon className="w-5 h-5" />}
                {headerType === 'DOCUMENT' && <FileText className="w-5 h-5" />}
                {headerType === 'VIDEO' && <Video className="w-5 h-5" />}
                {headerUploadLoading ? "Caricamento..." : "Sfoglia file"}
              </span>
              <input
                type="file"
                accept={
                  headerType === 'IMAGE'
                    ? 'image/*'
                    : headerType === 'DOCUMENT'
                    ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
                    : 'video/*'
                }
                className="hidden"
                onChange={handleFileChange}
                disabled={headerUploadLoading}
              />
            </span>
          </label>
          {headerFile ? (
            <div className="flex items-center gap-2">
              {headerType === 'IMAGE' ? (
                <img
                  src={URL.createObjectURL(headerFile)}
                  alt="Anteprima"
                  className="h-12 w-12 object-cover rounded shadow border"
                />
              ) : (
                <span className="flex items-center text-sm text-gray-700 font-mono">
                  {headerType === 'DOCUMENT' && <FileText className="w-4 h-4 mr-1 text-gray-400" />}
                  {headerType === 'VIDEO' && <Video className="w-4 h-4 mr-1 text-gray-400" />}
                  {headerFile.name}
                </span>
              )}
              <button
                className="ml-1 text-xs text-red-500 hover:text-red-700 bg-transparent border-none"
                type="button"
                onClick={() => setHeaderFile(null)}
                disabled={headerUploadLoading}
              >
                ✕
              </button>
            </div>
          ) : (
            <span className="text-gray-400 text-sm ml-2">Nessun file selezionato</span>
          )}
        </div>
      );
    }
    return null;
  };

  // ----------- RENDER PRINCIPALE -----------

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
          <Input
            placeholder="Lingua (es. it, en_US)"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mb-2"
          />
          {/* --- HEADER MULTIMEDIALE --- */}
          <div className="mb-2">
            <label className="block font-medium text-gray-700 mb-1">Intestazione (header):</label>
            <select
              value={headerType}
              onChange={e => {
                setHeaderType(e.target.value);
                setHeaderFile(null);
                setHeaderText('');
              }}
              className="border border-gray-300 rounded px-3 py-2 w-full md:w-1/2 focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
            >
              <option value="NONE">Nessuna</option>
              <option value="IMAGE">Immagine</option>
              <option value="DOCUMENT">Documento</option>
              <option value="VIDEO">Video</option>
              <option value="TEXT">Testo</option>
            </select>
            {renderHeaderInput()}
          </div>
          {/* --- CAMPI DINAMICI --- */}
          <div className="mb-2 flex flex-wrap gap-2 items-center">
            <span className="font-medium text-gray-700 mr-2">Campi dinamici:</span>
            {DYNAMIC_FIELDS.map(f => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full px-3 py-1 text-xs"
                onClick={() => insertVariable(f.value)}
              >
                {f.label}
              </Button>
            ))}
            <span className="ml-2 text-xs text-gray-400">(clicca per inserire)</span>
          </div>
          <textarea
            id="body-textarea"
            placeholder="Corpo del messaggio (puoi inserire variabili come {{1}})"
            rows={4}
            className="border border-gray-300 rounded px-3 py-2 w-full resize-none focus:outline-none focus:ring-2 focus:ring-gray-800 mb-2"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
          <Button
            onClick={handleSubmit}
            className="bg-black text-white hover:bg-gray-800 px-6 py-3 rounded-xl font-semibold transition text-base w-full md:w-fit"
            disabled={loading || !name || !bodyText || headerUploadLoading}
          >
            {headerUploadLoading ? (
              <>
                <Loader2 className="animate-spin inline-block mr-2" />
                Upload file...
              </>
            ) : (
              "📤 Invia Template"
            )}
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