import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const shop = searchParams.get('shop');
    
    if (!userId) {
      return NextResponse.json({ error: 'user_id mancante' }, { status: 400 });
    }
    
    if (!shop || !shop.includes('myshopify.com')) {
      return NextResponse.json({ 
        error: 'Shop non valido. Usa: tuostore.myshopify.com' 
      }, { status: 400 });
    }
    
    const shopifyApiKey = process.env.SHOPIFY_API_KEY;
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/api/shopify/oauth/callback`;
    const scopes = 'read_orders,read_fulfillments,read_customers';
    
    // Salva user_id nello state per recuperarlo dopo callback
    const state = Buffer.from(JSON.stringify({ user_id: userId })).toString('base64');
    
    // URL autorizzazione Shopify
    const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
      client_id: shopifyApiKey,
      scope: scopes,
      redirect_uri: redirectUri,
      state: state
    }).toString();
    
    console.log('🔗 Redirect OAuth Shopify:', authUrl);
    
    // Redirect utente a Shopify
    return NextResponse.redirect(authUrl);
    
  } catch (err) {
    console.error('❌ Errore OAuth start:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
