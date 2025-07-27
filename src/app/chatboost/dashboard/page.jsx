'use client';

import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/useAuth';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [waData, setWaData] = useState(null);
  const messagesEndRef = useRef(null);
  const phoneInputRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchWaData = async () => {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setWaData({
          phone_number_id: data.phone_number_id,
          numeroWhatsapp: data.numeroWhatsapp
        });
      } else {
        console.warn('⚠️ Documento utente non trovato per UID:', user.uid);
      }
    };

    fetchWaData();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllMessages(messages);

      const uniquePhones = Array.from(
        new Set(messages.map((msg) => (msg.from !== 'operator' ? msg.from : msg.to)))
      );
      setPhoneList(uniquePhones);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages, selectedPhone]);

  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !waData) return;

    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'text',
      text: { body: messageText },
    };

    const res = await fetch(`https://graph.facebook.com/v17.0/${waData.phone_number_id}/messages`, {
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
      console.warn('Errore invio messaggio:', data);
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
    <div className="flex flex-col md:flex-row h-screen">
      <div className="w-full md:w-1/4 bg-white border-r overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-4">📱 Conversazioni</h2>
        <ul className="space-y-2">
          {phoneList.map((phone) => (
            <li
              key={phone}
              onClick={() => {
                setSelectedPhone(phone);
                if (phoneInputRef.current) phoneInputRef.current.value = phone;
              }}
              className={`cursor-pointer px-3 py-2 rounded-lg hover:bg-gray-100 transition ${
                selectedPhone === phone ? 'bg-green-100 font-bold' : ''
              }`}
            >
              {phone}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col flex-1 bg-[#e5ddd5]">
        <div className="p-4 text-center text-lg font-semibold bg-[#f0f0f0] shadow-sm">
          {selectedPhone ? `Chat con ${selectedPhone}` : 'Seleziona una chat'}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-2">
            {filteredMessages.map((msg, idx) => {
              const isOperator = msg.from === 'operator';
              const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={msg.id || idx} className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-snug shadow-md break-words ${
                      isOperator
                        ? 'bg-[#dcf8c6] text-gray-900'
                        : 'bg-white text-gray-900'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">{time}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2 p-4 bg-[#f0f0f0] border-t">
          <Input
            ref={phoneInputRef}
            placeholder="Numero telefono"
            value={selectedPhone}
            onChange={(e) => setSelectedPhone(e.target.value)}
            className="w-full md:w-1/3"
          />
          <Input
            placeholder="Scrivi un messaggio..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="w-full flex-1 rounded-full px-4 py-2 text-sm border border-gray-300 bg-white"
          />
          <Button
            onClick={sendMessage}
            className="rounded-full px-4 py-2 bg-green-500 text-white hover:bg-green-600 transition"
            disabled={!waData || !messageText || !selectedPhone}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
