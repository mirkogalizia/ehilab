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
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();

  // Stati base
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState("NO_CAT"); // Default su "nessuna"
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [allContacts, setAllContacts] = useState([]); // per "tutti"

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

  // Azione di gruppo (sposta/elimina)
  const [moveToCat, setMoveToCat] = useState('');

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

  // Carica TUTTI i contatti (per vedere senza categoria)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      setAllContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Carica contatti filtrati per categoria
  useEffect(() => {
    if (!currentCat || currentCat === "ALL") {
      setContacts(allContacts);
      setSelected(new Set());
      return;
    }
    if (currentCat === "NO_CAT") {
      const noCat = allContacts.filter(c => !c.categories || c.categories.length === 0);
      setContacts(noCat);
      setSelected(new Set());
      return;
    }
    const filtered = allContacts.filter(c => c.categories?.includes(currentCat));
    setContacts(filtered);
    setSelected(new Set());
  }, [currentCat, allContacts]);

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
        batch.set(ref, { name, categories: [currentCat] }, { merge: true });
      }
    });
    await batch.commit();
  };

  // Nuovo contatto manuale
  const addNewContact = async () => {
    const phone = newContactPhone.trim();
    const name = newContactName.trim();
    if (!phone || !name || !currentCat || currentCat === "NO_CAT") return alert('Compila nome, telefono e seleziona una categoria.');
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

  // Seleziona tutti
  const toggleSelectAll = (checked) => {
    setSelected(checked ? new Set(contacts.map(c => c.id)) : new Set());
  };

  // Elimina categoria
  const deleteCategory = async (catId) => {
    if (!window.confirm('Vuoi davvero eliminare questa categoria? I contatti non saranno cancellati, ma solo dissociati.')) return;
    const contactsToEdit = allContacts.filter(c => c.categories?.includes(catId));
    for (let c of contactsToEdit) {
      const ref = doc(db, 'contacts', c.id);
      const newCats = (c.categories || []).filter(k => k !== catId);
      await updateDoc(ref, { categories: newCats });
    }
    await deleteDoc(doc(db, 'categories', catId));
    if (currentCat === catId) setCurrentCat("NO_CAT");
  };

  // Elimina un contatto da categoria
  const removeContactFromCat = async (contactId) => {
    const contact = allContacts.find(c => c.id === contactId);
    if (!contact) return;
    const newCats = (contact.categories || []).filter(k => k !== currentCat);
    await updateDoc(doc(db, 'contacts', contactId), { categories: newCats });
  };

  // Elimina del tutto un contatto (solo da "Senza categoria")
  const deleteContact = async (contactId) => {
    if (!window.confirm('Eliminare definitivamente questo contatto?')) return;
    await deleteDoc(doc(db, 'contacts', contactId));
  };

  // Sposta multi selezionati
  const moveSelectedToCategory = async (catId) => {
    if (!catId) return;
    const batch = writeBatch(db);
    selected.forEach(cid => {
      const c = allContacts.find(c => c.id === cid);
      if (c) {
        let newCats = c.categories || [];
        // Se già dentro, skip
        if (!newCats.includes(catId)) newCats = [...newCats, catId];
        // Se sposti da una categoria, rimuovila
        if (currentCat !== "NO_CAT" && currentCat !== "ALL")
          newCats = newCats.filter(k => k !== currentCat);
        batch.update(doc(db, 'contacts', cid), { categories: newCats });
      }
    });
    await batch.commit();
    setSelected(new Set());
    setMoveToCat('');
  };

  // Elimina selezionati
  const deleteSelected = async () => {
    if (currentCat === "NO_CAT") {
      if (!window.confirm('Eliminare definitivamente i contatti selezionati?')) return;
      const batch = writeBatch(db);
      selected.forEach(cid => batch.delete(doc(db, 'contacts', cid)));
      await batch.commit();
      setSelected(new Set());
    } else {
      selected.forEach(cid => removeContactFromCat(cid));
      setSelected(new Set());
    }
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
    if (!templateToSend || !currentCat) return alert('Seleziona un template.');
    setSending(true);
    setSendLog(`Invio template "${templateToSend.name}" a tutti i contatti di ${currentCat === "NO_CAT" ? "Senza categoria" : categories.find(c => c.id === currentCat)?.name}...\n`);
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

  // --- UI ---

  // Categorie pillole scorrevoli
  const categoriesBar = (
    <div className="flex overflow-x-auto gap-2 pb-2 md:flex-col md:overflow-x-visible md:gap-3 md:pb-0">
      <button
        onClick={() => setCurrentCat("NO_CAT")}
        className={`px-4 py-2 rounded-full font-semibold shadow text-xs whitespace-nowrap border-2 border-gray-200
        ${currentCat === "NO_CAT" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 text-gray-700 hover:bg-blue-100"}
        `}
      >Senza categoria</button>
      {categories.map(cat => (
        <div key={cat.id} className="flex items-center gap-1">
          <button
            onClick={() => setCurrentCat(cat.id)}
            className={`px-4 py-2 rounded-full font-semibold shadow text-xs whitespace-nowrap border-2 border-gray-200
              ${currentCat === cat.id ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 text-gray-700 hover:bg-blue-100"}
            `}
          >
            {cat.name}
          </button>
          <button
            onClick={() => deleteCategory(cat.id)}
            title="Elimina categoria"
            className="ml-1 text-red-500 hover:bg-red-100 rounded-full p-1"
          >
            <Trash2 size={16} />
          </button>
          <button
            title={`Invia template a tutta la categoria ${cat.name}`}
            onClick={() => { setCurrentCat(cat.id); setModalOpen(true); }}
            className="ml-1 text-blue-600 hover:bg-blue-100 rounded-full p-1"
          >
            <Send size={16} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto md:min-w-[220px]">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-1">
          <Users />
          Segmenti
        </h2>
        {categoriesBar}
        <div className="flex gap-2 mt-3">
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
        {/* Azioni multi selezione */}
        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap gap-3 items-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 shadow-sm">
            <span className="text-sm font-medium text-blue-700">
              {selected.size} selezionati
            </span>
            <select
              value={moveToCat}
              onChange={e => setMoveToCat(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Sposta in...</option>
              {categories
                .filter(cat => cat.id !== currentCat)
                .map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
            </select>
            <Button
              onClick={() => moveSelectedToCategory(moveToCat)}
              disabled={!moveToCat}
              className="bg-blue-600 text-white flex items-center gap-1"
            >
              <ArrowRightLeft size={16} /> Sposta
            </Button>
            <Button
              onClick={deleteSelected}
              variant="destructive"
              className="flex items-center gap-1"
            >
              <Trash2 size={16} /> Elimina
            </Button>
          </div>
        )}

        {currentCat === "NO_CAT" && (
          <div className="mb-4 text-blue-600 font-semibold">Contatti senza categoria</div>
        )}
        {!currentCat || contacts.length === 0 ? (
          <div className="text-gray-500">Nessun contatto presente</div>
        ) : (
          <>
            {/* Import e nuovo contatto */}
            {currentCat !== "NO_CAT" && (
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
                        onChange={e => toggleSelectAll(e.target.checked)}
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
                        {currentCat === "NO_CAT" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteContact(c.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeContactFromCat(c.id)}
                          >
                            <X size={16} /> Rimuovi
                          </Button>
                        )}
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
              {currentCat === "NO_CAT"
                ? "Senza categoria"
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
    </div>
  );
}

