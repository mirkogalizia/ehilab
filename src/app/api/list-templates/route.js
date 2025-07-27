// src/app/api/list-templates/route.js
import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  const userSnap = await getDoc(doc(db, 'users', uid));
  const wabaId = userSnap.data().waba_id;
  const token = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.ok ? 200 : res.status });
}
