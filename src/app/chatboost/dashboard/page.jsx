"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { format } from "date-fns";

export default function DashboardPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/chatboost/login");
      } else {
        fetchMessages();
      }
    });

    return () => unsub();
  }, []);

  const fetchMessages = async () => {
    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);

    const parsed = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    setMessages(parsed);
    setLoading(false);
  };

  if (loading) return <div className="p-8">Caricamento conversazioni...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">📩 Conversazioni recenti</h1>

      {messages.length === 0 && (
        <p>Nessun messaggio ricevuto.</p>
      )}

      <ul className="space-y-4">
        {messages.map(msg => (
          <li key={msg.id} className="border rounded-lg p-4 shadow">
            <div><strong>📞 Da:</strong> {msg.from}</div>
            <div><strong>🧑‍💼 Nome:</strong> {msg.name || "Sconosciuto"}</div>
            <div><strong>💬 Messaggio:</strong> {msg.body}</div>
            <div><strong>🕒 Orario:</strong> {format(new Date(msg.timestamp * 1000), "dd/MM/yyyy HH:mm")}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
