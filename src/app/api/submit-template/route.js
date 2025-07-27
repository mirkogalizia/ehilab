import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  const { name, category, language, bodyText, uid } = await req.json();

  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const userData = userSnap.data();

    const accessToken = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;
    const wabaId = userData.whatsapp_business_account_id;

    const res = await fetch(`https://graph.facebook.com/v17.0/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category,
        language,
        components: [
          {
            type: 'BODY',
            text: bodyText,
          },
        ],
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (err) {
    console.error('❌ Errore invio template:', err);
    return new Response(JSON.stringify({ error: 'Errore invio template' }), { status: 500 });
  }
}

