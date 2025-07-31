// /app/api/webhook/shopify/[merchantId]/[token]/route.js

import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { collection, addDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

export async function POST(req, { params }) {
  try {
    const { merchantId, token } = params;
    const payload = await req.json();

    // (Facoltativo ma consigliato) Valida che il token sia corretto per il merchant
    const ref = fireDoc(db, "shopify_merchants", merchantId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    // Estrai dati del cliente/ordine dal payload Shopify
    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};

    const contact = {
      merchantId,
      token,
      shop: payload.shop || "",
      orderId: payload.id || "",
      firstName: customer.first_name || shipping.name || "",
      lastName: customer.last_name || "",
      phone: customer.phone || shipping.phone || "",
      email: customer.email || payload.email || "",
      createdAt: new Date(),
      source: 'shopify',
      raw: payload // salva tutto il payload per eventuali future elaborazioni
    };

    // Salva il contatto in Firestore
    await addDoc(collection(db, "contacts"), contact);

    // Rispondi a Shopify per confermare ricezione
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}
