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
  where
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [phoneList, setPhoneList] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [userData, setUserData] = useState(null);
  const messagesEndRef = useRef(null);
  const [last24hWindowClosed, setLast24hWindowClosed] = useState(false);

  // Recupera dati utente (phone_number_id)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Ascolta messaggi realtime SOLO dell'utente corrente
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('user_uid', '==', user.uid),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, async snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllMessages(msgs);

      // lista numeri
      const phones = Array.from(new Set(msgs.map(m => m.from !== 'operator' ? m.from : m.to)));
      setPhoneList(phones);

      // nomi contatti (filtrati per utente!)
      const cs = await getDocs(query(collection(db, 'contacts'), where('createdBy', '==', user.uid)));
      const map = {};
      cs.forEach(d => map[d.id] = d.data().name);
      setContactNames(map);
    });
    return () => unsub();
  }, [user]);

  // Scroll automatico
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, selectedPhone]);

  // Carica templates APPROVED
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data.filter(t => t.status === 'APPROVED'));
    })();
  }, [user]);

  const parseTime = val => {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (typeof val === 'string') return parseInt(val) * 1000;
    return val.seconds * 1000;
  };

  const filtered = allMessages
    .filter(m => m.from === selectedPhone || m.to === selectedPhone)
    .sort((a,b) => parseTime(a.timestamp||a.createdAt) - parseTime(b.timestamp||b.createdAt));

  // Controlla se finestra 24h è chiusa (nel messaggio più recente)
  useEffect(() => {
    if (!filtered.length) {
      setLast24hWindowClosed(false);
      return;
    }
    const lastMsg = filtered[filtered.length -1];
    // Assume last_24h_window boolean in message, true = finestra aperta, false chiusa
    // Se mancante, consideriamo chiusa per sicurezza
    setLast24hWindowClosed(lastMsg.last_24h_window === false);
  }, [filtered]);

  const sendMessage = async () => {
    if (!selectedPhone || !messageText || !userData) return;
    if (last24hWindowClosed) {
      alert('⚠️ La finestra 24h è chiusa. Puoi inviare solo template.');
      return;
    }
    const payload = { messaging_product:'whatsapp', to:selectedPhone, type:'text', text:{ body:messageText }};
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`, {
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.messages) {
      await addDoc(collection(db,'messages'),{
        text:messageText, to:selectedPhone, from:'operator',
        timestamp:Date.now(), createdAt:serverTimestamp(),
        type:'text', user_uid:user.uid, message_id:data.messages[0].id
      });
      setMessageText('');
    } else {
      alert('Errore invio: '+JSON.stringify(data.error));
    }
  };

  const sendTemplate = async name => {
    if (!selectedPhone || !name || !userData) return;
    // Template si possono inviare anche se finestra 24h chiusa
    const payload = { messaging_product:'whatsapp', to:selectedPhone, type:'template', template:{ name, language:{ code:'it' }}};
    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,{
      method:'POST',
      headers:{ Authorization:`Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.messages) {
      await addDoc(collection(db,'messages'),{
        text:`Template inviato: ${name}`, to:selectedPhone, from:'operator',
        timestamp:Date.now(), createdAt:serverTimestamp(),
        type:'template', user_uid:user.uid, message_id:data.messages[0].id
      });
      setShowTemplates(false);
    } else {
      alert('Err template: '+JSON.stringify(data.error));
    }
  };

  const sendMedia = async (file, type) => {
    if (!selectedPhone || !userData) return;
    if (last24hWindowClosed) {
      alert('⚠️ La finestra 24h è chiusa. Puoi inviare solo template.');
      return;
    }
    try {
      const form = new FormData();
      form.append('file', file); form.append('type', type); form.append('messaging_product','whatsapp');
      const up = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/media`,{
        method:'POST',
        headers:{ Authorization:`Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}` },
        body: form
      });
      const upData = await up.json();
      if (!upData.id) throw upData;
      const payload = { messaging_product:'whatsapp', to:selectedPhone, type, [type]:{ id:upData.id, caption:file.name }};
      const res = await fetch(`https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,{
        method:'POST',
        headers:{ Authorization:`Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.messages) {
        await addDoc(collection(db,'messages'),{
          text:file.name, mediaUrl: '', to:selectedPhone, from:'operator',
          timestamp:Date.now(), createdAt:serverTimestamp(), type, user_uid:user.uid, message_id:d.messages[0].id
        });
      }
    } catch(e){
      console.error(e);
      alert('Media error');
    }
  };

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      {/* LISTA */}
      <div className={`${selectedPhone ? 'hidden' : 'block'} md:block md:w-1/4 bg-white border-r overflow-y-auto p-4`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Conversazioni</h2>
          <button onClick={() => setShowNewChat(true)} className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded-full">
            <Plus size={16} /> Nuova
          </button>
        </div>
        <ul className="space-y-2">
          {phoneList.map(phone => (
            <li
              key={phone}
              onClick={() => setSelectedPhone(phone)}
              className={`p-3 rounded-lg cursor-pointer transition ${selectedPhone === phone ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'}`}
            >
              {contactNames[phone] || allMessages.find(m => m.from === phone || m.to === phone)?.profile_name || phone}
            </li>
          ))}
        </ul>
        {/* Modal Nuova Chat */}
        {showNewChat && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg shadow">
            <h3 className="mb-2 font-medium">📞 Inserisci numero</h3>
            <Input placeholder="3931234567" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="mb-2" />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (newPhone) {
                    setPhoneList([newPhone, ...phoneList]);
                    setSelectedPhone(newPhone);
                    setNewPhone('');
                    setShowNewChat(false);
                  }
                }}
                className="flex-1 bg-black text-white"
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

      {/* CHAT */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-100">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 bg-white border-b sticky top-0 z-10">
            <button onClick={() => setSelectedPhone('')} className="md:hidden text-gray-600 hover:text-black">
              <ArrowLeft size={22} />
            </button>
            <span className="text-lg font-semibold truncate">
              {contactNames[selectedPhone] || allMessages.find(m => m.from === selectedPhone || m.to === selectedPhone)?.profile_name || selectedPhone}
            </span>
          </div>
          {/* Messaggi */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {filtered.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-4 py-2 rounded-xl text-sm shadow-md max-w-[70%] ${
                      msg.from === 'operator' ? 'bg-black text-white rounded-br-none' : 'bg-white text-gray-900 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {/* Input + Attach */}
          <div className="flex items-center gap-2 p-3 bg-white border-t sticky bottom-0">
            {/* Template */}
            <div className="relative">
              <button onClick={() => setShowTemplates(!showTemplates)} className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">
                📑
              </button>
              {showTemplates && (
                <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {templates.length > 0 ? (
                    templates.map(tpl => (
                      <div
                        key={tpl.name}
                        onClick={() => sendTemplate(tpl.name)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-gray-500 truncate">{tpl.components?.[0]?.text || '—'}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-gray-500">Nessun template</div>
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
                onChange={e => e.target.files[0] && sendMedia(e.target.files[0], 'image')}
              />
            </label>
            <label className="cursor-pointer px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200">
              📎
              <input
                type="file"
                accept=".pdf,.doc,.xls"
                className="hidden"
                onChange={e => e.target.files[0] && sendMedia(e.target.files[0], 'document')}
              />
            </label>
            {/* Text */}
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
            />
            <Button
              onClick={sendMessage}
              disabled={!messageText}
              className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


