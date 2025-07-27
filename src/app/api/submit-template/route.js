// src/app/api/submit-template/route.js
import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, email } = await req.json();

  if (!name || !category || !language || !bodyText || !email) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userData = users.find(u => u.email === email);

    if (!userData) {
      return new Response(JSON.stringify({ error: 'Utente non trovato con questa email' }), { status: 404 });
    }

    if (!userData.waba_id) {
      return new Response(JSON.stringify({ error: 'waba_id mancante nel documento utente' }), { status: 400 });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    const res = await fetch(`https://graph.facebook.com/v17.0/${userData.waba_id}/message_templates`, {
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

