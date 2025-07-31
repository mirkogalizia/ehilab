import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // puoi gestirlo come sicurezza anti-CSRF

  if (!shop || !code) {
    return NextResponse.json({ error: 'Missing shop or code' }, { status: 400 });
  }

  const client_id = process.env.SHOPIFY_CLIENT_ID || '898b7911f0e76349a4c79352098ef2a2';
  const client_secret = process.env.SHOPIFY_CLIENT_SECRET || '5590989357e9f45551d6abd77514f53a';

  // Scambia il code con access_token
  const tokenUrl = `https://${shop}/admin/oauth/access_token`;
  const body = {
    client_id,
    client_secret,
    code,
  };

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return NextResponse.json({ error: 'Token error', details: err }, { status: 500 });
  }

  const tokenData = await tokenRes.json(); // { access_token, scope, ... }
  // Salva access_token in Firestore associato all'utente (o nel tuo DB)

  // IMPORT ORDINI qui come esempio:
  // const ordersRes = await fetch(`https://${shop}/admin/api/2024-07/orders.json`, {
  //   headers: { 'X-Shopify-Access-Token': tokenData.access_token },
  // });
  // const orders = await ordersRes.json();

  // Qui puoi salvare lo shop e l'access_token dove vuoi (es. Firestore)
  // await saveShopifyIntegration({ shop, access_token: tokenData.access_token, user_uid: ... })

  // Redirect alla tua app: puoi anche mostrare "Collegamento completato!"
  return NextResponse.redirect('https://ehi-lab.it/impostazioni/integrations?success=1', 302);
}
