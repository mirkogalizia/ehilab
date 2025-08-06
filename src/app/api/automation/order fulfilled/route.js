import { db } from '@/firebase';
import { getDoc, doc, setDoc } from 'firebase/firestore';

// Funzione di invio template WhatsApp
async function sendWhatsappTemplateMessage({
  phone,
  template_name,
  parameters,
  phone_number_id,
  access_token
}) {
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
}

export default async function handler(req, res) {
  try {
    const { orderId, merchantId } = req.body;
    if (!orderId || !merchantId)
      return res.status(400).json({ error: 'orderId/merchantId required' });

    // 1. Prendi impostazioni automazione dal merchant
    const merchantRef = doc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    const merchantData = merchantSnap.data();
    const automation = merchantData?.automation?.order_fulfilled || {};

    if (!automation.enabled) {
      return res.status(200).json({ ok: true, message: "Automazione disattivata" });
    }

    // Parametri WhatsApp necessari
    const template_name = automation.template_id;
    const phone_number_id = merchantData.phone_number_id;
    const access_token = merchantData.access_token;

    if (!template_name || !phone_number_id || !access_token) {
      return res.status(400).json({ error: 'Dati WhatsApp non configurati' });
    }

    // 2. Prendi ordine
    const orderRef = doc(db, "orders", orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return res.status(404).json({ error: 'Order not found' });
    const order = snap.data();
    if (!order.fulfilled || order.evasione_inviata)
      return res.status(200).json({ ok: true, message: 'No send needed' });

    // 3. Estrai variabili dai dati ordine (ordine dei placeholder!)
    const nome = order.customer?.firstName || '';
    const ordine = order.orderNumber || orderId;
    const fulfillments = order.raw?.fulfillments || [];
    const fulfillment = fulfillments[0] || {};
    const corriere = fulfillment.tracking_company || '';
    const tracking = fulfillment.tracking_number || '';
    const trackingUrl = fulfillment.tracking_url || '';

    // Array parametri ordinati
    const parameters = [
      { type: "text", text: nome },
      { type: "text", text: ordine },
      { type: "text", text: corriere },
      { type: "text", text: tracking },
      { type: "text", text: trackingUrl }
    ];

    // 4. Invia WhatsApp template
    await sendWhatsappTemplateMessage({
      phone: order.customer?.phone,
      template_name,
      parameters,
      phone_number_id,
      access_token
    });

    // 5. Segna come inviato
    await setDoc(orderRef, { evasione_inviata: true }, { merge: true });

    res.status(200).json({ ok: true, message: 'WhatsApp inviato' });

  } catch (err) {
    console.error("Order fulfilled automation error:", err);
    res.status(500).json({ error: err.message });
  }
}