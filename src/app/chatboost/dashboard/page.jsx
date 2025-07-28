'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [contactNames, setContactNames] = useState({});
  const messagesEndRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, async (snap) => {
      const msgs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllMessages(msgs);

      const uniquePhones = Array.from(
        new Set(msgs.map((msg) => (msg.from !== 'operator' ? msg.from : msg.to)))
      );
      setPhoneList(uniquePhones);

      const contactsSnap = await getDocs(collection(db, 'contacts'));
      const namesMap = {};
      contactsSnap.forEach((doc) => (namesMap[doc.id] = doc.data().name));
      setContactNames(namesMap);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages, selectedPhone]);

  const parseTime = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
    if (val?.seconds) return val.seconds * 1000;
    return 0;
  };

  const filteredMessages = allMessages
    .filter((msg) => msg.from === selectedPhone || msg.to === selectedPhone)
    .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt));

  return (
    <div className="h-[100dvh] w-full md:w-[calc(100%-6rem)] overflow-hidden font-[Montserrat] bg-gray-50">
      <AnimatePresence>
        {!selectedPhone && (
          <motion.div
            key="list"
            initial={{ x: 0, opacity: 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            className="h-full overflow-y-auto px-4 py-5"
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Conversazioni</h2>
            <ul className="divide-y divide-gray-200">
              {phoneList.map((phone) => (
                <li
                  key={phone}
                  onClick={() => setSelectedPhone(phone)}
                  className="px-4 py-3 cursor-pointer hover:bg-gray-100 rounded-lg transition"
                >
                  {contactNames[phone] || phone}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPhone && (
          <motion.div
            key="chat"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0 }}
            className="flex flex-col h-full"
          >
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
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="flex flex-col gap-3">
                {filteredMessages.map((msg, idx) => {
                  const isOp = msg.from === 'operator';
                  const time = new Date(parseTime(msg.timestamp || msg.createdAt)).toLocaleTimeString(
                    'it-IT',
                    { hour: '2-digit', minute: '2-digit' }
                  );
                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isOp ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`px-4 py-2 rounded-lg text-base shadow ${
                          isOp
                            ? 'bg-black text-white rounded-br-none ml-auto'
                            : 'bg-white text-gray-900 rounded-bl-none mr-auto'
                        } max-w-[85%]`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[11px] text-gray-400 mt-1">{time}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-3 bg-white border-t shadow-inner sticky bottom-0">
              <Input
                placeholder="Scrivi un messaggio..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              />
              <Button className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800">
                <Send size={18} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


