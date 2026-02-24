// /src/app/api/send-template/route.js
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  try {
    const { to, template_name, language, components, user_uid } = await req.json();

    if (!to || !template_name || !user_uid) {
      return NextResponse.json({ error: 'Campi mancanti (to, template_name, user_uid)' }, { status: 400 });
    }

    // Recupera phone_number_id dall'utente
    const userRef = doc(db, 'users', user_uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }

    const userData = userSnap.data();
    const phone_number_id = userData.phone_number_id;
    const token = process.env.WA_ACCESS_TOKEN;

    if (!phone_number_id) {
      return NextResponse.json({ error: 'phone_number_id mancante per questo utente' }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ error: 'WA_ACCESS_TOKEN mancante nel server' }, { status: 500 });
    }

    // Pulisci il numero (solo cifre)
    const cleanNumber = to.replace(/[^0-9]/g, '');

    // Costruisci il payload per l'invio del template
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanNumber,
      type: 'template',
      template: {
        name: template_name,
        language: {
          code: language || 'it',
        },
      },
    };

    // Aggiungi components SOLO se ce ne sono con parametri reali
    if (components && Array.isArray(components) && components.length > 0) {
      // Filtra components vuoti (es. body senza parametri)
      const validComponents = components.filter(c => {
        if (!c || !c.type) return false;
        // Se ha parameters, deve averne almeno uno non vuoto
        if (c.parameters && Array.isArray(c.parameters)) {
          return c.parameters.length > 0;
        }
        return true;
      });
      if (validComponents.length > 0) {
        payload.template.components = validComponents;
      }
    }

    console.log('[send-template] Invio a:', cleanNumber, 'template:', template_name);
    console.log('[send-template] Payload:', JSON.stringify(payload, null, 2));

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[send-template] Errore Meta API:', JSON.stringify(data));
      return NextResponse.json(
        { error: data.error || data, detail: 'Errore invio template Meta API' },
        { status: res.status || 500 }
      );
    }

    console.log('[send-template] Successo:', JSON.stringify(data));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[send-template] Errore server:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}