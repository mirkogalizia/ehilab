'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft, Camera, Paperclip, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [userData, setUserData] = useState(null);
  const [canSendMessage, setCanSendMessage] = useState(false);
  const messagesEndRef = useRef(null);

  // Menù contestuale
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });

  // For mobile long press
  let longPressTimeout = useRef();

  const parseTime = val => {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (typeof val === 'string') return parseInt(val) * 1000;
    return val.seconds * 1000;
  };

  // Recupera dati utente
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Recupera nomi contatti
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const map = {};
      cs.forEach(d => (map[d.id] = d.data().name));
      setContactNames(map);
    })();
  }, [user]);

  // Ascolta messaggi realtime
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

  // Raggruppa conversazioni
  const phonesData = useMemo(() => {
    const chatMap = {};
    allMessages.forEach(m => {
      const phone = m.from !== 'operator' ? m.from : m.to;
      if (!phone) return;
      if (!chatMap[phone]) chatMap[phone] = [];
      chatMap[phone].push(m);
    });
    return Object.entries(chatMap)
      .map(([phone, msgs]) => {
        msgs.sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));
        const lastMsg = msgs[msgs.length - 1] || {};
        const unread = msgs.filter(m => m.from === phone && !m.read).length;
        return {
          phone,
          name: contactNames[phone] || phone,
          lastMsgTime: parseTime(lastMsg.timestamp || lastMsg.createdAt),
          lastMsgText: lastMsg.text || (lastMsg.type === 'image' ? '[Immagine]' : lastMsg.type === 'document' ? '[Documento]' : ''),
          unread,
        };
      })
      .sort((a, b) => b.lastMsgTime - a.lastMsgTime);
  }, [allMessages, contactNames]);

  // LOGICA 24H: solo se ultimo messaggio RICEVUTO è entro 24h
  useEffect(() => {
    if (!user?.uid || !selectedPhone) {
      setCanSendMessage(false);
      return;
    }
    const msgs = allMessages.filter(m => m.from === selectedPhone || m.to === selectedPhone);
    // Trova l’ultimo messaggio RICEVUTO
    const lastInbound = msgs
      .filter(m => m.from === selectedPhone)
      .sort((a, b) => parseTime(b.timestamp || b.createdAt) - parseTime(a.timestamp || a.createdAt))[0];
    if (!lastInbound) {
      setCanSendMessage(false); // Solo template, mai ricevuto niente
      return;
    }
    const lastTimestamp = parseTime(lastInbound.timestamp || lastInbound.createdAt);
    const now = Date.now();
    if (now - lastTimestamp < 86400000) {
      setCanSendMessage(true); // Finestra aperta
    } else {
      setCanSendMessage(false); // Solo template
    }
  }, [user, allMessages, selectedPhone]);

  // Marca messaggi come letti
  useEffect(() => {
    if (!selectedPhone || !user?.uid || allMessages.length === 0) return;
    const unreadMsgIds = allMessages
      .filter(m => m.from === selectedPhone && m.read === false)
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

  // Scroll automatico
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // Carica templates APPROVED
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

  const filtered = useMemo(() => (
    allMessages
      .filter(m => m.from === selectedPhone || m.to === selectedPhone)
      .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt))
  ), [allMessages, selectedPhone]);

  // Gestione file media selezionato
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handleMediaInput = type => e => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedMedia({ file, type });
    setShowTemplates(false);
    setMessageText('');
  };

  // --- CANCELLAZIONE MESSAGGIO SINGOLO
  const handleMessageContextMenu = (e, id) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      messageId: id
    });
  };
  const handleDeleteMessage = async () => {
    if (contextMenu.messageId) {
      await deleteDoc(doc(db, 'messages', contextMenu.messageId));
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
    }
  };

  // --- CANCELLAZIONE INTERA CHAT
  const handleChatContextMenu = (e, phone) => {
    e.preventDefault();
    setChatMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      phone
    });
  };
  const handleDeleteChat = async () => {
    if (chatMenu.phone) {
      const msgs = allMessages.filter(
        m => m.from === chatMenu.phone || m.to === chatMenu.phone
      );
      const batch = writeBatch(db);
      msgs.forEach(m => batch.delete(doc(db, 'messages', m.id)));
      await batch.commit();
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
      if (selectedPhone === chatMenu.phone) setSelectedPhone('');
    }
  };

  // --- Chiudi menù contestuale su click fuori
  useEffect(() => {
    const close = () => {
      setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
      setChatMenu({ visible: false, x: 0, y: 0, phone: null });
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, []);

  // --- Long press per mobile (messaggio)
  const handleTouchStart = (id) => {
    longPressTimeout.current = setTimeout(() => {
      setContextMenu({ visible: true, x: window.innerWidth / 2, y: window.innerHeight / 2, messageId: id });
    }, 600);
  };
  const handleTouchEnd = () => {
    clearTimeout(longPressTimeout.current);
  };

  // Invio messaggi testuali/media
  const sendMessage = async () => {
    if (!selectedPhone || (!messageText.trim() && !selectedMedia) || !userData) return;
    if (!canSendMessage) {
      alert("⚠️ La finestra di 24h per l'invio di messaggi è chiusa. Puoi inviare solo template.");
      return;
    }

    // Invio MEDIA (WhatsApp API CORRETTO)
    if (selectedMedia) {
      const uploadData = new FormData();
      uploadData.append('file', selectedMedia.file);
      uploadData.append('phone_number_id', userData.phone_number_id);

      const uploadRes = await fetch('/api/send-media', {
        method: 'POST',
        body: uploadData,
      });
      const uploadJson = await uploadRes.json();
      const media_id = uploadJson.id;
      if (!media_id) {
        alert("Errore upload media: " + JSON.stringify(uploadJson.error || uploadJson));
        return;
      }

      const payload = {
        messaging_product: "whatsapp",
        to: selectedPhone,
        type: selectedMedia.type,
        [selectedMedia.type]: {
          id: media_id,
          caption: messageText || '',
        },
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
          text: messageText,
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
        setMessageText('');
        setSelectedMedia(null);
      } else {
        alert("Errore invio media: " + JSON.stringify(data.error));
      }
      return;
    }

    // Invio messaggi testuali normali
    const payload = {
      messaging_product: "whatsapp",
      to: selectedPhone,
      type: "text",
      text: { body: messageText }
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
      alert("Errore invio: " + JSON.stringify(data.error));
    }
  };

  // Invio template WhatsApp
  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    const payload = {
      messaging_product: "whatsapp",
      to: selectedPhone,
      type: "template",
      template: { name, language: { code: "it" } }
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

  // UI
  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      {/* Lista chat */}
      <div className={`${selectedPhone ? "hidden" : "block"} md:block md:w-1/4 bg-white border-r overflow-y-auto p-4`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Conversazioni</h2>
          <button onClick={() => setShowNewChat(true)} className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded-full">
            <Plus size={16} /> Nuova
          </button>
        </div>
        <ul className="space-y-2">
          {phonesData.map(({ phone, name, lastMsgText, unread }) => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              onContextMenu={e => handleChatContextMenu(e, phone)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${selectedPhone === phone ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"}`}
            >
              <div>
                <span>{name}</span>
                <span className="block text-xs text-gray-400">{lastMsgText}</span>
              </div>
              {unread > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">{unread}</span>
              )}
            </li>
          ))}
        </ul>

        {/* Modal nuova chat */}
        {showNewChat && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg shadow">
            <h3 className="mb-2 font-medium">📞 Inserisci numero</h3>
            <Input
              placeholder="3931234567"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (newPhone) {
                    setSelectedPhone(newPhone);
                    setNewPhone('');
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

          {/* ----------- MESSAGGIO 24H ----------- */}
          {!canSendMessage && (
            <div className="flex items-center justify-center px-4 py-3 bg-yellow-100 border-b border-yellow-300 text-yellow-900 text-sm font-medium">
              ⚠️ La finestra di 24h per l'invio di messaggi è chiusa.<br />
              <span className="block">È possibile inviare solo template WhatsApp.</span>
            </div>
          )}

          {/* Messaggi */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {filtered.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}
                  onContextMenu={e => handleMessageContextMenu(e, msg.id)}
                  onTouchStart={() => handleTouchStart(msg.id)}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* IMMAGINE/FILE */}
                  {msg.type === 'image' && msg.media_id ? (
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
          </div>

          {/* ----------- ANTEPRIMA MEDIA ----------- */}
          {selectedMedia && (
            <div className="flex items-center gap-4 mb-2 p-2 bg-gray-100 rounded shadow border border-gray-300 max-w-xs mx-4">
              {selectedMedia.type === 'image' ? (
                <img
                  src={URL.createObjectURL(selectedMedia.file)}
                  alt="preview"
                  className="h-16 w-16 object-cover rounded"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Paperclip size={20} className="text-gray-600" />
                  <span className="text-sm">{selectedMedia.file.name}</span>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedMedia(null)}
                className="text-red-500 hover:bg-red-50"
                title="Rimuovi"
              >
                ✕
              </Button>
            </div>
          )}

          {/* Input + Attach */}
          <div className="flex items-center gap-2 p-3 bg-white border-t sticky bottom-0">
            {/* Foto */}
            <label className="flex items-center cursor-pointer">
              <Camera size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMediaInput('image')}
                disabled={!canSendMessage}
              />
            </label>
            {/* Allegati */}
            <label className="flex items-center cursor-pointer">
              <Paperclip size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                className="hidden"
                onChange={handleMediaInput('document')}
                disabled={!canSendMessage}
              />
            </label>
            {/* Text */}
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              disabled={!canSendMessage}
            />
            <Button
              onClick={sendMessage}
              disabled={(!messageText.trim() && !selectedMedia) || !canSendMessage}
              className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800"
            >
              <Send size={18} />
            </Button>
            {/* Template btn */}
            <Button
              onClick={() => setShowTemplates(!showTemplates)}
              className="rounded-full px-3 py-2 bg-gray-200 text-gray-700 ml-2"
              type="button"
            >
              Tmpl
            </Button>
          </div>

          {/* Lista Template */}
          {showTemplates && (
            <div className="absolute bottom-16 right-4 z-50 bg-white rounded-lg shadow-lg border w-80 max-w-full p-4">
              <h3 className="font-semibold mb-2">Template WhatsApp</h3>
              <ul>
                {templates.length === 0 && <li className="text-sm text-gray-400">Nessun template approvato</li>}
                {templates.map((t, idx) => (
                  <li key={idx} className="flex justify-between items-center mb-1">
                    <span>{t.name}</span>
                    <Button size="sm" onClick={() => sendTemplate(t.name)}>
                      Invia
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* --- MENÙ CONTESTUALE SINGOLO MESSAGGIO --- */}
          {contextMenu.visible && (
            <div
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
          {/* --- MENÙ CONTESTUALE CHAT --- */}
          {chatMenu.visible && (
            <div
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


