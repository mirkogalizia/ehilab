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
import { Send } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [userData, setUserData] = useState(null);
  const [contactNames, setContactNames] = useState({});
  const messagesEndRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const fetchUserDataByEmail = async () => {
      try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const currentUserData = allUsers.find((u) => u.email === user.email);

        if (currentUserData) {
          setUserData(currentUserData);
        }
      } catch (error) {
        console.error('❌ Errore nel recupero dati utente:', error);
      }
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

  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'text',
      text: { body: messageText },
    };

    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

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
      console.warn('❌ Errore invio messaggio:', data);
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
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="w-20 bg-white border-r flex flex-col items-center py-6 shadow-md">
        <div className="text-2xl font-bold text-green-600 mb-10">💬</div>
        <nav className="flex flex-col gap-6">
          <Button variant="ghost" size="icon">🏠</Button>
          <Button variant="ghost" size="icon">💬</Button>
          <Button variant="ghost" size="icon">📊</Button>
          <Button variant="ghost" size="icon">⚙️</Button>
        </nav>
      </aside>

      {/* Lista contatti */}
      <div className="w-1/4 bg-white border-r overflow-y-auto p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-700 mb-6">Conversazioni</h2>
        <ul className="space-y-3">
          {phoneList.map((phone) => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              className={`cursor-pointer px-4 py-3 rounded-xl shadow-sm transition ${
                selectedPhone === phone
                  ? 'bg-green-100 text-green-700 font-semibold'
                  : 'hover:bg-gray-100'
              }`}
            >
              {contactNames[phone] || phone}
            </li>
          ))}
        </ul>
      </div>

      {/* Chat */}
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
                        ? 'bg-green-500 text-white rounded-br-none'
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

        {/* Input */}
        <div className="flex items-center gap-3 p-4 bg-white border-t shadow-inner">
          <Input
            placeholder="Scrivi un messaggio..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 rounded-full px-5 py-3 text-sm border border-gray-300 focus:ring-2 focus:ring-green-400"
          />
          <Button
            onClick={sendMessage}
            className="rounded-full px-5 py-3 bg-green-500 text-white hover:bg-green-600"
            disabled={!userData || !selectedPhone || !messageText}
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}


