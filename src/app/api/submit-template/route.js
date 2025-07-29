import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, user_uid } = await req.json();

  if (!name || !category || !language || !bodyText || !user_uid) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    // Cerca l’utente direttamente tramite UID
    const userRef = doc(db, 'users', user_uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const user = userSnap.data();
    const wabaId = user.waba_id;
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN; // oppure metti hardcoded per test

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
