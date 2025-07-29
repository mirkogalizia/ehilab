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
  deleteDoc,
  updateDoc,
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
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();

  // Stati base
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [uncatContacts, setUncatContacts] = useState([]);

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
    if (!currentCat) {
      setContacts([]);
      setSelected(new Set());
      return;
    }
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.categories?.includes(currentCat));
      setContacts(arr);
      setSelected(new Set());
    });
    return () => unsub();
  }, [currentCat]);

  // Carica contatti SENZA categoria
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !c.categories || c.categories.length === 0);
      setUncatContacts(arr);
    });
    return () => unsub();
  }, []);

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

  // Elimina categoria (e opzionalmente i contatti)
  const deleteCategory = async (catId, deleteContacts = false) => {
    if (!window.confirm('Sicuro di eliminare questa categoria?')) return;
    await deleteDoc(doc(db, 'categories', catId));
    // Togli la categoria dai contatti o elimina contatti (in base a deleteContacts)
    const snap = await getDocs(collection(db, 'contacts'));
    for (let d of snap.docs) {
      const c = d.data();
      if (c.categories?.includes(catId)) {
        if (deleteContacts) {
          await deleteDoc(doc(db, 'contacts', d.id));
        } else {
          const newCats = (c.categories || []).filter(cid => cid !== catId);
          await updateDoc(doc(db, 'contacts', d.id), { categories: newCats });
        }
      }
    }
    if (currentCat === catId) setCurrentCat(null);
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
    if (!phone || !name || !currentCat) return alert('Compila nome, telefono e seleziona una categoria.');
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

  // Multi-elimina contatti
  const deleteSelectedContacts = async () => {
    if (!window.confirm('Eliminare i contatti selezionati?')) return;
    for (let id of selected) {
      await deleteDoc(doc(db, 'contacts', id));
    }
    setSelected(new Set());
  };

  // Elimina contatto da categoria (senza eliminare la scheda contatto)
  const removeContactFromCat = async id => {
    const ref = doc(db, 'contacts', id);
    const snap = await getDocs(collection(db, 'contacts'));
    const c = snap.docs.find(d => d.id === id)?.data();
    if (!c) return;
    const newCats = (c.categories || []).filter(cid => cid !== currentCat);
    await updateDoc(ref, { categories: newCats });
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
    setSendLog(`Invio template "${templateToSend.name}" a tutti i contatti di ${categories.find(c => c.id === currentCat)?.name}...\n`);
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

  // *** RENDER ***
  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <Users />
          Categorie
        </h2>
        <div className="flex flex-col gap-2">
          {/* Bottoni verticali categorie */}
          {categories.map(cat => (
            <div key={cat.id} className="relative">
              <button
                onClick={() => setCurrentCat(cat.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition border ${currentCat === cat.id
                  ? 'bg-blue-100 border-blue-400 text-blue-900 shadow'
                  : 'bg-gray-100 border-gray-200 hover:bg-blue-50'
                  }`}
              >
                <span>{cat.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    title={`Invia template a tutta la categoria ${cat.name}`}
                    onClick={e => {
                      e.stopPropagation();
                      setCurrentCat(cat.id);
                      setModalOpen(true);
                    }}
                    className="p-1 text-blue-600 hover:text-blue-900"
                  >
                    <Send size={18} />
                  </button>
                  <button
                    title="Elimina categoria"
                    onClick={e => {
                      e.stopPropagation();
                      deleteCategory(cat.id, false); // solo categoria, NON elimina contatti
                    }}
                    className="p-1 text-gray-500 hover:text-red-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </button>
            </div>
          ))}
          {/* Bottone per i contatti senza categoria */}
          {uncatContacts.length > 0 && (
            <button
              onClick={() => setCurrentCat('_uncat_')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition border bg-yellow-50 border-yellow-300 text-yellow-900`}
            >
              <span>🔄 Senza categoria</span>
              <span className="text-xs">{uncatContacts.length}</span>
            </button>
          )}
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
        {!currentCat ? (
          <div className="text-gray-500">Seleziona una categoria</div>
        ) : (
          <>
            {/* Import e nuovo contatto */}
            {currentCat !== '_uncat_' && (
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
              </div>
            )}

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
                            ? setSelected(new Set(
                              (currentCat === '_uncat_' ? uncatContacts : contacts).map(c => c.id)))
                            : setSelected(new Set())
                        }
                        checked={selected.size === (currentCat === '_uncat_' ? uncatContacts.length : contacts.length) && (currentCat === '_uncat_' ? uncatContacts.length : contacts.length) > 0}
                      />
                    </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefono</th>
                    <th className="p-2 text-left">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentCat === '_uncat_' ? uncatContacts : contacts).map(c => (
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
                      <td className="p-2 flex gap-2">
                        {/* Rimuovi dalla categoria se NON uncat */}
                        {currentCat !== '_uncat_' &&
                          <button
                            onClick={() => removeContactFromCat(c.id)}
                            className="p-1 text-gray-500 hover:text-red-500"
                            title="Rimuovi dalla categoria"
                          >
                            <Trash2 size={16} />
                          </button>
                        }
                        {/* Elimina completamente */}
                        <button
                          onClick={() => {
                            if (window.confirm('Eliminare questo contatto?'))
                              deleteDoc(doc(db, 'contacts', c.id));
                          }}
                          className="p-1 text-gray-700 hover:text-red-700"
                          title="Elimina contatto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Multi-elimina se almeno un contatto selezionato */}
              {selected.size > 0 && (
                <div className="flex gap-3 mt-3">
                  <Button
                    onClick={deleteSelectedContacts}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Elimina selezionati
                  </Button>
                </div>
              )}
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
              {categories.find(c => c.id === currentCat)?.name}
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
    </div>
  );
}

