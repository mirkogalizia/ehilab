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

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req) {
  const data = await req.json();
  const message = data?.value?.messages?.[0];
  const contact = data?.value?.contacts?.[0];
  const phoneNumberId = data?.value?.metadata?.phone_number_id;

  if (message && contact) {
    const messageData = {
      from: message.from,
      name: contact.profile?.name || null,
      phone_number_id: phoneNumberId,
      body: message.text?.body || null,
      timestamp: Number(message.timestamp),
      type: message.type,
      message_id: message.id,
      user_uid: null, // lo collegheremo dopo via query
      createdAt: Timestamp.now()
    };

    try {
      await addDoc(collection(db, "messages"), messageData);
      console.log("✅ Messaggio salvato:", messageData);
    } catch (err) {
      console.error("❌ Errore salvataggio Firestore:", err);
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
