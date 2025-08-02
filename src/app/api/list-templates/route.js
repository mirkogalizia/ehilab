import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  try {
    const { user_uid } = await req.json();
    if (!user_uid) {
      return new Response(JSON.stringify({ error: 'user_uid mancante' }), { status: 400 });
    }

    const userRef = doc(db, 'users', user_uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const user = userSnap.data();
    const wabaId = user.waba_id;
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN;

    if (!wabaId) {
      return new Response(JSON.stringify({ error: 'waba_id mancante' }), { status: 400 });
    }

    const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), { status: res.status });
    }

    // Ritorna SEMPRE un array (vuoto o pieno)
    if (Array.isArray(data.data)) {
      return new Response(JSON.stringify(data.data), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
