'use client';

import { useEffect, useState } from 'react';
import {
  collection, doc, setDoc, getDocs, writeBatch, onSnapshot, updateDoc, deleteDoc, addDoc, serverTimestamp, where, query
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import {
  Plus, Users, Send, X, Loader2, ArrowRight, Trash2, FolderSymlink, Info, Edit2, Save
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

// --- Normalizza telefono: restituisce SEMPRE +39... se ITA, accetta +... se internazionale ---
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (phone.startsWith('+')) return phone;
  return '';
}

export default function ContactsPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Popup nuovo contatto
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactSurname, setNewContactSurname] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTags, setNewContactTags] = useState('');

  const [newCat, setNewCat] = useState('');
  const [templates, setTemplates] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [templateToSend, setTemplateToSend] = useState(null);

  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState('');
  const [report, setReport] = useState([]);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetCategories, setTargetCategories] = useState([]);
  const [userData, setUserData] = useState(null);
  const [tagFilter, setTagFilter] = useState('');
  const [search, setSearch] = useState('');

  // --- Dettaglio e modifica contatto ---
  const [selectedContact, setSelectedContact] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

  // Carica dati utente by UID
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.id === user.uid);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Carica categorie realtime
  useEffect(() => {
    if (!user?.uid) return;
    const qCat = query(collection(db, 'categories'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(qCat, snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  // Carica contatti realtime (nuovo formato, filtro per user.uid)
  useEffect(() => {
    if (!user?.uid) return;
    const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(qContacts, snap => {
      let arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) {
        arr = arr.filter(c =>
          (c.firstName || c.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.lastName || c.surname || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || c.id || '').toLowerCase().includes(search.toLowerCase())
        );
      }
      let filtered = arr;
      if (showUnassigned) {
        filtered = arr.filter(c => !c.categories || c.categories.length === 0);
      } else if (currentCat) {
        filtered = arr.filter(c => c.categories?.includes(currentCat));
      }
      if (tagFilter) {
        filtered = filtered.filter(c => (c.tags || []).includes(tagFilter));
      }
      setContacts(filtered);
      setSelected(new Set());
    });
    return () => unsub();
  }, [user, currentCat, showUnassigned, tagFilter, search]);

  // Carica templates solo per user_uid
  useEffect(() => {
    async function loadTemplates() {
      if (!user?.uid) return;
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uid: user.uid }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data.filter(tpl => tpl.status === 'APPROVED'));
      }
    }
    if (user?.uid) loadTemplates();
  }, [user]);

  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  // --------- AGGIUNTA NUOVO CONTATTO ----------
  const addNewContact = async () => {
    const phone = normalizePhone(newContactPhone.trim());
    const firstName = newContactName.trim();
    const lastName = newContactSurname.trim();
    const email = newContactEmail.trim();
    const tagsArr = newContactTags.split(',').map(s => s.trim()).filter(Boolean);

    if (!phone || !firstName) return alert('Compila nome e telefono validi!');

    // 🟢 Aggiungi tutti i campi previsti vuoti se non specificati!
    await setDoc(doc(db, 'contacts', phone), {
      id: phone,
      phone,
      firstName,
      lastName,
      email,
      tags: tagsArr,
      address: "",
      city: "",
      zip: "",
      province: "",
      country: "",
      shop: "",
      orderId: "",
      categories: currentCat ? [currentCat] : [],
      createdBy: user.uid,
      source: "manual",
      updatedAt: new Date(),
    }, { merge: true });

    setNewContactName('');
    setNewContactSurname('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactTags('');
    setCreateModalOpen(false);
  };

  // --------- IMPORT FILE EXCEL/CSV -----------
  const importFile = async f => {
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const batch = writeBatch(db);
    rows.forEach(r => {
      const phone = normalizePhone(r.phone?.toString() || "");
      if (!phone) return;
      const firstName = r.firstName || r.nome || r.name || "";
      const lastName = r.lastName || r.cognome || r.surname || "";
      const email = r.email || "";
      const tags = [...new Set([...(r.tags ? r.tags.split(',').map(s => s.trim()) : []), 'import'])];
      batch.set(doc(db, 'contacts', phone), {
        id: phone,
        phone,
        firstName,
        lastName,
        email,
        tags,
        address: r.address || "",
        city: r.city || "",
        zip: r.zip || "",
        province: r.province || "",
        country: r.country || "",
        shop: r.shop || "",
        orderId: r.orderId || "",
        categories: currentCat ? [currentCat] : [],
        createdBy: user.uid,
        source: "import",
        updatedAt: new Date(),
      }, { merge: true });
    });
    await batch.commit();
  };

  // ----------- SELEZIONA ----------
  const toggleSelect = id => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  // Checkbox nella header per bulk
  const toggleSelectAll = (checked) => {
    if (checked) setSelected(new Set(contacts.map(c => c.phone || c.id)));
    else setSelected(new Set());
  };

  // ----------- BULK DELETE -----------
  const deleteSelectedContacts = async () => {
    if (!window.confirm('Sei sicuro di voler eliminare i contatti selezionati?')) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.phone || c.id)) batch.delete(doc(db, 'contacts', c.phone || c.id));
    });
    await batch.commit();
    setSelected(new Set());
  };

  // ----------- MOVE TO CATEGORY -----------
  const moveContacts = async () => {
    if (targetCategories.length === 0 || selected.size === 0) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.phone || c.id)) {
        let categoriesToSet = [...targetCategories];
        if (!showUnassigned && currentCat) {
          categoriesToSet = [...new Set([...(c.categories||[]).filter(cat=>cat!==currentCat), ...targetCategories])];
        }
        batch.update(doc(db, 'contacts', c.phone || c.id), { categories: categoriesToSet });
      }
    });
    await batch.commit();
    setMoveModalOpen(false);
    setSelected(new Set());
    setTargetCategories([]);
  };

  // ----------- REMOVE FROM CATEGORY -----------
  const removeSelectedFromCategory = async () => {
    if (!currentCat) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.phone || c.id)) {
        const updated = (c.categories||[]).filter(cat => cat !== currentCat);
        batch.update(doc(db, 'contacts', c.phone || c.id), { categories: updated });
      }
    });
    await batch.commit();
    setSelected(new Set());
  };

  // ----------- INFO / EDIT MODAL -----------
  const handleOpenContact = (contact) => {
    // Inizializza tutti i campi previsti
    setEditData({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      address: contact.address || '',
      city: contact.city || '',
      zip: contact.zip || '',
      province: contact.province || '',
      country: contact.country || '',
      shop: contact.shop || '',
      orderId: contact.orderId || '',
      phone: contact.phone || contact.id || '',
      tags: Array.isArray(contact.tags) ? contact.tags : [],
    });
    setSelectedContact(contact);
    setEditMode(false);
  };

  // Salva modifiche
  const handleEditField = (field, value) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };
  const handleSaveEdit = async () => {
    if (!selectedContact?.id && !selectedContact?.phone) return;
    // Normalizza sempre il numero prima di salvare
    const phone = normalizePhone(editData.phone || selectedContact.phone || selectedContact.id);
    const docId = selectedContact.id || selectedContact.phone;
    const fullEditData = {
      ...editData,
      id: phone,
      phone,
      updatedAt: new Date()
    };
    await updateDoc(doc(db, 'contacts', docId), fullEditData);
    setSelectedContact({ ...selectedContact, ...fullEditData });
    setEditMode(false);
  };

  // ----------- BULK SEND TEMPLATE -----------
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

  const sendTemplateMassive = async () => {
    if (!templateToSend) return alert('Seleziona un template.');
    setSending(true);
    setSendLog(`Invio template "${templateToSend.name}" ai contatti selezionati...\n`);
    setReport([]);
    try {
      const contactsToSend = contacts.filter(c => selected.has(c.phone || c.id));
      let reportArr = [];
      for (let i = 0; i < contactsToSend.length; i++) {
        const c = contactsToSend[i];
        setSendLog(prev => prev + `Invio a ${c.firstName || c.name} (${c.phone || c.id})... `);
        let res = await sendTemplateToContact(c.phone || c.id, templateToSend.name);
        if (res === true) {
          setSendLog(prev => prev + '✔️\n');
          reportArr.push({ name: c.firstName || c.name, id: c.phone || c.id, status: 'OK' });
        } else {
          setSendLog(prev => prev + `❌ (${res})\n`);
          reportArr.push({ name: c.firstName || c.name, id: c.phone || c.id, status: 'KO', error: res });
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

  // ----- RENDER -----
  return (
    <div className="h-screen flex flex-col md:flex-row font-[Montserrat]">
      {/* Sidebar categorie */}
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
        {/* Filtro tag */}
        <div className="mt-6">
          <label className="text-sm text-gray-600 mr-2">Filtro per tag:</label>
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="">Tutti</option>
            {[...new Set(contacts.flatMap(c => c.tags||[]))].map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </aside>

      {/* Contatti e azioni */}
      <main className="flex-1 p-4 overflow-y-auto flex flex-col">
        {!currentCat && !showUnassigned ? (
          <div className="text-gray-500">Seleziona una categoria o "senza categoria"</div>
        ) : (
          <>
            {/* Barra ricerca, + e importa */}
            <div className="mb-4 flex flex-wrap gap-4 items-center">
              <Input
                placeholder="Cerca nome, cognome, telefono..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-64"
              />
              <Button
                onClick={() => setCreateModalOpen(true)}
                className="bg-green-700 text-white flex items-center gap-1"
              >
                <Plus size={18}/> Crea contatto
              </Button>
              <label className="inline-block bg-blue-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-blue-700">
                Importa Excel/CSV
                <input
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  className="hidden"
                  onChange={e => e.target.files[0] && importFile(e.target.files[0])}
                />
              </label>
              {/* Azioni bulk */}
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
                  <Button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-1 bg-blue-700 hover:bg-blue-900 text-white"
                  >
                    <Send size={16} />
                    Invia template
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
                        onChange={e => toggleSelectAll(e.target.checked)}
                        checked={selected.size === contacts.length && contacts.length > 0}
                        indeterminate={selected.size > 0 && selected.size < contacts.length}
                      />
                    </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Cognome</th>
                    <th className="p-2 text-left">Telefono</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Tag</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.phone || c.id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.phone || c.id)}
                          onChange={() => toggleSelect(c.phone || c.id)}
                        />
                      </td>
                      <td className="p-2">{c.firstName || c.name}</td>
                      <td className="p-2">{c.lastName || c.surname}</td>
                      <td className="p-2">{c.phone || c.id}</td>
                      <td className="p-2">{c.email || '-'}</td>
                      <td className="p-2">
                        {(c.tags||[]).map(tag =>
                          <span key={tag} className="inline-block bg-blue-200 text-blue-700 rounded px-2 py-0.5 text-xs mr-1">{tag}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => handleOpenContact(c)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Dettagli contatto"
                        >
                          <Info size={18} />
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

      {/* --- MODAL NUOVO CONTATTO --- */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-7 max-w-lg w-full relative">
            <button
              className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-2xl"
              onClick={() => setCreateModalOpen(false)}
            >×</button>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Plus className="text-green-600" /> Nuovo contatto
            </h3>
            <div className="space-y-4">
              <Input
                placeholder="Nome"
                value={newContactName}
                onChange={e => setNewContactName(e.target.value)}
              />
              <Input
                placeholder="Cognome"
                value={newContactSurname}
                onChange={e => setNewContactSurname(e.target.value)}
              />
              <Input
                placeholder="Telefono"
                value={newContactPhone}
                onChange={e => setNewContactPhone(e.target.value)}
              />
              <Input
                placeholder="Email"
                value={newContactEmail}
                onChange={e => setNewContactEmail(e.target.value)}
              />
              <Input
                placeholder="Tag (virgola separati)"
                value={newContactTags}
                onChange={e => setNewContactTags(e.target.value)}
              />
              <Button
                onClick={addNewContact}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
              >
                Salva contatto
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DETTAGLIO E MODIFICA --- */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-7 max-w-lg w-full relative">
            <button
              className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-2xl"
              onClick={() => { setSelectedContact(null); setEditMode(false); }}
            >×</button>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Info className="text-blue-600" /> {editMode ? 'Modifica contatto' : 'Dettagli contatto'}
            </h3>
            <div className="space-y-3 text-base">
              {['firstName', 'lastName', 'email', 'address', 'city', 'zip', 'province', 'country', 'shop', 'orderId'].map((field) => (
                <div key={field}>
                  <b className="capitalize">{field}:</b>{' '}
                  {editMode ? (
                    <input
                      type="text"
                      value={editData[field] || ''}
                      onChange={e => handleEditField(field, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 w-2/3"
                    />
                  ) : (
                    <span>{selectedContact[field] || <span className="text-gray-400">–</span>}</span>
                  )}
                </div>
              ))}
              <div>
                <b>Telefono:</b>{' '}
                {editMode ? (
                  <input
                    type="text"
                    value={editData.phone || ''}
                    onChange={e => handleEditField('phone', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 w-2/3"
                  />
                ) : (
                  <span>{selectedContact.phone}</span>
                )}
              </div>
              <div>
                <b>Tag:</b>{' '}
                {editMode ? (
                  <input
                    type="text"
                    value={Array.isArray(editData.tags) ? editData.tags.join(', ') : (editData.tags || '')}
                    onChange={e => handleEditField('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    className="border border-gray-300 rounded px-2 py-1 w-2/3"
                  />
                ) : (
                  (selectedContact.tags || []).map(tag =>
                    <span key={tag} className="inline-block bg-blue-200 text-blue-700 rounded px-2 py-0.5 text-xs mr-1">{tag}</span>
                  )
                )}
              </div>
            </div>
            <div className="flex justify-end mt-6 gap-2">
              {editMode ? (
                <>
                  <Button onClick={handleSaveEdit} className="bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                    <Save size={16} /> Salva
                  </Button>
                  <Button onClick={() => setEditMode(false)} variant="outline">
                    Annulla
                  </Button>
                </>
              ) : (
                <Button onClick={() => setEditMode(true)} className="bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
                  <Edit2 size={16} /> Modifica
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
              Invia template ai selezionati ({selected.size})
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
                Invia ai selezionati
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