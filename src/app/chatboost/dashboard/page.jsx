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
  getDoc,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [userData, setUserData] = useState(null);
  const [contactNames, setContactNames] = useState({});
  const messagesEndRef = useRef(null);
  const { user } = useAuth();

  // Recupera dati utente da Firestore
  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserData(snap.data());
        }
      } catch (error) {
        console.error('❌ Errore recupero dati utente:', error);
      }
    };
    fetchUserData();
  }, [user]);

  // Recupera templates approvati tramite API interna
  useEffect(() => {
    if (!user?.email) return;

    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/list-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });

        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
        } else {
          setTemplates([]);
          console.warn('⚠️ Nessun template trovato per questo utente');
        }
      } catch (err) {
        console.error('❌ Errore caricamento template:', err);
      }
    };

    fetchTemplates();
  }, [user]);

  // Recupera messaggi realtime
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

  // Funzione comune invio messaggio/template
  const sendToWhatsApp = async (payload, text) => {
    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();

    if (data.messages) {
      await addDoc(collection(db, 'messages'), {
        text,
        to: payload.to,
        from: 'operator',
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: payload.type,
        user_uid: user.uid,
        message_id: data.messages[0].id,
      });
    } else {
      console.error('❌ Errore invio messaggio:', data);
    }
  };

  // Invio testo
  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'text',
      text: { body: messageText },
    };
    await sendToWhatsApp(payload, messageText);
    setMessageText('');
  };

  // Invio template
  const sendTemplate = async (templateName) => {
    if (!selectedPhone || !templateName || !userData) return;
    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'it' },
      },
    };
    await sendToWhatsApp(payload, `[TEMPLATE] ${templateName}`);
  };

  // Gestione timestamp messaggi
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
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 font-[Montserrat]">
      {/* Lista contatti */}
      <div className="w-full md:w-1/4 bg-white border-r overflow-y-auto p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-700 mb-6">Conversazioni</h2>
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
      </div>

      {/* Conversazione */}
      <div className="flex flex-col flex-1 bg-gray-100">
        {/* Header */}
        <div className="p-4 bg-white border-b shadow-sm text-lg font-semibold text-gray-700">
          {selectedPhone
            ? `Chat con ${contactNames[selectedPhone] || selectedPhone}`
            : 'Seleziona una chat'}
        </div>

        {/* Messaggi */}
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
                    {msg.text}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{time}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input + Icona Template */}
        <div className="flex items-center gap-3 p-4 bg-white border-t shadow-inner">
          <Input
            placeholder="Scrivi un messaggio..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 rounded-full px-5 py-3 text-sm border border-gray-300 focus:ring-2 focus:ring-gray-800"
          />

          {/* Pulsante Template */}
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition text-sm text-gray-700"
            >
              📑 Template
            </button>
            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition">
              {templates.length === 0 ? (
                <p className="p-3 text-sm text-gray-500 text-center">Nessun template</p>
              ) : (
                <ul className="py-2">
                  {templates.map((tpl) => (
                    <li
                      key={tpl.name}
                      onClick={() => sendTemplate(tpl.name)}
                      className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                    >
                      {tpl.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

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

