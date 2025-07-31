export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop || !shop.endsWith('.myshopify.com')) {
    return new Response('Dominio Shopify non valido', { status: 400 });
  }

  const client_id = process.env.SHOPIFY_CLIENT_ID || '898b7911f0e76349a4c79352098ef2a2';
  const scopes = 'read_orders,read_customers,read_products'; // aggiungi altri se ti servono
  const redirect_uri = process.env.SHOPIFY_REDIRECT_URI || 'https://ehi-lab.it/api/shopify/callback';

  // Generate a random nonce/state (anti-CSRF)
  const state = Math.random().toString(36).substring(2, 15);
  // Qui potresti salvare lo state in un cookie/sessione per validazione dopo

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${client_id}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${state}`;

  return Response.redirect(installUrl, 302);
}
