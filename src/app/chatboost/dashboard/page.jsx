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
  doc,
  updateDoc,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ChevronLeft } from 'lucide-react';
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

  // Recupera dati utente
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

  // Ascolta messaggi realtime
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

  // Scroll automatico in fondo chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages, selectedPhone]);

  // Carica template APPROVED
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

  // Funzione invio messaggio testo (rimane invariata)
  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    // ... [mantieni la tua logica di invio testo qui]
  };

  // Funzione invio template (mantieni la tua logica)
  const sendTemplate = async (templateName) => {
    if (!selectedPhone || !templateName || !userData) return;
    // ... [mantieni la tua logica di invio template qui]
  };

  // Funzione upload media e invio (mantieni la tua logica)
  const sendMediaMessage = async (file, type) => {
    // ... [mantieni la tua logica di upload e invio media qui]
  };

  const parseTime = (val) => {
    if (!val) return 0;
    if (typeof val === 'string') return parseInt(val) * 1000;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (val?.seconds) return val.seconds * 1000;
    return 0;
  };

  // Filtra messaggi per chat selezionata
  const filteredMessages = allMessages
    .filter((msg) => msg.from === selectedPhone || msg.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));

  // COMPONENTE lista contatti
  const ContactList = () => (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 p-4 border-b">
        <h2 className="text-xl font-semibold">Conversazioni</h2>
        <Button onClick={() => setShowNewChat(true)}><Plus size={16} /> Nuova</Button>
      </div>

      <ul className="overflow-y-auto flex-1 px-4 space-y-3">
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
        <div className="p-4 bg-gray-100 rounded-xl shadow-md m-4">
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
    </div>
  );

  // COMPONENTE chat
  const ChatWindow = () => (
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
            const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', {
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
                  {/* Mostra immagine, documento o testo */}
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
      </div>

      <div className="flex items-center gap-3 p-4 bg-white border-t shadow-inner relative">
        <Input
          placeholder="Scrivi un messaggio..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-1 rounded-full px-5 py-3 text-sm border border-gray-300 focus:ring-2 focus:ring-gray-800"
          disabled={!selectedPhone}
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
              disabled={!selectedPhone}
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
              disabled={!selectedPhone}
            />
          </label>
        </div>

        <Button
          onClick={sendMessage}
          className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800 transition"
          disabled={!selectedPhone || !messageText}
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  );

  // Props per layout
  return {
    pageType: 'chat',
    phoneListComponent: <ContactList />,
    chatComponent: <ChatWindow />,
  };
}

