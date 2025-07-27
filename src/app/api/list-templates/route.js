import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email mancante' }), { status: 400 });
  }

  const snapshot = await getDoc(doc(db, 'users', email));
  if (!snapshot.exists()) {
    return new Response(JSON.stringify({ error: 'Utente non trovato' }), { status: 404 });
  }

  const userData = snapshot.data();
  const wabaId = userData.waba_id;
  const token = 'EAAWboJeZBHdsBPER8VTl2cZC6TgMrCHlVeMrbOsAnY4yR8Spq3wSOp7phJkvlM7LLMV1njPAXgW6G5VxbL4GZCd37ZCHSq6ZBM7vCope47qU4BHnqfR4jcMI80rIy2z0jGIZC472Qvgx02VTEaZABcTVDES3voLVtfAELTwEYWQmLDeL8VepL3cIuUl6Tpr0NLrngZDZD'; // in chiaro solo per test

  const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.ok ? 200 : res.status });
}

