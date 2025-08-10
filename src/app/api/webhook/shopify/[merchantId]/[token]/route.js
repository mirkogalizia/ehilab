import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { setDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

// --- Utility normalizzazione phone identica a ContactsPage ---
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return '';
  let phone = phoneRaw.trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
  if (phone.startsWith('39') && phone.length >= 11) return '+' + phone;
  if (phone.startsWith('3') && phone.length === 10) return '+39' + phone;
  if (/^\d+$/.test(phone) && phone.length > 10) return '+' + phone;
  if (phone.startsWith('+')) return phone;
  return '';
}

// --- helper giorni tra due ISO date ---
function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return Infinity;
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.round((b - a) / 86400000);
}

// --- WEBHOOK Shopify ---
export async function POST(req, { params }) {
  try {
    // 1. Auth
    const { merchantId, token } = params;
    const payload = await req.json();

    // 2. Verifica merchant/token
    const merchantRef = fireDoc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    if (!merchantSnap.exists() || merchantSnap.data().token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    // 3. Dati cliente & ordine
    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};
    const phoneRaw = customer.phone || shipping.phone || "";
    const phone = normalizePhone(phoneRaw);

    // --- ID ordine ---
    const orderId = payload.id?.toString() || payload.order_id?.toString() || "";
    const orderNumber = payload.order_number?.toString() || "";
    const fulfillment_status = payload.fulfillment_status || "";
    const isNowFulfilled = fulfillment_status === "fulfilled" || fulfillment_status === true;

    // 4. Tracking/corriere (prende primo fulfillment, che è la spedizione principale)
    const fulfillments = payload.fulfillments || [];
    const fulfillment = fulfillments[0] || payload.fulfillment || {};
    const trackingNumber = fulfillment.tracking_number || "";
    const trackingCompany = fulfillment.tracking_company || "";
    const trackingUrl = fulfillment.tracking_url || "";

    // 5. Recupera ordine precedente (se esiste)
    const orderRef = fireDoc(db, "orders", orderId);
    const prevSnap = await getDoc(orderRef);
    const prevOrder = prevSnap.exists() ? prevSnap.data() : {};
    const wasFulfilled = prevOrder.fulfilled === true;
    const wasEvasioneInviata = prevOrder.evasione_inviata === true;

    // ---- NUOVO: determino le date utili se presenti nel payload ---
    // data ordine (preferenza: created_at, poi processed_at)
    const order_created_at =
      prevOrder.order_created_at ||
      payload.created_at ||
      payload.processed_at ||
      null;

    // data fulfilled (dal fulfillment specifico se presente)
    const fulfilled_at =
      prevOrder.fulfilled_at ||
      fulfillment.created_at ||
      fulfillment.updated_at ||
      null;

    // possibile delivered contenuto in questo payload (in alcuni setup arriva su fulfillment_event o su delivered_at custom)
    const fulfillment_event = payload.fulfillment_event || {};
    const payloadDeliveredStatus = (fulfillment_event.status || payload.delivery_status || "").toString().toLowerCase();
    const delivered_at =
      prevOrder.delivered_at ||
      payload.delivered_at ||
      fulfillment_event.happened_at ||
      fulfillment_event.occurred_at ||
      null;

    // 6. Prepara oggetto ordine
    let orderData = {
      orderId,
      orderNumber,
      merchantId,
      customer: {
        firstName: customer.first_name || shipping.name || "",
        lastName: customer.last_name || "",
        email: customer.email || payload.email || "",
        phone,
        phone_raw: phoneRaw,
        address: shipping.address1 || "",
        city: shipping.city || "",
        zip: shipping.zip || "",
        province: shipping.province || "",
        country: shipping.country || "",
      },
      fulfilled: isNowFulfilled,
      fulfillment_status,
      trackingNumber,
      trackingCompany,
      trackingUrl,
      // --- NUOVO: salvo le date se disponibili ---
      ...(order_created_at ? { order_created_at } : {}),
      ...(fulfilled_at ? { fulfilled_at } : {}),
      ...(delivered_at ? { delivered_at } : {}),
      updatedAt: new Date(),
      raw: { ...payload },
    };

    // 6bis. CREA/AGGIORNA CONTATTO in Firestore con tag "shopify" senza duplicati
    const contactDocId = phone;
    if (contactDocId) {
      // Recupera i tag già esistenti per evitare duplicati
      let existingTags = [];
      const contactSnap = await getDoc(fireDoc(db, "contacts", contactDocId));
      if (contactSnap.exists()) {
        const data = contactSnap.data();
        if (Array.isArray(data.tags)) existingTags = data.tags;
      }
      // Merge tag "shopify" senza duplicati
      const newTags = Array.from(new Set([...(existingTags || []), "shopify"]));

      await setDoc(
        fireDoc(db, "contacts", contactDocId),
        {
          id: contactDocId,
          phone,
          firstName: customer.first_name || shipping.name || "",
          lastName: customer.last_name || "",
          email: customer.email || payload.email || "",
          address: shipping.address1 || "",
          city: shipping.city || "",
          zip: shipping.zip || "",
          province: shipping.province || "",
          country: shipping.country || "",
          createdBy: merchantId,
          updatedAt: new Date(),
          source: "shopify",
          tags: newTags,
        },
        { merge: true }
      );
    }

    // 7. Salva/aggiorna ordine in Firestore (merge con eventuali dati precedenti)
    await setDoc(orderRef, { ...prevOrder, ...orderData }, { merge: true });

    // 8. TRIGGER AUTOMAZIONE: fulfilled appena diventato true
    if (isNowFulfilled && !wasFulfilled && !wasEvasioneInviata) {
      // LOG: trigger automazione
      console.log("🚚 TRIGGER ordine fulfilled:", {
        orderId,
        merchantId,
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/automation/order-fulfilled`
      });

      // NON aspettare risposta (fire and forget!)
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/automation/order-fulfilled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, merchantId }),
      }).then(r => {
        // LOG: risposta fetch automazione
        console.log("📩 Risposta automazione:", r.status, r.statusText);
      }).catch(err => {
        // LOG: errore fetch automazione
        console.error("❌ Errore chiamata automazione:", err);
      });
    }

    // ---------------------------------------------
    // 9. ✅ SOLO AGGIUNTA TAG "happy" (non altera altre funzioni)
    //    Condizioni:
    //    - esiste order_created_at
    //    - esiste fulfilled_at
    //    - diff giorni tra order_created_at e fulfilled_at <= 3
    //    - consegna rilevata (delivered_at presente o status delivered nel payload)
    // ---------------------------------------------
    if (contactDocId && orderData.order_created_at && orderData.fulfilled_at) {
      const diff = daysBetween(orderData.order_created_at, orderData.fulfilled_at);

      const deliveredDetected =
        Boolean(orderData.delivered_at) ||
        payloadDeliveredStatus === 'delivered' ||
        (payload.fulfillment_status || '').toLowerCase() === 'delivered';

      if (diff <= 3 && deliveredDetected) {
        // recupera tags esistenti
        let existingTags2 = [];
        const contactSnap2 = await getDoc(fireDoc(db, "contacts", contactDocId));
        if (contactSnap2.exists()) {
          const data2 = contactSnap2.data();
          if (Array.isArray(data2.tags)) existingTags2 = data2.tags;
        }
        const tagsHappy = Array.from(new Set([...(existingTags2 || []), "happy"]));

        await setDoc(
          fireDoc(db, "contacts", contactDocId),
          { tags: tagsHappy, updatedAt: new Date() },
          { merge: true }
        );
      }
    }

    return NextResponse.json({ success: true, orderId, phone });

  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}