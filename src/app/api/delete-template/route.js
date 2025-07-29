import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  const { user_uid, template_name } = await req.json();

  if (!user_uid || !template_name) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    // Prendi l'utente tramite UID
    const userRef = doc(db, 'users', user_uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const user = userSnap.data();
    const wabaId = user.waba_id;
    const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN;

    // DELETE via nome template
    const url = `https://graph.facebook.com/v17.0/${wabaId}/message_templates?name=${encodeURIComponent(template_name)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Errore eliminazione Meta:', data);
      return new Response(JSON.stringify({ error: data }), { status: res.status });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('❌ Errore interno:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}


