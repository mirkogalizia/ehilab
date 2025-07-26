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
  const body = await req.json();
  console.log("📩 WHATSAPP EVENT:", JSON.stringify(body, null, 2));

  // TODO: salva in Firestore, inoltra, ecc.
  return new Response("EVENT_RECEIVED", { status: 200 });
}
