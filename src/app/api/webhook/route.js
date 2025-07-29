// src/app/api/webhook/route.js

import { db } from "@/firebase";
import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where
} from "firebase/firestore";

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  // ---- 1. VERIFICA WEBHOOK
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === "chatboost_verify_token") {
    console.log("✅ Webhook verificato");
    return new Response(challenge, { status: 200 });
  }

  // ---- 2. ONBOARDING WHATSAPP
  // (Meta chiama questa url con state/email, waba_id, phone_number_id, numeroWhatsapp)
  const email = searchParams.get("state");
  const waba_id = searchParams.get("waba_id");
  const phone_number_id = searchParams.get("phone_number_id");
  const numeroWhatsapp = searchParams.get("numeroWhatsapp");

  if (email && waba_id && phone_number_id && numeroWhatsapp) {
    // Cerca utente tramite email (campo "email" in users)
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return new Response("❌ Utente non trovato", { status: 404 });
    }
    const userDoc = querySnapshot.docs[0];
    await updateDoc(userDoc.ref, {
      waba_id,
      phone_number_id,
      numeroWhatsapp,
      wa_status: "connected"
    });
    // Redirect automatico a InfoPage (UX perfetta)
    return Response.redirect("https://ehi-lab.it/chatboost/impostazioni/info", 302);
    // In alternativa, return new Response("✅ WhatsApp collegato!", { status: 200 });
  }

  // ---- 3. SE NESSUNO DEI DUE: FORBIDDEN
  return new Response("❌ Forbidden", { status: 403 });
}

export async function POST(req) {
  try {
    const body = await req.json();
    // ---- 4. RICEZIONE MESSAGGI WHATSAPP
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phone_number_id = value?.metadata?.phone_number_id;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    if (!phone_number_id || messages.length === 0) {
      return new Response("No messages to process", { status: 200 });
    }

    // Trova l'utente associato al phone_number_id
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("phone_number_id", "==", phone_number_id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn("Nessun utente trovato per questo phone_number_id:", phone_number_id);
      return new Response("Utente non trovato", { status: 200 });
    }

    const userDoc = querySnapshot.docs[0];
    const user_uid = userDoc.id;

    // Loop su tutti i messaggi ricevuti
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const contact = contacts?.[i];
      const wa_id = contact?.wa_id || message.from;
      const profile_name = contact?.profile?.name || "";

      // 1. Salva messaggio
      await addDoc(collection(db, "messages"), {
        user_uid,
        from: wa_id,
        message_id: message.id,
        timestamp: message.timestamp,
        type: message.type,
        text: message.text?.body || "",
        createdAt: serverTimestamp(),
      });

      // 2. Salva nome contatto se presente
      if (profile_name) {
        await setDoc(doc(db, "contacts", wa_id), {
          name: profile_name,
        }, { merge: true });
      }
    }

    return new Response("Messaggi salvati", { status: 200 });
  } catch (error) {
    console.error("❌ Errore nel webhook:", error);
    return new Response("Errore interno", { status: 500 });
  }
}


