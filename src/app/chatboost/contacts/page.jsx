'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  collection, doc, setDoc, getDocs, writeBatch, onSnapshot, updateDoc, addDoc, serverTimestamp, where, query, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import {
  Plus, Users, Send, X, Loader2, ArrowRight, Trash2, FolderSymlink,
  Edit2, Save, Search, Upload, Tag, Download, MessageSquare,
  CalendarDays, Clock, User, Phone, Mail, MapPin, ShoppingBag,
  FileText, ChevronRight, MoreHorizontal, Hash, Globe, Zap,
  StickyNote, ArrowUpRight, CheckCircle, XCircle
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';

/* ═══════════ Helpers ═══════════ */

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim().replace(/^[+]+/, '').replace(/^00/, '').replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (phone.startsWith('+')) return phone;
  return '';
}

function normalizeText(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function parseSearch(q) {
  const norm = normalizeText(q);
  const tokens = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(norm)) !== null) tokens.push(m[1] || m[2] || '');
  return tokens.map(t => {
    const idx = t.indexOf(':');
    if (idx > 0) { const key = t.slice(0, idx).trim(); const value = t.slice(idx+1).trim(); if (key && value) return { key, value }; }
    return { value: t };
  });
}

function contactGlobalIndex(c) {
  const f = [
    c.firstName, c.name, c.lastName, c.surname, c.phone, c.id,
    c.email, ...(c.tags || []), c.city, c.province, c.country, c.address
  ].filter(Boolean).map(normalizeText).join(' ');
  return f;
}

function matchesQuery(contact, specs) {
  if (!specs.length) return true;
  const idx = contactGlobalIndex(contact);
  return specs.every(spec => {
    const val = normalizeText(spec.value);
    if (!val) return true;
    if (spec.key) {
      const fieldMap = {
        name: normalizeText(`${contact.firstName||''} ${contact.lastName||''}`),
        phone: normalizeText(contact.phone || contact.id || ''),
        email: normalizeText(contact.email || ''),
        tag: normalizeText((contact.tags||[]).join(' ')),
        tags: normalizeText((contact.tags||[]).join(' ')),
        city: normalizeText(contact.city || ''),
        source: normalizeText(contact.source || ''),
      };
      return (fieldMap[spec.key.toLowerCase()] || '').includes(val);
    }
    return idx.includes(val);
  });
}

const SOURCE_CONFIG = {
  manual: { label: 'Manuale', icon: User, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  import: { label: 'Import', icon: Upload, color: 'bg-amber-50 text-amber-600 border-amber-200' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  shopify: { label: 'Shopify', icon: ShoppingBag, color: 'bg-violet-50 text-violet-600 border-violet-200' },
  'wa-auto': { label: 'WhatsApp', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

function SourceBadge({ source }) {
  const cfg = SOURCE_CONFIG[source] || SOURCE_CONFIG.manual;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

/* ═══════════ Main ═══════════ */

export default function ContactsPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Data
  const [allContacts, setAllContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [allMessages, setAllMessages] = useState([]);

  // UI state
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [newCat, setNewCat] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailContact, setDetailContact] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [bulkTagModal, setBulkTagModal] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState('');
  const [bulkTagAction, setBulkTagAction] = useState('add'); // 'add' | 'remove'
  const [targetCategories, setTargetCategories] = useState([]);
  const [noteText, setNoteText] = useState('');

  // New contact form
  const [newContactName, setNewContactName] = useState('');
  const [newContactSurname, setNewContactSurname] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTags, setNewContactTags] = useState('');

  // Template sending
  const [templates, setTemplates] = useState([]);
  const [templateToSend, setTemplateToSend] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState('');
  const [report, setReport] = useState([]);
  const [userData, setUserData] = useState(null);

  /* ──── Load data ──── */
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.id === user.uid);
      if (me) setUserData(me);
    })();
  }, [user]);

  // All contacts realtime
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setAllContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  // Categories realtime
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'categories'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  // Messages for "last interaction"
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'messages'), where('user_uid', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAllMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  // Templates
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const res = await fetch('/api/list-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_uid: user.uid }) });
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data.filter(t => t.status === 'APPROVED'));
    })();
  }, [user]);

  /* ──── Filtered contacts ──── */
  const contacts = useMemo(() => {
    let base = allContacts;
    if (showUnassigned) base = base.filter(c => !c.categories || c.categories.length === 0);
    else if (currentCat) base = base.filter(c => c.categories?.includes(currentCat));
    if (tagFilter) {
      const tf = normalizeText(tagFilter);
      base = base.filter(c => (c.tags || []).some(tag => normalizeText(tag) === tf));
    }
    const specs = parseSearch(search);
    return specs.length ? base.filter(c => matchesQuery(c, specs)) : base;
  }, [allContacts, currentCat, showUnassigned, tagFilter, search]);

  /* ──── Stats ──── */
  const stats = useMemo(() => {
    const bySource = {};
    allContacts.forEach(c => {
      const s = c.source || 'manual';
      bySource[s] = (bySource[s] || 0) + 1;
    });
    return { total: allContacts.length, bySource, catCount: categories.length };
  }, [allContacts, categories]);

  /* ──── All tags ──── */
  const allTags = useMemo(() => {
    const set = new Set();
    allContacts.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [allContacts]);

  /* ──── Category counts ──── */
  const catCounts = useMemo(() => {
    const m = {};
    allContacts.forEach(c => (c.categories || []).forEach(cat => { m[cat] = (m[cat] || 0) + 1; }));
    return m;
  }, [allContacts]);

  /* ──── Last message per contact ──── */
  const lastMsgMap = useMemo(() => {
    const m = new Map();
    for (const msg of allMessages) {
      const phone = msg.from === 'operator' ? normalizePhone(msg.to) : normalizePhone(msg.from);
      if (!phone || m.has(phone)) continue;
      m.set(phone, msg);
    }
    return m;
  }, [allMessages]);

  /* ──── Contact messages (for detail panel) ──── */
  const contactMessages = useMemo(() => {
    if (!detailContact) return [];
    const phone = detailContact.phone || detailContact.id;
    return allMessages.filter(m =>
      normalizePhone(m.from) === phone || normalizePhone(m.to) === phone
    ).slice(0, 20);
  }, [detailContact, allMessages]);

  /* ──── Actions ──── */
  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  const addNewContact = async () => {
    const phone = normalizePhone(newContactPhone.trim());
    const firstName = newContactName.trim();
    if (!phone || !firstName) return alert('Compila nome e telefono validi!');
    await setDoc(doc(db, 'contacts', phone), {
      id: phone, phone, firstName, lastName: newContactSurname.trim(),
      email: newContactEmail.trim(),
      tags: newContactTags.split(',').map(s => s.trim()).filter(Boolean),
      address: '', city: '', zip: '', province: '', country: '', shop: '', orderId: '',
      categories: currentCat ? [currentCat] : [],
      createdBy: user.uid, source: 'manual', updatedAt: new Date(),
    }, { merge: true });
    setNewContactName(''); setNewContactSurname(''); setNewContactPhone('');
    setNewContactEmail(''); setNewContactTags(''); setCreateModalOpen(false);
  };

  const importFile = async f => {
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const batch = writeBatch(db);
    rows.forEach(r => {
      const phone = normalizePhone(r.phone?.toString() || '');
      if (!phone) return;
      batch.set(doc(db, 'contacts', phone), {
        id: phone, phone,
        firstName: r.firstName || r.nome || r.name || '',
        lastName: r.lastName || r.cognome || r.surname || '',
        email: r.email || '',
        tags: [...new Set([...(r.tags ? r.tags.split(',').map(s => s.trim()) : []), 'import'])],
        address: r.address || '', city: r.city || '', zip: r.zip || '',
        province: r.province || '', country: r.country || '',
        shop: r.shop || '', orderId: r.orderId || '',
        categories: currentCat ? [currentCat] : [],
        createdBy: user.uid, source: 'import', updatedAt: new Date(),
      }, { merge: true });
    });
    await batch.commit();
  };

  const exportContacts = () => {
    const data = contacts.map(c => ({
      firstName: c.firstName || '', lastName: c.lastName || '',
      phone: c.phone || c.id, email: c.email || '',
      tags: (c.tags || []).join(', '), source: c.source || '',
      city: c.city || '', address: c.address || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatti');
    XLSX.writeFile(wb, `contatti_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const toggleSelect = id => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const toggleSelectAll = checked => { if (checked) setSelected(new Set(contacts.map(c => c.phone || c.id))); else setSelected(new Set()); };

  const deleteSelectedContacts = async () => {
    if (!window.confirm(`Eliminare ${selected.size} contatti?`)) return;
    const batch = writeBatch(db);
    contacts.forEach(c => { if (selected.has(c.phone || c.id)) batch.delete(doc(db, 'contacts', c.phone || c.id)); });
    await batch.commit(); setSelected(new Set());
  };

  const moveContacts = async () => {
    if (targetCategories.length === 0 || selected.size === 0) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.phone || c.id)) {
        let cats = [...targetCategories];
        if (!showUnassigned && currentCat) cats = [...new Set([...(c.categories||[]).filter(cat => cat !== currentCat), ...targetCategories])];
        batch.update(doc(db, 'contacts', c.phone || c.id), { categories: cats });
      }
    });
    await batch.commit(); setMoveModalOpen(false); setSelected(new Set()); setTargetCategories([]);
  };

  const removeSelectedFromCategory = async () => {
    if (!currentCat) return;
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (selected.has(c.phone || c.id)) batch.update(doc(db, 'contacts', c.phone || c.id), { categories: (c.categories||[]).filter(cat => cat !== currentCat) });
    });
    await batch.commit(); setSelected(new Set());
  };

  const bulkTagApply = async () => {
    if (!bulkTagValue.trim() || selected.size === 0) return;
    const tag = bulkTagValue.trim();
    const batch = writeBatch(db);
    contacts.forEach(c => {
      if (!selected.has(c.phone || c.id)) return;
      const current = c.tags || [];
      const updated = bulkTagAction === 'add'
        ? [...new Set([...current, tag])]
        : current.filter(t => t !== tag);
      batch.update(doc(db, 'contacts', c.phone || c.id), { tags: updated });
    });
    await batch.commit(); setBulkTagModal(false); setBulkTagValue(''); setSelected(new Set());
  };

  const handleOpenContact = (contact) => {
    setEditData({
      firstName: contact.firstName || '', lastName: contact.lastName || '',
      email: contact.email || '', address: contact.address || '',
      city: contact.city || '', zip: contact.zip || '',
      province: contact.province || '', country: contact.country || '',
      shop: contact.shop || '', orderId: contact.orderId || '',
      phone: contact.phone || contact.id || '',
      tags: Array.isArray(contact.tags) ? contact.tags : [],
    });
    setDetailContact(contact);
    setEditMode(false);
    setNoteText('');
  };

  const handleSaveEdit = async () => {
    if (!detailContact?.id && !detailContact?.phone) return;
    const phone = normalizePhone(editData.phone || detailContact.phone || detailContact.id);
    const docId = detailContact.id || detailContact.phone;
    const fullEditData = { ...editData, id: phone, phone, updatedAt: new Date() };
    await updateDoc(doc(db, 'contacts', docId), fullEditData);
    setDetailContact({ ...detailContact, ...fullEditData });
    setEditMode(false);
  };

  const addNote = async () => {
    if (!detailContact || !noteText.trim()) return;
    const docId = detailContact.id || detailContact.phone;
    const notes = detailContact.notes || [];
    notes.push({ text: noteText.trim(), date: new Date().toISOString(), by: user.email });
    await updateDoc(doc(db, 'contacts', docId), { notes });
    setDetailContact({ ...detailContact, notes });
    setNoteText('');
  };

  const openChat = (phone) => {
    router.push('/chatboost/dashboard');
    // The dashboard will pick up the phone from URL or we can use localStorage
    if (typeof window !== 'undefined') localStorage.setItem('openChatWith', phone);
  };

  // Template sending (same logic as before)
  const sendTemplateToContact = async (phone, templateName) => {
    if (!user || !phone || !templateName || !userData) return false;
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: 'POST',headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: templateName, language: { code: 'it' } } })
    });
    const data = await res.json();
    if (data.messages) {
      await addDoc(collection(db, 'messages'), { text: `Template inviato: ${templateName}`, to: phone, from: 'operator', timestamp: Date.now(), createdAt: serverTimestamp(), type: 'template', user_uid: user.uid, message_id: data.messages[0].id });
      return true;
    }
    return data.error?.message || 'Errore';
  };

  const sendTemplateMassive = async () => {
    if (!templateToSend) return;
    setSending(true); setSendLog(''); setReport([]);
    const toSend = contacts.filter(c => selected.has(c.phone || c.id));
    const reportArr = [];
    for (const c of toSend) {
      setSendLog(p => p + `${c.firstName || c.name} (${c.phone || c.id})... `);
      const res = await sendTemplateToContact(c.phone || c.id, templateToSend.name);
      if (res === true) { setSendLog(p => p + 'OK\n'); reportArr.push({ name: c.firstName, id: c.phone || c.id, status: 'OK' }); }
      else { setSendLog(p => p + `Errore\n`); reportArr.push({ name: c.firstName, id: c.phone || c.id, status: 'KO', error: res }); }
      await new Promise(r => setTimeout(r, 200));
    }
    setReport(reportArr); setSending(false);
    setTimeout(() => setModalOpen(false), 1200);
  };

  /* ════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════ */
  return (
    <div className="h-full flex flex-col lg:flex-row font-[Montserrat] overflow-hidden">

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-full lg:w-72 bg-white border-r border-slate-200/60 flex flex-col shrink-0 overflow-hidden">
        {/* Stats */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Users size={16} className="text-slate-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Contatti</h2>
              <p className="text-[11px] text-slate-400">{stats.total} totali</p>
            </div>
          </div>
          {/* Source mini-stats */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(stats.bySource).map(([src, count]) => {
              const cfg = SOURCE_CONFIG[src] || SOURCE_CONFIG.manual;
              return (
                <span key={src} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${cfg.color}`}>
                  {count} {cfg.label}
                </span>
              );
            })}
          </div>
          {/* Create category */}
          <div className="flex gap-1.5 pr-1">
            <input placeholder="Nuova categoria" value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCategory()}
              className="input-premium flex-1 min-w-0 text-xs h-8 px-2.5" />
            <button onClick={createCategory} className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shrink-0 transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => { setShowUnassigned(false); setCurrentCat(null); setSelected(new Set()); }}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              !currentCat && !showUnassigned ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Users size={14} /> Tutti <span className="ml-auto text-[10px] opacity-60">{stats.total}</span>
          </button>
          <button
            onClick={() => { setShowUnassigned(true); setCurrentCat(null); setSelected(new Set()); }}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              showUnassigned ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <Hash size={14} /> Senza categoria
          </button>
          {categories.map(cat => {
            const active = currentCat === cat.id && !showUnassigned;
            return (
              <button key={cat.id}
                onClick={() => { setCurrentCat(cat.id); setShowUnassigned(false); setSelected(new Set()); }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="truncate flex-1 text-left">{cat.name}</span>
                <span className="text-[10px] opacity-50">{catCounts[cat.id] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Tag filter */}
        <div className="px-3 py-2.5 border-t border-slate-100">
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="select-premium w-full text-xs h-8 py-0">
            <option value="">Tutti i tag</option>
            {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-1)]">
        {/* Toolbar */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200/60 px-4 py-3 z-10 shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder='Cerca contatti...' value={search} onChange={e => setSearch(e.target.value)}
                className="input-premium w-full pl-9 pr-3 py-2 text-sm" />
            </div>

            <button onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm">
              <Plus size={14} /> Nuovo
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer transition-colors">
              <Upload size={14} /> Importa
              <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={e => e.target.files[0] && importFile(e.target.files[0])} />
            </label>
            <button onClick={exportContacts}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors">
              <Download size={14} /> Esporta
            </button>

            {/* Bulk actions */}
            {selected.size > 0 && (
              <div className="flex gap-1.5 items-center ml-1 pl-3 border-l border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">{selected.size}</span>
                <button onClick={() => setBulkTagModal(true)} className="w-8 h-8 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 flex items-center justify-center transition-colors" title="Gestisci tag">
                  <Tag size={14} />
                </button>
                <button onClick={() => setMoveModalOpen(true)} className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-600 flex items-center justify-center transition-colors" title="Sposta">
                  <FolderSymlink size={14} />
                </button>
                {currentCat && (
                  <button onClick={removeSelectedFromCategory} className="w-8 h-8 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-600 flex items-center justify-center transition-colors" title="Rimuovi da cat.">
                    <ArrowRight size={14} />
                  </button>
                )}
                <button onClick={deleteSelectedContacts} className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors" title="Elimina">
                  <Trash2 size={14} />
                </button>
                <button onClick={() => setModalOpen(true)} className="w-8 h-8 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center transition-colors" title="Invia template">
                  <Send size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-100">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_minmax(120px,auto)_auto] md:grid-cols-[auto_1fr_minmax(120px,auto)_auto_auto] lg:grid-cols-[auto_1fr_minmax(120px,auto)_auto_auto_auto] items-center gap-x-4 px-4 py-2 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-[5]">
              <div><input type="checkbox" onChange={e => toggleSelectAll(e.target.checked)}
                checked={selected.size === contacts.length && contacts.length > 0} className="rounded border-slate-300 w-3.5 h-3.5" /></div>
              <div>Contatto</div>
              <div className="hidden sm:block">Telefono</div>
              <div className="hidden md:block">Sorgente</div>
              <div className="hidden lg:block">Ultimo msg</div>
              <div></div>
            </div>

            {contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <Users size={28} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nessun contatto trovato</p>
                <p className="text-xs text-slate-400 mt-1">Crea un nuovo contatto o cambia i filtri</p>
              </div>
            ) : (
              contacts.map(c => {
                const phone = c.phone || c.id;
                const lastMsg = lastMsgMap.get(phone);
                const lastTime = lastMsg ? new Date(
                  typeof lastMsg.timestamp === 'number'
                    ? (lastMsg.timestamp > 1e12 ? lastMsg.timestamp : lastMsg.timestamp * 1000)
                    : Date.now()
                ) : null;
                const isSelected = selected.has(phone);

                return (
                  <div key={phone}
                    className={`grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_minmax(120px,auto)_auto] md:grid-cols-[auto_1fr_minmax(120px,auto)_auto_auto] lg:grid-cols-[auto_1fr_minmax(120px,auto)_auto_auto_auto] items-center gap-x-4 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group ${isSelected ? 'bg-emerald-50/50' : ''}`}
                    onClick={() => handleOpenContact(c)}
                  >
                    <div onClick={e => { e.stopPropagation(); toggleSelect(phone); }}>
                      <input type="checkbox" checked={isSelected} readOnly className="rounded border-slate-300 w-3.5 h-3.5 cursor-pointer" />
                    </div>

                    {/* Name + email + tags */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{c.firstName || c.name || '—'} {c.lastName || ''}</span>
                        {(c.tags||[]).slice(0, 2).map(tag => (
                          <span key={tag} className="hidden md:inline px-1.5 py-0 rounded text-[9px] font-medium bg-slate-100 text-slate-500">{tag}</span>
                        ))}
                        {(c.tags||[]).length > 2 && <span className="hidden md:inline text-[9px] text-slate-400">+{(c.tags||[]).length - 2}</span>}
                      </div>
                      {c.email && <p className="text-[11px] text-slate-400 truncate">{c.email}</p>}
                    </div>

                    {/* Phone */}
                    <div className="hidden sm:block">
                      <span className="text-xs text-slate-500 font-mono">{phone}</span>
                    </div>

                    {/* Source */}
                    <div className="hidden md:block">
                      <SourceBadge source={c.source} />
                    </div>

                    {/* Last message */}
                    <div className="hidden lg:block">
                      {lastTime ? (
                        <span className="text-[10px] text-slate-400">{lastTime.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-end">
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer count */}
          {contacts.length > 0 && (
            <div className="px-4 py-3 bg-white border-t border-slate-100 text-[11px] text-slate-400 font-medium">
              {contacts.length} contatt{contacts.length === 1 ? 'o' : 'i'}
              {selected.size > 0 && ` · ${selected.size} selezionat${selected.size === 1 ? 'o' : 'i'}`}
            </div>
          )}
        </div>
      </div>

      {/* ═══ DETAIL PANEL (right side) ═══ */}
      {detailContact && (
        <div className="fixed inset-0 lg:relative lg:inset-auto lg:w-[400px] xl:w-[440px] bg-white border-l border-slate-200/60 flex flex-col z-40 lg:z-auto overflow-hidden shrink-0">
          {/* Detail header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
            <button onClick={() => { setDetailContact(null); setEditMode(false); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{detailContact.firstName} {detailContact.lastName}</h3>
              <p className="text-xs text-slate-400 font-mono">{detailContact.phone || detailContact.id}</p>
            </div>
            <SourceBadge source={detailContact.source} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Quick actions */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => openChat(detailContact.phone || detailContact.id)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors">
                  <MessageSquare size={18} />
                  <span className="text-[10px] font-semibold">Chat</span>
                </button>
                <a href={`tel:${detailContact.phone || detailContact.id}`}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors">
                  <Phone size={18} />
                  <span className="text-[10px] font-semibold">Chiama</span>
                </a>
                <a href={`mailto:${detailContact.email || ''}`}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors ${detailContact.email ? 'bg-violet-50 hover:bg-violet-100 text-violet-700' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                  <Mail size={18} />
                  <span className="text-[10px] font-semibold">Email</span>
                </a>
              </div>
            </div>

            {/* Info fields */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Informazioni</h4>
                <button onClick={() => setEditMode(!editMode)}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                  {editMode ? 'Annulla' : 'Modifica'}
                </button>
              </div>
              <div className="space-y-2.5">
                {[
                  { key: 'firstName', label: 'Nome', icon: User },
                  { key: 'lastName', label: 'Cognome', icon: User },
                  { key: 'email', label: 'Email', icon: Mail },
                  { key: 'phone', label: 'Telefono', icon: Phone },
                  { key: 'address', label: 'Indirizzo', icon: MapPin },
                  { key: 'city', label: 'Città', icon: MapPin },
                  { key: 'province', label: 'Provincia', icon: Globe },
                  { key: 'shop', label: 'Shop', icon: ShoppingBag },
                ].map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Icon size={13} className="text-slate-400 shrink-0" />
                    {editMode ? (
                      <input value={editData[key] || ''} onChange={e => setEditData(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={label} className="input-premium flex-1 text-xs h-8 px-2.5" />
                    ) : (
                      <span className="text-xs text-slate-700 truncate">{detailContact[key] || <span className="text-slate-300">—</span>}</span>
                    )}
                  </div>
                ))}
                {/* Tags */}
                <div className="flex items-start gap-3">
                  <Tag size={13} className="text-slate-400 shrink-0 mt-1" />
                  {editMode ? (
                    <input value={Array.isArray(editData.tags) ? editData.tags.join(', ') : ''} placeholder="Tag (virgola sep.)"
                      onChange={e => setEditData(p => ({ ...p, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      className="input-premium flex-1 text-xs h-8 px-2.5" />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(detailContact.tags || []).length > 0
                        ? (detailContact.tags||[]).map(t => <span key={t} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">{t}</span>)
                        : <span className="text-xs text-slate-300">—</span>}
                    </div>
                  )}
                </div>
              </div>
              {editMode && (
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleSaveEdit} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs flex-1">
                    <Save size={13} className="mr-1" /> Salva
                  </Button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="px-5 py-4 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Note CRM</h4>
              {(detailContact.notes || []).length > 0 && (
                <div className="space-y-2 mb-3">
                  {(detailContact.notes || []).map((n, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <p className="text-xs text-slate-700">{n.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(n.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Aggiungi nota..."
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  className="input-premium flex-1 text-xs h-8 px-2.5" />
                <button onClick={addNote} disabled={!noteText.trim()}
                  className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-colors disabled:opacity-40 shrink-0">
                  <StickyNote size={13} />
                </button>
              </div>
            </div>

            {/* Activity timeline */}
            <div className="px-5 py-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Attività recente</h4>
              {contactMessages.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-4">Nessuna interazione</p>
              ) : (
                <div className="space-y-2">
                  {contactMessages.map((msg, i) => {
                    const isOut = msg.from === 'operator' || msg.direction === 'outgoing';
                    const ts = typeof msg.timestamp === 'number'
                      ? (msg.timestamp > 1e12 ? msg.timestamp : msg.timestamp * 1000) : 0;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isOut ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {isOut ? <ArrowUpRight size={10} /> : <MessageSquare size={10} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-slate-700 truncate">{msg.text || `[${msg.type}]`}</p>
                          <p className="text-[10px] text-slate-400">
                            {isOut ? 'Inviato' : 'Ricevuto'} · {ts ? new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Nuovo contatto ═══ */}
      {createModalOpen && (
        <div className="modal-overlay" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Plus size={18} className="text-emerald-600" /></div>
                <h3 className="text-lg font-bold text-slate-900">Nuovo contatto</h3>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Nome" value={newContactName} onChange={e => setNewContactName(e.target.value)} className="input-premium px-3 py-2.5 text-sm" />
                <input placeholder="Cognome" value={newContactSurname} onChange={e => setNewContactSurname(e.target.value)} className="input-premium px-3 py-2.5 text-sm" />
              </div>
              <input placeholder="Telefono" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} className="input-premium w-full px-3 py-2.5 text-sm" />
              <input placeholder="Email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} className="input-premium w-full px-3 py-2.5 text-sm" />
              <input placeholder="Tag (virgola separati)" value={newContactTags} onChange={e => setNewContactTags(e.target.value)} className="input-premium w-full px-3 py-2.5 text-sm" />
              <Button onClick={addNewContact} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-11 rounded-xl font-semibold mt-1">Salva contatto</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Bulk tag ═══ */}
      {bulkTagModal && (
        <div className="modal-overlay" onClick={() => setBulkTagModal(false)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Tag size={18} className="text-indigo-600" /></div>
                <h3 className="text-lg font-bold text-slate-900">Gestisci tag</h3>
              </div>
              <button onClick={() => setBulkTagModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setBulkTagAction('add')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${bulkTagAction === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Aggiungi
              </button>
              <button onClick={() => setBulkTagAction('remove')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${bulkTagAction === 'remove' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Rimuovi
              </button>
            </div>
            <input value={bulkTagValue} onChange={e => setBulkTagValue(e.target.value)} placeholder="Nome tag..."
              className="input-premium w-full px-3 py-2.5 text-sm mb-3" />
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {allTags.slice(0, 15).map(t => (
                  <button key={t} onClick={() => setBulkTagValue(t)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${bulkTagValue === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={bulkTagApply} disabled={!bulkTagValue.trim()}
              className={`w-full h-10 rounded-xl font-semibold ${bulkTagAction === 'add' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
              {bulkTagAction === 'add' ? 'Aggiungi' : 'Rimuovi'} tag a {selected.size} contatti
            </Button>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Sposta ═══ */}
      {moveModalOpen && (
        <div className="modal-overlay" onClick={() => setMoveModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><FolderSymlink size={18} className="text-amber-600" /></div>
                <h3 className="text-lg font-bold text-slate-900">Sposta contatti</h3>
              </div>
              <button onClick={() => setMoveModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Categorie di destinazione</label>
            <div className="flex flex-wrap gap-2 mb-5">
              {categories.map(cat => (
                <label key={cat.id} className={`cursor-pointer px-3.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                  targetCategories.includes(cat.id) ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}>
                  <input type="checkbox" checked={targetCategories.includes(cat.id)} className="sr-only"
                    onChange={e => { if (e.target.checked) setTargetCategories([...targetCategories, cat.id]); else setTargetCategories(targetCategories.filter(id => id !== cat.id)); }} />
                  {cat.name}
                </label>
              ))}
            </div>
            <Button onClick={moveContacts} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl w-full h-11" disabled={targetCategories.length === 0}>
              Sposta {selected.size} contatti
            </Button>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Invio massivo ═══ */}
      {modalOpen && (
        <div className="modal-overlay p-4" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">Invia template <span className="text-slate-400 font-normal">({selected.size})</span></h3>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Template</label>
            <select value={templateToSend?.name || ''} onChange={e => setTemplateToSend(templates.find(t => t.name === e.target.value) || null)}
              className="select-premium w-full mb-4">
              <option value="">Scegli template...</option>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={sendTemplateMassive} disabled={sending || !templateToSend}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2">
                {sending && <Loader2 size={14} className="animate-spin" />} Invia
              </Button>
              <Button onClick={() => setModalOpen(false)} variant="outline" className="rounded-xl">Annulla</Button>
            </div>
            {sendLog && <pre className="mt-3 max-h-32 overflow-y-auto bg-slate-50 border border-slate-200 p-3 rounded-xl text-[10px] font-mono text-slate-600 whitespace-pre-wrap">{sendLog}</pre>}
            {report.length > 0 && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs max-h-28 overflow-y-auto">
                {report.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    {r.status === 'OK' ? <CheckCircle size={12} className="text-emerald-500" /> : <XCircle size={12} className="text-red-500" />}
                    <span>{r.name} ({r.id})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
