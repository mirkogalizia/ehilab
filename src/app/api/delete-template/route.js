import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function POST(req) {
  const { email, template_name } = await req.json();

  if (!email || !template_name) {
    return new Response(JSON.stringify({ error: 'Campi mancanti' }), { status: 400 });
  }

  try {
    // Trova l'utente tramite email
    const snapshot = await getDocs(collection(db, 'users'));
    const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const matchedUser = allUsers.find(u => u.email === email);

    if (!matchedUser) {
      return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
    }

    const wabaId = matchedUser.waba_id;
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

