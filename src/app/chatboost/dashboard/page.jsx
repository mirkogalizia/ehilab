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

  // Scroll automatico in fondo
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

  // Invio messaggio
  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'text',
      text: { body: messageText },
    };
    try {
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
      console.error('❌ Errore invio messaggio:', err);
    }
  };

  // Parse timestamp
  const parseTime = (val) => {
    if (!val) return 0;
    if (typeof val === 'string') return parseInt(val) * 1000;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (val?.seconds) return val.seconds * 1000;
    return 0;
  };

  // Filtra messaggi
  const filteredMessages = allMessages
    .filter((msg) => msg.from === selectedPhone || msg.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));

  return (
    <div className="h-[100dvh] w-screen flex font-[Montserrat] bg-gray-50 overflow-hidden">
      {/* Lista contatti */}
      <div
        className={`${
          selectedPhone ? 'hidden md:block md:w-1/3' : 'w-full md:w-1/3'
        } bg-white border-r overflow-y-auto px-4 py-5`}
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
              className={`cursor-pointer px-4 py-3 text-base rounded-lg transition ${
                selectedPhone === phone
                  ? 'bg-gray-200 font-semibold text-gray-900'
                  : 'hover:bg-gray-100'
              }`}
            >
              {contactNames[phone] || phone}
            </li>
          ))}
        </ul>
      </div>

      {/* Chat */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-100">
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
                const isOperator = msg.from === 'operator';
                const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString(
                  'it-IT',
                  { hour: '2-digit', minute: '2-digit' }
                );
                return (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`px-4 py-2 rounded-lg text-base shadow ${
                        isOperator
                          ? 'bg-black text-white rounded-br-none ml-auto'
                          : 'bg-white text-gray-900 rounded-bl-none mr-auto'
                      } max-w-[90%]`}
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
          <div className="flex items-center gap-3 p-3 bg-white border-t shadow-inner sticky bottom-0">
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
        </div>
      )}
    </div>
  );
}

