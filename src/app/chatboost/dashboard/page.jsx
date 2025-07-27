"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedWaId, setSelectedWaId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // CARICA CONVERSAZIONI — numeri da from/to
  useEffect(() => {
    const q = query(collection(db, "messages"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const numbersSet = new Set();
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (d.from && d.from !== "operator") numbersSet.add(d.from);
        if (d.to && d.to !== "operator") numbersSet.add(d.to);
      });

      const numbers = Array.from(numbersSet);
      setConversations(numbers);
      if (!selectedWaId && numbers.length > 0) setSelectedWaId(numbers[0]);
    });

    return () => unsubscribe();
  }, [selectedWaId]);

  // CARICA MESSAGGI di quella conversazione
  useEffect(() => {
    if (!selectedWaId) return;

    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((msg) =>
          msg.from === selectedWaId || msg.to === selectedWaId
        );

      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [selectedWaId]);

  // INVIA messaggio WhatsApp + salva su Firestore
  const handleSend = async () => {
    if (!newMessage.trim() || !user || !selectedWaId) return;

    const phoneNumberId = user.phone_number_id;
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN;

    try {
      const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: selectedWaId,
          type: "text",
          text: { body: newMessage },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Errore API WhatsApp:", result);
        alert("Errore nell'invio del messaggio via WhatsApp API");
        return;
      }

      await addDoc(collection(db, "messages"), {
        from: "operator",
        to: selectedWaId,
        message_id: result.messages?.[0]?.id || "manual-" + Date.now(),
        timestamp: Math.floor(Date.now() / 1000),
        type: "text",
        text: newMessage,
        createdAt: serverTimestamp(),
      });

      setNewMessage("");
    } catch (error) {
      console.error("Errore invio:", error);
      alert("Errore imprevisto nell'invio del messaggio");
    }
  };

  if (!user)
    return <div className="text-center mt-10">🔒 Effettua il login per accedere alla dashboard</div>;

  return (
    <div className="max-w-6xl mx-auto mt-8 p-4">
      <h1 className="text-2xl font-bold mb-6">💬 Chat WhatsApp</h1>
      <div className="grid grid-cols-3 gap-4">
        {/* Lista numeri */}
        <div className="col-span-1 border rounded-xl p-2 bg-white h-[500px] overflow-y-auto">
          {conversations.map((waId) => (
            <div
              key={waId}
              className={`cursor-pointer p-3 rounded-lg hover:bg-gray-100 ${
                selectedWaId === waId ? "bg-gray-200" : ""
              }`}
              onClick={() => setSelectedWaId(waId)}
            >
              <div className="font-semibold">{waId}</div>
            </div>
          ))}
        </div>

        {/* Chat */}
        <div className="col-span-2 border rounded-xl bg-white h-[500px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[80%] px-4 py-2 rounded-xl text-sm shadow-sm ${
                  msg.from === "operator" ? "bg-green-100 ml-auto text-right" : "bg-gray-100 mr-auto"
                }`}
              >
                <div className="text-xs text-gray-500 mb-1">
                  {msg.from === "operator" ? "👨‍💼 Operatore" : "👤 Cliente"}
                </div>
                <div>{msg.text}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {format(new Date(Number(msg.timestamp) * 1000), "dd/MM/yyyy HH:mm")}
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="text-gray-500">Nessun messaggio nella chat.</p>}
          </div>
          <div className="p-3 border-t flex gap-2">
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
      </div>
    </div>
  );
}



