// src/app/api/webhook/route.js
import { db } from "@/firebase";
import { collection, addDoc, query, where, getDocs, doc, serverTimestamp } from "firebase/firestore";

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
    console.log("📩 Messaggio ricevuto:", JSON.stringify(body, null, 2));

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phone_number_id = value?.metadata?.phone_number_id;
    const messages = value?.messages || [];

    if (!phone_number_id || messages.length === 0) {
      return new Response("No messages to process", { status: 200 });
    }

    // Cerca utente in base al phone_number_id
    const usersRef = collection(db, "utenti");
    const q = query(usersRef, where("phone_number_id", "==", phone_number_id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn("Nessun utente trovato per questo phone_number_id:", phone_number_id);
      return new Response("Utente non trovato", { status: 200 });
    }

    const userDoc = querySnapshot.docs[0];
    const user_uid = userDoc.id;

    // Salva i messaggi in Firebase associandoli all'utente
    for (const message of messages) {
      await addDoc(collection(db, "messaggi"), {
        user_uid,
        from: message.from,
        message_id: message.id,
        timestamp: message.timestamp,
        type: message.type,
        text: message.text?.body || "",
        createdAt: serverTimestamp()
      });
    }

    return new Response("Messaggio salvato", { status: 200 });
  } catch (error) {
    console.error("Errore nel webhook:", error);
    return new Response("Errore interno", { status: 500 });
  }
}


