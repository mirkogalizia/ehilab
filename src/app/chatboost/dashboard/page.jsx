'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft } from 'lucide-react';
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

  // Fetch utente
  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const currentUser = allUsers.find((u) => u.email === user.email);
      if (currentUser) setUserData(currentUser);
    };
    fetchUserData();
  }, [user]);

  // Ascolta messaggi realtime
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, async (snap) => {
      const msgs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllMessages(msgs);

      const uniquePhones = Array.from(
        new Set(msgs.map((msg) => (msg.from !== 'operator' ? msg.from : msg.to)))
      );
      setPhoneList(uniquePhones);

      const contactsSnap = await getDocs(collection(db, 'contacts'));
      const namesMap = {};
      contactsSnap.forEach((doc) => (namesMap[doc.id] = doc.data().name));
      setContactNames(namesMap);
    });
    return () => unsub();
  }, []);

  // Scroll automatico
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages, selectedPhone]);

  // Carica template
  useEffect(() => {
    if (!user?.email) return;
    const fetchTemplates = async () => {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data.filter((tpl) => tpl.status === 'APPROVED'));
      }
    };
    fetchTemplates();
  }, [user]);

  // Invia testo
  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    try {
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
        alert('Errore invio: ' + JSON.stringify(data.error));
      }
    } catch (err) {
      console.error('Errore invio messaggio:', err);
    }
  };

  // Invia template
  const sendTemplate = async (tplName) => {
    if (!selectedPhone || !tplName || !userData) return;
    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: selectedPhone,
        type: 'template',
        template: { name: tplName, language: { code: 'it' } },
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
          text: `Template inviato: ${tplName}`,
          to: selectedPhone,
          from: 'operator',
          timestamp: Date.now(),
          createdAt: serverTimestamp(),
          type: 'template',
          user_uid: user.uid,
          message_id: data.messages[0].id,
        });
        setShowTemplates(false);
      } else {
        alert('Errore invio template: ' + JSON.stringify(data.error));
      }
    } catch (err) {
      console.error('Errore template:', err);
    }
  };

  // Upload & invio media
  const sendMediaMessage = async (file, mediaType) => {
    if (!selectedPhone || !userData) return;
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', mediaType);
      form.append('messaging_product', 'whatsapp');

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

      const payload = {
        messaging_product: 'whatsapp',
        to: selectedPhone,
        type: mediaType,
        [mediaType]: { id: mediaId, caption: file.name },
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
      if (result.messages) {
        await addDoc(collection(db, 'messages'), {
          text: file.name,
          to: selectedPhone,
          from: 'operator',
          timestamp: Date.now(),
          createdAt: serverTimestamp(),
          type: mediaType,
          user_uid: user.uid,
          message_id: result.messages[0].id,
        });
      }
    } catch (err) {
      console.error('Errore invio media:', err);
    }
  };

  const parseTime = (val) => {
    if (!val) return 0;
    if (typeof val === 'string') return parseInt(val) * 1000;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (val?.seconds) return val.seconds * 1000;
    return 0;
  };

  const filteredMessages = allMessages
    .filter((msg) => msg.from === selectedPhone || msg.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));

  return (
    <div className="h-[100dvh] w-screen flex font-[Montserrat] bg-gray-50 overflow-hidden">
      {/* Lista contatti */}
      <AnimatePresence>
        {!selectedPhone && (
          <motion.div
            key="list"
            initial={{ x: 0, opacity: 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full md:w-1/3 bg-white border-r overflow-y-auto px-4 py-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Conversazioni</h2>
              <button
                onClick={() => setShowNewChat(true)}
                className="flex items-center gap-1 text-sm bg-black text-white px-3 py-2 rounded-full hover:bg-gray-800"
              >
                <Plus size={16} /> Nuova
              </button>
            </div>

            <ul className="divide-y divide-gray-100">
              {phoneList.map((phone) => (
                <li
                  key={phone}
                  onClick={() => setSelectedPhone(phone)}
                  className="cursor-pointer px-4 py-3 text-base rounded-lg hover:bg-gray-100 transition"
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
                      if (newPhone) {
                        setSelectedPhone(newPhone);
                        if (!phoneList.includes(newPhone)) {
                          setPhoneList((prev) => [newPhone, ...prev]);
                        }
                        setShowNewChat(false);
                        setNewPhone('');
                      }
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat */}
      <AnimatePresence>
        {selectedPhone && (
          <motion.div
            key="chat"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col flex-1 bg-gray-100"
          >
            {/* Header */}
            <div className="p-4 bg-white border-b shadow-sm flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => setSelectedPhone('')}
                className="md:hidden text-gray-600 hover:text-black"
              >
                <ArrowLeft size={22} />
              </button>
              <span className="text-lg font-semibold text-gray-700 truncate">
                {contactNames[selectedPhone] || selectedPhone}
              </span>
            </div>

            {/* Messaggi */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <div className="flex flex-col gap-3">
                {filteredMessages.map((msg, idx) => {
                  const isOp = msg.from === 'operator';
                  const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString(
                    'it-IT',
                    { hour: '2-digit', minute: '2-digit' }
                  );
                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isOp ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`px-4 py-2 rounded-lg text-base shadow ${
                          isOp
                            ? 'bg-black text-white rounded-br-none ml-auto'
                            : 'bg-white text-gray-900 rounded-bl-none mr-auto'
                        } max-w-[85%]`}
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
                            className="text-blue-600 underline text-sm"
                          >
                            📎 {msg.text}
                          </a>
                        ) : msg.type === 'template' ? (
                          <span className="font-medium">📑 {msg.text}</span>
                        ) : (
                          msg.text
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">{time}</div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-3 bg-white border-t shadow-inner sticky bottom-0">
              {/* Template */}
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200"
                >
                  📑
                </button>
                {showTemplates && (
                  <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
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
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
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

              {/* Media */}
              <label className="cursor-pointer px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">
                📷
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && sendMediaMessage(e.target.files[0], 'image')}
                />
              </label>
              <label className="cursor-pointer px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">
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

              {/* Testo */}
              <Input
                placeholder="Scrivi un messaggio..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              />

              <Button
                onClick={sendMessage}
                className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800 transition"
                disabled={!userData || !selectedPhone || !messageText}
              >
                <Send size={18} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

