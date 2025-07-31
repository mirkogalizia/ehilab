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
  writeBatch,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const { user } = useAuth();

  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [contactNames, setContactNames] = useState({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, type: null, msgId: null }); // type: 'msg' | 'chat'

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

  // Eliminazione singolo messaggio
  const deleteMessage = async (msgId) => {
    await deleteDoc(doc(db, 'messages', msgId));
    setContextMenu({ show: false, x: 0, y: 0, type: null, msgId: null });
  };

  // Eliminazione intera conversazione
  const deleteConversation = async () => {
    if (!window.confirm('Eliminare tutta la conversazione?')) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      where('to', '==', selectedPhone)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(docu => batch.delete(doc(db, 'messages', docu.id)));
    await batch.commit();
    setContextMenu({ show: false, x: 0, y: 0, type: null, msgId: null });
    setAllMessages([]); // UI feedback
  };

  // Gestione context menu (click destro/tap lungo)
  const handleContextMenuMsg = (e, msgId) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.pageX,
      y: e.pageY,
      type: 'msg',
      msgId,
    });
  };
  const handleContextMenuChat = (e) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.pageX,
      y: e.pageY,
      type: 'chat',
      msgId: null,
    });
  };
  // Chiudi context menu
  useEffect(() => {
    const handleClick = () => setContextMenu({ show: false, x: 0, y: 0, type: null, msgId: null });
    if (contextMenu.show) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu.show]);

  // Supporto tap lungo su mobile
  let tapTimer = null;
  const handleTouchStartMsg = (msgId) => {
    tapTimer = setTimeout(() => setContextMenu({
      show: true,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      type: 'msg',
      msgId,
    }), 600);
  };
  const handleTouchEndMsg = () => clearTimeout(tapTimer);
  const handleTouchStartChat = () => {
    tapTimer = setTimeout(() => setContextMenu({
      show: true,
      x: window.innerWidth / 2,
      y: 80,
      type: 'chat',
      msgId: null,
    }), 600);
  };
  const handleTouchEndChat = () => clearTimeout(tapTimer);

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
              onContextMenu={handleContextMenuChat}
              onTouchStart={handleTouchStartChat}
              onTouchEnd={handleTouchEndChat}
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
        <div
          className="flex items-center px-6 py-4 border-b bg-white font-semibold text-lg cursor-pointer relative"
          onContextMenu={handleContextMenuChat}
          onTouchStart={handleTouchStartChat}
          onTouchEnd={handleTouchEndChat}
        >
          {contactNames[selectedPhone] || selectedPhone || "Seleziona una chat"}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            title="Elimina conversazione"
            onClick={deleteConversation}
          >
            <Trash2 size={20} />
          </Button>
        </div>

        {/* Messaggi */}
        <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {allMessages.map(msg => (
            <li
              key={msg.id}
              onContextMenu={e => handleContextMenuMsg(e, msg.id)}
              onTouchStart={() => handleTouchStartMsg(msg.id)}
              onTouchEnd={handleTouchEndMsg}
              className={`max-w-lg rounded-2xl px-4 py-2 shadow-sm relative group
                ${msg.from === 'operator' ? 'ml-auto bg-blue-200 text-right' : 'bg-white text-left'}
              `}
            >
              <div>{msg.text}</div>
              <span className="text-xs text-gray-400 absolute -bottom-5 right-2">
                {msg.createdAt && new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {/* Icona trash visibile al passaggio mouse */}
              <button
                className="hidden group-hover:inline absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500"
                title="Elimina messaggio"
                onClick={() => deleteMessage(msg.id)}
              >
                <Trash2 size={16} />
              </button>
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

        {/* Menu contestuale */}
        {contextMenu.show && (
          <div
            className="fixed z-50 bg-white rounded shadow-md border w-44"
            style={{ top: contextMenu.y, left: contextMenu.x, minWidth: 160 }}
            onClick={() => setContextMenu({ show: false })}
          >
            {contextMenu.type === 'msg' && (
              <button
                className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 font-medium"
                onClick={() => deleteMessage(contextMenu.msgId)}
              >
                Elimina messaggio
              </button>
            )}
            {contextMenu.type === 'chat' && (
              <button
                className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 font-medium"
                onClick={deleteConversation}
              >
                Elimina conversazione
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


