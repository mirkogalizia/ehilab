import { NextResponse } from 'next/server';
import { db } from '@/firebase';
import { collection, setDoc, getDoc, doc as fireDoc } from 'firebase/firestore';

// Funzione per normalizzare il numero per WhatsApp (solo Italia, estendibile)
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

    // Valida il token su Firestore
    const ref = fireDoc(db, "shopify_merchants", merchantId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().token !== token) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 403 });
    }

    const customer = payload.customer || {};
    const shipping = payload.shipping_address || {};

    const phoneRaw = customer.phone || shipping.phone || "";
    const phone = normalizePhone(phoneRaw);

    if (!phone) {
      return NextResponse.json({ success: false, error: "Telefono non valido" }, { status: 200 });
    }

    // Prepara tutti i dati da salvare/aggiornare
    const dataToUpdate = {
      phone,
      phone_raw: phoneRaw,
      merchantId,
      source: 'shopify',
      shop: payload.shop || "",
      orderId: payload.id || "",
      orderNumber: payload.order_number || payload.name || "", // <--- AGGIUNTO QUI
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
    };

    // Leggi il contatto esistente (usando phone come docID)
    const contactRef = fireDoc(db, "contacts", phone);
    const existingSnap = await getDoc(contactRef);

    let newTags = ['shopify'];

    if (existingSnap.exists()) {
      // Unisci i tags vecchi con "shopify" (senza duplicati)
      const prev = existingSnap.data();
      if (Array.isArray(prev.tags)) {
        newTags = Array.from(new Set([...prev.tags, 'shopify']));
      }

      // Aggiorna solo se il dato da Shopify è migliore/non presente
      dataToUpdate.firstName = dataToUpdate.firstName || prev.firstName || "";
      dataToUpdate.lastName = dataToUpdate.lastName || prev.lastName || "";
      dataToUpdate.email = dataToUpdate.email || prev.email || "";
      dataToUpdate.address = dataToUpdate.address || prev.address || "";
      dataToUpdate.city = dataToUpdate.city || prev.city || "";
      dataToUpdate.zip = dataToUpdate.zip || prev.zip || "";
      dataToUpdate.province = dataToUpdate.province || prev.province || "";
      dataToUpdate.country = dataToUpdate.country || prev.country || "";
    }

    // Scrivi/aggiorna il contatto (con merge!)
    await setDoc(contactRef, {
      ...dataToUpdate,
      tags: newTags,
      createdBy: merchantId,
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore webhook Shopify:", error);
    return NextResponse.json({ success: false, error: error.toString() }, { status: 500 });
  }
}
