// src/app/chatboost/dashboard/page.jsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "messages"),
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

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    if (!user) return;

    await addDoc(collection(db, "messages"), {
      user_uid: user.uid,
      from: "operator",
      message_id: "manual-" + Date.now(),
      timestamp: Math.floor(Date.now() / 1000),
      type: "text",
      text: newMessage,
      createdAt: serverTimestamp(),
    });

    setNewMessage("");
  };

  if (!user) return <div className="text-center mt-10">🔒 Effettua il login per accedere alla dashboard</div>;

  return (
    <div className="max-w-xl mx-auto mt-8 p-4 bg-white rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-4">💬 Chat WhatsApp</h1>
      <div className="h-[400px] overflow-y-auto space-y-3 mb-4 p-2 border rounded-lg bg-gray-50">
        {[...messages].reverse().map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[80%] px-4 py-2 rounded-xl text-sm shadow-sm ${
              msg.from === "operator" ? "bg-green-100 ml-auto text-right" : "bg-white mr-auto"
            }`}
          >
            <div>{msg.text}</div>
            <div className="text-xs text-gray-400 mt-1">
              {format(new Date(Number(msg.timestamp) * 1000), "dd/MM/yyyy HH:mm")}
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-gray-500">Nessun messaggio ricevuto ancora.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-1 border px-4 py-2 rounded-lg"
          placeholder="Scrivi un messaggio..."
        />
        <button
          onClick={handleSend}
          className="bg-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800"
        >
          Invia
        </button>
      </div>
    </div>
  );
}
