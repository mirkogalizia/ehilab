import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { setDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

// Funzione per normalizzare il numero di telefono (solo ITA)
function normalizePhone(phone) {
  if (!phone) return "";
  let norm = phone.replace(/[\s\-\.\(\)]/g, "");
  if (norm.startsWith("0039")) norm = "+39" + norm.slice(4);
  if (norm.startsWith("39") && norm.length === 11) norm = "+39" + norm.slice(2);
  if (!norm.startsWith("+") && norm.length === 10) norm = "+39" + norm;
  // Rendi valido solo formato +39 e almeno 11 cifre
  if (!/^\+39\d{9,10}$/.test(norm)) return "";
  return norm;
}

export async function POST(req, { params }) {
  try {
    const { merchantId, token } = params;
    const payload = await req.json();

    // --- Valida merchant ---
    const ref = fireDoc(db, "shopify_merchants", merchantId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    // --- Estrai dati ordine e cliente ---
    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};
    const phoneRaw = customer.phone || shipping.phone || "";
    const phone = normalizePhone(phoneRaw);

    // --- Prepara dati contatto (merge se esiste) ---
    const contactRef = fireDoc(db, "contacts", phone);
    const prevContactSnap = await getDoc(contactRef);

    let contactData = {
      phone,
      phone_raw: phoneRaw,
      merchantId,
      source: 'shopify',
      shop: payload.shop || "",
      firstName: customer.first_name || shipping.name || "",
      lastName: customer.last_name || "",
      email: customer.email || payload.email || "",
      address: shipping.address1 || "",
      city: shipping.city || "",
      zip: shipping.zip || "",
      province: shipping.province || "",
      country: shipping.country || "",
      tags: ['shopify'],
      updatedAt: new Date(),
      createdBy: merchantId,
    };

    if (prevContactSnap.exists()) {
      const prev = prevContactSnap.data();
      contactData = {
        ...prev,
        ...contactData,
        tags: Array.from(new Set([...(prev.tags || []), 'shopify']))
      };
    }

    if (phone) {
      await setDoc(contactRef, contactData, { merge: true });
    }

    // --- Prepara dati ordine ---
    const orderId = payload.id?.toString() || "";
    const orderNumber = payload.order_number?.toString() || "";
    const orderLink = payload.order_status_url || ""; // Link diretto ordine Shopify (se presente)
    const orderRef = fireDoc(db, "orders", orderId);

    // Calcolo fulfilled (usando lo stato di Shopify)
    const fulfillment_status = payload.fulfillment_status || "";
    const fulfilled = fulfillment_status === "fulfilled" || fulfillment_status === true;

    // Totale ordine e indirizzo completo
    const totalPrice = payload.total_price || "";
    const shippingAddress = `${shipping.address1 || ""}, ${shipping.zip || ""} ${shipping.city || ""} (${shipping.province || ""})`.trim();

    // Tracking info (potrai espandere se vuoi)
    const trackingNumbers = (payload.fulfillments || []).flatMap(f => f.tracking_number ? [f.tracking_number] : []);
    const trackingUrls = (payload.fulfillments || []).flatMap(f => f.tracking_url ? [f.tracking_url] : []);

    const orderData = {
      orderId,
      orderNumber,
      orderLink,
      createdAt: payload.created_at || "",
      updatedAt: new Date(),
      merchantId,
      shop: payload.shop || "",
      source: "shopify",
      status: payload.financial_status || "",
      fulfillment_status,
      fulfilled,
      totalPrice,
      shippingAddress,
      trackingNumbers,
      trackingUrls,
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
      products: Array.isArray(payload.line_items) ? payload.line_items.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        variant_title: item.variant_title,
        vendor: item.vendor,
      })) : [],
      raw: payload,
      conferma_inviata: false,
      // puoi aggiungere qui altri flag degli automatismi
    };

    if (orderId) {
      await setDoc(orderRef, orderData, { merge: true });
    }

    return NextResponse.json({ success: true, orderId, phone });
  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}