'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Send, Plus, ArrowLeft, Camera, Paperclip, Trash2,
  ChevronDown, Search, X, FileText, Loader2,
  Check, CheckCheck, Clock, AlertCircle, MessageSquare
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = String(phoneRaw)
    .trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (String(phoneRaw).startsWith('+')) return String(phoneRaw).trim();
  return '';
}

const parseTime = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    if (isNaN(n)) return 0;
    return n > 1e12 ? n : n * 1000;
  }
  if (val && typeof val === 'object') {
    if (val.seconds != null) return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
    if (typeof val.getTime === 'function') return val.getTime();
  }
  return 0;
};

function renderTextWithLinks(text) {
  if (!text) return null;
  let s = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n');
  if (!s.includes('\n')) {
    s = s
      .replace(/\s+(Corriere:)/, '\n$1')
      .replace(/\s+(Tracking:)/, '\n$1')
      .replace(/\s+(Puoi tracciare|Traccia la spedizione)/, '\n$1')
      .replace(/\s+(Questo numero WhatsApp)/, '\n\n$1');
  }
  const urlRe = /\bhttps?:\/\/[^\s]+/gi;
  return s.split('\n').map((line, iLine, lines) => {
    const nodes = [];
    let lastIndex = 0;
    let match;
    while ((match = urlRe.exec(line)) !== null) {
      const url = match[0];
      const offset = match.index;
      if (offset > lastIndex) nodes.push(line.slice(lastIndex, offset));
      nodes.push(
        <a key={`ln-${iLine}-ofs-${offset}`} href={url} target="_blank" rel="noopener noreferrer"
          className="underline break-words opacity-90 hover:opacity-100">
          {url}
        </a>
      );
      lastIndex = offset + url.length;
    }
    if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
    return (
      <span key={`ln-${iLine}`}>
        {nodes}
        {iLine < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

// ── Status ticks component ──
function StatusTicks({ msg }) {
  if (msg.from === 'operator' || msg.direction === 'outgoing') {
    const status = msg.wa_status;
    if (status === 'failed') {
      return <AlertCircle size={13} className="text-red-400 shrink-0" />;
    }
    if (status === 'read') {
      return <CheckCheck size={13} className="text-blue-400 shrink-0" />;
    }
    if (status === 'delivered') {
      return <CheckCheck size={13} className="text-slate-400/70 shrink-0" />;
    }
    if (status === 'sent') {
      return <Check size={13} className="text-slate-400/70 shrink-0" />;
    }
    // Fallback: messaggio inviato ma senza status dal webhook ancora
    return <Check size={13} className="text-slate-400/50 shrink-0" />;
  }
  return null;
}

// ── Avatar initials ──
function AvatarInitials({ name, size = 'md' }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');
  const colors = [
    'from-emerald-400 to-teal-500',
    'from-blue-400 to-indigo-500',
    'from-violet-400 to-purple-500',
    'from-amber-400 to-orange-500',
    'from-rose-400 to-pink-500',
    'from-cyan-400 to-sky-500',
  ];
  const colorIdx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const sizeClass = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm';

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

// ── Format time helpers ──
function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Oggi';
  if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [userData, setUserData] = useState(null);
  const [canSendMessage, setCanSendMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const listChatRef = useRef(null);

  const [searchContact, setSearchContact] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });
  const [sending, setSending] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  let longPressTimeout = useRef();

  // blocca lo scroll del body
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  // Open chat from contacts page (via localStorage)
  useEffect(() => {
    const phone = localStorage.getItem('openChatWith');
    if (phone) {
      setSelectedPhone(phone);
      localStorage.removeItem('openChatWith');
    }
  }, []);

  // userData
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // contatti dedup
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const byPhone = new Map();
      cs.forEach(d => {
        const c = d.data();
        const phoneNorm = normalizePhone(c.phone || d.id);
        if (!phoneNorm) return;
        const candidate = {
          phone: phoneNorm,
          name: c.firstName || c.name || '',
          lastName: c.lastName || '',
          email: c.email || '',
          source: c.source || '',
        };
        const score =
          (candidate.source === 'manual' ? 100 : 0) +
          (candidate.lastName ? 3 : 0) +
          (candidate.name ? 2 : 0) +
          (candidate.email ? 1 : 0);
        const prev = byPhone.get(phoneNorm);
        const prevScore = prev?.__score ?? -1;
        if (!prev || score > prevScore) {
          byPhone.set(phoneNorm, { ...candidate, __score: score });
        }
      });
      const arr = Array.from(byPhone.values()).map(({ __score, ...rest }) => rest);
      setAllContacts(arr);
      const map = {};
      arr.forEach(c => { map[c.phone] = c.name || c.phone; });
      setContactNames(map);
    })();
  }, [user]);

  // ricerca contatti
  useEffect(() => {
    if (!searchContact.trim()) { setFilteredContacts([]); return; }
    const search = searchContact.trim().toLowerCase();
    const tokens = search.split(/\s+/).filter(Boolean);
    const found = allContacts.filter(c => {
      const fields = [
        (c.name || '').toLowerCase(),
        (c.lastName || '').toLowerCase(),
        (c.email || '').toLowerCase(),
        (c.phone || '').toLowerCase(),
      ];
      return tokens.length === 1
        ? fields.some(f => f.includes(tokens[0]))
        : tokens.every(tok => fields.some(f => f.includes(tok)));
    });
    setFilteredContacts(found);
  }, [searchContact, allContacts]);

  // messages realtime
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllMessages(msgs);
    });
    return () => unsub();
  }, [user]);

  // conversazioni aggregate
  const phonesData = useMemo(() => {
    const map = new Map();
    for (const m of allMessages) {
      const fromNorm = normalizePhone(m.from);
      const toNorm = normalizePhone(m.to);
      const phone = m.from === 'operator' ? toNorm : fromNorm;
      if (!phone) continue;
      const time = parseTime(m.timestamp || m.createdAt);
      let lastText =
        m.text ||
        (m.type === 'image' ? '[Immagine]' :
         m.type === 'document' ? '[Documento]' :
         m.type === 'audio' ? '[Audio]' :
         m.type === 'video' ? '[Video]' :
         m.type === 'sticker' ? '[Sticker]' : '');
      // Clean up old template preview text
      if (m.type === 'template' && lastText.startsWith('Template inviato:')) {
        const tName = lastText.replace('Template inviato:', '').trim();
        lastText = `📄 ${tName}`;
      } else if (m.type === 'template') {
        lastText = lastText.length > 50 ? `📄 ${lastText.substring(0, 50)}...` : `📄 ${lastText}`;
      }
      const unreadInc = (fromNorm === phone && m.read === false) ? 1 : 0;
      const prev = map.get(phone);
      if (!prev) {
        map.set(phone, { phone, name: contactNames[phone] || phone, lastMsgTime: time, lastMsgText: lastText, lastMsgFrom: m.from, unread: unreadInc });
      } else {
        if (time >= prev.lastMsgTime) { prev.lastMsgTime = time; prev.lastMsgText = lastText; prev.lastMsgFrom = m.from; }
        prev.unread += unreadInc;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if ((b.unread > 0) !== (a.unread > 0)) return b.unread - a.unread;
      return b.lastMsgTime - a.lastMsgTime;
    });
  }, [allMessages, contactNames]);

  // sidebar search filter
  const visibleThreads = useMemo(() => {
    if (!sidebarSearch.trim()) return phonesData;
    const s = sidebarSearch.trim().toLowerCase();
    return phonesData.filter(t =>
      t.name.toLowerCase().includes(s) || t.phone.includes(s)
    );
  }, [phonesData, sidebarSearch]);

  const unreadThreads = useMemo(() => visibleThreads.filter(x => x.unread > 0), [visibleThreads]);
  const readThreads = useMemo(() => visibleThreads.filter(x => x.unread === 0), [visibleThreads]);

  // finestra 24h
  useEffect(() => {
    if (!user?.uid || !selectedPhone) { setCanSendMessage(false); return; }
    const msgs = allMessages.filter(m =>
      normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone
    );
    const lastInbound = msgs
      .filter(m => normalizePhone(m.from) === selectedPhone)
      .sort((a, b) => parseTime(b.timestamp || b.createdAt) - parseTime(a.timestamp || a.createdAt))[0];
    if (!lastInbound) { setCanSendMessage(false); return; }
    setCanSendMessage(Date.now() - parseTime(lastInbound.timestamp || lastInbound.createdAt) < 86400000);
  }, [user, allMessages, selectedPhone]);

  // segna letti
  useEffect(() => {
    if (!selectedPhone || !user?.uid || allMessages.length === 0) return;
    const unreadMsgIds = allMessages
      .filter(m => normalizePhone(m.from) === selectedPhone && m.read === false)
      .map(m => m.id);
    if (unreadMsgIds.length > 0) {
      const batch = writeBatch(db);
      unreadMsgIds.forEach(id => batch.update(doc(collection(db, 'messages'), id), { read: true }));
      batch.commit();
    }
  }, [selectedPhone, allMessages, user]);

  // autoscroll messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // scroll to bottom button
  const chatBoxRef = useRef();
  const [showScrollDown, setShowScrollDown] = useState(false);
  const handleScroll = () => {
    if (!chatBoxRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
  };
  const scrollToBottom = () => {
    chatBoxRef.current?.scrollTo({ top: chatBoxRef.current.scrollHeight, behavior: 'smooth' });
  };

  // templates
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uid: user.uid }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data.filter(t => t.status === 'APPROVED'));
    })();
  }, [user]);

  // messaggi filtrati
  const filtered = useMemo(() => (
    allMessages
      .filter(m => normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone)
      .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt))
  ), [allMessages, selectedPhone]);

  // date separators
  const messagesWithDates = useMemo(() => {
    const result = [];
    let lastDate = '';
    for (const msg of filtered) {
      const ts = parseTime(msg.timestamp || msg.createdAt);
      const dateStr = new Date(ts).toDateString();
      if (dateStr !== lastDate) {
        result.push({ type: 'date', date: ts, key: `date-${dateStr}` });
        lastDate = dateStr;
      }
      result.push({ type: 'message', msg, key: msg.id || `msg-${ts}` });
    }
    return result;
  }, [filtered]);

  // media
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handleMediaInput = type => e => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedMedia({ file, type });
    setShowTemplates(false);
    setMessageText('');
  };

  // context menus
  const handleMessageContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX ?? window.innerWidth/2, y: e.clientY ?? window.innerHeight/2, messageId: id });
  };
  const handleDeleteMessage = async () => {
    if (contextMenu.messageId) {
      await deleteDoc(doc(db, 'messages'), contextMenu.messageId);
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
    }
  };
  const handleChatContextMenu = (e, phone) => {
    e.preventDefault();
    e.stopPropagation();
    setChatMenu({ visible: true, x: e.clientX ?? window.innerWidth/2, y: e.clientY ?? window.innerHeight/2, phone });
  };
  const handleDeleteChat = async () => {
    if (chatMenu.phone) {
      const msgs = allMessages.filter(m => normalizePhone(m.from) === chatMenu.phone || normalizePhone(m.to) === chatMenu.phone);
      const batch = writeBatch(db);
      msgs.forEach(m => batch.delete(doc(db, 'messages', m.id)));
      await batch.commit();
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
      if (selectedPhone === chatMenu.phone) setSelectedPhone('');
    }
  };
  const handleDeleteAllConversations = async () => {
    if (!user?.uid) return;
    const mine = allMessages.filter(m => m.user_uid === user.uid);
    if (mine.length === 0) return;
    const ok1 = confirm(`Elimina TUTTE le conversazioni (${mine.length} messaggi)? Azione irreversibile.`);
    if (!ok1) return;
    const check = prompt('Scrivi "ELIMINA TUTTO" per confermare:');
    if (check !== 'ELIMINA TUTTO') return;
    const CHUNK = 450;
    for (let i = 0; i < mine.length; i += CHUNK) {
      const batch = writeBatch(db);
      mine.slice(i, i + CHUNK).forEach(m => { if (m.id) batch.delete(doc(db, 'messages', m.id)); });
      await batch.commit();
    }
    setSelectedPhone('');
    setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
    setChatMenu({ visible: false, x: 0, y: 0, phone: null });
  };

  // close context menus
  useEffect(() => {
    if (!contextMenu.visible && !chatMenu.visible) return;
    const close = (e) => {
      const menu = document.getElementById('menu-contestuale-msg');
      if (menu && menu.contains(e?.target)) return;
      const chatMenuEl = document.getElementById('menu-contestuale-chat');
      if (chatMenuEl && chatMenuEl.contains(e?.target)) return;
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
    };
    const esc = (e) => { if (e.key === 'Escape') close(e); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close);
      window.removeEventListener('keydown', esc);
    };
  }, [contextMenu.visible, chatMenu.visible]);

  const handleTouchStart = (id) => {
    longPressTimeout.current = setTimeout(() => {
      setContextMenu({ visible: true, x: window.innerWidth / 2, y: window.innerHeight / 2, messageId: id });
    }, 600);
  };
  const handleTouchEnd = () => clearTimeout(longPressTimeout.current);

  // ── Send message ──
  const sendMessage = async () => {
    if (!selectedPhone || (!messageText.trim() && !selectedMedia) || !userData) return;
    if (!canSendMessage) return;
    if (sending) return;
    setSending(true);
    try {
      if (selectedMedia) {
        const uploadData = new FormData();
        uploadData.append('file', selectedMedia.file);
        uploadData.append('phone_number_id', userData.phone_number_id);
        const uploadRes = await fetch('/api/send-media', { method: 'POST', body: uploadData });
        const uploadJson = await uploadRes.json();
        const media_id = uploadJson.id;
        if (!media_id) {
          alert('Errore upload media: ' + JSON.stringify(uploadJson.error || uploadJson));
          return;
        }
        const payload = {
          messaging_product: 'whatsapp', to: selectedPhone,
          type: selectedMedia.type, [selectedMedia.type]: { id: media_id, caption: '' },
        };
        const res = await fetch(
          `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
          { method: 'POST', headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        const data = await res.json();
        if (data.messages) {
          await addDoc(collection(db, 'messages'), {
            text: '', to: selectedPhone, from: 'operator', timestamp: Date.now(),
            createdAt: serverTimestamp(), type: selectedMedia.type, media_id,
            user_uid: user.uid, read: true, message_id: data.messages[0].id,
            wa_status: 'sent',
          });
          if (messageText.trim()) {
            const resText = await fetch('/api/send-text', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: selectedPhone, text: messageText.trim(), phone_number_id: userData.phone_number_id })
            });
            const dataText = await resText.json();
            if (resText.ok && dataText?.messages) {
              await addDoc(collection(db, 'messages'), {
                text: messageText.trim(), to: selectedPhone, from: 'operator',
                timestamp: Date.now(), createdAt: serverTimestamp(), type: 'text',
                user_uid: user.uid, read: true, message_id: dataText.messages[0].id,
                wa_status: 'sent',
              });
            }
          }
          setMessageText(''); setSelectedMedia(null);
        } else {
          alert('Errore invio media: ' + JSON.stringify(data.error));
        }
        return;
      }

      const res = await fetch('/api/send-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selectedPhone, text: messageText, phone_number_id: userData.phone_number_id })
      });
      const data = await res.json();
      if (res.ok && data.messages) {
        await addDoc(collection(db, 'messages'), {
          text: messageText, to: selectedPhone, from: 'operator', timestamp: Date.now(),
          createdAt: serverTimestamp(), type: 'text', user_uid: user.uid, read: true,
          message_id: data.messages[0].id, wa_status: 'sent',
        });
        setMessageText('');
      } else {
        alert('Errore invio: ' + JSON.stringify(data.error || data));
      }
    } finally {
      setSending(false);
    }
  };

  // ── Send template — salva il body text reale ──
  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    const template = templates.find(t => t.name === name);
    if (!template) return alert('Template non trovato!');

    // Estrai il body text reale dal template
    const bodyComp = template.components?.find(c => c.type === 'BODY');
    const bodyText = bodyComp?.text || `Template: ${name}`;

    let components = [];
    const headerComp = template.components?.find(c => c.type === 'HEADER');
    if (headerComp) {
      if (headerComp.format === 'TEXT' && headerComp.text?.includes('{{')) {
        components.push({ type: 'header', parameters: [{ type: 'text', text: '' }] });
      } else if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(headerComp.format)) {
        const mediaType = headerComp.format.toLowerCase();
        const exampleUrl = headerComp.example?.header_handle?.[0] || '';
        if (exampleUrl) {
          components.push({ type: 'header', parameters: [{ type: mediaType, [mediaType]: { link: exampleUrl } }] });
        }
      }
    }
    if (bodyComp?.text && /\{\{\d+\}\}/.test(bodyComp.text)) {
      const matches = bodyComp.text.match(/\{\{\d+\}\}/g) || [];
      components.push({ type: 'body', parameters: matches.map(() => ({ type: 'text', text: '' })) });
    }

    setSending(true);
    try {
      const res = await fetch('/api/send-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedPhone, template_name: name,
          language: template.language || 'it',
          components: components.length > 0 ? components : undefined,
          user_uid: user.uid,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.messages) {
        await addDoc(collection(db, 'messages'), {
          text: bodyText,
          to: selectedPhone, from: 'operator', timestamp: Date.now(),
          createdAt: serverTimestamp(), type: 'template',
          template_name: name,
          user_uid: user.uid, read: true,
          message_id: data.data.messages[0].id,
          wa_status: 'sent',
        });
        setShowTemplates(false);
      } else {
        const errMsg = data.error?.message || data.error?.error_data?.details || JSON.stringify(data.error);
        alert('Errore template: ' + errMsg);
      }
    } catch (e) {
      alert('Errore invio template: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  // ══════════════════════════════════════════
  // UI — iOS-style Chat
  // ══════════════════════════════════════════
  return (
    <div className="chat-shell flex flex-col md:flex-row bg-[var(--surface-1)] font-[Montserrat] overflow-hidden">

      {/* ═══ SIDEBAR ═══ */}
      <div
        className={`${selectedPhone ? 'hidden' : 'flex'} md:flex flex-col md:w-[340px] lg:w-[380px] bg-white border-r border-slate-200/60 chat-scroll`}
        ref={listChatRef}
      >
        {/* Sidebar header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Chat</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowNewChat(true)}
                className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shadow-sm"
                title="Nuova chat"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
              <button
                onClick={handleDeleteAllConversations}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Svuota tutto"
                disabled={allMessages.length === 0}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Cerca chat..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all border border-transparent focus:border-slate-200"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {visibleThreads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MessageSquare size={24} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-400 text-center">Nessuna conversazione</p>
            </div>
          )}

          {/* Non letti */}
          {unreadThreads.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Non letti</span>
              </div>
              {unreadThreads.map(({ phone, name, lastMsgText, unread, lastMsgTime }) => (
                <button
                  key={`u-${phone}`}
                  data-phone={phone}
                  onClick={() => setSelectedPhone(phone)}
                  onContextMenu={e => handleChatContextMenu(e, phone)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                    selectedPhone === phone ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <AvatarInitials name={name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{name}</span>
                      <span className="text-[10px] text-emerald-600 font-medium shrink-0">{formatTime(lastMsgTime)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">{lastMsgText}</span>
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Letti */}
          {readThreads.length > 0 && (
            <div>
              {unreadThreads.length > 0 && (
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recenti</span>
                </div>
              )}
              {readThreads.map(({ phone, name, lastMsgText, lastMsgTime }) => (
                <button
                  key={`r-${phone}`}
                  data-phone={phone}
                  onClick={() => setSelectedPhone(phone)}
                  onContextMenu={e => handleChatContextMenu(e, phone)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                    selectedPhone === phone ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <AvatarInitials name={name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-slate-800 truncate">{name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{formatTime(lastMsgTime)}</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{lastMsgText}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New chat panel */}
        {showNewChat && (
          <div className="absolute inset-0 md:relative md:inset-auto bg-white z-20 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <button onClick={() => setShowNewChat(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <ArrowLeft size={18} />
              </button>
              <h3 className="text-sm font-bold text-slate-900">Nuova conversazione</h3>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Nome, telefono o email..."
                  value={searchContact}
                  onChange={e => setSearchContact(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white border border-transparent focus:border-slate-200 transition-all"
                  autoFocus
                />
              </div>
              {searchContact && filteredContacts.length > 0 && (
                <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {filteredContacts.map((c) => (
                    <button
                      key={c.phone}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      onClick={() => { setSelectedPhone(c.phone); setSearchContact(''); setShowNewChat(false); }}
                    >
                      <AvatarInitials name={`${c.name} ${c.lastName}`} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800 truncate block">{c.name} {c.lastName}</span>
                        <span className="text-xs text-slate-400 font-mono">{c.phone}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={() => {
                    if (searchContact) {
                      setSelectedPhone(normalizePhone(searchContact));
                      setSearchContact(''); setShowNewChat(false);
                    }
                  }}
                  className="flex-1 bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-10 text-sm"
                >
                  Avvia chat
                </Button>
                <Button variant="outline" onClick={() => setShowNewChat(false)} className="flex-1 rounded-xl h-10 text-sm">
                  Annulla
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ CHAT AREA ═══ */}
      {selectedPhone ? (
        <div className="flex flex-col flex-1 chat-bg relative overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200/60 sticky top-0 z-20 shadow-sm">
            <button onClick={() => setSelectedPhone('')} className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <AvatarInitials name={contactNames[selectedPhone] || selectedPhone} size="sm" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">{contactNames[selectedPhone] || selectedPhone}</h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">{selectedPhone}</p>
            </div>
          </div>

          {/* 24h warning */}
          {!canSendMessage && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs font-medium">
              <Clock size={14} className="shrink-0" />
              <span>Finestra 24h chiusa. Puoi inviare solo template WhatsApp.</span>
            </div>
          )}

          {/* Messages area */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth"
            ref={chatBoxRef}
            onScroll={handleScroll}
          >
            <div className="space-y-1">
              {messagesWithDates.map((item) => {
                if (item.type === 'date') {
                  return (
                    <div key={item.key} className="flex justify-center py-3">
                      <span className="px-3 py-1 rounded-lg bg-white/80 backdrop-blur-sm text-[11px] font-medium text-slate-500 shadow-sm border border-slate-200/50">
                        {formatDateLabel(item.date)}
                      </span>
                    </div>
                  );
                }

                const msg = item.msg;
                const isOut = msg.from === 'operator' || msg.direction === 'outgoing';
                const isTemplate = msg.type === 'template';
                const time = parseTime(msg.timestamp || msg.createdAt);

                // Per i vecchi messaggi template "Template inviato: nome", estrai il nome
                let templateName = msg.template_name || '';
                let displayText = msg.text || '';
                if (isTemplate && displayText.startsWith('Template inviato:')) {
                  templateName = templateName || displayText.replace('Template inviato:', '').trim();
                  // Prova a trovare il body reale dal template
                  const tpl = templates.find(t => t.name === templateName);
                  const bodyComp = tpl?.components?.find(c => c.type === 'BODY');
                  if (bodyComp?.text) {
                    displayText = bodyComp.text;
                  }
                }

                return (
                  <div
                    key={item.key}
                    className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1.5`}
                    onContextMenu={e => handleMessageContextMenu(e, msg.id)}
                    onTouchStart={() => handleTouchStart(msg.id)}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className={`relative max-w-[80%] sm:max-w-[65%] ${isOut ? 'order-1' : 'order-0'}`}>
                      {/* Media */}
                      {msg.type === 'image' && msg.media_id && (
                        <div className={`rounded-2xl overflow-hidden shadow-sm mb-0.5 ${isOut ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/media-proxy?media_id=${msg.media_id}`}
                            alt="Immagine"
                            className="max-w-full rounded-2xl"
                            loading="lazy"
                          />
                        </div>
                      )}
                      {msg.type === 'document' && msg.media_id && (
                        <a
                          href={`/api/media-proxy?media_id=${msg.media_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-sm text-sm ${
                            isOut
                              ? 'bg-emerald-600 text-white rounded-br-md'
                              : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
                          }`}
                        >
                          <FileText size={18} />
                          <span className="underline">Documento allegato</span>
                        </a>
                      )}

                      {/* Template card — stile WhatsApp */}
                      {isTemplate && displayText ? (
                        <div className={`rounded-2xl shadow-sm overflow-hidden ${isOut ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                          {/* Template body */}
                          <div className={`px-3.5 py-2.5 ${
                            isOut ? 'bg-[#005c4b] text-white' : 'bg-white text-slate-800 border border-slate-200/50'
                          }`}>
                            <div className="break-words whitespace-pre-wrap text-[13.5px] leading-[1.45]">
                              {renderTextWithLinks(displayText)}
                            </div>
                            {/* Footer: time + status */}
                            <div className={`flex items-center justify-end gap-1 mt-1.5 ${isOut ? 'text-white/50' : 'text-slate-400'}`}>
                              <span className="text-[10px]">{formatTime(time)}</span>
                              <StatusTicks msg={msg} />
                            </div>
                          </div>
                          {/* Template name tag */}
                          {templateName && (
                            <div className={`px-3.5 py-1.5 flex items-center gap-1.5 ${
                              isOut ? 'bg-[#004a3d] text-emerald-300/70' : 'bg-slate-50 text-slate-400 border-t border-slate-100'
                            }`}>
                              <FileText size={10} />
                              <span className="text-[10px] font-medium">{templateName}</span>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Normal text bubble */}
                      {!isTemplate && msg.text && (
                        <div
                          className={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-[1.45] shadow-sm ${
                            isOut
                              ? 'bg-[#005c4b] text-white rounded-br-md'
                              : 'bg-white text-slate-800 rounded-bl-md border border-slate-200/50'
                          }`}
                        >
                          <div className="break-words whitespace-pre-wrap">
                            {renderTextWithLinks(msg.text)}
                          </div>
                          {/* Time + status */}
                          <div className={`flex items-center justify-end gap-1 mt-1 -mb-0.5 ${isOut ? 'text-white/50' : 'text-slate-400'}`}>
                            <span className="text-[10px]">{formatTime(time)}</span>
                            <StatusTicks msg={msg} />
                          </div>
                        </div>
                      )}

                      {/* Time only for media without text */}
                      {!msg.text && !isTemplate && (msg.type === 'image' || msg.type === 'document') && (
                        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[10px] text-slate-400">{formatTime(time)}</span>
                          <StatusTicks msg={msg} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Scroll to bottom */}
          {showScrollDown && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-24 right-4 w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all hover:shadow-xl z-30"
            >
              <ChevronDown size={20} />
            </button>
          )}

          {/* Media preview */}
          {selectedMedia && (
            <MediaPreview selectedMedia={selectedMedia} onClear={() => setSelectedMedia(null)} />
          )}

          {/* ═══ COMPOSER ═══ */}
          <div className="bg-white border-t border-slate-200/60 px-3 py-2.5 safe-area-bottom">
            <div className="flex items-end gap-2">
              {/* Media buttons */}
              <div className="flex items-center gap-0.5 pb-1">
                <label className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
                  <Camera size={20} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleMediaInput('image')} disabled={!canSendMessage || sending} />
                </label>
                <label className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
                  <Paperclip size={20} />
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" className="hidden" onChange={handleMediaInput('document')} disabled={!canSendMessage || sending} />
                </label>
              </div>

              {/* Text input */}
              <div className="flex-1 relative">
                <textarea
                  placeholder={canSendMessage ? "Scrivi un messaggio..." : "Finestra 24h chiusa"}
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !sending) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={!canSendMessage || sending}
                  rows={1}
                  className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white border border-transparent focus:border-slate-200 transition-all max-h-32 disabled:opacity-50"
                  style={{ minHeight: '40px' }}
                  onInput={e => {
                    e.target.style.height = '40px';
                    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                  }}
                />
              </div>

              {/* Send / Template */}
              <div className="flex items-center gap-1 pb-1">
                <button
                  onClick={sendMessage}
                  disabled={sending || (!messageText.trim() && !selectedMedia) || !canSendMessage}
                  className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-emerald-600 shadow-sm active:scale-95"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
                </button>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  disabled={sending}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors text-xs font-bold ${
                    showTemplates
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title="Template WhatsApp"
                >
                  <FileText size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Template picker */}
          {showTemplates && (
            <div className="absolute bottom-[72px] left-0 right-0 md:left-auto md:right-4 md:max-w-sm z-50 mx-3 md:mx-0">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in-scale">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Template WhatsApp</h3>
                  <button onClick={() => setShowTemplates(false)} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                  {templates.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">Nessun template approvato</div>
                  )}
                  {templates.map((t, idx) => {
                    const body = t.components?.find(c => c.type === 'BODY')?.text || '';
                    return (
                      <button
                        key={idx}
                        onClick={() => sendTemplate(t.name)}
                        disabled={sending}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-800">{t.name}</span>
                          <Send size={13} className="text-emerald-500 shrink-0" />
                        </div>
                        {body && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{body}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Context menus */}
          {contextMenu.visible && (
            <div
              id="menu-contestuale-msg"
              className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[160px] animate-fade-in-scale"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={e => e.stopPropagation()}
            >
              <button className="flex items-center gap-2.5 w-full py-2.5 px-4 text-sm text-red-600 hover:bg-red-50 transition-colors" onClick={handleDeleteMessage}>
                <Trash2 size={15} /> Elimina messaggio
              </button>
            </div>
          )}
          {chatMenu.visible && (
            <div
              id="menu-contestuale-chat"
              className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[160px] animate-fade-in-scale"
              style={{ top: chatMenu.y, left: chatMenu.x }}
              onClick={e => e.stopPropagation()}
            >
              <button className="flex items-center gap-2.5 w-full py-2.5 px-4 text-sm text-red-600 hover:bg-red-50 transition-colors" onClick={handleDeleteChat}>
                <Trash2 size={15} /> Elimina chat
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty state — no chat selected (desktop) */
        <div className="hidden md:flex flex-1 items-center justify-center bg-[var(--surface-1)]">
          <div className="text-center animate-fade-in-up">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mx-auto mb-5">
              <MessageSquare size={32} className="text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">Le tue conversazioni</h3>
            <p className="text-sm text-slate-400 max-w-xs">Seleziona una chat dalla sidebar o avvia una nuova conversazione</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Preview media ──
function MediaPreview({ selectedMedia, onClear }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (selectedMedia?.type === 'image' && selectedMedia.file) {
      const u = URL.createObjectURL(selectedMedia.file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [selectedMedia]);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-t border-slate-200">
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 max-w-xs">
        {selectedMedia.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url || ''} alt="preview" className="h-12 w-12 object-cover rounded-lg" />
        ) : (
          <div className="flex items-center gap-2">
            <Paperclip size={16} className="text-slate-400" />
            <span className="text-xs text-slate-600 truncate max-w-[150px]">{selectedMedia.file?.name}</span>
          </div>
        )}
        <button
          onClick={onClear}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
