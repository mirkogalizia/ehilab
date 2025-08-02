import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { setDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

// --- Funzione per normalizzare il numero di telefono ---
function normalizePhone(phone) {
  if (!phone) return "";
  let norm = phone.replace(/[\s\-\.\(\)]/g, "");
  if (norm.startsWith("0039")) norm = "+39" + norm.slice(4);
  if (norm.startsWith("39") && norm.length === 11) norm = "+39" + norm.slice(2);
  if (!norm.startsWith("+") && norm.length === 10) norm = "+39" + norm;
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

    // --- Estrai dati ordine ---
    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};

    const phoneRaw = customer.phone || shipping.phone || "";
    const phone = normalizePhone(phoneRaw);

    // --- Dettagli ordine principali ---
    const orderId = payload.id?.toString() || "";
    const orderData = {
      orderId,
      orderNumber: payload.order_number?.toString() || "",
      createdAt: payload.created_at || "",
      updatedAt: new Date(),
      merchantId,
      shop: payload.shop || "",
      source: "shopify",
      status: payload.financial_status || "",
      fulfillment_status: payload.fulfillment_status || "",
      // Dati cliente
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
      // Prodotti acquistati
      products: Array.isArray(payload.line_items) ? payload.line_items.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        variant_title: item.variant_title,
        vendor: item.vendor,
      })) : [],
      // Salva il payload intero per debug/tracciabilità (opzionale, rimuovi se non vuoi)
      raw: payload,
      // Flags automatismi (potrai aggiungerne quanti vuoi)
      conferma_inviata: false,
      // ...aggiungi altri flag se vuoi
    };

    // --- Salva l’ordine in Firestore (sovrascrive se già esiste con stesso ID) ---
    const orderRef = fireDoc(db, "orders", orderId);
    await setDoc(orderRef, orderData, { merge: true });

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error("Errore webhook-order:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}