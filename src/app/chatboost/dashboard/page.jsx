// src/app/chatboost/dashboard/page.jsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "messages"), // ✅ correzione qui
      where("user_uid", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = [];
      querySnapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [user]);

  if (!user) return <div className="text-center mt-10">🔒 Effettua il login per accedere alla dashboard</div>;

  return (
    <div className="max-w-2xl mx-auto mt-8 p-4 bg-white rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-4">📨 Le tue conversazioni WhatsApp</h1>
      <div className="space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="border p-3 rounded-lg bg-gray-100">
            <div className="text-sm text-gray-500">
              {format(new Date(Number(msg.timestamp) * 1000), "dd/MM/yyyy HH:mm")}
            </div>
            <div className="text-lg">{msg.text}</div>
            <div className="text-xs text-gray-400 mt-1">ID: {msg.message_id}</div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-gray-500">Nessun messaggio ricevuto ancora.</p>}
      </div>
    </div>
  );
}
