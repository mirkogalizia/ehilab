'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
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
  ArrowRight,
  Trash2,
  FolderSymlink,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();

  // Stati base
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [showUnassigned, setShowUnassigned] = useState(false);

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

  // Modal sposta
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetCategories, setTargetCategories] = useState([]);

  // Dati utente per API WhatsApp (phone_number_id)
  const [userData, setUserData] = useState(null);

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

  // Carica contatti realtime filtrati per categoria o "senza categoria"
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (showUnassigned) {
        setContacts(arr.filter(c => !c.categories || c.categories.length === 0));
      } else if (currentCat) {
        setContacts(arr.filter(c => c.categories?.includes(currentCat)));
      } else {
        setContacts([]);
      }
      setSelected(new Set());
    });
    return () => unsub();
  }, [currentCat, showUnassigned]);

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
        batch.set(ref, { name, categories: currentCat ? [currentCat] : [] }, { merge: true });
      }
    });
    await batch.commit();
  };

  // Nuovo contatto manuale
  const addNewContact = async () => {
    const phone = newContactPhone.trim();
    const name = newContactName.trim();
    if (!phone || !name || (!currentCat && !showUnassigned)) return alert('Compila nome, telefono e seleziona una categoria.');
    const ref = doc(db, 'contacts', phone);
    await setDoc(ref, { name, categories: currentCat ? [currentCat] : [] }, { merge: true });
    setNewContactName('');
    setNewContactPhone('');
  };

  // Toggle selezione contatto
  const toggleSelect = id => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  // Sposta i contatti selezionati nelle categorie scelte
  const moveContacts = async () => {
    if (targetCategories.length === 0 || selected.size === 0) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.id)) {
        let categoriesToSet = [...targetCategories];
        // se non sono senza categoria, rimuovi la categoria attuale e aggiungi la destinazione
        if (!showUnassigned && currentCat) {
          categoriesToSet = [...new Set([...(c.categories||[]).filter(cat=>cat!==currentCat), ...targetCategories])];
        }
        batch.update(doc(db, 'contacts', c.id), { categories: categoriesToSet });
      }
    });
    await batch.commit();
    setMoveModalOpen(false);
    setSelected(new Set());
    setTargetCategories([]);
  };

  // Elimina i contatti selezionati (da DB)
  const deleteSelectedContacts = async () => {
    if (!window.confirm('Sei sicuro di voler eliminare i contatti selezionati?')) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.id)) batch.delete(doc(db, 'contacts', c.id));
    });
    await batch.commit();
    setSelected(new Set());
  };

  // Rimuovi i contatti selezionati SOLO dalla categoria attuale (non li elimina dal DB)
  const removeSelectedFromCategory = async () => {
    if (!currentCat) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.id)) {
        const updated = (c.categories||[]).filter(cat => cat !== currentCat);
        batch.update(doc(db, 'contacts', c.id), { categories: updated });
      }
    });
    await batch.commit();
    setSelected(new Set());
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
    if (!templateToSend || (!currentCat && !showUnassigned)) return alert('Seleziona un template.');
    setSending(true);
    setSendLog(`Invio template "${templateToSend.name}" a tutti i contatti della lista selezionata...\n`);
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
        await new Promise(r => setTimeout(r, 200));
      }
      setReport(reportArr);
      setSendLog(prev => prev + 'Invio completato!\n');
    } catch (err) {
      setSendLog(prev => prev + `Errore: ${err.message}\n`);
    }
    setSending(false);
    setTimeout(() => setModalOpen(false), 1200);
  };

  // Layout responsive
  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie (verticale desktop, orizzontale scrollabile mobile) */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Users />
          <span className="text-xl font-semibold">Categorie</span>
          <Button
            onClick={() => { setShowUnassigned(true); setCurrentCat(null); }}
            variant={showUnassigned ? "default" : "outline"}
            className={`ml-auto text-xs px-3 py-1 ${showUnassigned ? 'bg-blue-600 text-white' : ''}`}
          >
            Senza categoria
          </Button>
        </div>
        <div className="flex flex-col gap-2 md:gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setCurrentCat(cat.id); setShowUnassigned(false); }}
              className={`flex items-center justify-between px-4 py-2 rounded-lg font-medium border transition
                ${currentCat === cat.id && !showUnassigned ? 'bg-blue-100 border-blue-600 text-blue-900' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-100'}`}
            >
              <span className="flex-1 text-left">{cat.name}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="p-0"
                  title="Invia template a tutta la categoria"
                  onClick={e => { e.stopPropagation(); setCurrentCat(cat.id); setShowUnassigned(false); setModalOpen(true); }}
                >
                  <Send size={16} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="p-0"
                  title="Elimina categoria"
                  onClick={async e => {
                    e.stopPropagation();
                    if (window.confirm('Eliminare questa categoria?')) {
                      // Rimuovi la categoria dai contatti che la contengono
                      const snap = await getDocs(collection(db, 'contacts'));
                      const batch = writeBatch(db);
                      snap.forEach(docu => {
                        const c = docu.data();
                        if (c.categories?.includes(cat.id)) {
                          const updated = c.categories.filter(catg => catg !== cat.id);
                          batch.update(doc(db, 'contacts', docu.id), { categories: updated });
                        }
                      });
                      await batch.commit();
                      await deleteDoc(doc(db, 'categories', cat.id));
                      if (currentCat === cat.id) setCurrentCat(null);
                    }
                  }}
                >
                  <Trash2 size={16} color="#d11a2a" />
                </Button>
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
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
        {!currentCat && !showUnassigned ? (
          <div className="text-gray-500">Seleziona una categoria o "senza categoria"</div>
        ) : (
          <>
            {/* Import e nuovo contatto */}
            <div className="mb-4 flex flex-wrap gap-4 items-center">
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
              {selected.size > 0 && (
                <>
                  <Button
                    onClick={() => setMoveModalOpen(true)}
                    className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    <FolderSymlink size={16} />
                    Sposta ({selected.size})
                  </Button>
                  {currentCat &&
                    <Button
                      onClick={removeSelectedFromCategory}
                      className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      <ArrowRight size={16} />
                      Rimuovi da categoria
                    </Button>
                  }
                  <Button
                    onClick={deleteSelectedContacts}
                    className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 size={16} />
                    Elimina
                  </Button>
                </>
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
              Invia template a tutta la lista selezionata
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

      {/* Modal sposta contatti */}
      {moveModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setMoveModalOpen(false)}
              className="absolute top-3 right-3 text-gray-600 hover:text-gray-900"
              title="Chiudi"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold mb-4">Sposta contatti selezionati</h3>
            <div>
              <label className="block mb-2">Categorie di destinazione:</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <label
                    key={cat.id}
                    className={`cursor-pointer px-3 py-2 rounded-lg border ${
                      targetCategories.includes(cat.id)
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-gray-100 text-gray-800 border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={targetCategories.includes(cat.id)}
                      onChange={e => {
                        if (e.target.checked) setTargetCategories([...targetCategories, cat.id]);
                        else setTargetCategories(targetCategories.filter(id => id !== cat.id));
                      }}
                      className="mr-1"
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
              <Button
                onClick={moveContacts}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
                disabled={targetCategories.length === 0}
              >
                Sposta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

