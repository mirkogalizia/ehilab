// src/app/api/submit-template/route.js
import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, uid } = await req.json();

  if (!name || !category || !language || !bodyText) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const userData = userSnap.data();
    const wabaId = userData.waba_id;
    const token = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;

    const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category,
        language,
        parameter_format: 'HANDLEBARS',
        allow_category_change: false,
        components: [
          { type: 'BODY', text: bodyText }
        ]
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), { status: res.status });
    }
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}


