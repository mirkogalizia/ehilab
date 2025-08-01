'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  collection, doc, setDoc, getDocs, writeBatch, onSnapshot, updateDoc, deleteDoc, addDoc, serverTimestamp, where, query
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import {
  Plus, Users, Send, X, Loader2, ArrowRight, Trash2, FolderSymlink, Info, Edit2, Save, Search
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

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

  const [newCat, setNewCat] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactSurname, setNewContactSurname] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTags, setNewContactTags] = useState('');

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
  const [search, setSearch] = useState(''); // <-- Barra di ricerca

  // --- Dettaglio e modifica contatto ---
  const [selectedContact, setSelectedContact] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

  // ...[Caricamento dati: useEffect come prima, invariati]...

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.id === user.uid);
      if (me) setUserData(me);
    })();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const qCat = query(collection(db, 'categories'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(qCat, snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const qContacts = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(qContacts, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  }, [user, currentCat, showUnassigned, tagFilter]);

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

  // --- Ricerca dinamica (filtra su tutti i campi principali) ---
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.trim().toLowerCase();
    return contacts.filter(c =>
      (c.firstName || c.name || '').toLowerCase().includes(q) ||
      (c.lastName || c.surname || '').toLowerCase().includes(q) ||
      (c.phone || c.id || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (Array.isArray(c.tags) ? c.tags.join(',').toLowerCase() : '').includes(q)
    );
  }, [contacts, search]);

  // --- Seleziona tutto visibile ---
  const allVisibleSelected = filteredContacts.length > 0 && filteredContacts.every(c => selected.has(c.phone || c.id));
  const someVisibleSelected = filteredContacts.some(c => selected.has(c.phone || c.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(s => {
        const updated = new Set(s);
        filteredContacts.forEach(c => updated.delete(c.phone || c.id));
        return updated;
      });
    } else {
      setSelected(s => {
        const updated = new Set(s);
        filteredContacts.forEach(c => updated.add(c.phone || c.id));
        return updated;
      });
    }
  };

  // ...[Funzioni add, edit, delete, move ecc. come sopra, invariati]...

  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  // --- AGGIUNTA NUOVO CONTATTO, IMPORT, MODAL, ecc. --- (tutto come sopra, invariato!)

  // ...resto codice come sopra...

  // --- Render
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
            {/* --- Barra ricerca dinamica --- */}
            <div className="flex items-center mb-4 gap-2 max-w-lg">
              <Search className="text-gray-400" />
              <Input
                placeholder="Cerca nome, cognome, telefono, tag, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>

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
                  placeholder="Nome"
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  className="w-32"
                />
                <Input
                  placeholder="Cognome"
                  value={newContactSurname}
                  onChange={e => setNewContactSurname(e.target.value)}
                  className="w-32"
                />
                <Input
                  placeholder="Telefono"
                  value={newContactPhone}
                  onChange={e => setNewContactPhone(e.target.value)}
                  className="w-40"
                />
                <Input
                  placeholder="Email"
                  value={newContactEmail}
                  onChange={e => setNewContactEmail(e.target.value)}
                  className="w-40"
                />
                <Input
                  placeholder="Tag (virgola separati)"
                  value={newContactTags}
                  onChange={e => setNewContactTags(e.target.value)}
                  className="w-48"
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
                        onChange={toggleSelectAll}
                        checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                        title="Seleziona tutti i visibili"
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
                  {filteredContacts.map(c => (
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
                  {filteredContacts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        Nessun contatto trovato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* --- Tutte le modali come prima, invariato --- */}
      {/* ...Modali info/edit, bulk, move... */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          {/* ...modale info/edit come sopra... */}
        </div>
      )}
      {/* ...modal bulk... */}
      {/* ...modal move... */}
    </div>
  );
}