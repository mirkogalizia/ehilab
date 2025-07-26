export async function POST(req) {
  console.log("📥 POST ricevuto!");

  try {
    const text = await req.text(); // NON usare .json() per il test
    console.log("📦 Body grezzo ricevuto:", text);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("❌ Errore ricezione POST:", err);
    return new Response("ERROR", { status: 500 });
  }
}

export async function GET(req) {
  return new Response("GET OK", { status: 200 });
}

