import { db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('uid'); // passiamo l'email come id

  const snapshot = await getDocs(collection(db, 'users'));
  const allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const user = allUsers.find((u) => u.email === email);

  if (!user || !user.waba_id) {
    return new Response(JSON.stringify({ error: 'Utente non trovato o waba_id mancante' }), { status: 404 });
  }

  const token = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v17.0/${user.waba_id}/message_templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.ok ? 200 : res.status });
}
