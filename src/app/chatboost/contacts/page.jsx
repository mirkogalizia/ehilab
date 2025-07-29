'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import {
  Plus,
  Users,
  Send,
  X,
  Loader2,
  CheckCircle,
  Trash2,
  CornerDownRight
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();

  // Stati base
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());

  // Nuova categoria
  const [newCat, setNewCat] = useState('');

  // Nuovo contatto manuale
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Template disponibili per invio massivo
  const [templates, setTemplates] = useState([]);

  // Modal gestione invio massivo
  const [modalOpen, setModalOpen] = useState(false);
  const [templateToSend, setTemplateToSend] = useState(null);

  // Stato invio massivo
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState('');
  const [report, setReport] = useState([]);

  // Dati utente per API WhatsApp (phone_number_id)
  const [userData, setUserData] = useState(null);

  // Modal riassegna contatti orfani
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [categoryToAssign, setCategoryToAssign] = useState('');

  // Carica userData (phone_number_id)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Carica categorie realtime
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Carica contatti realtime filtrati per categoria
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      let arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (currentCat === 'NO_CAT') {
        arr = arr.filter(c => !c.categories || c.categories.length === 0);
      } else if (currentCat) {
        arr = arr.filter(c => c.categories?.includes(currentCat));
      } else {
        arr = [];
      }
      setContacts(arr);
      setSelected(new Set());
    });
    return () => unsub();
  }, [currentCat]);

  // Carica templates
  useEffect(() => {
    async function loadTemplates() {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data.filter(tpl => tpl.status === 'APPROVED'));
      }
    }
    if (user?.email) loadTemplates();
  }, [user]);

  // Crea categoria
  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  // Elimina categoria (opzionale: elimina anche i contatti)
  const deleteCategory = async (catId) => {
    if (!window.confirm('Vuoi eliminare la categoria? I contatti resteranno senza categoria.')) return;
    await deleteDoc(doc(db, 'categories', catId));
    // Rimuovi categoria da tutti i contatti
    const conts = await getDocs(collection(db, 'contacts'));
    const batch = writeBatch(db);
    conts.forEach(c => {
      if (c.data().categories?.includes(catId)) {
        const cats = (c.data().categories || []).filter(x => x !== catId);
        batch.update(doc(db, 'contacts', c.id), { categories: cats });
      }
    });
    await batch.commit();
    setCurrentCat(null);
  };

  // Elimina contatto
  const deleteContact = async (contactId) => {
    if (!window.confirm('Eliminare questo contatto?')) return;
    await deleteDoc(doc(db, 'contacts', contactId));
  };

  // Import Excel/CSV
  const importFile = async f => {
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const batch = writeBatch(db);
    rows.forEach(r => {
      const phone = r.phone?.toString();
      const name = r.name;
      if (phone && name) {
        const ref = doc(db, 'contacts', phone);
        batch.set(ref, { name, categories: [currentCat] }, { merge: true });
      }
    });
    await batch.commit();
  };

  // Nuovo contatto manuale
  const addNewContact = async () => {
    const phone = newContactPhone.trim();
    const name = newContactName.trim();
    if (!phone || !name || !currentCat || currentCat === 'NO_CAT')
      return alert('Compila nome, telefono e seleziona una categoria.');
    const ref = doc(db, 'contacts', phone);
    await setDoc(ref, { name, categories: [currentCat] }, { merge: true });
    setNewContactName('');
    setNewContactPhone('');
  };

  // Toggle selezione contatto
  const toggleSelect = id => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  // Multi-assegnazione contatti orfani
  const assignToCategory = async () => {
    if (!categoryToAssign || selected.size === 0) return;
    const batch = writeBatch(db);
    Array.from(selected).forEach(id => {
      const ref = doc(db, 'contacts', id);
      batch.update(ref, { categories: [categoryToAssign] });
    });
    await batch.commit();
    setShowAssignModal(false);
    setSelected(new Set());
    setCategoryToAssign('');
  };

  // Invio template a un singolo contatto (salva anche su Firestore!)
  const sendTemplateToContact = async (phone, templateName) => {
    if (!user || !phone || !templateName || !userData) return false;
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: templateName, language: { code: "it" } }
    };
    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
    const data = await res.json();
    if (data.messages) {
      // Salva in Firestore
      await addDoc(collection(db, "messages"), {
        text: `Template inviato: ${templateName}`,
        to: phone,
        from: "operator",
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: "template",
        user_uid: user.uid,
        message_id: data.messages[0].id
      });
      return true;
    } else {
      return data.error ? data.error.message || 'Errore sconosciuto' : 'Errore sconosciuto';
    }
  };

  // Invio massivo template a tutti i contatti della categoria
  const sendTemplateMassive = async () => {
    if (!templateToSend || !currentCat) return alert('Seleziona un template.');
    setSending(true);
    setSendLog(`Invio template "${templateToSend.name}" a tutti i contatti...\n`);
    setReport([]);
    try {
      const contactsToSend = contacts;
      let reportArr = [];
      for (let i = 0; i < contactsToSend.length; i++) {
        const c = contactsToSend[i];
        setSendLog(prev => prev + `Invio a ${c.name} (${c.id})... `);
        let res = await sendTemplateToContact(c.id, templateToSend.name);
        if (res === true) {
          setSendLog(prev => prev + '✔️\n');
          reportArr.push({ name: c.name, id: c.id, status: 'OK' });
        } else {
          setSendLog(prev => prev + `❌ (${res})\n`);
          reportArr.push({ name: c.name, id: c.id, status: 'KO', error: res });
        }
        await new Promise(r => setTimeout(r, 200)); // Delay per evitare rate limit
      }
      setReport(reportArr);
      setSendLog(prev => prev + 'Invio completato!\n');
    } catch (err) {
      setSendLog(prev => prev + `Errore: ${err.message}\n`);
    }
    setSending(false);
    setTimeout(() => setModalOpen(false), 1200); // chiudi modale dopo invio
  };

  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-1">
          <Users />
          Categorie
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Bottone "Senza categoria" */}
          <button
            className={`px-3 py-2 rounded-lg font-semibold border flex items-center gap-1 transition ${
              currentCat === 'NO_CAT'
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-blue-100'
            }`}
            onClick={() => setCurrentCat('NO_CAT')}
          >
            <Users size={16} /> Senza categoria
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="relative flex items-center">
              <button
                className={`px-3 py-2 rounded-lg font-semibold border flex items-center gap-1 transition ${
                  currentCat === cat.id
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-blue-100'
                }`}
                onClick={() => setCurrentCat(cat.id)}
              >
                {cat.name}
              </button>
              {/* Invio template a categoria */}
              <button
                title={`Invia template a tutta la categoria ${cat.name}`}
                onClick={() => { setCurrentCat(cat.id); setModalOpen(true); }}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                <Send size={17} />
              </button>
              {/* Elimina categoria */}
              <button
                title="Elimina categoria"
                className="ml-1 text-red-500 hover:text-red-700"
                onClick={() => deleteCategory(cat.id)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Nuova categoria"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
          />
          <Button onClick={createCategory} className="flex items-center gap-1">
            <Plus />
            Crea
          </Button>
        </div>
      </aside>

      {/* Contatti e azioni */}
      <main className="flex-1 p-4 overflow-y-auto flex flex-col">
        {!currentCat ? (
          <div className="text-gray-500">Seleziona una categoria</div>
        ) : (
          <>
            {/* Import e nuovo contatto */}
            <div className="mb-4 flex flex-wrap gap-4 items-center">
              {currentCat !== 'NO_CAT' && (
                <>
                  <label className="inline-block bg-blue-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-blue-700">
                    Importa Excel/CSV
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      className="hidden"
                      onChange={e => e.target.files[0] && importFile(e.target.files[0])}
                    />
                  </label>
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Nome nuovo contatto"
                      value={newContactName}
                      onChange={e => setNewContactName(e.target.value)}
                      className="w-48"
                    />
                    <Input
                      placeholder="Telefono"
                      value={newContactPhone}
                      onChange={e => setNewContactPhone(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      onClick={addNewContact}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      Aggiungi
                    </Button>
                  </div>
                </>
              )}

              {/* Bottone "Riassegna" se siamo su Senza categoria e c'è almeno un contatto selezionato */}
              {currentCat === 'NO_CAT' && selected.size > 0 && (
                <Button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  <CornerDownRight size={16} />
                  Riassegna a categoria
                </Button>
              )}
            </div>

            {/* Tabella contatti */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2">
                      <input
                        type="checkbox"
                        onChange={e =>
                          e.target.checked
                            ? setSelected(new Set(contacts.map(c => c.id)))
                            : setSelected(new Set())
                        }
                        checked={selected.size === contacts.length && contacts.length > 0}
                      />
                    </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefono</th>
                    <th className="p-2 text-left">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.id}</td>
                      <td className="p-2">
                        <button
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteContact(c.id)}
                          title="Elimina contatto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal invio massivo */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-3 right-3 text-gray-600 hover:text-gray-900"
              title="Chiudi"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-semibold mb-4">
              Invia template a tutta la categoria{' '}
              {currentCat === 'NO_CAT'
                ? 'Senza categoria'
                : categories.find(c => c.id === currentCat)?.name}
            </h3>

            <div className="mb-4">
              <label className="block mb-1 font-medium">Seleziona template:</label>
              <select
                value={templateToSend?.name || ''}
                onChange={e => {
                  const tpl = templates.find(t => t.name === e.target.value);
                  setTemplateToSend(tpl || null);
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">-- Scegli un template --</option>
                {templates.map(tpl => (
                  <option key={tpl.name} value={tpl.name}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={sendTemplateMassive}
                disabled={sending || !templateToSend}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {sending && <Loader2 className="animate-spin" size={18} />}
                Invia a tutti
              </Button>
              <Button onClick={() => setModalOpen(false)} variant="outline">
                Annulla
              </Button>
            </div>

            {sendLog && (
              <pre className="mt-4 max-h-40 overflow-y-auto bg-gray-100 p-2 rounded text-xs whitespace-pre-wrap">
                {sendLog}
              </pre>
            )}
            {report.length > 0 && (
              <div className="mt-3 bg-blue-50 rounded-lg p-2 max-h-32 overflow-y-auto text-xs">
                <b>Report invio:</b>
                <ul>
                  {report.map(r =>
                    <li key={r.id}>
                      {r.name} ({r.id}): <span className={r.status === 'OK' ? 'text-green-700' : 'text-red-600'}>
                        {r.status}{r.error && ` (${r.error})`}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Riassegna contatti orfani */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowAssignModal(false)}
              className="absolute top-3 right-3 text-gray-600 hover:text-gray-900"
              title="Chiudi"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold mb-4">Riassegna a categoria</h3>
            <select
              value={categoryToAssign}
              onChange={e => setCategoryToAssign(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
            >
              <option value="">-- Scegli una categoria --</option>
              {categories.map(c => (
                <option value={c.id} key={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                onClick={assignToCategory}
                disabled={!categoryToAssign || selected.size === 0}
                className="bg-yellow-500 hover:bg-yellow-600 text-white flex-1"
              >
                Riassegna
              </Button>
              <Button onClick={() => setShowAssignModal(false)} variant="outline" className="flex-1">Annulla</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

