"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const [userUid, setUserUid] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedWaId, setSelectedWaId] = useState(null);
  const [messages, setMessages] = useState([]);

  // Recupera user_uid da email
  useEffect(() => {
    if (!user) return;

    const fetchUserUid = async () => {
      const usersRef = collection(db, "users");
      const qUser = query(usersRef, where("email", "==", user.email));
      const snapshot = await getDocs(qUser);

      if (!snapshot.empty) {
        const uid = snapshot.docs[0].id;
        setUserUid(uid);
      }
    };

    fetchUserUid();
  }, [user]);

  // Chat raggruppate per numero
  useEffect(() => {
    if (!userUid) return;

    const q = query(collection(db, "messages"), where("user_uid", "==", userUid));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const convos = new Map();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const wa_id = data.from === "operator" ? data.to : data.from;
        if (!convos.has(wa_id)) convos.set(wa_id, []);
        convos.get(wa_id).push({ id: doc.id, ...data });
      });
      const entries = Array.from(convos.entries());
      entries.sort((a, b) => {
        const aTime = Math.max(...a[1].map((m) => Number(m.timestamp)));
        const bTime = Math.max(...b[1].map((m) => Number(m.timestamp)));
        return bTime - aTime;
      });
      setConversations(entries);
      if (!selectedWaId && entries.length > 0) setSelectedWaId(entries[0][0]);
    });

    return () => unsubscribe();
  }, [userUid]);

  // Messaggi della chat selezionata
  useEffect(() => {
    if (!selectedWaId || !userUid) return;
    const q = query(
      collection(db, "messages"),
      where("user_uid", "==", userUid),
      where("participants", "array-contains", selectedWaId),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = [];
      querySnapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [selectedWaId, userUid]);

  if (!user)
    return <div className="text-center mt-10">🔒 Effettua il login per accedere alla dashboard</div>;

  return (
    <div className="max-w-6xl mx-auto mt-8 p-4">
      <h1 className="text-2xl font-bold mb-6">💬 Chat WhatsApp</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 border rounded-xl p-2 bg-white h-[500px] overflow-y-auto">
          {conversations.map(([waId]) => (
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

        <div className="col-span-2 border rounded-xl bg-white h-[500px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[80%] px-4 py-2 rounded-xl text-sm shadow-sm ${
                  msg.from === "operator"
                    ? "bg-green-100 ml-auto text-right"
                    : "bg-gray-100 mr-auto"
                }`}
              >
                <div>{msg.text}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {format(new Date(Number(msg.timestamp) * 1000), "dd/MM/yyyy HH:mm")}
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="text-gray-500">Nessun messaggio nella chat.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}



