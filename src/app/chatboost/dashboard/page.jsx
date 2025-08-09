'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft, Camera, Paperclip, Trash2, ChevronDown, ChevronUp, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import toast, { Toaster } from 'react-hot-toast';

// Funzione per normalizzare e validare numeri di telefono
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim().replace(/^[+]+/, '').replace(/^00/, '').replace(/[\s\-().]/g, '');
  if (!/^\d+$/.test(phone)) return ''; // Solo numeri
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (phone.length > 10) return '+' + phone;
  return '';
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
  const [searchContact, setSearchContact] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });
  const [showConfirmDelete, setShowConfirmDelete] = useState({ type: null, id: null });
  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);
  const listChatRef = useRef(null);
  const chatBoxRef = useRef(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  const parseTime = val => {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (typeof val === 'string') return parseInt(val) * 1000;
    return val.seconds * 1000;
  };

  // Carica dati utente
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Carica contatti
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const contactsArr = [];
      const map = {};
      cs.forEach(d => {
        const c = d.data();
        const phoneNorm = normalizePhone(c.phone || d.id);
        if (!phoneNorm) return;
        contactsArr.push({
          phone: phoneNorm,
          name: c.firstName || c.name || phoneNorm,
          lastName: c.lastName || '',
          email: c.email || '',
        });
        map[phoneNorm] = c.firstName || c.name || phoneNorm;
      });
      setAllContacts(contactsArr);
      setContactNames(map);
    })();
  }, [user]);

  // Filtra contatti per ricerca
  useEffect(() => {
    if (!searchContact.trim()) {
      setFilteredContacts([]);
      return;
    }
    const search = searchContact.trim().toLowerCase();
    const tokens = search.split(/\s+/).filter(Boolean);
    const found = allContacts.filter(c => {
      const fields = [
        (c.name || '').toLowerCase(),
        (c.lastName || '').toLowerCase(),
        (c.email || '').toLowerCase(),
        (c.phone || '').toLowerCase(),
      ];
      return tokens.every(tok => fields.some(f => f.includes(tok)));
    });
    setFilteredContacts(found);
  }, [searchContact, allContacts]);

  // Carica messaggi
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

  // Calcola dati delle chat
  const phonesData = useMemo(() => {
    const chatMap = {};
    allMessages.forEach(m => {
      const rawPhone = m.from !== 'operator' ? m.from : m.to;
      const phone = normalizePhone(rawPhone);
      if (!phone) return;
      if (!chatMap[phone]) chatMap[phone] = [];
      chatMap[phone].push(m);
    });
    return Object.entries(chatMap)
      .map(([phone, msgs]) => {
        msgs.sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));
        const lastMsg = msgs[msgs.length - 1] || {};
        const unread = msgs.filter(m => normalizePhone(m.from) === phone && !m.read).length;
        return {
          phone,
          name: contactNames[phone] || phone,
          lastMsgTime: parseTime(lastMsg.timestamp || lastMsg.createdAt),
          lastMsgText: lastMsg.text || (lastMsg.type === 'image' ? '[Immagine]' : lastMsg.type === 'document' ? '[Documento]' : ''),
          unread,
          lastMsgFrom: lastMsg.from
        };
      })
      .sort((a, b) => {
        if ((b.unread > 0) !== (a.unread > 0)) return b.unread - a.unread;
        return b.lastMsgTime - a.lastMsgTime;
      });
  }, [allMessages, contactNames]);

  // Scroll automatico sulla chat selezionata
  useEffect(() => {
    if (!selectedPhone || !listChatRef.current) return;
    const activeLi = listChatRef.current.querySelector(`[data-phone="${selectedPhone}"]`);
    if (activeLi && typeof activeLi.scrollIntoView === 'function') {
      activeLi.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [selectedPhone, phonesData.length]);

  // Verifica se si può inviare un messaggio
  useEffect(() => {
    if (!user?.uid || !selectedPhone) {
      setCanSendMessage(false);
      return;
    }
    const msgs = allMessages.filter(m =>
      normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone
    );
    const lastInbound = msgs
      .filter(m => normalizePhone(m.from) === selectedPhone)
      .sort((a, b) => parseTime(b.timestamp || b.createdAt) - parseTime(a.timestamp || a.createdAt))[0];
    if (!lastInbound) {
      setCanSendMessage(false);
      return;
    }
    const lastTimestamp = parseTime(lastInbound.timestamp || lastInbound.createdAt);
    const now = Date.now();
    setCanSendMessage(now - lastTimestamp < 86400000);
  }, [user, allMessages, selectedPhone]);

  // Segna messaggi come letti
  useEffect(() => {
    if (!selectedPhone || !user?.uid || allMessages.length === 0) return;
    const unreadMsgIds = allMessages
      .filter(m => normalizePhone(m.from) === selectedPhone && m.read === false)
      .map(m => m.id);
    if (unreadMsgIds.length > 0) {
      const batch = writeBatch(db);
      unreadMsgIds.forEach(id => {
        const ref = doc(collection(db, 'messages'), id);
        batch.update(ref, { read: true });
      });
      batch.commit();
    }
  }, [selectedPhone, allMessages, user]);

  // Scroll automatico all'ultimo messaggio
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // Gestione scroll per pulsanti su/giù
  const handleScroll = () => {
    if (!chatBoxRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    setShowScrollButtons(scrollHeight - clientHeight > 600);
  };

  const scrollToTop = () => {
    chatBoxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const scrollToBottom = () => {
    chatBoxRef.current?.scrollTo({ top: chatBoxRef.current.scrollHeight, behavior: 'smooth' });
  };

  // Carica template
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const res = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: user.uid }),
        });
        const data = await res.json();
        if (Array.isArray(data)) setTemplates(data.filter(t => t.status === 'APPROVED'));
      } catch {
        toast.error('Errore caricamento template');
      }
    })();
  }, [user]);

  // Filtra messaggi per la chat selezionata
  const filtered = useMemo(() => (
    allMessages
      .filter(m =>
        normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone
      )
      .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt))
  ), [allMessages, selectedPhone]);

  // Gestione media
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handleMediaInput = type => e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { // Limite 5MB
      toast.error('File troppo grande (max 5MB)');
      return;
    }
    setSelectedMedia({ file, type });
    setShowTemplates(false);
    setMessageText('');
  };

  // Menu contestuali
  const handleMessageContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX ?? window.innerWidth / 2,
      y: e.clientY ?? window.innerHeight / 2,
      messageId: id
    });
  };

  const handleChatContextMenu = (e, phone) => {
    e.preventDefault();
    e.stopPropagation();
    setChatMenu({
      visible: true,
      x: e.clientX ?? window.innerWidth / 2,
      y: e.clientY ?? window.innerHeight / 2,
      phone
    });
  };

  // Eliminazione con conferma
  const handleDeleteMessage = async () => {
    if (showConfirmDelete.type === 'message' && showConfirmDelete.id) {
      try {
        await deleteDoc(doc(db, 'messages', showConfirmDelete.id));
        toast.success('Messaggio eliminato');
      } catch {
        toast.error('Errore durante l\'eliminazione');
      }
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
      setShowConfirmDelete({ type: null, id: null });
    }
  };

  const handleDeleteChat = async () => {
    if (showConfirmDelete.type === 'chat' && showConfirmDelete.id) {
      try {
        const msgs = allMessages.filter(
          m => normalizePhone(m.from) === showConfirmDelete.id || normalizePhone(m.to) === showConfirmDelete.id
        );
        const batch = writeBatch(db);
        msgs.forEach(m => batch.delete(doc(db, 'messages', m.id)));
        await batch.commit();
        toast.success('Chat eliminata');
        if (selectedPhone === showConfirmDelete.id) setSelectedPhone('');
      } catch {
        toast.error('Errore durante l\'eliminazione');
      }
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
      setShowConfirmDelete({ type: null, id: null });
    }
  };

  // Gestione chiusura menu contestuali
  useEffect(() => {
    function close(e) {
      const menu = document.getElementById("menu-contestuale-msg");
      if (menu && menu.contains(e?.target)) return;
      const chatMenuEl = document.getElementById("menu-contestuale-chat");
      if (chatMenuEl && chatMenuEl.contains(e?.target)) return;
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
    }
    if (contextMenu.visible || chatMenu.visible) {
      window.addEventListener('mousedown', close);
      window.addEventListener('scroll', close);
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(e); });
    }
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close);
      window.removeEventListener('keydown', (e) => { if (e.key === 'Escape') close(e); });
    };
  }, [contextMenu.visible, chatMenu.visible]);

  // Invio messaggio
  const [isSending, setIsSending] = useState(false);
  const sendMessage = async () => {
    if (!selectedPhone || (!messageText.trim() && !selectedMedia) || !userData) return;
    if (!canSendMessage) {
      toast.error('Finestra di 24h chiusa. Usa un template.');
      return;
    }

    setIsSending(true);
    try {
      if (selectedMedia) {
        const uploadData = new FormData();
        uploadData.append('file', selectedMedia.file);
        uploadData.append('phone_number_id', userData.phone_number_id);

        const uploadRes = await fetch('/api/send-media', {
          method: 'POST',
          body: uploadData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadJson.id) throw new Error(uploadJson.error?.message || 'Errore upload media');

        const payload = {
          messaging_product: "whatsapp",
          to: selectedPhone,
          type: selectedMedia.type,
          [selectedMedia.type]: { id: uploadJson.id, caption: "" },
        };

        const res = await fetch('/api/send-whatsapp-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.messages) throw new Error(data.error?.message || 'Errore invio media');

        await addDoc(collection(db, "messages"), {
          text: "",
          to: selectedPhone,
          from: "operator",
          timestamp: Date.now(),
          createdAt: serverTimestamp(),
          type: selectedMedia.type,
          media_id: uploadJson.id,
          user_uid: user.uid,
          read: true,
          message_id: data.messages[0].id,
        });

        if (messageText.trim()) {
          const payloadText = {
            messaging_product: "whatsapp",
            to: selectedPhone,
            type: "text",
            text: { body: messageText.trim() }
          };
          const resText = await fetch('/api/send-whatsapp-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadText),
          });
          const dataText = await resText.json();
          if (!dataText.messages) throw new Error(dataText.error?.message || 'Errore invio testo');

          await addDoc(collection(db, "messages"), {
            text: messageText.trim(),
            to: selectedPhone,
            from: "operator",
            timestamp: Date.now(),
            createdAt: serverTimestamp(),
            type: "text",
            user_uid: user.uid,
            read: true,
            message_id: dataText.messages[0].id,
          });
        }
        toast.success('Messaggio inviato');
        setMessageText('');
        setSelectedMedia(null);
      } else {
        const payload = {
          messaging_product: "whatsapp",
          to: selectedPhone,
          type: "text",
          text: { body: messageText.trim() }
        };
        const res = await fetch('/api/send-whatsapp-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.messages) throw new Error(data.error?.message || 'Errore invio messaggio');

        await addDoc(collection(db, "messages"), {
          text: messageText.trim(),
          to: selectedPhone,
          from: "operator",
          timestamp: Date.now(),
          createdAt: serverTimestamp(),
          type: "text",
          user_uid: user.uid,
          read: true,
          message_id: data.messages[0].id,
        });
        toast.success('Messaggio inviato');
        setMessageText('');
      }
    } catch (error) {
      toast.error(`Errore: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // Invio template
  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    const template = templates.find(t => t.name === name);
    if (!template) {
      toast.error('Template non trovato');
      return;
    }

    setIsSending(true);
    try {
      let components = [];
      if (template.header && template.header.type !== "NONE") {
        if (template.header.type === "TEXT") {
          components.push({
            type: "HEADER",
            parameters: [{ type: "text", text: template.header.text || "" }]
          });
        } else if (["IMAGE", "DOCUMENT", "VIDEO"].includes(template.header.type)) {
          if (!template.header.url) throw new Error('File header non trovato');
          components.push({
            type: "HEADER",
            parameters: [{
              type: template.header.type.toLowerCase(),
              [template.header.type.toLowerCase()]: { link: template.header.url }
            }]
          });
        }
      }
      components.push({ type: "BODY", parameters: [] });

      const payload = {
        messaging_product: "whatsapp",
        to: selectedPhone,
        type: "template",
        template: { name, language: { code: template.language || "it" }, components }
      };

      const res = await fetch('/api/send-whatsapp-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.messages) throw new Error(data.error?.message || 'Errore invio template');

      await addDoc(collection(db, "messages"), {
        text: `Template inviato: ${name}`,
        to: selectedPhone,
        from: "operator",
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: "template",
        user_uid: user.uid,
        read: true,
        message_id: data.messages[0].id,
      });
      toast.success('Template inviato');
      setShowTemplates(false);
    } catch (error) {
      toast.error(`Errore: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // UI
  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1E3A8A',
            color: '#FFFFFF',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          },
        }}
      />
      {/* Lista chat */}
      <div
        className={`${selectedPhone ? "hidden" : "block"} md:block md:w-1/4 bg-gray-100 border-r overflow-y-auto p-3`}
        ref={listChatRef}
        role="navigation"
        aria-label="Lista delle conversazioni"
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Conversazioni</h2>
          <Button
            onClick={() => setShowNewChat(true)}
            className="flex items-center gap-1 px-3 py-1 bg-blue-900 text-white rounded-full hover:bg-blue-800"
            aria-label="Avvia nuova conversazione"
          >
            <Plus size={16} /> Nuova
          </Button>
        </div>
        <ul className="space-y-0" role="listbox">
          {(() => {
            const unreadChats = phonesData.filter(x => x.unread > 0);
            const readChats = phonesData.filter(x => x.unread === 0);
            return (
              <>
                {unreadChats.length > 0 && (
                  <>
                    <li className="text-xs uppercase text-gray-500 font-bold px-2 py-1 tracking-wide" role="presentation">
                      Non letti
                    </li>
                    {unreadChats.map(({ phone, name, lastMsgText, unread, lastMsgFrom }) => (
                      <li
                        key={phone}
                        data-phone={phone}
                        onClick={() => setSelectedPhone(phone)}
                        onContextMenu={e => handleChatContextMenu(e, phone)}
                        className={`group flex items-center justify-between px-3 py-2 mb-1 rounded-xl cursor-pointer transition 
                          ${selectedPhone === phone ? "bg-gray-200 font-semibold shadow" : "hover:bg-gray-100"}
                          border-b border-gray-100 focus-visible:ring-2 focus-visible:ring-blue-900`}
                        style={{ boxShadow: selectedPhone === phone ? "0 4px 16px #0001" : "" }}
                        role="option"
                        aria-selected={selectedPhone === phone}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setSelectedPhone(phone)}
                      >
                        <div>
                          <span className={`font-medium tracking-tight ${unread > 0 ? 'font-bold text-black' : ''}`}>
                            {name}
                            {lastMsgFrom !== 'operator' && unread > 0 ? <span className="ml-1 text-green-500">●</span> : ''}
                          </span>
                          <span className="block text-xs text-gray-400">
                            {lastMsgText.length > 32 ? lastMsgText.substring(0, 32) + '…' : lastMsgText}
                          </span>
                        </div>
                        {unread > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-bold animate-pulse">
                            {unread}
                          </span>
                        )}
                      </li>
                    ))}
                    <li className="my-2 border-t border-gray-200" role="presentation"></li>
                  </>
                )}
                {readChats.length > 0 && (
                  <>
                    <li className="text-xs uppercase text-gray-500 font-bold px-2 py-1 tracking-wide" role="presentation">
                      Conversazioni
                    </li>
                    {readChats.map(({ phone, name, lastMsgText, unread, lastMsgFrom }) => (
                      <li
                        key={phone}
                        data-phone={phone}
                        onClick={() => setSelectedPhone(phone)}
                        onContextMenu={e => handleChatContextMenu(e, phone)}
                        className={`group flex items-center justify-between px-3 py-2 mb-1 rounded-xl cursor-pointer transition 
                          ${selectedPhone === phone ? "bg-gray-200 font-semibold shadow" : "hover:bg-gray-100"}
                          border-b border-gray-100 focus-visible:ring-2 focus-visible:ring-blue-900`}
                        style={{ boxShadow: selectedPhone === phone ? "0 4px 16px #0001" : "" }}
                        role="option"
                        aria-selected={selectedPhone === phone}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setSelectedPhone(phone)}
                      >
                        <div>
                          <span className="font-medium tracking-tight">{name}</span>
                          <span className="block text-xs text-gray-400">
                            {lastMsgText.length > 32 ? lastMsgText.substring(0, 32) + '…' : lastMsgText}
                          </span>
                        </div>
                      </li>
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </ul>

        {/* Modal nuova chat */}
        {showNewChat && (
          <div
            className="mt-3 p-3 bg-gray-100 rounded-lg shadow transition-all duration-200"
            style={{ opacity: showNewChat ? 1 : 0, transform: showNewChat ? 'scale(1)' : 'scale(0.95)' }}
            role="dialog"
            aria-label="Nuova conversazione"
          >
            <h3 className="mb-2 font-medium">📞 Cerca contatto o inserisci numero</h3>
            <Input
              placeholder="Nome, cognome, email o numero…"
              value={searchContact}
              onChange={e => setSearchContact(e.target.value)}
              className="mb-2 border-gray-300 focus:ring-2 focus:ring-blue-900 disabled:opacity-30 disabled:border-gray-400"
              autoFocus
              aria-label="Cerca contatto"
            />
            {searchContact && (
              <div className="max-h-40 overflow-auto mb-2 rounded border bg-white shadow">
                {filteredContacts.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">Nessun risultato</div>
                ) : (
                  filteredContacts.map((c, i) => (
                    <div
                      key={c.phone}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-200 flex flex-col focus-visible:ring-2 focus-visible:ring-blue-900"
                      onClick={() => {
                        setSelectedPhone(c.phone);
                        setSearchContact('');
                        setShowNewChat(false);
                      }}
                      role="option"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && (setSelectedPhone(c.phone), setSearchContact(''), setShowNewChat(false))}
                    >
                      <span className="font-medium tracking-tight">{c.name} {c.lastName}</span>
                      <span className="text-xs text-gray-400">{c.phone}</span>
                      {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const normalized = normalizePhone(searchContact);
                  if (!normalized) {
                    toast.error('Numero non valido');
                    return;
                  }
                  setSelectedPhone(normalized);
                  setSearchContact('');
                  setShowNewChat(false);
                }}
                className="flex-1 bg-blue-900 text-white hover:bg-blue-800"
                aria-label="Avvia conversazione"
              >
                Avvia
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowNewChat(false)}
                className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-100"
                aria-label="Annulla"
              >
                Annulla
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Chat */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-50 relative">
          {/* Header */}
          <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
            <Button
              onClick={() => setSelectedPhone('')}
              className="md:hidden text-gray-600 hover:text-blue-900 p-0"
              aria-label="Torna alla lista delle conversazioni"
            >
              <ArrowLeft size={22} />
            </Button>
            <span className="text-lg font-semibold truncate">{contactNames[selectedPhone] || selectedPhone}</span>
          </div>
          {!canSendMessage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-200 text-orange-900 text-sm font-medium">
              <AlertTriangle size={16} /> Finestra 24h chiusa. Usa template.
            </div>
          )}

          {/* Messaggi */}
          <div
            className="flex-1 overflow-y-auto p-3 sm:p-2 scroll-smooth relative"
            ref={chatBoxRef}
            onScroll={handleScroll}
            style={{ scrollBehavior: 'smooth' }}
            role="main"
            aria-label="Conversazione"
          >
            <div ref={messagesTopRef} />
            <div className="space-y-3">
              {filtered.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}
                  onContextMenu={e => handleMessageContextMenu(e, msg.id)}
                  role="group"
                  aria-label={`Messaggio da ${msg.from === 'operator' ? 'te' : 'interlocutore'}`}
                >
                  {msg.type === 'image' && msg.media_id ? (
                    <img
                      src={`/api/media-proxy?media_id=${msg.media_id}`}
                      alt="Immagine inviata"
                      className="max-w-[50%] rounded-lg shadow-md border border-blue-200"
                      loading="lazy"
                    />
                  ) : msg.type === 'document' && msg.media_id ? (
                    <a
                      href={`/api/media-proxy?media_id=${msg.media_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                      aria-label="Scarica documento"
                    >
                      Documento allegato
                    </a>
                  ) : (
                    <div
                      className={`px-4 py-2 rounded-xl text-sm shadow-md max-w-[70%] ${
                        msg.from === 'operator'
                          ? 'bg-blue-900 text-white rounded-br-none'
                          : 'bg-white text-gray-900 rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {showScrollButtons && (
              <div className="fixed bottom-24 right-6 z-40 flex flex-col gap-1">
                <Button
                  size="icon"
                  className="rounded-full shadow bg-gray-200 hover:bg-blue-900 hover:text-white"
                  onClick={scrollToTop}
                  title="Vai all'inizio"
                  aria-label="Scorri all'inizio della conversazione"
                >
                  <ChevronUp size={20} />
                </Button>
                <Button
                  size="icon"
                  className="rounded-full shadow bg-gray-200 hover:bg-blue-900 hover:text-white"
                  onClick={scrollToBottom}
                  title="Vai in fondo"
                  aria-label="Scorri alla fine della conversazione"
                >
                  <ChevronDown size={20} />
                </Button>
              </div>
            )}
          </div>

          {/* Preview media */}
          {selectedMedia && (
            <div className={`flex items-center gap-4 mb-2 p-2 bg-gray-100 rounded shadow border ${
              selectedMedia.type === 'image' ? 'border-blue-200' : 'border-gray-200'
            } max-w-xs mx-4`}>
              {selectedMedia.type === 'image' ? (
                <img
                  src={URL.createObjectURL(selectedMedia.file)}
                  alt="Anteprima immagine"
                  className="h-16 w-16 object-cover rounded"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Paperclip size={20} className="text-gray-600" />
                  <span className="text-sm">{selectedMedia.file.name} ({(selectedMedia.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedMedia(null)}
                className="text-red-500 hover:bg-red-50"
                title="Rimuovi allegato"
                aria-label="Rimuovi allegato"
              >
                ✕
              </Button>
            </div>
          )}

          {/* Input messaggio */}
          <div className="flex items-center gap-2 p-3 bg-white border-t sticky bottom-0 z-20">
            <label className="flex items-center cursor-pointer">
              <Camera size={22} className="mr-2 text-gray-500 hover:text-blue-900" aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMediaInput('image')}
                disabled={!canSendMessage}
                aria-label="Allega immagine"
              />
            </label>
            <label className="flex items-center cursor-pointer">
              <Paperclip size={22} className="mr-2 text-gray-500 hover:text-blue-900" aria-hidden="true" />
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                className="hidden"
                onChange={handleMediaInput('document')}
                disabled={!canSendMessage}
                aria-label="Allega documento"
              />
            </label>
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-blue-900 disabled:opacity-30 disabled:border-gray-400"
              disabled={!canSendMessage}
              aria-label="Scrivi un messaggio"
            />
            <Button
              onClick={sendMessage}
              disabled={(!messageText.trim() && !selectedMedia) || !canSendMessage || isSending}
              className="rounded-full px-5 py-3 bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-30"
              aria-label="Invia messaggio"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </Button>
            <Button
              onClick={() => setShowTemplates(!showTemplates)}
              className="rounded-full px-3 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 ml-2"
              aria-label="Mostra/nascondi template"
              disabled={isSending}
            >
              Tmpl
            </Button>
          </div>

          {/* Menu template */}
          {showTemplates && (
            <div
              className="absolute bottom-[4.5rem] left-4 right-4 z-50 bg-white rounded-lg shadow-lg border max-w-[90vw] p-4 max-h-48 overflow-y-auto transition-all duration-200"
              style={{ opacity: showTemplates ? 1 : 0, transform: showTemplates ? 'scale(1)' : 'scale(0.95)' }}
              role="menu"
              aria-label="Template WhatsApp"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Template WhatsApp</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowTemplates(false)}
                  aria-label="Chiudi menu template"
                >
                  <X size={16} />
                </Button>
              </div>
              <ul>
                {templates.length === 0 ? (
                  <li className="text-sm text-gray-400">Nessun template approvato</li>
                ) : (
                  templates.map((t, idx) => (
                    <li key={idx} className="flex justify-between items-center mb-1" role="menuitem">
                      <span>{t.name}</span>
                      <Button
                        size="sm"
                        onClick={() => sendTemplate(t.name)}
                        aria-label={`Invia template ${t.name}`}
                        disabled={isSending}
                      >
                        Invia
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* Menu contestuale messaggio */}
          {contextMenu.visible && (
            <div
              id="menu-contestuale-msg"
              style={{
                position: 'fixed',
                top: Math.min(contextMenu.y, window.innerHeight - 100),
                left: Math.min(contextMenu.x, window.innerWidth - 140),
                zIndex: 9999,
                background: 'white',
                border: '1px solid #eee',
                borderRadius: 10,
                boxShadow: '0 4px 20px #0002',
                padding: 8,
                minWidth: 120,
                transition: 'opacity 0.2s, transform 0.2s',
                opacity: contextMenu.visible ? 1 : 0,
                transform: contextMenu.visible ? 'scale(1)' : 'scale(0.95)',
              }}
              className="focus-visible:ring-2 focus-visible:ring-blue-900"
              onClick={e => e.stopPropagation()}
              role="menu"
              aria-label="Menu contestuale messaggio"
            >
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded"
                onClick={() => setShowConfirmDelete({ type: 'message', id: contextMenu.messageId })}
                aria-label="Elimina messaggio"
              >
                <Trash2 size={16} /> Elimina messaggio
              </button>
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-gray-600 hover:bg-gray-100 rounded"
                onClick={() => setContextMenu({ visible: false, x: 0, y: 0, messageId: null })}
                aria-label="Chiudi menu"
              >
                <X size={16} /> Chiudi
              </button>
            </div>
          )}

          {/* Menu contestuale chat */}
          {chatMenu.visible && (
            <div
              id="menu-contestuale-chat"
              style={{
                position: 'fixed',
                top: Math.min(chatMenu.y, window.innerHeight - 100),
                left: Math.min(chatMenu.x, window.innerWidth - 140),
                zIndex: 9999,
                background: 'white',
                border: '1px solid #eee',
                borderRadius: 10,
                boxShadow: '0 4px 20px #0002',
                padding: 8,
                minWidth: 140,
                transition: 'opacity 0.2s, transform 0.2s',
                opacity: chatMenu.visible ? 1 : 0,
                transform: chatMenu.visible ? 'scale(1)' : 'scale(0.95)',
              }}
              className="focus-visible:ring-2 focus-visible:ring-blue-900"
              onClick={e => e.stopPropagation()}
              role="menu"
              aria-label="Menu contestuale chat"
            >
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded"
                onClick={() => setShowConfirmDelete({ type: 'chat', id: chatMenu.phone })}
                aria-label="Elimina chat"
              >
                <Trash2 size={16} /> Elimina chat
              </button>
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-gray-600 hover:bg-gray-100 rounded"
                onClick={() => setChatMenu({ visible: false, x: 0, y: 0, phone: null })}
                aria-label="Chiudi menu"
              >
                <X size={16} /> Chiudi
              </button>
            </div>
          )}

          {/* Modale conferma eliminazione */}
          {showConfirmDelete.type && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-label="Conferma eliminazione">
              <div className="bg-white p-4 rounded-lg shadow max-w-sm w-full">
                <p className="mb-4">
                  Confermi l'eliminazione {showConfirmDelete.type === 'message' ? 'del messaggio' : 'della chat'}?
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={showConfirmDelete.type === 'message' ? handleDeleteMessage : handleDeleteChat}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                    aria-label="Conferma eliminazione"
                  >
                    Sì
                  </Button>
                  <Button
                    onClick={() => setShowConfirmDelete({ type: null, id: null })}
                    className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300"
                    aria-label="Annulla eliminazione"
                  >
                    No
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}