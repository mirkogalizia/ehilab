import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { collection, addDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

// Funzione per normalizzare il numero per WhatsApp (solo Italia, estendibile)
function normalizePhone(phone) {
  if (!phone) return "";
  // Rimuove spazi, trattini, punti, parentesi
  let norm = phone.replace(/[\s\-\.\(\)]/g, "");
  // 0039 -> +39
  if (norm.startsWith("0039")) norm = "+39" + norm.slice(4);
  // 39 senza + all'inizio e lunghezza 11 (es: 39123456789) -> +39
  if (norm.startsWith("39") && norm.length === 11) norm = "+39" + norm.slice(2);
  // Solo cifre (es: 3471234567) -> +39
  if (!norm.startsWith("+") && norm.length === 10) norm = "+39" + norm;
  // (Facoltativo) accetta solo numeri con almeno 10 cifre
  if (!/^\+39\d{9,10}$/.test(norm)) return ""; // ritorna vuoto se non valido
  return norm;
}

export async function POST(req, { params }) {
  try {
    const { merchantId, token } = params;
    const payload = await req.json();

    // Valida il token su Firestore
    const ref = fireDoc(db, "shopify_merchants", merchantId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};

    // Estrazione e normalizzazione
    const phoneRaw = customer.phone || shipping.phone || "";
    const phone = normalizePhone(phoneRaw);

    const contact = {
      merchantId,
      token,
      source: 'shopify',
      tags: ['shopify'],
      firstName: customer.first_name || shipping.name || "",
      lastName: customer.last_name || "",
      phone,            // numero pulito per WhatsApp (già con +39)
      phone_raw: phoneRaw, // come arriva da Shopify
      email: customer.email || payload.email || "",
      createdAt: new Date(),
      shop: payload.shop || "",
      orderId: payload.id || "",
      raw: payload
    };

    // Salva solo se il numero è valido e non vuoto
    if (phone) {
      await addDoc(collection(db, "contacts"), contact);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}

