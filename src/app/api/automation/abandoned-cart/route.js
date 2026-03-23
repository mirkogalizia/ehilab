import { db } from '@/lib/firebase';
import { getDoc, doc, setDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';

// Invio del template WhatsApp
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
  return data.messages[0]?.id || null;
}

// POST: riceve trigger dal webhook, invia subito o controlla scheduling
export async function POST(req) {
  try {
    const { checkoutId, merchantId, sendAt } = await req.json();

    if (!checkoutId || !merchantId) {
      return new Response(JSON.stringify({ error: 'checkoutId/merchantId required' }), { status: 400 });
    }

    // Se c'è un sendAt futuro, non inviare ora — il cron/polling lo gestirà
    if (sendAt) {
      const sendAtDate = new Date(sendAt);
      if (sendAtDate > new Date()) {
        console.log(`[abandoned-cart] Messaggio schedulato per ${sendAt}, non invio ora`);
        return new Response(JSON.stringify({
          ok: true,
          message: `Schedulato per ${sendAt}`,
          checkoutId
        }), { status: 200 });
      }
    }

    return await processAbandonedCart(checkoutId, merchantId);

  } catch (err) {
    console.error('[abandoned-cart] Errore generale:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// GET: endpoint per cron/polling — cerca tutti i checkout schedulati pronti per l'invio
export async function GET(req) {
  try {
    const now = new Date().toISOString();
    console.log(`[abandoned-cart-cron] Checking scheduled sends at ${now}`);

    // Trova tutti i checkout con scheduled_send_at <= now e non ancora inviati
    const q = query(
      collection(db, 'abandoned_checkouts'),
      where('recovery_message_sent', '!=', true)
    );
    const snap = await getDocs(q);

    let processed = 0;
    let skipped = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const scheduledAt = data.scheduled_send_at;

      if (!scheduledAt) { skipped++; continue; }
      if (new Date(scheduledAt) > new Date()) { skipped++; continue; } // Non ancora tempo
      if (data.completed === true) { skipped++; continue; }

      const merchantId = data.merchantId;
      if (!merchantId) { skipped++; continue; }

      console.log(`[abandoned-cart-cron] Processing checkout ${d.id}`);
      try {
        await processAbandonedCart(d.id, merchantId);
        processed++;
      } catch (err) {
        console.error(`[abandoned-cart-cron] Errore checkout ${d.id}:`, err.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      checked: snap.docs.length,
      processed,
      skipped
    }), { status: 200 });

  } catch (err) {
    console.error('[abandoned-cart-cron] Errore:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// Logica core di invio messaggio abandoned cart
async function processAbandonedCart(checkoutId, merchantId) {
  // 1. Merchant + automazione
  const merchantRef = doc(db, "shopify_merchants", merchantId);
  const merchantSnap = await getDoc(merchantRef);
  if (!merchantSnap.exists()) {
    return new Response(JSON.stringify({ error: 'Merchant non trovato' }), { status: 404 });
  }

  const merchantData = merchantSnap.data();
  const automation = merchantData?.automation?.abandoned_cart || {};
  const isEnabled = automation.enabled === true;
  const template_name = automation.template_id;
  const user_uid = merchantData?.user_uid || merchantId;

  if (!isEnabled) {
    console.log('[abandoned-cart] Automazione disabilitata, skip');
    return new Response(JSON.stringify({ ok: true, message: "Automazione disattivata" }), { status: 200 });
  }

  // 2. WhatsApp credentials
  const userRef = doc(db, "users", user_uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const phone_number_id = userData.phone_number_id;
  const access_token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!template_name || !phone_number_id || !access_token) {
    console.error('[abandoned-cart] Dati WhatsApp incompleti');
    return new Response(JSON.stringify({ error: 'Dati WhatsApp incompleti' }), { status: 400 });
  }

  // 3. Checkout data
  const checkoutRef = doc(db, "abandoned_checkouts", checkoutId);
  const snap = await getDoc(checkoutRef);
  if (!snap.exists()) {
    return new Response(JSON.stringify({ error: 'Checkout non trovato' }), { status: 404 });
  }

  const checkout = snap.data();

  if (checkout.completed === true) {
    console.log('[abandoned-cart] Checkout completato, skip');
    return new Response(JSON.stringify({ ok: true, message: 'Checkout completato' }), { status: 200 });
  }
  if (checkout.recovery_message_sent === true) {
    console.log('[abandoned-cart] Messaggio già inviato, skip');
    return new Response(JSON.stringify({ ok: true, message: 'Già inviato' }), { status: 200 });
  }

  // 4. Build template params
  const nome = checkout.customer?.firstName || 'Cliente';
  const totale = checkout.totalPrice || '0';
  const valuta = checkout.currency || 'EUR';
  const checkoutUrl = checkout.checkoutUrl || '';
  const lineItems = checkout.lineItems || [];
  const prodottiText = lineItems.slice(0, 3).map(item =>
    `${item.quantity}x ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''}`
  ).join(', ');

  const parameters = [
    { type: "text", text: nome },
    { type: "text", text: prodottiText },
    { type: "text", text: totale },
    { type: "text", text: valuta },
    { type: "text", text: checkoutUrl }
  ];

  const testoFinale = `Ciao ${nome}! Hai dimenticato qualcosa nel carrello: ${prodottiText}${lineItems.length > 3 ? ` e altri ${lineItems.length - 3} prodotti` : ''}. Totale: ${totale} ${valuta}. Completa il tuo acquisto qui: ${checkoutUrl}`;

  // 5. Send
  const message_id = await sendWhatsappTemplateMessage({
    phone: checkout.customer?.phone,
    template_name, parameters, phone_number_id, access_token
  });

  // 6. Save message
  await addDoc(collection(db, 'messages'), {
    text: testoFinale, to: checkout.customer?.phone,
    from: "operator", timestamp: Date.now(), createdAt: new Date(),
    type: "template", template_name, user_uid,
    message_id: message_id || ("abandoned_cart_" + checkoutId),
    checkout_id: checkoutId, merchant_id: merchantId,
  });

  // 7. Mark as sent
  await setDoc(checkoutRef, {
    recovery_message_sent: true,
    recovery_message_sent_at: new Date(),
    scheduled_send_at: null, // cleanup
  }, { merge: true });

  console.log(`[abandoned-cart] Messaggio inviato per checkout ${checkoutId}`);

  return new Response(JSON.stringify({
    ok: true, message: 'Messaggio inviato', checkoutId, message_id
  }), { status: 200 });
}
