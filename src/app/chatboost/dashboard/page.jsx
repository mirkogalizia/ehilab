'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  getDocs, where, writeBatch, doc, deleteDoc
} from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Plus, ArrowLeft, Camera, Paperclip, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = String(phoneRaw)
    .trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (String(phoneRaw).startsWith('+')) return String(phoneRaw).trim();
  return '';
}

const parseTime = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    if (isNaN(n)) return 0;
    return n > 1e12 ? n : n * 1000;
  }
  if (val && typeof val === 'object') {
    if (val.seconds != null) return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
    if (typeof val.getTime === 'function') return val.getTime();
  }
  return 0;
};

function formatDateSeparator(date) {
  const now = new Date();
  const d = new Date(date);
  const day = d.getDate(), month = d.getMonth(), year = d.getFullYear();
  const today = now.getDate(), thisMonth = now.getMonth(), thisYear = now.getFullYear();
  if (day === today && month === thisMonth && year === thisYear) return "Oggi";
  const yesterday = new Date(now);
  yesterday.setDate(today - 1);
  if (
    day === yesterday.getDate() &&
    month === yesterday.getMonth() &&
    year === yesterday.getFullYear()
  ) return "Ieri";
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderTextWithLinks(text) {
  if (!text) return null;
  let s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\\n/g, '\n');
  if (!s.includes('\n')) {
    s = s
      .replace(/\s+(Corriere:)/, '\n$1')
      .replace(/\s+(Tracking:)/, '\n$1')
      .replace(/\s+(Puoi tracciare|Traccia la spedizione)/, '\n$1')
      .replace(/\s+(Questo numero WhatsApp)/, '\n\n$1');
  }
  const urlRe = /\bhttps?:\/\/[^\s]+/gi;
  return s.split('\n').map((line, iLine, lines) => {
    const nodes = [];
    let lastIndex = 0, match;
    while ((match = urlRe.exec(line)) !== null) {
      const url = match[0], offset = match.index;
      if (offset > lastIndex) nodes.push(line.slice(lastIndex, offset));
      nodes.push(
        <a
          key={`ln-${iLine}-ofs-${offset}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-words"
        >
          {url}
        </a>
      );
      lastIndex = offset + url.length;
    }
    if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
    return (
      <span key={`ln-${iLine}`}>
        {nodes}
        {iLine < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

export default function ChatPage() {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [selectedPhone, setSelectedPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [userData, setUserData] = useState(null);
  const [canSendMessage, setCanSendMessage] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesTopRef = useRef(null);
  const listChatRef = useRef(null);
  const chatBoxRef = useRef();

  const [searchContact, setSearchContact] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [chatMenu, setChatMenu] = useState({ visible: false, x: 0, y: 0, phone: null });
  const [sending, setSending] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  let longPressTimeout = useRef();

  // tutte le useEffect e funzioni rimangono COME NEL TUO FILE ORIGINALE
  // ... (omesso qui per brevità - copia-incolla tutto invariato!) ...

  // ...Aggiungi qui tutte le funzioni: sendMessage, sendTemplate, handleMediaInput, autoscroll, context menu ecc...

  // phonesData con hasAbandonedCartMsg (carrello abbandonato) come già integrato
  const phonesData = useMemo(() => {
    const map = new Map();
    for (const m of allMessages) {
      const fromNorm = normalizePhone(m.from);
      const toNorm = normalizePhone(m.to);
      const phone = m.from === 'operator' ? toNorm : fromNorm;
      if (!phone) continue;
      const isAbandonedCartMsg = m.automation === 'abandoned_cart';
      const prev = map.get(phone);
      if (!prev) {
        map.set(phone, {
          phone,
          name: contactNames[phone] || phone,
          hasAbandonedCartMsg: isAbandonedCartMsg,
          lastMsgTime: parseTime(m.timestamp || m.createdAt),
          lastMsgText: m.text || '',
          lastMsgFrom: m.from,
          unread: (fromNorm === phone && m.read === false) ? 1 : 0,
        });
      } else {
        if (isAbandonedCartMsg) prev.hasAbandonedCartMsg = true;
        const time = parseTime(m.timestamp || m.createdAt);
        if (time >= prev.lastMsgTime) {
          prev.lastMsgTime = time;
          prev.lastMsgText = m.text || '';
          prev.lastMsgFrom = m.from;
        }
        if (fromNorm === phone && m.read === false) prev.unread += 1;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.unread - a.unread || b.lastMsgTime - a.lastMsgTime);
  }, [allMessages, contactNames]);
  const unreadThreads = useMemo(() => phonesData.filter(x => x.unread > 0), [phonesData]);
  const readThreads = useMemo(() => phonesData.filter(x => x.unread === 0), [phonesData]);

  // Resto delle funzioni invariato come da tua versione! (autoscroll, preview, eliminazione, modali ecc.)

  return (
    <div className="chat-shell flex flex-col md:flex-row bg-gray-50 font-[Montserrat] overflow-hidden">
      {/* LISTA CHAT */}
      <div
        className={`${selectedPhone ? 'hidden' : 'block'} md:block md:w-1/4 bg-white border-r p-4 chat-scroll`}
        ref={listChatRef}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Conversazioni</h2>
        </div>
        <ul className="space-y-0">
          {unreadThreads.length > 0 && (
            <>
              <li className="text-xs uppercase text-gray-400 px-2 py-1 tracking-wide">Non letti</li>
              {unreadThreads.map(thread => (
                <li
                  key={`unread-${thread.phone}`}
                  data-phone={thread.phone}
                  onClick={() => setSelectedPhone(thread.phone)}
                  className={`group flex items-center justify-between px-4 py-3 mb-1 rounded-xl cursor-pointer transition 
                  ${selectedPhone === thread.phone ? 'bg-gray-200 font-semibold shadow' : 'hover:bg-gray-100'}
                  border-b border-gray-100`}
                  style={{ boxShadow: selectedPhone === thread.phone ? '0 4px 16px #0001' : '' }}
                >
                  <div>
                    <span className="font-bold text-black">
                      {thread.name}
                      {thread.hasAbandonedCartMsg && (
                        <span className="ml-2" title="Messaggio carrello abbandonato inviato">
                          <span style={{ fontSize: '1.2em', verticalAlign: 'middle' }}>🛒</span>
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {thread.lastMsgText.length > 32 ? thread.lastMsgText.substring(0, 32) + '…' : thread.lastMsgText}
                    </span>
                  </div>
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">{thread.unread}</span>
                </li>
              ))}
              <li className="my-2 border-t border-gray-200"></li>
            </>
          )}
          {readThreads.length > 0 && (
            <>
              <li className="text-xs uppercase text-gray-400 px-2 py-1 tracking-wide">Conversazioni</li>
              {readThreads.map(thread => (
                <li
                  key={`read-${thread.phone}`}
                  data-phone={thread.phone}
                  onClick={() => setSelectedPhone(thread.phone)}
                  className={`group flex items-center justify-between px-4 py-3 mb-1 rounded-xl cursor-pointer transition 
                  ${selectedPhone === thread.phone ? 'bg-gray-200 font-semibold shadow' : 'hover:bg-gray-100'}
                  border-b border-gray-100`}
                >
                  <div>
                    <span className="font-bold text-black">
                      {thread.name}
                      {thread.hasAbandonedCartMsg && (
                        <span className="ml-2" title="Messaggio carrello abbandonato inviato">
                          <span style={{ fontSize: '1.2em', verticalAlign: 'middle' }}>🛒</span>
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {thread.lastMsgText.length > 32 ? thread.lastMsgText.substring(0, 32) + '…' : thread.lastMsgText}
                    </span>
                  </div>
                </li>
              ))}
            </>
          )}
        </ul>
        {/* ...modali nuova chat, batch delete, ecc... */}
      </div>

      {/* CHAT AREA */}
      {selectedPhone && (
        <div className="flex flex-col flex-1 bg-gray-100 relative">
          <div className="flex items-center gap-3 p-4 bg-white border-b sticky top-0 z-20">
            <button onClick={() => setSelectedPhone('')} className="md:hidden text-gray-600 hover:text-black">
              <ArrowLeft size={22} />
            </button>
            <span className="text-lg font-semibold truncate">{contactNames[selectedPhone] || selectedPhone}</span>
          </div>
          {/* PRIMA: Preview media se c'è */}
          {selectedMedia && (
            <MediaPreview selectedMedia={selectedMedia} onClear={() => setSelectedMedia(null)} />
          )}
          <div
            className="flex-1 p-4 scroll-smooth relative chat-scroll chat-scroll--with-composer"
            ref={chatBoxRef}
          >
            <div ref={messagesTopRef} />
            <div className="space-y-3">
              {/* Messaggi con date separator */}
              {(() => {
                let lastMsgDateLabel = null;
                return allMessages
                  .filter(m =>
                    normalizePhone(m.from) === selectedPhone ||
                    normalizePhone(m.to) === selectedPhone
                  )
                  .sort((a, b) => parseTime(a.timestamp || a.createdAt) - parseTime(b.timestamp || b.createdAt))
                  .map((msg, idx) => {
                  const msgDate = new Date(parseTime(msg.timestamp || msg.createdAt));
                  const dateLabel = formatDateSeparator(msgDate);
                  const showDateSeparator = dateLabel !== lastMsgDateLabel;
                  lastMsgDateLabel = dateLabel;
                  return (
                    <div key={idx}>
                      {showDateSeparator && (
                        <div className="flex justify-center my-4">
                          <span className="bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1 rounded-full shadow">
                            {dateLabel}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex flex-col ${msg.from === 'operator' ? 'items-end' : 'items-start'}`}
                      >
                        {msg.type === 'image' && msg.media_id ? (
                          <img
                            src={`/api/media-proxy?media_id=${msg.media_id}`}
                            alt="Immagine"
                            className="max-w-xs rounded-lg shadow-md"
                            loading="lazy"
                          />
                        ) : msg.type === 'document' && msg.media_id ? (
                          <a
                            href={`/api/media-proxy?media_id=${msg.media_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                          >
                            Documento allegato
                          </a>
                        ) : (
                          <div
                            className={`px-4 py-2 rounded-xl text-sm shadow-md max-w-[70%] whitespace-pre-wrap break-words ${
                              msg.from === 'operator'
                                ? 'bg-black text-white rounded-br-none'
                                : 'bg-white text-gray-900 rounded-bl-none'
                            }`}
                          >
                            {renderTextWithLinks(msg.text)}
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">
                          {msgDate.toLocaleTimeString('it-IT', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {/* COMPOSER */}
          <div className="flex items-center gap-2 p-3 sticky-composer">
            <label className="flex items-center cursor-pointer">
              <Camera size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setSelectedMedia({ file, type: 'image' });
                  setShowTemplates(false);
                  setMessageText('');
                }}
                disabled={!canSendMessage || sending}
              />
            </label>
            <label className="flex items-center cursor-pointer">
              <Paperclip size={22} className="mr-2 text-gray-500 hover:text-black" />
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                className="hidden"
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setSelectedMedia({ file, type: 'document' });
                  setShowTemplates(false);
                  setMessageText('');
                }}
                disabled={!canSendMessage || sending}
              />
            </label>
            <Input
              placeholder="Scrivi un messaggio..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !sending && /* sendMessage() */ null}
              className="flex-1 rounded-full px-4 py-3 text-base border border-gray-300 focus:ring-2 focus:ring-gray-800"
              disabled={!canSendMessage || sending}
            />
            <Button
              onClick={/* sendMessage */ () => {}}
              disabled={sending || (!messageText.trim() && !selectedMedia) || !canSendMessage}
              className="rounded-full px-5 py-3 bg-black text-white hover:bg-gray-800"
            >
              <Send size={18} />
            </Button>
            <Button
              onClick={() => setShowTemplates(!showTemplates)}
              className="rounded-full px-3 py-2 bg-gray-200 text-gray-700 ml-2"
              type="button"
              disabled={sending}
            >
              Tmpl
            </Button>
          </div>
          {/* Qui modali template, context menu, ecc. */}
        </div>
      )}
    </div>
  );
}

function MediaPreview({ selectedMedia, onClear }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (selectedMedia?.type === 'image' && selectedMedia.file) {
      const u = URL.createObjectURL(selectedMedia.file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [selectedMedia]);
  return (
    <div className="flex items-center gap-4 mb-2 p-2 bg-gray-100 rounded shadow border border-gray-300 max-w-xs mx-4">
      {selectedMedia.type === 'image' ? (
        <img src={url || ''} alt="preview" className="h-16 w-16 object-cover rounded" />
      ) : (
        <div className="flex items-center gap-2">
          <Paperclip size={20} className="text-gray-600" />
          <span className="text-sm">{selectedMedia.file?.name}</span>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="text-red-500 hover:bg-red-50"
        title="Rimuovi"
      >✕</Button>
    </div>
  );
}

