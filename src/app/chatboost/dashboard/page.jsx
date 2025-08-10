'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft, Camera, Paperclip, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim().replace(/^[+]+/, '').replace(/^00/, '').replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+'+phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39'+phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+'+phone;
  if (phone.startsWith('+')) return phone;
  return '';
}

// parseTime più robusta
const parseTime = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    if (isNaN(n)) return 0;
    return n > 1e12 ? n : n * 1000;
  }
  if (val && typeof val === 'object') {
    // Firestore Timestamp
    if (val.seconds != null) return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
    // Date
    if (typeof val.getTime === 'function') return val.getTime();
  }
  return 0;
};

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
  const messagesTopRef = useRef(null);
  const listChatRef = useRef(null);

  const [searchContact, setSearchContact] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });

  // anti doppio invio
  const [sending, setSending] = useState(false);

  let longPressTimeout = useRef();

  // blocca lo scroll del body
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
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

  // contatti
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const contactsArr = [];
      const map = {};
      cs.forEach(d => {
        const c = d.data();
        const phoneNorm = normalizePhone(c.phone || d.id);
        contactsArr.push({
          phone: phoneNorm,
          name: c.firstName || c.name || '',
          lastName: c.lastName || '',
          email: c.email || '',
        });
        map[phoneNorm] = c.firstName || c.name || phoneNorm;
      });
      setAllContacts(contactsArr);
      setContactNames(map);
    })();
  }, [user]);

  // ricerca
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
      if (tokens.length === 1) {
        return fields.some(f => f.includes(tokens[0]));
      }
      return tokens.every(tok => fields.some(f => f.includes(tok)));
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

  // conversazioni
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

  // autoscroll lista
  useEffect(() => {
    if (!selectedPhone || !listChatRef.current) return;
    const activeLi = listChatRef.current.querySelector(`[data-phone="${selectedPhone}"]`);
    if (activeLi && typeof activeLi.scrollIntoView === 'function') {
      activeLi.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [selectedPhone, phonesData.length]);

  // finestra 24h
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

  // segna letti
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

  // autoscroll messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // gestione scroll + btn
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const chatBoxRef = useRef();
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
      .filter(m =>
        normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone
      )
      .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt))
  ), [allMessages, selectedPhone]);

  // media
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handleMediaInput = type => e => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedMedia({ file, type });
    setShowTemplates(false);
    setMessageText('');
  };

  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const handleMessageContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX ?? window.innerWidth/2,
      y: e.clientY ?? window.innerHeight/2,
      messageId: id
    });
  };
  const handleDeleteMessage = async () => {
    if (contextMenu.messageId) {
      await deleteDoc(doc(db, 'messages', contextMenu.messageId));
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
    }
  };

  const handleChatContextMenu = (e, phone) => {
    e.preventDefault();
    e.stopPropagation();
    setChatMenu({
      visible: true,
      x: e.clientX ?? window.innerWidth/2,
      y: e.clientY ?? window.innerHeight/2,
      phone
    });
  };
  const handleDeleteChat = async () => {
    if (chatMenu.phone) {
      const msgs = allMessages.filter(
        m => normalizePhone(m.from) === chatMenu.phone || normalizePhone(m.to) === chatMenu.phone
      );
      const batch = writeBatch(db);
      msgs.forEach(m => batch.delete(doc(db, 'messages', m.id)));
      await batch.commit();
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
      if (selectedPhone === chatMenu.phone) setSelectedPhone('');
    }
  };

  // listener stabili
  useEffect(() => {
    if (!contextMenu.visible && !chatMenu.visible) return;
    const close = (e) => {
      const menu = document.getElementById("menu-contestuale-msg");
      if (menu && menu.contains(e?.target)) return;
      const chatMenuEl = document.getElementById("menu-contestuale-chat");
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
  const handleTouchEnd = () => {
    clearTimeout(longPressTimeout.current);
  };

  // invio messaggi (con anti doppio invio + /api/send-text)
  const sendMessage = async () => {
    if (!selectedPhone || (!messageText.trim() && !selectedMedia) || !userData) return;
    if (!canSendMessage) {
      alert("⚠️ La finestra di 24h per l'invio di messaggi è chiusa. Puoi inviare solo template.");
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      if (selectedMedia) {
        // upload file al tuo endpoint (già server-side ok)
        const uploadData = new FormData();
        uploadData.append('file', selectedMedia.file);
        uploadData.append('phone_number_id', userData.phone_number_id);

        const uploadRes = await fetch('/api/send-media', { method: 'POST', body: uploadData });
        const uploadJson = await uploadRes.json();
        const media_id = uploadJson.id;
        if (!media_id) {
          alert("Errore upload media: " + JSON.stringify(uploadJson.error || uploadJson));
          return;
        }

        // invia il messaggio media su WhatsApp (rimane com'era)
        const payload = {
          messaging_product: "whatsapp",
          to: selectedPhone,
          type: selectedMedia.type,
          [selectedMedia.type]: { id: media_id, caption: "" },
        };
        const res = await fetch(
          `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        if (data.messages) {
          await addDoc(collection(db, "messages"), {
            text: "",
            to: selectedPhone,
            from: "operator",
            timestamp: Date.now(),
            createdAt: serverTimestamp(),
            type: selectedMedia.type,
            media_id,
            user_uid: user.uid,
            read: true,
            message_id: data.messages[0].id,
          });

          // eventuale testo dopo la media
          if (messageText.trim()) {
            const resText = await fetch('/api/send-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: selectedPhone,
                text: messageText.trim(),
                phone_number_id: userData.phone_number_id
              })
            });
            const dataText = await resText.json();
            if (resText.ok && dataText?.messages) {
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
          }
          setMessageText('');
          setSelectedMedia(null);
        } else {
          alert("Errore invio media: " + JSON.stringify(data.error));
        }
        return;
      }

      // SOLO TESTO via /api/send-text (token lato server)
      const res = await fetch('/api/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedPhone,
          text: messageText,
          phone_number_id: userData.phone_number_id
        })
      });
      const data = await res.json();
      if (res.ok && data.messages) {
        await addDoc(collection(db, "messages"), {
          text: messageText,
          to: selectedPhone,
          from: "operator",
          timestamp: Date.now(),
          createdAt: serverTimestamp(),
          type: "text",
          user_uid: user.uid,
          read: true,
          message_id: data.messages[0].id,
        });
        setMessageText('');
      } else {
        alert("Errore invio: " + JSON.stringify(data.error || data));
      }
    } finally {
      setSending(false);
    }
  };

  // template
  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    const template = templates.find(t => t.name === name);
    if (!template) return alert("Template non trovato!");
    let components = [];
    if (template.header && template.header.type !== "NONE") {
      if (template.header.type === "TEXT") {
        components.push({ type: "HEADER", parameters: [{ type: "text", text: template.header.text || "" }] });
      } else if (["IMAGE", "DOCUMENT", "VIDEO"].includes(template.header.type)) {
        if (!template.header.url) return alert("File header non trovato!");
        components.push({
          type: "HEADER",
          parameters: [{ type: template.header.type.toLowerCase(), [template.header.type.toLowerCase()]: { link: template.header.url } }]
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

    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (data.messages) {
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
      setShowTemplates(false);
    } else {
      alert("Errore template: " + JSON.stringify(data.error));
    }
  };

  // ------------------ UI ------------------
  return (
    <div className="chat-shell flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      {/* Lista chat */}
      <div
        className={`${selectedPhone ? "hidden" : "block"} md:block md:w-1/4 bg-white border-r p-4 chat-scroll`}
        ref={listChatRef}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Conversazioni</h2>
          <button onClick={() => setShowNewChat(true)} className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded-full">
            <Plus size={16} /> Nuova
          </button>
        </div>
        <ul className="space-y-0">
          {(() => {
            const unreadChats = phonesData.filter(x => x.unread > 0);
            const readChats = phonesData.filter(x => x.unread === 0);
            return (
              <>
                {unreadChats.length > 0 && (
                  <>
                    <li className="text-xs uppercase text-gray-400 px-2 py-1 tracking-wide">Non letti</li>
                    {unreadChats.map(({ phone, name, lastMsgText, unread, lastMsgFrom }) => (
                      <li
                        key={phone}
                        data-phone={phone}
                        onClick={() => setSelectedPhone(phone)}
                        onContextMenu={e => handleChatContextMenu(e, phone)}
                        className={`group flex items-center justify-between px-4 py-3 mb-1 rounded-xl cursor-pointer transition 
                          ${selectedPhone === phone ? "bg-gray-200 font-semibold shadow" : "hover:bg-gray-100"}
                          border-b border-gray-100`}
                        style={{ boxShadow: selectedPhone === phone ? "0 4px 16px #0001" : "" }}
                      >
                        <div>
                          <span className={`${unread > 0 ? 'font-bold text-black' : ''}`}>
                            {name}
                            {lastMsgFrom !== 'operator' && unread > 0 ? <span className="ml-1 text-green-600">●</span> : ''}
                          </span>
                          <span className="block text-xs text-gray-400">
                            {lastMsgText.length > 32 ? lastMsgText.substring(0, 32) + '…' : lastMsgText}
                          </span>
                        </div>
                        {unread > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">{unread}</span>
                        )}
                      </li>
                    ))}
                    <li className="my-2 border-t border-gray-200"></li>
                  </>
                )}
                {readChats.length > 0 && (
                  <>
                    {readChats.length > 0 && (
                      <li className="text-xs uppercase text-gray-400 px-2 py-1 tracking-wide">Conversazioni</li>
                    )}
                    {readChats.map(({ phone, name, lastMsgText }) => (
                      <li
                        key={phone}
                        data-phone={phone}
                        onClick={() => setSelectedPhone(phone)}
                        onContextMenu={e => handleChatContextMenu(e, phone)}
                        className={`group flex items-center justify-between px-4 py-3 mb-1 rounded-xl cursor-pointer transition 
                          ${selectedPhone === phone ? "bg-gray-200 font-semibold shadow" : "hover:bg-gray-100"}
                          border-b border-gray-100`}
                      >
                        <div>
                          <span>{name}</span>
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
          <div className="mt-4 p-4 bg-gray-100 rounded-lg shadow">
            <h3 className="mb-2 font-medium">📞 Cerca contatto o inserisci numero</h3>
            <Input
              placeholder="Nome, cognome, email o numero…"
              value={searchContact}
              onChange={e => setSearchContact(e.target.value)}
              className="mb-2"
              autoFocus
            />
            {searchContact && filteredContacts.length > 0 && (
              <div className="max-h-40 overflow-auto mb-2 rounded border bg-white shadow">
                {filteredContacts.map((c) => (
                  <div
                    key={c.phone}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-200 flex flex-col"
                    onClick={() => {
                      setSelectedPhone(c.phone);
                      setSearchContact('');
                      setShowNewChat(false);
                    }}
                  >
                    <span className="font-medium">{c.name} {c.lastName}</span>
                    <span className="text-xs text-gray-400">{c.phone}</span>
                    {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (searchContact) {
                    setSelectedPhone(normalizePhone(searchContact));
                    setSearchContact('');
                    setShowNewChat(false);
                  }
                }}
                className="flex-1 bg-black text-white"
              >
                Avvia
              </Button>
              <Button variant="outline" onClick={() => setShowNewChat(false)} className="flex-1">
                Annulla
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Chat */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-100 relative">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 bg-white border-b sticky top-0 z-20">
            <button onClick={() => setSelectedPhone('')} className="md:hidden text-gray-600 hover:text-black">
              <ArrowLeft size={22} />
            </button>
            <span className="text-lg font-semibold truncate">{contactNames[selectedPhone] || selectedPhone}</span>
          </div>
          {!canSendMessage && (
            <div className="flex items-center justify-center px-4 py-3 bg-yellow-100 border-b border-yellow-300 text-yellow-900 text-sm font-medium">
              ⚠️ La finestra di 24h per l'invio di messaggi è chiusa.<br />
              <span className="block">È possibile inviare solo template WhatsApp.</span>
            </div>
          )}

          {/* Messaggi */}
          <div
            className="flex-1 p-4 scroll-smooth relative chat-scroll chat-scroll--with-composer"
            ref={chatBoxRef}
            onScroll={handleScroll}
          >
            <div ref={messagesTopRef} />
            <div className="space-y-3">
              {filtered.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}
                  onContextMenu={e => handleMessageContextMenu(e, msg.id)}
                  onTouchStart={() => handleTouchStart(msg.id)}
                  onTouchEnd={handleTouchEnd}
                >
                  {msg.type === 'image' && msg.media_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/media-proxy?media_id=${msg.media_id}`}
                      alt="Immagine"
                      className="max-w-xs rounded-lg shadow-md"
                      loading="lazy"
                    />
                  ) : msg.type === 'document' && msg.media_id ? (
                    <a
                      href={`/api/media-proxy?media_id=${msg.media_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Documento allegato
                    </a>
                  ) : (
                    <div
                      className={`px-4 py-2 rounded-xl text-sm shadow-md max-w-[70%] ${
                        msg.from === 'operator'
                          ? 'bg-black text-white rounded-br-none'
                          : 'bg-white text-gray-900 rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
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
              <div className="fixed bottom-28 right-8 z-40 flex flex-col gap-1">
                <Button
                  size="icon"
                  className="rounded-full shadow bg-gray-200 hover:bg-black hover:text-white"
                  onClick={scrollToTop}
                  title="Vai all'inizio"
                  type="button"
                >
                  <ChevronUp size={20} />
                </Button>
                <Button
                  size="icon"
                  className="rounded-full shadow bg-gray-200 hover:bg-black hover:text-white"
                  onClick={scrollToBottom}
                  title="Vai in fondo"
                  type="button"
                >
                  <ChevronDown size={20} />
                </Button>
              </div>
            )}
          </div>

          {/* Anteprima media (no memory leak) */}
          {selectedMedia && (
            <MediaPreview
              selectedMedia={selectedMedia}
              onClear={() => setSelectedMedia(null)}
            />
          )}

          {/* Composer */}
          <div className="flex items-center gap-2 p-3 sticky-composer">
            <label className="flex items-center cursor-pointer">
              <Camera size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMediaInput('image')}
                disabled={!canSendMessage || sending}
              />
            </label>
            <label className="flex items-center cursor-pointer">
              <Paperclip size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                className="hidden"
                onChange={handleMediaInput('document')}
                disabled={!canSendMessage || sending}
              />
            </label>
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !sending && sendMessage()}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              disabled={!canSendMessage || sending}
            />
            <Button
              onClick={sendMessage}
              disabled={sending || (!messageText.trim() && !selectedMedia) || !canSendMessage}
              className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800"
            >
              <Send size={18} />
            </Button>
            <Button
              onClick={() => setShowTemplates(!showTemplates)}
              className="rounded-full px-3 py-2 bg-gray-200 text-gray-700 ml-2"
              type="button"
              disabled={sending}
            >
              Tmpl
            </Button>
          </div>

          {showTemplates && (
            <div className="absolute bottom-20 right-4 z-50 bg-white rounded-lg shadow-lg border w-80 max-w-full p-4">
              <h3 className="font-semibold mb-2">Template WhatsApp</h3>
              <ul>
                {templates.length === 0 && <li className="text-sm text-gray-400">Nessun template approvato</li>}
                {templates.map((t, idx) => (
                  <li key={idx} className="flex justify-between items-center mb-1">
                    <span>{t.name}</span>
                    <Button size="sm" onClick={() => sendTemplate(t.name)} disabled={sending}>
                      Invia
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* context menu msg */}
          {contextMenu.visible && (
            <div
              id="menu-contestuale-msg"
              style={{
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                zIndex: 9999,
                background: 'white',
                border: '1px solid #eee',
                borderRadius: 10,
                boxShadow: '0 4px 20px #0002',
                padding: 8,
                minWidth: 120,
              }}
              onClick={e => e.stopPropagation()}
            >
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded"
                onClick={handleDeleteMessage}
              >
                <Trash2 size={16} /> Elimina messaggio
              </button>
            </div>
          )}
          {/* context menu chat */}
          {chatMenu.visible && (
            <div
              id="menu-contestuale-chat"
              style={{
                position: 'fixed',
                top: chatMenu.y,
                left: chatMenu.x,
                zIndex: 9999,
                background: 'white',
                border: '1px solid #eee',
                borderRadius: 10,
                boxShadow: '0 4px 20px #0002',
                padding: 8,
                minWidth: 140,
              }}
              onClick={e => e.stopPropagation()}
            >
              <button
                className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded"
                onClick={handleDeleteChat}
              >
                <Trash2 size={16} /> Elimina chat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Preview media senza leak ----
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
    <div className="flex items-center gap-4 mb-2 p-2 bg-gray-100 rounded shadow border border-gray-300 max-w-xs mx-4">
      {selectedMedia.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url || ''} alt="preview" className="h-16 w-16 object-cover rounded" />
      ) : (
        <div className="flex items-center gap-2">
          <Paperclip size={20} className="text-gray-600" />
          <span className="text-sm">{selectedMedia.file?.name}</span>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="text-red-500 hover:bg-red-50"
        title="Rimuovi"
      >
        ✕
      </Button>
    </div>
  );
}