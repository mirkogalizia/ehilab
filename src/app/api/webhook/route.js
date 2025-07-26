// src/app/api/webhook/route.js

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
    const data = await req.json();
    console.log("📩 Messaggio ricevuto:", JSON.stringify(data, null, 2));

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err) {
    console.error("❌ Errore nel body del webhook:", err);
    return new Response("Errore parsing", { status: 400 });
  }
}
