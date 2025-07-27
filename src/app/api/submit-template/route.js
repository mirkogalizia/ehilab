import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, email } = await req.json();

  if (!name || !category || !language || !bodyText || !email) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    // Cerca l’utente tramite email
    const snapshot = await getDocs(collection(db, 'users'));
    const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const matchedUser = allUsers.find(u => u.email === email);

    if (!matchedUser) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const wabaId = matchedUser.waba_id;
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN; // o metti hardcoded temporaneamente per test

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
