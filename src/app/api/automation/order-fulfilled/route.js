// src/app/api/automation/order-fulfilled/route.js

import { db } from '@/firebase';
import { getDoc, doc, setDoc, addDoc, collection } from 'firebase/firestore';

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

  // LOG: payload per debug
  console.log("[order-fulfilled] Invio WhatsApp API:", {
    endpoint: `https://graph.facebook.com/v17.0/${phone_number_id}/messages`,
    payload
  });

  const res = await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  // LOG: risposta API WhatsApp
  console.log("[order-fulfilled] Risposta WhatsApp API:", data);

  if (!data.messages) {
    throw new Error("Errore WhatsApp API: " + JSON.stringify(data.error || data));
  }
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
    if (!merchantSnap.exists()) {
      console.error("[order-fulfilled] Merchant non trovato:", merchantId);
      return new Response(JSON.stringify({ error: 'Merchant not found' }), { status: 404 });
    }
    const merchantData = merchantSnap.data();
    const automation = merchantData?.automation?.order_fulfilled || {};

    if (!automation.enabled) {
      console.log("[order-fulfilled] Automazione disattivata per merchant", merchantId);
      return new Response(JSON.stringify({ ok: true, message: "Automazione disattivata" }), { status: 200 });
    }

    // 2. Prendi ordine
    const orderRef = doc(db, "orders", orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      console.error("[order-fulfilled] Ordine non trovato:", orderId);
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
    }
    const order = snap.data();
    if (!order.fulfilled || order.evasione_inviata)
      return new Response(JSON.stringify({ ok: true, message: 'No send needed' }), { status: 200 });

    // 3. Estrai parametri WhatsApp
    const template_name = automation.template_id;
    const phone_number_id = merchantData.phone_number_id;
    const access_token = process.env.WHATSAPP_ACCESS_TOKEN; // SEMPRE da variabili ambiente

    console.log("[order-fulfilled] Parametri WhatsApp:", {
      template_name,
      phone_number_id,
      access_token: !!access_token,
      user_uid: merchantData.user_uid || merchantId,
    });

    if (!template_name || !phone_number_id || !access_token) {
      console.error("[order-fulfilled] Dati WhatsApp mancanti", {
        template_name,
        phone_number_id,
        access_token: access_token ? "PRESENTE" : "MANCANTE",
        user_uid: merchantData.user_uid || merchantId,
      });
      return new Response(JSON.stringify({ error: 'Dati WhatsApp non configurati' }), { status: 400 });
    }

    // 4. Prepara parametri template
    const nome = order.customer?.firstName || '';
    const ordine = order.orderNumber || orderId;
    const fulfillments = order.raw?.fulfillments || [];
    const fulfillment = fulfillments[0] || {};
    const corriere = fulfillment.tracking_company || order.trackingCompany || '';
    const tracking = fulfillment.tracking_number || order.trackingNumber || '';
    const trackingUrl = fulfillment.tracking_url || order.trackingUrl || '';

    // Array parametri ordinati: {{1}}=nome, {{2}}=ordine, {{3}}=corriere, {{4}}=tracking, {{5}}=trackingUrl
    const parameters = [
      { type: "text", text: nome },
      { type: "text", text: ordine },
      { type: "text", text: corriere },
      { type: "text", text: tracking },
      { type: "text", text: trackingUrl }
    ];

    // TESTO finale inviato (utile per vederlo in chat)
    const testoFinale = `Ciao ${nome}, il tuo ordine #${ordine} è stato spedito! 🚚 Corriere: ${corriere} Tracking: ${tracking} Puoi tracciare la spedizione qui: ${trackingUrl} Questo numero WhatsApp viene utilizzato solo per comunicazioni relative al tuo ordine. 👕🛒`;

    // 5. INVIA WHATSAPP
    let message_id = null;
    try {
      message_id = await sendWhatsappTemplateMessage({
        phone: order.customer?.phone,
        template_name,
        parameters,
        phone_number_id,
        access_token
      });
    } catch (err) {
      console.error("[order-fulfilled] Errore invio WhatsApp:", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }

    // 6. Salva in "messages" su Firestore
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

    // 7. Segna come inviato
    await setDoc(orderRef, { evasione_inviata: true }, { merge: true });

    console.log("[order-fulfilled] WhatsApp inviato e salvato per ordine:", orderId);

    return new Response(JSON.stringify({ ok: true, message: 'WhatsApp inviato e salvato' }), { status: 200 });

  } catch (err) {
    console.error("[order-fulfilled] Errore generale:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}