import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../firebase"; // usa il path relativo corretto

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
  try {
    const data = await req.json();
    console.log("📦 Payload ricevuto:", JSON.stringify(data, null, 2));

    const message = data?.value?.messages?.[0];
    const contact = data?.value?.contacts?.[0];
    const phoneNumberId = data?.value?.metadata?.phone_number_id;

    if (!message || !contact || !phoneNumberId) {
      console.warn("❗ Payload incompleto:", { message, contact, phoneNumberId });
      return new Response("IGNORED", { status: 200 });
    }

    const messageData = {
      from: message.from,
      name: contact.profile?.name || null,
      phone_number_id: phoneNumberId,
      body: message.text?.body || null,
      timestamp: Number(message.timestamp),
      type: message.type,
      message_id: message.id,
      user_uid: null,
      createdAt: Timestamp.now()
    };

    console.log("📝 Salvo in Firestore:", messageData);
    await addDoc(collection(db, "messages"), messageData);
    console.log("✅ Messaggio salvato");

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err) {
    console.error("❌ Errore durante il salvataggio:", err);
    return new Response("ERROR", { status: 500 });
  }
}
