import { db } from '@/firebase';
import { getDoc, doc, setDoc, addDoc, collection } from 'firebase/firestore';

// Invio del template WhatsApp (identico a order-fulfilled)
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

export async function POST(req) {
  try {
    const { checkoutId, merchantId, delayMinutes = 60 } = await req.json();
    
    if (!checkoutId || !merchantId) {
      return new Response(JSON.stringify({ error: 'checkoutId/merchantId required' }), { status: 400 });
    }

    console.log(`[abandoned-cart] Inizio elaborazione per checkoutId: ${checkoutId}`);

    // DELAY: Aspetta X minuti prima di inviare
    if (delayMinutes > 0) {
      console.log(`[abandoned-cart] Aspetto ${delayMinutes} minuti prima di inviare...`);
      await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));
    }

    // 1. Prendi merchant e automazione CARRELLO ABBANDONATO
    const merchantRef = doc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    
    if (!merchantSnap.exists()) {
      console.error('[abandoned-cart] Merchant non trovato:', merchantId);
      return new Response(JSON.stringify({ error: 'Merchant non trovato' }), { status: 404 });
    }
    
    const merchantData = merchantSnap.data();
    
    // ✅ VERIFICA AUTOMAZIONE ATTIVA (controllo doppio dopo delay)
    const automation = merchantData?.automation?.abandoned_cart || {};
    const isEnabled = automation.enabled === true;
    const template_name = automation.template_id;
    const user_uid = merchantData?.user_uid || merchantId;

    if (!isEnabled) {
      console.log('[abandoned-cart] Automazione disabilitata dopo il delay, skip');
      return new Response(JSON.stringify({ ok: true, message: "Automazione carrello disattivata" }), { status: 200 });
    }

    // 2. Prendi dati WhatsApp dal documento user OWNER
    const userRef = doc(db, "users", user_uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const phone_number_id = userData.phone_number_id;
    const access_token = process.env.WHATSAPP_ACCESS_TOKEN;

    console.log('[abandoned-cart] Dati WhatsApp:', {
      template_name,
      phone_number_id,
      access_token: access_token ? 'PRESENTE' : 'MANCANTE',
      user_uid,
      whatsappNumber: userData.whatsappNumber,
      automation_enabled: isEnabled
    });

    if (!template_name || !phone_number_id || !access_token) {
      console.error('[abandoned-cart] Dati WhatsApp incompleti');
      return new Response(JSON.stringify({
        error: 'Dati WhatsApp non configurati per carrello abbandonato',
        template_name,
        phone_number_id,
        access_token: access_token ? 'PRESENTE' : 'MANCANTE'
      }), { status: 400 });
    }

    // 3. Prendi CHECKOUT abbandonato
    const checkoutRef = doc(db, "abandoned_checkouts", checkoutId);
    const snap = await getDoc(checkoutRef);
    
    if (!snap.exists()) {
      console.error('[abandoned-cart] Checkout non trovato:', checkoutId);
      return new Response(JSON.stringify({ error: 'Checkout not found' }), { status: 404 });
    }
    
    const checkout = snap.data();

    // Verifica se già completato o messaggio già inviato
    if (checkout.completed === true) {
      console.log('[abandoned-cart] Checkout completato nel frattempo, skip');
      return new Response(JSON.stringify({ ok: true, message: 'Checkout completato' }), { status: 200 });
    }

    if (checkout.recovery_message_sent === true) {
      console.log('[abandoned-cart] Messaggio già inviato, skip');
      return new Response(JSON.stringify({ ok: true, message: 'Messaggio già inviato' }), { status: 200 });
    }

    // 4. Estrai variabili per il template CARRELLO ABBANDONATO
    const nome = checkout.customer?.firstName || 'Cliente';
    const totale = checkout.totalPrice || '0';
    const valuta = checkout.currency || 'EUR';
    const checkoutUrl = checkout.checkoutUrl || '';
    
    // Componi elenco prodotti (primi 3 per brevità)
    const lineItems = checkout.lineItems || [];
    const prodottiArray = lineItems.slice(0, 3).map(item => 
      `${item.quantity}x ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''}`
    );
    const prodottiText = prodottiArray.join(', ');
    const numeroProdotti = lineItems.length;

    // Parametri template WhatsApp
    // ⚠️ Adatta in base al tuo template approvato su Meta
    const parameters = [
      { type: "text", text: nome },              // {{1}} Nome cliente
      { type: "text", text: prodottiText },      // {{2}} Prodotti
      { type: "text", text: totale },            // {{3}} Totale
      { type: "text", text: valuta },            // {{4}} Valuta
      { type: "text", text: checkoutUrl }        // {{5}} Link checkout
    ];

    const testoFinale = `Ciao ${nome}! 👋 Hai dimenticato qualcosa nel carrello: ${prodottiText}${numeroProdotti > 3 ? ` e altri ${numeroProdotti - 3} prodotti` : ''}. Totale: ${totale} ${valuta}. Completa il tuo acquisto qui: ${checkoutUrl}`;

    // 5. Invia WhatsApp template
    let message_id = null;
    try {
      message_id = await sendWhatsappTemplateMessage({
        phone: checkout.customer?.phone,
        template_name,
        parameters,
        phone_number_id,
        access_token
      });
      console.log('[abandoned-cart] WhatsApp inviato con successo, message_id:', message_id);
    } catch (err) {
      console.error('[abandoned-cart] Errore invio WhatsApp:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }

    // 6. Salva anche in messages
    await addDoc(collection(db, 'messages'), {
      text: testoFinale,
      to: checkout.customer?.phone,
      from: "operator",
      timestamp: Date.now(),
      createdAt: new Date(),
      type: "template",
      template_name,
      parameters,
      user_uid,
      message_id: message_id || ("abandoned_cart_" + checkoutId),
      checkout_id: checkoutId,
      merchant_id: merchantId,
    });

    // 7. Segna come inviato nel checkout
    await setDoc(checkoutRef, { 
      recovery_message_sent: true,
      recovery_message_sent_at: new Date()
    }, { merge: true });

    console.log('[abandoned-cart] ✅ Messaggio WhatsApp inviato correttamente', {
      checkoutId, 
      message_id, 
      phone: checkout.customer?.phone
    });

    return new Response(JSON.stringify({ 
      ok: true, 
      message: 'WhatsApp carrello abbandonato inviato',
      checkoutId,
      message_id
    }), { status: 200 });

  } catch (err) {
    console.error('[abandoned-cart] ❌ Errore generale:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
