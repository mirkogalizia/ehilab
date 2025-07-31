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
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const { user } = useAuth();

  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [userData, setUserData] = useState(null);
  const [contactNames, setContactNames] = useState({});
  const [showTemplates, setShowTemplates] = useState(false);

  const messagesEndRef = useRef(null);

  // Carica nomi rubrica (dalla tua collezione "contacts")
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'contacts'), where('createdBy', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const obj = {};
      snap.docs.forEach(d => { obj[d.id] = d.data().name || d.id; });
      setContactNames(obj);
      setPhoneList(snap.docs.map(d => d.id));
      if (!selectedPhone && snap.docs.length) setSelectedPhone(snap.docs[0].id);
    });
    return () => unsub();
  }, [user]);

  // Carica dati utente by UID
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.id === user.uid);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Carica messaggi in real time della chat selezionata
  useEffect(() => {
    if (!user?.uid || !selectedPhone) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      where('to', '==', selectedPhone),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setAllMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [user, selectedPhone]);

  // Invia messaggio nuovo
  const sendMsg = async () => {
    if (!user || !selectedPhone || !messageText.trim()) return;
    await addDoc(collection(db, 'messages'), {
      text: messageText,
      to: selectedPhone,
      from: 'operator',
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
      type: 'text',
      user_uid: user.uid,
    });
    setMessageText('');
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
  };

  // --- NUOVA FUNZIONE: elimina singolo messaggio con click destro o tap lungo
  let tapTimer = null;
  const handleContextMenu = async (e, msgId) => {
    e.preventDefault();
    if (window.confirm('Vuoi eliminare questo messaggio?')) {
      await deleteDoc(doc(db, 'messages', msgId));
    }
  };
  const handleTouchStart = (msgId) => {
    tapTimer = setTimeout(async () => {
      if (window.confirm('Vuoi eliminare questo messaggio?')) {
        await deleteDoc(doc(db, 'messages', msgId));
      }
    }, 600);
  };
  const handleTouchEnd = () => clearTimeout(tapTimer);

  // -------------------------------

  return (
    <div className="flex h-[100vh] w-full">
      {/* Sidebar chat */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 flex items-center font-bold text-lg">
          📞 Rubrica
        </div>
        <ul className="flex-1 overflow-y-auto">
          {phoneList.map(phone => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              className={`px-4 py-3 cursor-pointer border-b hover:bg-blue-100 ${
                selectedPhone === phone ? 'bg-blue-50 font-semibold' : ''
              }`}
            >
              {contactNames[phone] || phone}
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat principale */}
      <main className="flex-1 flex flex-col bg-gray-50">
        {/* Header chat */}
        <div className="flex items-center px-6 py-4 border-b bg-white font-semibold text-lg">
          {contactNames[selectedPhone] || selectedPhone || "Seleziona una chat"}
        </div>

        {/* Messaggi */}
        <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {allMessages.map(msg => (
            <li
              key={msg.id}
              // --- Aggiunto qui ---
              onContextMenu={e => handleContextMenu(e, msg.id)}
              onTouchStart={() => handleTouchStart(msg.id)}
              onTouchEnd={handleTouchEnd}
              className={`max-w-lg rounded-2xl px-4 py-2 shadow-sm relative
                ${msg.from === 'operator' ? 'ml-auto bg-blue-200 text-right' : 'bg-white text-left'}
              `}
            >
              <div>{msg.text}</div>
              <span className="text-xs text-gray-400 absolute -bottom-5 right-2">
                {msg.createdAt && new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
          <div ref={messagesEndRef} />
        </ul>

        {/* Invio messaggio */}
        <form
          className="flex gap-2 p-4 border-t bg-white"
          onSubmit={e => { e.preventDefault(); sendMsg(); }}
        >
          <Input
            className="flex-1"
            value={messageText}
            placeholder="Scrivi un messaggio…"
            onChange={e => setMessageText(e.target.value)}
            disabled={!selectedPhone}
            autoFocus
          />
          <Button type="submit" disabled={!messageText.trim() || !selectedPhone}>
            <Send />
          </Button>
        </form>
      </main>
    </div>
  );
}


