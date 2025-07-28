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

  // User Data
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

  // Messaggi realtime
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

  // Templates
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

  // Send text message
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
        status: 'sent',
      });
      setMessageText('');
    } else {
      console.error('❌ Errore invio messaggio:', data);
    }
  };

  // Send template
  const sendTemplate = async (templateName) => {
    const tpl = templates.find((t) => t.name === templateName);
    const bodyText = tpl?.components?.[0]?.text || `Template inviato: ${templateName}`;

    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type: 'template',
      template: { name: templateName, language: { code: 'it' } },
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
        text: bodyText,
        to: selectedPhone,
        from: 'operator',
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type: 'template',
        user_uid: user.uid,
        message_id: data.messages[0].id,
        status: 'sent',
      });
      setShowTemplates(false);
    }
  };

  // Upload media
  const uploadMedia = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', file.type);
    formData.append('messaging_product', 'whatsapp');

    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}` },
        body: formData,
      }
    );
    const data = await res.json();
    return data.id || null;
  };

  const sendMediaMessage = async (file, type) => {
    const mediaId = await uploadMedia(file);
    if (!mediaId) return;

    const payload = {
      messaging_product: 'whatsapp',
      to: selectedPhone,
      type,
      [type]: { id: mediaId, caption: file.name },
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
        text: file.name,
        to: selectedPhone,
        from: 'operator',
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        type,
        user_uid: user.uid,
        message_id: data.messages[0].id,
        mediaUrl: URL.createObjectURL(file), // preview locale
        status: 'sent',
      });
    }
  };

  const parseTime = (val) =>
    val?.seconds ? val.seconds * 1000 : typeof val === 'number' ? val : Date.now();

  const filteredMessages = allMessages
    .filter((msg) => msg.from === selectedPhone || msg.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));

  // Abilitazione invio libero solo dopo risposta
  const hasReply = filteredMessages.some((msg) => msg.from !== 'operator');
  const canSendFreeText = hasReply;

  return (
    <div className="flex h-screen bg-gray-50 font-[Montserrat]">
      {/* Sidebar */}
      <div className="w-1/4 bg-white p-6 border-r">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">Conversazioni</h2>
          <button onClick={() => setShowNewChat(true)} className="text-sm bg-black text-white px-3 py-1 rounded">+ Nuova</button>
        </div>
        {phoneList.map((phone) => (
          <div
            key={phone}
            onClick={() => setSelectedPhone(phone)}
            className={`p-2 cursor-pointer rounded ${selectedPhone === phone ? 'bg-gray-200 font-bold' : 'hover:bg-gray-100'}`}
          >
            {contactNames[phone] || phone}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-gray-100">
        <div className="p-4 bg-white border-b font-semibold">
          {selectedPhone ? `Chat con ${contactNames[selectedPhone] || selectedPhone}` : 'Seleziona una chat'}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {filteredMessages.map((msg) => {
            const isOperator = msg.from === 'operator';
            const time = new Date(parseTime(msg.timestamp)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={msg.id} className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'} mb-3`}>
                <div className={`px-4 py-2 rounded-2xl shadow ${isOperator ? 'bg-black text-white' : 'bg-white'}`}>
                  {msg.type === 'image' && msg.mediaUrl ? (
                    <img src={msg.mediaUrl} alt="Immagine" className="max-w-[200px] rounded" />
                  ) : msg.type === 'document' && msg.mediaUrl ? (
                    <a href={msg.mediaUrl} target="_blank" className="text-blue-600 underline">📎 {msg.text}</a>
                  ) : (
                    msg.text
                  )}
                </div>
                <div className="text-[10px] text-gray-400 flex gap-1 items-center mt-1">
                  {time}
                  {isOperator && (
                    <>
                      {msg.status === 'sent' && '✅'}
                      {msg.status === 'delivered' && '✅✅'}
                      {msg.status === 'read' && <span className="text-blue-500">✅✅</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-3 bg-white border-t flex gap-2">
          <Input
            placeholder="Scrivi un messaggio..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={!canSendFreeText}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={!canSendFreeText || !messageText}>
            <Send size={18} />
          </Button>
          <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && sendMediaMessage(e.target.files[0], 'image')} />
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => e.target.files[0] && sendMediaMessage(e.target.files[0], 'document')} />
        </div>
      </div>
    </div>
  );
}

