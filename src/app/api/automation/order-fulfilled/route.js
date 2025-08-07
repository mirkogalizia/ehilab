// src/app/api/automation/order-fulfilled/route.js

import { db } from '@/firebase';
import { getDoc, doc, setDoc, addDoc, collection } from 'firebase/firestore';

// Funzione di invio template WhatsApp
async function sendWhatsappTemplateMessage({ phone, template_name, parameters, phone_number_id, access_token }) {
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: template_name,
      language: { code: "it" },
      components: [
        {
          type: "body",
          parameters
        }
      ]
    }
  };

  const res = await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.messages) {
    throw new Error("Errore WhatsApp API: " + JSON.stringify(data.error || data));
  }

  // Restituisci ID messaggio WhatsApp (se vuoi salvarlo in Firestore)
  return data.messages[0]?.id || null;
}

export async function POST(req) {
  try {
    const { orderId, merchantId } = await req.json();
    if (!orderId || !merchantId)
      return new Response(JSON.stringify({ error: 'orderId/merchantId required' }), { status: 400 });

    // 1. Prendi impostazioni automazione dal merchant
    const merchantRef = doc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    const merchantData = merchantSnap.data();
    const automation = merchantData?.automation?.order_fulfilled || {};

    if (!automation.enabled) {
      return new Response(JSON.stringify({ ok: true, message: "Automazione disattivata" }), { status: 200 });
    }

    // Prendi parametri WhatsApp necessari
    const template_name = automation.template_id;
    const phone_number_id = merchantData.phone_number_id;
    const access_token = merchantData.access_token; // assicurati che sia salvato e aggiornato

    if (!template_name || !phone_number_id || !access_token) {
      return new Response(JSON.stringify({ error: 'Dati WhatsApp non configurati' }), { status: 400 });
    }

    // 2. Prendi ordine
    const orderRef = doc(db, "orders", orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
    const order = snap.data();
    if (!order.fulfilled || order.evasione_inviata)
      return new Response(JSON.stringify({ ok: true, message: 'No send needed' }), { status: 200 });

    // 3. Estrai variabili dai dati ordine (ordine dei placeholder!)
    const nome = order.customer?.firstName || '';
    const ordine = order.orderNumber || orderId;
    const fulfillments = order.raw?.fulfillments || [];
    const fulfillment = fulfillments[0] || {};
    const corriere = fulfillment.tracking_company || '';
    const tracking = fulfillment.tracking_number || '';
    const trackingUrl = fulfillment.tracking_url || '';

    // Array parametri ordinati: {{1}}=nome, {{2}}=ordine, {{3}}=corriere, {{4}}=tracking, {{5}}=trackingUrl
    const parameters = [
      { type: "text", text: nome },
      { type: "text", text: ordine },
      { type: "text", text: corriere },
      { type: "text", text: tracking },
      { type: "text", text: trackingUrl }
    ];

    // TESTO finale inviato (così lo vedi come lo riceve il cliente)
    const testoFinale = `Ciao ${nome}, il tuo ordine #${ordine} è stato spedito! 🚚 Corriere: ${corriere} Tracking: ${tracking} Puoi tracciare la spedizione qui: ${trackingUrl} Questo numero WhatsApp viene utilizzato solo per comunicazioni relative al tuo ordine. 👕🛒`;

    // 4. Invia WhatsApp template
    const message_id = await sendWhatsappTemplateMessage({
      phone: order.customer?.phone,
      template_name,
      parameters,
      phone_number_id,
      access_token
    });

    // 5. Salva anche in messages
    await addDoc(collection(db, 'messages'), {
      text: testoFinale,
      to: order.customer?.phone,
      from: "operator",
      timestamp: Date.now(),
      createdAt: new Date(),
      type: "template",
      template_name,
      parameters,
      user_uid: merchantData.user_uid || merchantId,
      message_id: message_id || ("order_fulfilled_" + orderId)
    });

    // 6. Segna come inviato
    await setDoc(orderRef, { evasione_inviata: true }, { merge: true });

    return new Response(JSON.stringify({ ok: true, message: 'WhatsApp inviato e salvato' }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}