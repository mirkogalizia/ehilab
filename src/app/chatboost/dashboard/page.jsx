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
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [userData, setUserData] = useState(null);
  const [contactNames, setContactNames] = useState({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const messagesEndRef = useRef(null);
  const { user } = useAuth();

  // Recupera dati utente da Firestore (documento “users”)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const current = allUsers.find((u) => u.email === user.email);
      if (current) setUserData(current);
    })();
  }, [user]);

  // Ascolta i messaggi in real-time
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, async (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllMessages(msgs);

      // Costruisci la lista dei numeri unici
      const uniques = Array.from(
        new Set(msgs.map((m) => (m.from !== 'operator' ? m.from : m.to)))
      );
      setPhoneList(uniques);

      // Carica tutti i contatti
      const contactsSnap = await getDocs(collection(db, 'contacts'));
      const map = {};
      contactsSnap.forEach((d) => {
        map[d.id] = d.data().name;
      });
      setContactNames(map);
    });
    return unsubscribe;
  }, []);

  // Scroll automatico in fondo
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // Carica template APPROVED
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data.filter((tpl) => tpl.status === 'APPROVED'));
      }
    })();
  }, [user]);

  // Helper per convertire timestamp Firestore / Unix
  const parseTime = (val) => {
    if (!val) return 0;
    if (typeof val === 'string') return parseInt(val) * 1000;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (val?.seconds) return val.seconds * 1000;
    return 0;
  };

  // Filtra e ordina i messaggi per chat selezionata
  const filteredMessages = allMessages
    .filter((m) => m.from === selectedPhone || m.to === selectedPhone)
    .sort(
      (a, b) =>
        parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt)
    );

  // ──────────────────────────────────────────────────────
  // Funzione per inviare text message
  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;

    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'text',
      text: { body: messageText },
    };

    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();

    if (data.messages) {
      await addDoc(collection(db, 'messages'), {
        text: messageText,
        to: selectedPhone,
        from: 'operator',
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: 'text',
        user_uid: user.uid,
        message_id: data.messages[0].id,
      });
      setMessageText('');
    } else {
      console.error(data);
      alert('Errore invio text: ' + JSON.stringify(data.error));
    }
  };

  // ──────────────────────────────────────────────────────
  // Funzione per invio MEDIA (image / document)
  const sendMediaMessage = async (file, mediaType) => {
    if (!selectedPhone || !userData) return;

    try {
      // 1) Upload del file a WhatsApp Graph API
      const form = new FormData();
      form.append('file', file);
      form.append('type', mediaType);

      const uploadRes = await fetch(
        `https://graph.facebook.com/v17.0/${userData.phone_number_id}/media`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          },
          body: form,
        }
      );
      const uploadData = await uploadRes.json();
      if (!uploadData.id) throw new Error(JSON.stringify(uploadData));

      const mediaId = uploadData.id;

      // 2) Recupera URL pubblico del media per mostrare in chat
      const urlRes = await fetch(
        `https://graph.facebook.com/v17.0/${mediaId}?fields=url`,
        {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          },
        }
      );
      const { url: mediaUrl } = await urlRes.json();

      // 3) Invia il messaggio WhatsApp con riferimento a mediaId
      const payload = {
        messaging_product: 'whatsapp',
        to: selectedPhone,
        type: mediaType,
        [mediaType]: {
          id: mediaId,
          caption: file.name,
        },
      };
      const res = await fetch(
        `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (!result.messages) throw new Error(JSON.stringify(result));

      // 4) Registra in Firestore
      await addDoc(collection(db, 'messages'), {
        text: file.name,
        mediaUrl,
        to: selectedPhone,
        from: 'operator',
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: mediaType,
        user_uid: user.uid,
        message_id: result.messages[0].id,
      });
    } catch (err) {
      console.error('❌ Errore sendMediaMessage:', err);
      alert('Errore invio media: ' + err.message);
    }
  };
  // ──────────────────────────────────────────────────────

  // ────────────────────── RENDER ────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 font-[Montserrat]">
      {/* Sidebar contatti */}
      <div className="w-full md:w-1/4 bg-white border-r overflow-y-auto p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Conversazioni</h2>
          <button
            onClick={() => setShowNewChat(true)}
            className="flex items-center gap-1 text-sm bg-black text-white px-3 py-2 rounded-full hover:bg-gray-800"
          >
            <Plus size={16} /> Nuova
          </button>
        </div>
        <ul className="space-y-3">
          {phoneList.map((phone) => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              className={`cursor-pointer px-4 py-3 rounded-xl shadow-sm transition ${
                selectedPhone === phone
                  ? 'bg-gray-200 text-gray-900 font-semibold'
                  : 'hover:bg-gray-100'
              }`}
            >
              {contactNames[phone] || phone}
            </li>
          ))}
        </ul>
        {showNewChat && (
          <div className="mt-4 p-4 bg-gray-100 rounded-xl shadow-md">
            <h3 className="font-medium mb-2">📞 Inserisci numero</h3>
            <Input
              placeholder="Es: 3931234567"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="mb-3"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!phoneList.includes(newPhone)) {
                    setPhoneList((prev) => [newPhone, ...prev]);
                  }
                  setSelectedPhone(newPhone);
                  setShowNewChat(false);
                  setNewPhone('');
                }}
                className="bg-black text-white hover:bg-gray-800 flex-1"
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

      {/* Chat window */}
      <div className="flex flex-col flex-1 bg-gray-100">
        <div className="p-4 bg-white border-b shadow-sm text-lg font-semibold text-gray-700">
          {selectedPhone
            ? `Chat con ${contactNames[selectedPhone] || selectedPhone}`
            : 'Seleziona una chat'}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-3">
            {filteredMessages.map((msg, idx) => {
              const isOperator = msg.from === 'operator';
              const time = new Date(
                parseTime(msg.timestamp || msg.createdAt)
              ).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[70%] px-5 py-3 rounded-2xl text-sm shadow-md ${
                      isOperator
                        ? 'bg-black text-white rounded-br-none'
                        : 'bg-white text-gray-900 rounded-bl-none'
                    }`}
                  >
                    {msg.type === 'image' && msg.mediaUrl ? (
                      <img
                        src={msg.mediaUrl}
                        alt={msg.text}
                        className="max-w-full h-auto rounded-lg shadow-md"
                      />
                    ) : msg.type === 'document' && msg.mediaUrl ? (
                      <a
                        href={msg.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 underline text-sm"
                      >
                        📎 {msg.text}
                      </a>
                    ) : msg.type === 'template' ? (
                      <>
                        <span className="font-semibold">📑 </span>
                        {msg.text}
                      </>
                    ) : (
                      msg.text
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{time}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input e bottoni */}
        <div className="flex items-center gap-3 p-4 bg-white border-t shadow-inner relative">
          <Input
            placeholder="Scrivi un messaggio..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 rounded-full px-5 py-3 text-sm border border-gray-300 focus:ring-2 focus:ring-gray-800"
          />

          {/* Template picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplates((p) => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition text-sm text-gray-700"
            >
              📑
            </button>
            {showTemplates && (
              <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500 text-center">
                    Nessun template approvato
                  </p>
                ) : (
                  <ul>
                    {templates.map((tpl) => (
                      <li
                        key={tpl.name}
                        onClick={() => sendTemplate(tpl.name)}
                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {tpl.components?.[0]?.text || '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Bottone upload IMMAGINE */}
          <label className="cursor-pointer flex items-center px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700">
            📷
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                e.target.files[0] && sendMediaMessage(e.target.files[0], 'image')
              }
            />
          </label>

          {/* Bottone upload DOCUMENTO */}
          <label className="cursor-pointer flex items-center px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700">
            📎
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) =>
                e.target.files[0] && sendMediaMessage(e.target.files[0], 'document')
              }
            />
          </label>

          {/* Bottone invio testo */}
          <Button
            onClick={sendMessage}
            className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800 transition"
            disabled={!userData || !selectedPhone || !messageText}
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}

