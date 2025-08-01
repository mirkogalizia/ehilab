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

function cleanPhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim()
    .replace(/^[+]+/, '') // togli tutti i "+" all'inizio
    .replace(/^00/, '')  // togli 00 iniziale
    .replace(/[\s\-().]/g, ''); // togli spazi e simboli
  if (phone.startsWith('39') && phone.length >= 11) return phone;
  if (phone.startsWith('3') && phone.length === 10) return '39' + phone;
  return phone;
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

  // --- Dettaglio e modifica contatto ---
  const [selectedContact, setSelectedContact] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

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

  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  // --- Funzioni aggiuntive: import, add, move, delete, send come PRIMA ---
  // ...(Invariato, omesso qui per brevità. Usa quello che hai già.)...

  // --- Dettagli/Modifica ---
  const handleOpenContact = (contact) => {
    setSelectedContact(contact);
    setEditMode(false);
    setEditData(contact);
  };
  const handleEditField = (field, value) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };
  const handleSaveEdit = async () => {
    if (!selectedContact?.id) return;
    await updateDoc(doc(db, 'contacts', selectedContact.id), { ...editData });
    setSelectedContact({ ...selectedContact, ...editData });
    setEditMode(false);
  };

  // ----- RENDER -----
  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie... invariata */}
      {/* ...tutto come nel tuo codice... */}

      {/* Contatti e azioni */}
      <main className="flex-1 p-4 overflow-y-auto flex flex-col">
        {!currentCat && !showUnassigned ? (
          <div className="text-gray-500">Seleziona una categoria o "senza categoria"</div>
        ) : (
          <>
            {/* Import e nuovo contatto... invariati */}

            {/* Tabella contatti */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2"></th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Cognome</th>
                    <th className="p-2 text-left">Telefono</th>
                    <th className="p-2 text-left">Tag</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => {
                            const s = new Set(selected);
                            s.has(c.id) ? s.delete(c.id) : s.add(c.id);
                            setSelected(s);
                          }}
                        />
                      </td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.surname}</td>
                      <td className="p-2">{c.id && `+${c.id}`}</td>
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
              {['name', 'surname', 'email', 'address', 'city', 'zip', 'province', 'country', 'shop', 'orderId'].map((field) => (
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
                    value={editData.id || ''}
                    onChange={e => handleEditField('id', e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 w-2/3"
                  />
                ) : (
                  <span>+{selectedContact.id}</span>
                )}
              </div>
              <div>
                <b>Tag:</b>{' '}
                {editMode ? (
                  <input
                    type="text"
                    value={(editData.tags || []).join(', ')}
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
      {/* ...modali per invio massivo/spostamento contatti come prima... */}
    </div>
  );
}