'use client';

import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [userData, setUserData] = useState(null);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const messagesEndRef = useRef(null);

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

  // Ascolta messaggi realtime SOLO dell'utente corrente tramite user.uid
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, async snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllMessages(msgs);

      // Costruisci lista numeri e stats
      const phoneMeta = {};
      msgs.forEach(m => {
        const phone = m.from !== 'operator' ? m.from : m.to;
        if (!phoneMeta[phone]) {
          phoneMeta[phone] = {
            lastTimestamp: 0,
            unread: 0,
          };
        }
        // Ultimo messaggio
        const ts = typeof m.timestamp === 'number'
          ? (m.timestamp > 1e12 ? m.timestamp : m.timestamp * 1000)
          : m.createdAt?.seconds ? m.createdAt.seconds * 1000 : 0;
        if (ts > phoneMeta[phone].lastTimestamp) phoneMeta[phone].lastTimestamp = ts;
        // Conteggio non letti (solo ricevuti)
        if (m.from !== 'operator' && m.read === false) phoneMeta[phone].unread += 1;
      });
      // Ordina i numeri per ultimo messaggio (desc)
      const phones = Object.entries(phoneMeta)
        .sort((a, b) => b[1].lastTimestamp - a[1].lastTimestamp)
        .map(([phone]) => phone);
      setPhoneList(phones);

      // Stat unread
      const unreadMap = {};
      Object.entries(phoneMeta).forEach(([phone, meta]) => unreadMap[phone] = meta.unread);
      setUnreadCounts(unreadMap);

      // nomi contatti (filtrati per createdBy)
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const map = {};
      cs.forEach(d => (map[d.id] = d.data().name));
      setContactNames(map);

      // Verifica finestra 24h per numero selezionato
      if (selectedPhone) {
        const lastMsg = msgs
          .filter(m => (m.from === selectedPhone || m.to === selectedPhone) && m.from !== 'operator')
          .slice(-1)[0];
        if (!lastMsg) {
          setCanSendMessage(true);
          return;
        }
        const lastTimestamp = typeof lastMsg.timestamp === 'number'
          ? (lastMsg.timestamp > 1e12 ? lastMsg.timestamp : lastMsg.timestamp * 1000)
          : lastMsg.createdAt?.seconds ? lastMsg.createdAt.seconds * 1000 : 0;
        const now = Date.now();
        setCanSendMessage(now - lastTimestamp < 86400000);
      }
    });
    return () => unsub();
  }, [user, selectedPhone]);

  // Quando selezioni una chat, marca come letti tutti i messaggi ricevuti non letti!
  useEffect(() => {
    if (!selectedPhone || !user?.uid || allMessages.length === 0) return;
    // Trova i messaggi non letti da questo numero
    const unreadMsgIds = allMessages
      .filter(m => m.from === selectedPhone && m.read === false)
      .map(m => m.id);
    if (unreadMsgIds.length > 0) {
      // Aggiorna in batch
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
      // Ora API accetta user_uid, più sicuro!
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uid: user.uid }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data.filter(t => t.status === 'APPROVED'));
    })();
  }, [user]);

  const parseTime = val => {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (typeof val === 'string') return parseInt(val) * 1000;
    return val.seconds * 1000;
  };

  const filtered = allMessages
    .filter(m => m.from === selectedPhone || m.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));

  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    if (!canSendMessage) {
      alert("⚠️ La finestra di 24h per l'invio dei messaggi è chiusa. Puoi inviare solo template.");
      return;
    }
    const payload = { messaging_product: "whatsapp", to: selectedPhone, type: "text", text: { body: messageText } };
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
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
        user_uid: user.uid,
        read: true,
        message_id: data.messages[0].id,
      });
      setMessageText("");
    } else {
      alert("Errore invio: " + JSON.stringify(data.error));
    }
  };

  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    const payload = { messaging_product: "whatsapp", to: selectedPhone, type: "template", template: { name, language: { code: "it" } } };
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
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
        user_uid: user.uid,
        read: true,
        message_id: data.messages[0].id,
      });
      setShowTemplates(false);
    } else {
      alert("Err template: " + JSON.stringify(data.error));
    }
  };

  // ---- UI ----
  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      {/* LISTA */}
      <div className={`${selectedPhone ? "hidden" : "block"} md:block md:w-1/4 bg-white border-r overflow-y-auto p-4`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Conversazioni</h2>
          <button onClick={() => setShowNewChat(true)} className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded-full">
            <Plus size={16} /> Nuova
          </button>
        </div>
        <ul className="space-y-2">
          {phoneList.map(phone => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition ${selectedPhone === phone ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"}`}
            >
              <span>
                {contactNames[phone] || phone}
              </span>
              {/* Badge non letti */}
              {unreadCounts[phone] > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">{unreadCounts[phone]}</span>
              )}
            </li>
          ))}
        </ul>
        {/* Modal Nuova Chat */}
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
                    setPhoneList([newPhone, ...phoneList]);
                    setSelectedPhone(newPhone);
                    setNewPhone("");
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

      {/* CHAT */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-100 relative">
          {/* Avviso finestra 24h */}
          {!canSendMessage && (
            <div className="absolute top-0 left-0 right-0 bg-yellow-200 border border-yellow-400 text-yellow-900 text-center py-2 font-semibold z-10">
              ⚠️ La finestra di 24h per l'invio di messaggi è chiusa.<br />
              È possibile inviare solo template WhatsApp.
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 p-4 bg-white border-b sticky top-8 z-20">
            <button onClick={() => setSelectedPhone("")} className="md:hidden text-gray-600 hover:text-black">
              <ArrowLeft size={22} />
            </button>
            <span className="text-lg font-semibold truncate">{contactNames[selectedPhone] || selectedPhone}</span>
          </div>

          {/* Messaggi */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {filtered.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.from === "operator" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`px-4 py-2 rounded-xl text-sm shadow-md max-w-[70%] ${
                      msg.from === "operator" ? "bg-black text-white rounded-br-none" : "bg-white text-gray-900 rounded-bl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input + Attach */}
          <div className="flex items-center gap-2 p-3 bg-white border-t sticky bottom-0">
            {/* Template */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200"
              >
                📑
              </button>
              {showTemplates && (
                <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {templates.length > 0 ? (
                    templates.map(tpl => (
                      <div
                        key={tpl.name}
                        onClick={() => sendTemplate(tpl.name)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-gray-500 truncate">{tpl.components?.[0]?.text || "—"}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-gray-500">Nessun template</div>
                  )}
                </div>
              )}
            </div>

            {/* Media */}
            {/* ...eventuale gestione media qui (come già implementato)... */}

            {/* Text */}
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              disabled={!canSendMessage}
            />
            <Button
              onClick={sendMessage}
              disabled={!messageText || !canSendMessage}
              className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

