// src/app/api/webhook/route.js
import { db } from "@/firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

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
    const change = body.entry?.[0]?.changes?.[0];
    const value = change?.value;

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!message || !contact) {
      return new Response("No message or contact", { status: 200 });
    }

    const messageData = {
      from: message.from,
      name: contact.profile?.name || null,
      phone_number_id: phoneNumberId,
      body: message.text?.body || null,
      timestamp: Number(message.timestamp),
      type: message.type,
      message_id: message.id,
      user_uid: null, // da collegare successivamente
      createdAt: Timestamp.now(),
    };

    await addDoc(collection(db, "messages"), messageData);
    console.log("✅ Messaggio salvato:", messageData);

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err) {
    console.error("❌ Errore salvataggio webhook:", err);
    return new Response("Errore server", { status: 500 });
  }
}

