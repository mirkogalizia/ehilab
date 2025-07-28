// src/app/api/webhook/route.js

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === "chatboost_verify_token") {
    console.log("✅ Webhook verificato");
    return new Response(challenge, { status: 200 });
  }

  return new Response("❌ Forbidden", { status: 403 });
}

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("📩 Webhook payload:", JSON.stringify(body, null, 2));

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    if (!value) return new Response("Nessun valore", { status: 200 });

    const phone_number_id = value?.metadata?.phone_number_id;

    // 🔹 Gestione messaggi in entrata
    if (value.messages) {
      const messages = value.messages;
      const contacts = value.contacts || [];

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("phone_number_id", "==", phone_number_id));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const user_uid = userDoc.id;

        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          const contact = contacts?.[i];
          const wa_id = contact?.wa_id || message.from;
          const profile_name = contact?.profile?.name || "";

          await addDoc(collection(db, "messages"), {
            user_uid,
            from: wa_id,
            message_id: message.id,
            timestamp: message.timestamp,
            type: message.type,
            text: message.text?.body || "",
            createdAt: serverTimestamp(),
            status: "delivered", // ricevuto → delivered
          });

          if (profile_name) {
            await setDoc(
              doc(db, "contacts", wa_id),
              { name: profile_name },
              { merge: true }
            );
          }
        }
      }
    }

    // 🔹 Gestione aggiornamenti di stato
    if (value.statuses) {
      for (const status of value.statuses) {
        const messageId = status.id;
        const newStatus = status.status; // "sent" | "delivered" | "read"

        const msgsRef = collection(db, "messages");
        const snapshot = await getDocs(msgsRef);

        snapshot.forEach(async (docSnap) => {
          const data = docSnap.data();
          if (data.message_id === messageId) {
            const msgRef = doc(db, "messages", docSnap.id);
            await updateDoc(msgRef, {
              status: newStatus,
              updatedAt: serverTimestamp(),
            });
            console.log(`✅ Stato aggiornato per ${messageId}: ${newStatus}`);
          }
        });
      }
    }

    return new Response("Webhook elaborato", { status: 200 });
  } catch (error) {
    console.error("❌ Errore webhook:", error);
    return new Response("Errore interno", { status: 500 });
  }
}
