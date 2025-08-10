'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';

import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { Send, Plus, ArrowLeft, Camera, Paperclip, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

// --- helpers (JSX-safe) ---
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim().replace(/^[+]+/, '').replace(/^00/, '').replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (phoneRaw.startsWith('+')) return phoneRaw;
  return '';
}

const parseTime = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  if (typeof val === 'string') return parseInt(val) * 1000;
  return val.seconds * 1000;
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

  const [searchContact, setSearchContact] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });

  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);
  const listChatRef = useRef(null);
  const chatBoxRef = useRef(null);
  const longPressTimeout = useRef();

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  // userData (WhatsApp)
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
      if (tokens.length === 1) return fields.some(f => f.includes(tokens[0]));
      return tokens.every(tok => fields.some(f => f.includes(tok)));
    });
    setFilteredContacts(found);
  }, [searchContact, allContacts]);

  // messages realtime
  useEffect(() => {
    if (!user?.uid) return;
    const qy = query(collection(db, 'messages'), where('user_uid', '==', user.uid), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(qy, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllMessages(msgs);
    });
    return () => unsub();
  }, [user]);

  // lista conversazioni
  const phonesData = useMemo(() => {
    const chatMap = {};
    allMessages.forEach((m) => {
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

  // autoscroll lista chat
  useEffect(() => {
    if (!selectedPhone || !listChatRef.current) return;
    const activeLi = listChatRef.current.querySelector(`[data-phone="${selectedPhone}"]`);
    if (activeLi && typeof activeLi.scrollIntoView === 'function') {
      activeLi.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [selectedPhone, phonesData.length]);

  // finestra 24h
  useEffect(() => {
    if (!user?.uid || !selectedPhone) { setCanSendMessage(false); return; }
    const msgs = allMessages.filter(m => normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone);
    const lastInbound = msgs
      .filter(m => normalizePhone(m.from) === selectedPhone)
      .sort((a, b) => parseTime(b.timestamp || b.createdAt) - parseTime(a.timestamp || a.createdAt))[0];
    if (!lastInbound) { setCanSendMessage(false); return; }
    const lastTimestamp = parseTime(lastInbound.timestamp || lastInbound.createdAt);
    setCanSendMessage(Date.now() - lastTimestamp < 86400000);
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

  // scroll btns
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const handleScroll = () => {
    if (!chatBoxRef.current) return;
    const el = chatBoxRef.current;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowScrollButtons(scrollHeight - clientHeight > 600 && !(scrollHeight - clientHeight - scrollTop < 80));
  };
  const scrollToTop = () => chatBoxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => chatBoxRef.current?.scrollTo({ top: chatBoxRef.current.scrollHeight, behavior: 'smooth' });

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
  const filtered = useMemo(
    () => allMessages
      .filter(m => normalizePhone(m.from) === selectedPhone || normalizePhone(m.to) === selectedPhone)
      .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt)),
    [allMessages, selectedPhone]
  );

  // media
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handleMediaInput = (type) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedMedia({ file, type });
    setShowTemplates(false);
    setMessageText('');
  };

  // context menu
  const handleMessageContextMenu = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX ?? window.innerWidth/2, y: e.clientY ?? window.innerHeight/2, messageId: id });
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
    setChatMenu({ visible: true, x: e.clientX ?? window.innerWidth/2, y: e.clientY ?? window.innerHeight/2, phone });
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
      window.removeEventListener('keydown', () => {});
    };
  }, [contextMenu.visible, chatMenu.visible]);

  const handleTouchStart = (id) => {
    longPressTimeout.current = setTimeout(() => {
      setContextMenu({ visible: true, x: window.innerWidth / 2, y: window.innerHeight / 2, messageId: id });
    }, 600);
  };
  const handleTouchEnd = () => clearTimeout(longPressTimeout.current);

  // invio messaggi
  const sendMessage = async () => {
    if (!selectedPhone || (!messageText.trim() && !selectedMedia) || !userData) return;
    if (!canSendMessage) { alert("⚠️ La finestra di 24h è chiusa. Puoi inviare solo template."); return; }

    // media (prima media poi eventuale testo)
    if (selectedMedia) {
      const uploadData = new FormData();
      uploadData.append('file', selectedMedia.file);
      uploadData.append('phone_number_id', userData.phone_number_id);
      const uploadRes = await fetch('/api/send-media', { method: 'POST', body: uploadData });
      const uploadJson = await uploadRes.json();
      const media_id = uploadJson.id;
      if (!media_id) { alert("Errore upload media: " + JSON.stringify(uploadJson.error || uploadJson)); return; }

      const payload = {
        messaging_product: "whatsapp",
        to: selectedPhone,
        type: selectedMedia.type,
        [selectedMedia.type]: { id: media_id, caption: "" },
      };
      const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });
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
          user_uid: user?.uid,
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
          const resText = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payloadText),
          });
          const dataText = await resText.json();
          if (dataText.messages) {
            await addDoc(collection(db, "messages"), {
              text: messageText.trim(),
              to: selectedPhone,
              from: "operator",
              timestamp: Date.now(),
              createdAt: serverTimestamp(),
              type: "text",
              user_uid: user?.uid,
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

    // solo testo
    const payload = { messaging_product: "whatsapp", to: selectedPhone, type: "text", text: { body: messageText } };
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.messages) {
      await addDoc(collection(db, "messages"), {
        text: messageText,
        to: selectedPhone,
        from: "operator",
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: "text",
        user_uid: user?.uid,
        read: true,
        message_id: data.messages[0].id,
      });
      setMessageText('');
    } else {
      alert("Errore invio: " + JSON.stringify(data.error));
    }
  };

  // invio template
  const sendTemplate = async (name) => {
    if (!selectedPhone || !name || !userData) return;
    const template = templates.find(t => t.name === name);
    if (!template) return alert("Template non trovato!");
    const components = [];

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

    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.messages) {
      await addDoc(collection(db, "messages"), {
        text: `Template inviato: ${name}`,
        to: selectedPhone,
        from: "operator",
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: "template",
        user_uid: user?.uid,
        read: true,
        message_id: data.messages[0].id,
      });
      setShowTemplates(false);
    } else {
      alert("Errore template: " + JSON.stringify(data.error));
    }
  };

  return (
    <div className="mx-auto max-w-6xl w-full p-4 md:p-6 font-[Montserrat] space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">Chat</h1>
        <div className="text-sm text-muted-foreground">UI coerente con shadcn/ui</div>
      </div>

      <Card className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <aside ref={listChatRef} className="bg-white">
            <div className="p-3 flex items-center gap-2">
              <Input
                placeholder="Cerca contatto o inserisci numero…"
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
                className="rounded-xl"
              />
              <Button onClick={() => setShowNewChat(true)} className="rounded-xl">
                <Plus className="h-4 w-4 mr-1" /> Nuova
              </Button>
            </div>
            <Separator />

            {searchContact && filteredContacts.length > 0 && (
              <div className="px-3 pb-2">
                <Card className="border rounded-xl overflow-hidden">
                  <ScrollArea className="max-h-56">
                    <ul className="p-2 space-y-1">
                      {filteredContacts.map((c) => (
                        <li key={c.phone}>
                          <button
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent"
                            onClick={() => {
                              setSelectedPhone(c.phone);
                              setSearchContact('');
                              setShowNewChat(false);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8"><AvatarFallback>{(c.phone || '').slice(-2)}</AvatarFallback></Avatar>
                              <div className="truncate">
                                <div className="text-sm font-medium">{c.name} {c.lastName}</div>
                                <div className="text-xs text-muted-foreground">{c.phone}</div>
                                {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </Card>
              </div>
            )}

            <ScrollArea className="h-[62vh] md:h-[72vh]">
              <ul className="py-2">
                {(() => {
                  const unreadChats = phonesData.filter(x => x.unread > 0);
                  const readChats = phonesData.filter(x => x.unread === 0);
                  return (
                    <>
                      {unreadChats.length > 0 && (
                        <>
                          <div className="px-4 py-2 text-xs uppercase text-muted-foreground">Non letti</div>
                          {unreadChats.map(({ phone, name, lastMsgText, unread, lastMsgFrom }) => (
                            <li key={phone} data-phone={phone} onClick={() => setSelectedPhone(phone)} onContextMenu={(e) => handleChatContextMenu(e, phone)}>
                              <div className={['flex items-center justify-between px-4 py-3 cursor-pointer transition', selectedPhone === phone ? 'bg-accent/80 font-semibold' : 'hover:bg-accent/50'].join(' ')}>
                                <div className="flex items-center gap-3 truncate">
                                  <Avatar className="h-8 w-8"><AvatarFallback>{(name || phone).toString().slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                                  <div className="min-w-0">
                                    <div className="text-sm truncate">{name}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {lastMsgText.length > 42 ? lastMsgText.substring(0, 42) + '…' : lastMsgText}
                                    </div>
                                  </div>
                                </div>
                                {unread > 0 && (
                                  <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">{unread}</span>
                                )}
                              </div>
                            </li>
                          ))}
                          <Separator className="my-1" />
                        </>
                      )}
                      {readChats.length > 0 && (
                        <>
                          <div className="px-4 py-2 text-xs uppercase text-muted-foreground">Conversazioni</div>
                          {readChats.map(({ phone, name, lastMsgText }) => (
                            <li key={phone} data-phone={phone} onClick={() => setSelectedPhone(phone)} onContextMenu={(e) => handleChatContextMenu(e, phone)}>
                              <div className={['flex items-center justify-between px-4 py-3 cursor-pointer transition', selectedPhone === phone ? 'bg-accent/80 font-semibold' : 'hover:bg-accent/50'].join(' ')}>
                                <div className="flex items-center gap-3 truncate">
                                  <Avatar className="h-8 w-8"><AvatarFallback>{(name || phone).toString().slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                                  <div className="min-w-0">
                                    <div className="text-sm truncate">{name}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {lastMsgText.length > 42 ? lastMsgText.substring(0, 42) + '…' : lastMsgText}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
              </ul>
            </ScrollArea>

            {showNewChat && (
              <div className="p-3">
                <Card className="p-3 rounded-xl bg-muted/30">
                  <div className="mb-2 text-sm font-medium">📞 Avvia nuova chat</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome, cognome, email o numero…"
                      value={searchContact}
                      onChange={(e) => setSearchContact(e.target.value)}
                      className="rounded-xl"
                      autoFocus
                    />
                    <Button
                      className="rounded-xl"
                      onClick={() => {
                        if (searchContact) {
                          setSelectedPhone(normalizePhone(searchContact));
                          setSearchContact('');
                          setShowNewChat(false);
                        }
                      }}
                    >
                      Avvia
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => setShowNewChat(false)}>
                      Annulla
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </aside>

          {/* Chat area */}
          <section className="flex flex-col bg-muted/30">
            <div className="h-14 px-4 bg-white border-b flex items-center gap-3 sticky top-0 z-20">
              <button onClick={() => setSelectedPhone('')} className="md:hidden text-muted-foreground hover:text-foreground">
                <ArrowLeft size={22} />
              </button>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8"><AvatarFallback>{selectedPhone ? selectedPhone.slice(-2) : '??'}</AvatarFallback></Avatar>
                <div className="leading-tight">
                  <div className="text-sm font-medium truncate max-w-[60vw] md:max-w-none">
                    {selectedPhone ? (contactNames[selectedPhone] || selectedPhone) : 'Seleziona una conversazione'}
                  </div>
                  {!!selectedPhone && <div className="text-xs text-muted-foreground">Online di recente</div>}
                </div>
              </div>
            </div>

            {!canSendMessage && selectedPhone && (
              <div className="px-4 py-2 bg-yellow-100 border-b border-yellow-300 text-yellow-900 text-sm text-center">
                ⚠️ Finestra 24h chiusa. Puoi inviare solo template WhatsApp.
              </div>
            )}

            <div ref={chatBoxRef} onScroll={handleScroll} className="flex-1 p-4 relative">
              <ScrollArea className="h-full">
                <div ref={messagesTopRef} />
                <div className="space-y-3">
                  {filtered.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}
                      onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
                      onTouchStart={() => handleTouchStart(msg.id)}
                      onTouchEnd={handleTouchEnd}
                    >
                      {msg.type === 'image' && msg.media_id ? (
                        <img src={`/api/media-proxy?media_id=${msg.media_id}`} alt="Immagine" className="max-w-xs rounded-xl shadow" loading="lazy" />
                      ) : msg.type === 'document' && msg.media_id ? (
                        <a href={`/api/media-proxy?media_id=${msg.media_id}`} target="_blank" rel="noopener noreferrer" className="underline px-4 py-2 rounded-xl text-sm shadow bg-white">
                          Documento allegato
                        </a>
                      ) : (
                        <div className={['px-4 py-2 rounded-2xl text-sm shadow max-w-[72%]', msg.from === 'operator' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-white text-foreground rounded-bl-none'].join(' ')}>
                          {msg.text}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {showScrollButtons && (
                <div className="absolute right-4 bottom-24 md:bottom-28 flex flex-col gap-1">
                  <Button size="icon" className="rounded-full shadow bg-muted hover:bg-foreground hover:text-background" onClick={scrollToTop} title="Vai all'inizio" type="button">
                    <ChevronUp size={18} />
                  </Button>
                  <Button size="icon" className="rounded-full shadow bg-muted hover:bg-foreground hover:text-background" onClick={scrollToBottom} title="Vai in fondo" type="button">
                    <ChevronDown size={18} />
                  </Button>
                </div>
              )}
            </div>

            {selectedMedia && (
              <div className="px-4">
                <Card className="flex items-center gap-4 mb-2 p-2 rounded-xl border">
                  {selectedMedia.type === 'image' ? (
                    <img src={URL.createObjectURL(selectedMedia.file)} alt="preview" className="h-16 w-16 object-cover rounded-lg" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-4 w-4" />
                      <span className="truncate max-w-[50vw]">{selectedMedia.file.name}</span>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelectedMedia(null)} className="text-red-500 hover:bg-red-50 ml-auto">
                    Rimuovi
                  </Button>
                </Card>
              </div>
            )}

            <div className="p-3 bg-background border-t">
              <div className="flex items-end gap-2">
                <label className="flex items-center cursor-pointer">
                  <Camera className="h-5 w-5 mr-2 text-muted-foreground hover:text-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleMediaInput('image')} disabled={!canSendMessage} />
                </label>
                <label className="flex items-center cursor-pointer">
                  <Paperclip className="h-5 w-5 mr-2 text-muted-foreground hover:text-foreground" />
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                    className="hidden"
                    onChange={handleMediaInput('document')}
                    disabled={!canSendMessage}
                  />
                </label>

                <Input
                  placeholder={selectedPhone ? 'Scrivi un messaggio…' : 'Seleziona una chat per iniziare'}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                  className="flex-1 rounded-xl"
                  disabled={!canSendMessage}
                />
                <Button onClick={sendMessage} disabled={(!messageText.trim() && !selectedMedia) || !canSendMessage} className="rounded-xl">
                  <Send className="h-4 w-4 mr-1" /> Invia
                </Button>
                <Button onClick={() => setShowTemplates(!showTemplates)} variant="secondary" className="rounded-xl">
                  Tmpl
                </Button>
              </div>
            </div>

            {showTemplates && (
              <Card className="absolute bottom-20 right-4 z-50 bg-background rounded-xl shadow-lg border w-80 max-w-[92vw] p-4">
                <div className="font-semibold mb-2">Template WhatsApp</div>
                <ScrollArea className="max-h-64 pr-2">
                  <ul className="space-y-1">
                    {templates.length === 0 && <li className="text-sm text-muted-foreground">Nessun template approvato</li>}
                    {templates.map((t, idx) => (
                      <li key={idx} className="flex justify-between items-center">
                        <span className="text-sm">{t.name}</span>
                        <Button size="sm" onClick={() => sendTemplate(t.name)}>Invia</Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </Card>
            )}

            {contextMenu.visible && (
              <div
                id="menu-contestuale-msg"
                style={{
                  position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
                  background: 'white', border: '1px solid #eee', borderRadius: 10,
                  boxShadow: '0 4px 20px #0002', padding: 8, minWidth: 140,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded" onClick={handleDeleteMessage}>
                  <Trash2 size={16} /> Elimina messaggio
                </button>
              </div>
            )}

            {chatMenu.visible && (
              <div
                id="menu-contestuale-chat"
                style={{
                  position: 'fixed', top: chatMenu.y, left: chatMenu.x, zIndex: 9999,
                  background: 'white', border: '1px solid #eee', borderRadius: 10,
                  boxShadow: '0 4px 20px #0002', padding: 8, minWidth: 160,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="flex items-center gap-2 w-full py-2 px-3 text-red-600 hover:bg-gray-100 rounded" onClick={handleDeleteChat}>
                  <Trash2 size={16} /> Elimina chat
                </button>
              </div>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}