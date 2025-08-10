// /src/app/api/send-text/route.js
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { to, text, phone_number_id } = await req.json();
    if (!to || !text || !phone_number_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const token = process.env.WA_ACCESS_TOKEN; // ⚠️ NON usare NEXT_PUBLIC_*
    if (!token) return NextResponse.json({ error: 'Missing WA token' }, { status: 500 });

    const res = await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error || 'Graph error' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}