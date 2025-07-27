// src/app/api/submit-template/route.js
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, email } = await req.json();

  if (!name || !category || !language || !bodyText || !email) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    // Cerca l'utente tramite la mail
    const snapshot = await getDoc(doc(db, 'users', email));
    const userSnap = snapshot.exists() ? snapshot : null;

    if (!userSnap) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const userData = userSnap.data();

    if (!userData.waba_id) {
      return new Response(JSON.stringify({ error: 'waba_id mancante nel documento utente' }), { status: 400 });
    }

    const wabaId = userData.waba_id;

    // 🔥 Token scritto in chiaro per test temporaneo
    const token = 'EAAWboJeZBHdsBPER8VTl2cZC6TgMrCHlVeMrbOsAnY4yR8Spq3wSOp7phJkvlM7LLMV1njPAXgW6G5VxbL4GZCd37ZCHSq6ZBM7vCope47qU4BHnqfR4jcMI80rIy2z0jGIZC472Qvgx02VTEaZABcTVDES3voLVtfAELTwEYWQmLDeL8VepL3cIuUl6Tpr0NLrngZDZD';

    const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.toLowerCase().replace(/\s+/g, '_'),
        category,
        language,
        parameter_format: 'POSITIONAL',
        allow_category_change: false,
        components: [
          {
            type: 'BODY',
            text: bodyText,
          },
        ],
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
