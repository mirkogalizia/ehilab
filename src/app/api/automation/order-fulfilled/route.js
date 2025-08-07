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

  console.log("WA API Payload:", payload);

  const res = await fetch(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("WA API Response:", data);
  if (!data.messages) {
    throw new Error("Errore WhatsApp API: " + JSON.stringify(data.error || data));
  }

  return data.messages[0]?.id || null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("🚀 [order-fulfilled] BODY:", body);

    const { orderId, merchantId } = body;
    if (!orderId || !merchantId) {
      console.log("❌ [order-fulfilled] Manca orderId o merchantId");
      return new Response(JSON.stringify({ error: 'orderId/merchantId required' }), { status: 400 });
    }

    // 1. Merchant
    const merchantRef = doc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    const merchantData = merchantSnap.data();
    if (!merchantData) {
      console.log("❌ [order-fulfilled] Merchant non trovato:", merchantId);
      return new Response(JSON.stringify({ error: 'Merchant not found' }), { status: 400 });
    }

    const automation = merchantData?.automation?.order_fulfilled || {};
    if (!automation.enabled) {
      console.log("⏭️ [order-fulfilled] Automazione disattivata per merchant:", merchantId);
      return new Response(JSON.stringify({ ok: true, message: "Automazione disattivata" }), { status: 200 });
    }

    // 2. Credenziali WhatsApp
    const template_name = automation.template_id;
    const phone_number_id = merchantData.phone_number_id;
    const access_token = merchantData.access_token;

    if (!template_name || !phone_number_id || !access_token) {
      console.log("❌ [order-fulfilled] Dati WhatsApp mancanti", { template_name, phone_number_id, access_token });
      return new Response(JSON.stringify({ error: 'Dati WhatsApp non configurati' }), { status: 400 });
    }

    // 3. Order
    const orderRef = doc(db, "orders", orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      console.log("❌ [order-fulfilled] Ordine non trovato:", orderId);
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
    }
    const order = snap.data();
    if (!order.fulfilled) {
      console.log("⏭️ [order-fulfilled] Ordine non ancora fulfilled:", orderId);
      return new Response(JSON.stringify({ ok: true, message: 'Order not fulfilled' }), { status: 200 });
    }
    if (order.evasione_inviata) {
      console.log("⏭️ [order-fulfilled] Già inviato WA per questo ordine:", orderId);
      return new Response(JSON.stringify({ ok: true, message: 'No send needed' }), { status: 200 });
    }

    // 4. Estrazione variabili
    const nome = order.customer?.firstName || '';
    const ordine = order.orderNumber || orderId;
    const fulfillments = order.raw?.fulfillments || [];
    const fulfillment = fulfillments[0] || {};
    const corriere = fulfillment.tracking_company || order.trackingCompany || '';
    const tracking = fulfillment.tracking_number || order.trackingNumber || '';
    const trackingUrl = fulfillment.tracking_url || order.trackingUrl || '';

    // 5. LOG dei dati che si mandano
    console.log("📦 [order-fulfilled] Dati WA", {
      nome,
      ordine,
      corriere,
      tracking,
      trackingUrl,
      phone: order.customer?.phone,
      template_name,
      phone_number_id,
      access_token
    });

    // 6. Parametri e testo
    const parameters = [
      { type: "text", text: nome },
      { type: "text", text: ordine },
      { type: "text", text: corriere },
      { type: "text", text: tracking },
      { type: "text", text: trackingUrl }
    ];
    const testoFinale = `Ciao ${nome}, il tuo ordine #${ordine} è stato spedito! 🚚 Corriere: ${corriere} Tracking: ${tracking} Puoi tracciare la spedizione qui: ${trackingUrl} Questo numero WhatsApp viene utilizzato solo per comunicazioni relative al tuo ordine. 👕🛒`;

    // 7. Invio WhatsApp
    let message_id = null;
    try {
      message_id = await sendWhatsappTemplateMessage({
        phone: order.customer?.phone,
        template_name,
        parameters,
        phone_number_id,
        access_token
      });
      console.log("✅ [order-fulfilled] WhatsApp inviato, message_id:", message_id);
    } catch (waErr) {
      console.error("❌ [order-fulfilled] Errore invio WhatsApp:", waErr);
      return new Response(JSON.stringify({ error: waErr.message }), { status: 500 });
    }

    // 8. Salva messaggio in Firestore
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

    // 9. Segna ordine come evaso-inviato
    await setDoc(orderRef, { evasione_inviata: true }, { merge: true });

    console.log("✅ [order-fulfilled] Ordine aggiornato con evasione_inviata true");

    return new Response(JSON.stringify({ ok: true, message: 'WhatsApp inviato e salvato' }), { status: 200 });

  } catch (err) {
    console.error("❌ [order-fulfilled] Errore generale:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}