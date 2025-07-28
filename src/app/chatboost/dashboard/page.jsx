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

  // Recupera userData
  useEffect(() => {
    if (!user) return;
    const fetchUserDataByEmail = async () => {
      try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const currentUserData = allUsers.find((u) => u.email === user.email);
        if (currentUserData) setUserData(currentUserData);
      } catch (error) {
        console.error('❌ Errore nel recupero dati utente:', error);
      }
    };
    fetchUserDataByEmail();
  }, [user]);

  // Recupera messaggi realtime
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllMessages(messages);

      const uniquePhones = Array.from(
        new Set(messages.map((msg) => (msg.fr
