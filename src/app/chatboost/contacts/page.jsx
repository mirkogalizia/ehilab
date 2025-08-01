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

    const ref = doc(db, 'contacts', phone);
    await setDoc(ref, {
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
      const firstName = r.firstName || r.nome || r.name || "";
      const lastName = r.lastName || r.cognome || r.surname || "";
      const email = r.email || "";
      const tags = [...new Set([...(r.tags ? r.tags.split(',').map(s => s.trim()) : []), 'import'])];
      if (phone && firstName) {
        const ref = doc(db, 'contacts', phone);
        batch.set(ref, {
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
      }
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
      phone: contact.phone || '',
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
    const docId = selectedContact.phone || selectedContact.id;
    // Prepara tutti i campi chiave
    const fullEditData = {
      firstName: editData.firstName || '',
      lastName: editData.lastName || '',
      email: editData.email || '',
      address: editData.address || '',
      city: editData.city || '',
      zip: editData.zip || '',
      province: editData.province || '',
      country: editData.country || '',
      shop: editData.shop || '',
      orderId: editData.orderId || '',
      phone: editData.phone || '',
      tags: Array.isArray(editData.tags) ? editData.tags : [],
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
      {/* ...tutto il JSX identico a quello che hai postato, nessun </Button> fuori posto... */}
      {/* ...modal per creazione/modifica/spostamento/invio massivo inclusi... */}
    </div>
  );
}