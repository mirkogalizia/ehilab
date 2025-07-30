// /app/api/send-media/route.js
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const phone_number_id = formData.get('phone_number_id');
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN; // o usa WA_ACCESS_TOKEN se NON deve essere public

    if (!file || !phone_number_id || !token) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 });
    }

    // Ricrea FormData per chiamata a Meta
    const metaForm = new FormData();
    metaForm.append('file', file, file.name); // <-- file.name è importante!
    metaForm.append('messaging_product', 'whatsapp');

    const res = await fetch(
      `https://graph.facebook.com/v17.0/${phone_number_id}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: metaForm,
      }
    );

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
