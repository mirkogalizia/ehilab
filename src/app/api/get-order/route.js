import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req) {
  try {
    const { order_id, customer_contact, merchant_id } = await req.json();
    
    if (!order_id || !customer_contact || !merchant_id) {
      return NextResponse.json({ 
        found: false, 
        message: 'Parametri mancanti' 
      }, { status: 400 });
    }
    
    const cleanOrderId = order_id.replace(/[#\s]/g, '');
    const cleanContact = customer_contact.trim().toLowerCase();
    
    console.log('🔍 Ricerca ordine:', { order_id, customer_contact, merchant_id });
    
    // ===== LEGGE CREDENZIALI SHOPIFY DA users/{merchant_id} =====
    const userRef = doc(db, 'users', merchant_id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return NextResponse.json({ 
        found: false, 
        message: 'Utente non trovato' 
      }, { status: 404 });
    }
    
    const userData = userSnap.data();
    const shopifyUrl = userData.shopify_config?.store_url;
    const shopifyToken = userData.shopify_config?.admin_token;
    
    if (!shopifyUrl || !shopifyToken) {
      return NextResponse.json({ 
        found: false, 
        message: 'Shopify non configurato. Vai su Automazioni → Assistente AI' 
      }, { status: 400 });
    }
    
    // ===== QUERY SHOPIFY API =====
    let endpoint;
    if (order_id.startsWith('#')) {
      // Cerca per nome ordine (es: #1234)
      endpoint = `https://${shopifyUrl}/admin/api/2024-01/orders.json?name=${encodeURIComponent(order_id)}&status=any`;
    } else {
      // Cerca per ID numerico
      endpoint = `https://${shopifyUrl}/admin/api/2024-01/orders/${cleanOrderId}.json`;
    }
    
    const res = await fetch(endpoint, {
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ found: false, message: 'Ordine non trovato su Shopify' });
      }
      console.error('❌ Shopify API error:', res.status);
      return NextResponse.json({ 
        found: false, 
        message: 'Errore recupero ordine da Shopify' 
      }, { status: 500 });
    }
    
    const data = await res.json();
    const order = data.order || data.orders?.[0];
    
    if (!order) {
      return NextResponse.json({ found: false, message: 'Ordine non trovato' });
    }
    
    // ===== VERIFICA SICUREZZA (email o telefono devono corrispondere) =====
    const emailMatch = order.email?.toLowerCase() === cleanContact;
    const phoneMatch = order.phone?.replace(/[\s\-().+]/g, '') === cleanContact.replace(/[\s\-().+]/g, '');
    
    if (!emailMatch && !phoneMatch) {
      console.log('❌ Verifica fallita:', { 
        orderEmail: order.email, 
        orderPhone: order.phone, 
        customerContact: cleanContact 
      });
      return NextResponse.json({ 
        found: false, 
        message: 'Email/telefono non corrispondono all\'ordine' 
      });
    }
    
    console.log('✅ Ordine trovato e verificato:', order.name);
    
    // ===== MAPPA STATUS SHOPIFY A STATUS NORMALIZZATO =====
    let normalizedStatus;
    let statusDescription;
    
    if (order.cancelled_at) {
      normalizedStatus = 'cancelled';
      statusDescription = 'Annullato';
    } else if (order.fulfillment_status === 'fulfilled') {
      normalizedStatus = 'delivered';
      statusDescription = 'Consegnato';
    } else if (order.fulfillment_status === 'partial' || (order.fulfillments && order.fulfillments.length > 0)) {
      normalizedStatus = 'shipped';
      statusDescription = 'Spedito';
    } else if (order.financial_status === 'paid' || order.financial_status === 'authorized') {
      normalizedStatus = 'processing';
      statusDescription = 'In preparazione';
    } else if (order.financial_status === 'pending') {
      normalizedStatus = 'pending';
      statusDescription = 'In attesa di pagamento';
    } else {
      normalizedStatus = 'processing';
      statusDescription = 'In lavorazione';
    }
    
    // ===== ESTRAI INFO TRACKING =====
    const fulfillment = order.fulfillments?.[0];
    const trackingNumber = fulfillment?.tracking_number || '';
    const trackingUrls = fulfillment?.tracking_urls || [];
    const trackingUrl = trackingUrls[0] || fulfillment?.tracking_url || '';
    const carrier = fulfillment?.tracking_company || 'Non ancora assegnato';
    
    // ===== CALCOLA DATA CONSEGNA STIMATA =====
    let estimatedDelivery = 'da definire';
    if (fulfillment?.created_at && normalizedStatus !== 'delivered') {
      const shipDate = new Date(fulfillment.created_at);
      shipDate.setDate(shipDate.getDate() + 3); // +3 giorni dalla spedizione
      estimatedDelivery = shipDate.toLocaleDateString('it-IT', { 
        weekday: 'long',
        day: 'numeric', 
        month: 'long' 
      });
    }
    
    // ===== CALCOLA GIORNI DALL'ORDINE (importante per ritardi) =====
    const orderDate = new Date(order.created_at);
    const daysAgo = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // ===== RISPOSTA FORMATTATA PER AI =====
    return NextResponse.json({
      found: true,
      order_id: order.name || `#${order.order_number}`,
      status: normalizedStatus,
      status_description: statusDescription,
      carrier: carrier,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      estimated_delivery: estimatedDelivery,
      order_date: orderDate.toLocaleDateString('it-IT', { 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      }),
      days_since_order: daysAgo,
      total: parseFloat(order.total_price).toFixed(2),
      currency: order.currency || 'EUR',
      items: order.line_items.map(i => `${i.name} (x${i.quantity})`).join(', '),
      delivery_date: fulfillment?.delivered_at 
        ? new Date(fulfillment.delivered_at).toLocaleDateString('it-IT')
        : null,
      shipping_address: order.shipping_address 
        ? `${order.shipping_address.city}, ${order.shipping_address.province || order.shipping_address.country}`
        : 'N/D',
      customer_email: order.email,
      // Flag per ritardi (utile per AI)
      is_delayed: daysAgo > 7 && !trackingNumber
    });
    
  } catch (err) {
    console.error('❌ Errore get-order:', err);
    return NextResponse.json({ 
      found: false, 
      message: 'Errore tecnico: ' + err.message 
    }, { status: 500 });
  }
}
