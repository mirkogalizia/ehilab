import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { setDoc, getDoc, doc as fireDoc, deleteDoc } from 'firebase/firestore';

// Utility: normalizza numeri telefono
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

// Converti tutti i valori undefined in null (ricorsivamente)
function undefinedToNull(obj) {
  if (Array.isArray(obj)) return obj.map(undefinedToNull);
  if (obj && typeof obj === 'object')
    return Object.fromEntries(
      Object.entries(obj).map(
        ([k, v]) => [k, v === undefined ? null : undefinedToNull(v)]
      )
    );
  return obj;
}

export async function POST(req, { params }) {
  try {
    const { merchantId, token } = params;
    const topic = req.headers.get('x-shopify-topic') || '';
    const payload = await req.json();

    // 1. Auth
    const merchantRef = fireDoc(db, "shopify_merchants", merchantId);
    const merchantSnap = await getDoc(merchantRef);
    const merchantData = merchantSnap.data();
    if (!merchantSnap.exists() || merchantData.token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    switch (topic) {
      // ORDINE CREATO
      case "orders/create": {
        const customer = payload.customer || {};
        const shipping = payload.shipping_address || {};
        const phoneRaw = customer.phone || shipping.phone || "";
        const phone = normalizePhone(phoneRaw);

        const orderId = payload.id?.toString() || "";
        const orderNumber = payload.order_number?.toString() || "";
        const fulfillment_status = payload.fulfillment_status || "";
        const isNowFulfilled = fulfillment_status === "fulfilled" || fulfillment_status === true;

        const fulfillments = payload.fulfillments || [];
        const fulfillment = fulfillments[0] || {};
        const trackingNumber = fulfillment.tracking_number || "";
        const trackingCompany = fulfillment.tracking_company || "";
        const trackingUrl = fulfillment.tracking_url || "";

        const orderRef = fireDoc(db, "orders", orderId);
        const prevSnap = await getDoc(orderRef);
        const prevOrder = prevSnap.exists() ? prevSnap.data() : {};

        let orderData = {
          orderId,
          orderNumber,
          merchantId,
          customer: {
            firstName: customer.first_name || shipping.name || null,
            lastName: customer.last_name || null,
            email: customer.email || payload.email || null,
            phone: phone || null,
            phone_raw: phoneRaw || null,
            address: shipping.address1 || null,
            city: shipping.city || null,
            zip: shipping.zip || null,
            province: shipping.province || null,
            country: shipping.country || null,
          },
          fulfilled: isNowFulfilled,
          fulfillment_status,
          trackingNumber,
          trackingCompany,
          trackingUrl,
          updatedAt: new Date(),
          raw: { ...payload },
        };

        // Pulizia carrello abbandonato correlato (se esiste)
        const checkoutId = payload.checkout_id?.toString() || payload.checkout_token || null;
        if (checkoutId) {
          const abCheckoutRef = fireDoc(db, "abandoned_checkouts", checkoutId);
          const abCheckoutSnap = await getDoc(abCheckoutRef);
          if (abCheckoutSnap.exists()) {
            await deleteDoc(abCheckoutRef);
            console.log(`[SHOPIFY] Pulizia: carrello abbandonato ${checkoutId} eliminato dopo creazione ordine.`);
          }
        }

        await setDoc(orderRef, undefinedToNull({ ...prevOrder, ...orderData }), { merge: true });
        return NextResponse.json({ success: true, kind: "order", orderId, phone });
      }

      // ORDINE EVASO / FULFILLED
      case "orders/fulfilled":
      case "fulfillments/create": {
        const customer = payload.customer || {};
        const shipping = payload.shipping_address || {};
        const phoneRaw = customer.phone || shipping.phone || "";
        const phone = normalizePhone(phoneRaw);

        const orderId = payload.id?.toString() || "";
        const orderNumber = payload.order_number?.toString() || "";
        const fulfillment_status = payload.fulfillment_status || "";
        const isNowFulfilled = fulfillment_status === "fulfilled" || fulfillment_status === true;

        const fulfillments = payload.fulfillments || [];
        const fulfillment = fulfillments[0] || {};
        const trackingNumber = fulfillment.tracking_number || "";
        const trackingCompany = fulfillment.tracking_company || "";
        const trackingUrl = fulfillment.tracking_url || "";

        const orderRef = fireDoc(db, "orders", orderId);
        const prevSnap = await getDoc(orderRef);
        const prevOrder = prevSnap.exists() ? prevSnap.data() : {};
        const wasFulfilled = prevOrder.fulfilled === true;
        const wasEvasioneInviata = prevOrder.evasione_inviata === true;

        let orderData = {
          orderId,
          orderNumber,
          merchantId,
          customer: {
            firstName: customer.first_name || shipping.name || null,
            lastName: customer.last_name || null,
            email: customer.email || payload.email || null,
            phone: phone || null,
            phone_raw: phoneRaw || null,
            address: shipping.address1 || null,
            city: shipping.city || null,
            zip: shipping.zip || null,
            province: shipping.province || null,
            country: shipping.country || null,
          },
          fulfilled: isNowFulfilled,
          fulfillment_status,
          trackingNumber,
          trackingCompany,
          trackingUrl,
          updatedAt: new Date(),
          raw: { ...payload },
        };

        // Pulizia carrello abbandonato correlato (anche qui come "fallback")
        const checkoutId = payload.checkout_id?.toString() || payload.checkout_token || null;
        if (checkoutId) {
          const abCheckoutRef = fireDoc(db, "abandoned_checkouts", checkoutId);
          const abCheckoutSnap = await getDoc(abCheckoutRef);
          if (abCheckoutSnap.exists()) {
            await deleteDoc(abCheckoutRef);
            console.log(`[SHOPIFY] Pulizia: carrello abbandonato ${checkoutId} eliminato dopo ordine fulfilled.`);
          }
        }

        await setDoc(orderRef, undefinedToNull({ ...prevOrder, ...orderData }), { merge: true });

        if (isNowFulfilled && !wasFulfilled && !wasEvasioneInviata) {
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/automation/order-fulfilled`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, merchantId }),
          });
        }

        return NextResponse.json({ success: true, kind: "order", orderId, phone });
      }

      // CARRELLO ABBANDONATO
      case "checkouts/create":
      case "checkouts/update": {
        const customer = payload.customer || {};
        const shipping = payload.shipping_address || {};
        const billing = payload.billing_address || {};
        const phoneRaw = customer.phone || shipping.phone || billing.phone || "";
        const phone = normalizePhone(phoneRaw);
        const checkoutId = payload.id?.toString() || payload.token || "";
        const checkoutToken = payload.token || "";
        const checkoutUrl = payload.abandoned_checkout_url || null;
        const totalPrice = payload.total_price || "0";
        const subtotalPrice = payload.subtotal_price || "0";
        const currency = payload.currency || "EUR";
        const lineItems = (payload.line_items || []).map(item => ({
          id: item.id, title: item.title, quantity: item.quantity, price: item.price, variant_title: item.variant_title || null,
          product_id: item.product_id, variant_id: item.variant_id,
        }));
        const completedAt = payload.completed_at || null;
        const isCompleted = completedAt ? true : false;
        const checkoutRef = fireDoc(db, "abandoned_checkouts", checkoutId);
        const prevSnap = await getDoc(checkoutRef);
        const prevCheckout = prevSnap.exists() ? prevSnap.data() : {};
        const wasRecoveryMessageSent = prevCheckout.recovery_message_sent === true;

        let checkoutData = {
          checkoutId, checkoutToken, merchantId,
          customer: {
            firstName: customer.first_name || shipping.first_name || billing.first_name || null,
            lastName: customer.last_name || shipping.last_name || billing.last_name || null,
            email: customer.email || payload.email || null,
            phone: phone || null,
            phone_raw: phoneRaw || null,
            address: shipping.address1 || billing.address1 || null,
            city: shipping.city || billing.city || null,
            zip: shipping.zip || billing.zip || null,
            province: shipping.province || billing.province || null,
            country: shipping.country || billing.country || null,
          },
          checkoutUrl, totalPrice, subtotalPrice, currency,
          lineItems, completed: isCompleted, completedAt,
          createdAt: prevCheckout.createdAt || payload.created_at || new Date(),
          updatedAt: new Date(),
          raw: { ...payload },
        };

        const contactDocId = phone;
        if (contactDocId) {
          let existingTags = [];
          const contactSnap = await getDoc(fireDoc(db, "contacts", contactDocId));
          if (contactSnap.exists()) {
            const data = contactSnap.data();
            if (Array.isArray(data.tags)) existingTags = data.tags;
          }
          const newTags = Array.from(new Set([...(existingTags || []), "checkout_abbandonato"]));
          await setDoc(
            fireDoc(db, "contacts", contactDocId),
            undefinedToNull({
              id: contactDocId,
              phone,
              firstName: customer.first_name || shipping.first_name || billing.first_name || null,
              lastName: customer.last_name || shipping.last_name || billing.last_name || null,
              email: customer.email || payload.email || null,
              address: shipping.address1 || billing.address1 || null,
              city: shipping.city || billing.city || null,
              zip: shipping.zip || billing.zip || null,
              province: shipping.province || billing.province || null,
              country: shipping.country || billing.country || null,
              createdBy: merchantId,
              updatedAt: new Date(),
              source: "shopify_checkout",
              tags: newTags
            }),
            { merge: true }
          );
        }
        await setDoc(checkoutRef, undefinedToNull({ ...prevCheckout, ...checkoutData }), { merge: true });
        const isAbandoned = !isCompleted;
        const hasPhone = phone && phone.length > 5;
        const automation = merchantData?.automation?.abandoned_cart || {};
        if (isAbandoned && !wasRecoveryMessageSent && hasPhone && automation.enabled && automation.template_id) {
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/automation/abandoned-cart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              checkoutId, 
              merchantId,
              delayMinutes: automation.delay_minutes || 60
            }),
          });
        }

        return NextResponse.json({ success: true, kind: "checkout", checkoutId, phone });
      }

      // EVENTO NON GESTITO
      default:
        return NextResponse.json({ success: false, error: "Evento non gestito: " + topic }, { status: 200 });
    }
  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}
