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
import { Send, Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage({ setShowContactsMobile }) {
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

  useEffect(() => {
    if (!user) return;
    const fetchUserDataByEmail = async () => {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const currentUserData = allUsers.find((u) => u.email === user.email);
      if (currentUserData) setUserData(currentUserData);
    };
    fetchUserDataByEmail();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllMessages(messages);

      const uniquePhones = Array.from(
        new Set(messages.map((msg) => (msg.from !== 'operator' ? msg.from : msg.to)))
      );
      setPhoneList(uniquePhones);

      const contactsSnapshot = await getDocs(collection(db, 'contacts'));
      const namesMap = {};
      contactsSnapshot.forEach((doc) => {
        namesMap[doc.id] = doc.data().name;
      });
      setContactNames(namesMap);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages, selectedPhone]);

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

  // Seleziona contatto (lista)
  const onSelectPhone = (phone) => {
    setSelectedPhone(phone);
    if (window.innerWidth < 768) {
      setShowContactsMobile(false); // Chiude lista contatti su mobile
    }
  };

  // Altri metodi (sendMessage, sendTemplate, sendMediaMessage, ecc) rimangono invariati...

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
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header mobile con bottone indietro */}
      <div className="flex items-center justify-between p-4 border-b bg-white md:hidden">
        {selectedPhone ? (
          <>
            <button
              onClick={() => setShowContactsMobile(true)}
              aria-label="Torna alla lista contatti"
              className="p-2"
            >
              <ArrowLeft size={24} />
            </button>
            <h2 className="font-semibold text-lg">{contactNames[selectedPhone] || selectedPhone}</h2>
            <div style={{ width: 40 }} /> {/* Placeholder */}
          </>
        ) : (
          <h2 className="font-semibold text-lg">Seleziona una chat</h2>
        )}
      </div>

      {/* Lista contatti desktop/mobile */}
      <div className="hidden md:block p-4 bg-white border-r overflow-y-auto h-full">
        <h2 className="font-bold text-xl mb-4">Conversazioni</h2>
        <ul className="space-y-2">
          {phoneList.map((phone) => (
            <li
              key={phone}
              onClick={() => onSelectPhone(phone)}
              className={`cursor-pointer rounded px-3 py-2 transition ${
                selectedPhone === phone
                  ? 'bg-gray-200 font-semibold'
                  : 'hover:bg-gray-100'
              }`}
            >
              {contactNames[phone] || phone}
            </li>
          ))}
        </ul>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">
        {selectedPhone ? (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Messaggi */}
              {filteredMessages.map((msg, idx) => {
                const isOperator = msg.from === 'operator';
                const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'} mb-3`}
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
                          alt="Immagine"
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

            {/* Input e bottoni */}
            <div className="flex items-center gap-3 p-4 bg-white border-t shadow-inner relative">
              <Input
                placeholder="Scrivi un messaggio..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1 rounded-full px-5 py-3 text-sm border border-gray-300 focus:ring-2 focus:ring-gray-800"
              />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplates((prev) => !prev)}
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

              <div>
                <label className="cursor-pointer flex items-center px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700">
                  📷
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && sendMediaMessage(e.target.files[0], 'image')}
                  />
                </label>
              </div>

              <div>
                <label className="cursor-pointer flex items-center px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700">
                  📎
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && sendMediaMessage(e.target.files[0], 'document')}
                  />
                </label>
              </div>

              <Button
                onClick={sendMessage}
                className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800 transition"
                disabled={!userData || !selectedPhone || !messageText}
              >
                <Send size={18} />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Seleziona una chat
          </div>
        )}
      </div>
    </div>
  );
}

