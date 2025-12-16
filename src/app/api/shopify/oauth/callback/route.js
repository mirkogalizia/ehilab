import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import crypto from 'crypto';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');
    
    console.log('📥 Shopify callback ricevuto:', { shop, hasCode: !!code, hasHmac: !!hmac });
    
    if (!code || !shop || !state) {
      console.error('❌ Parametri OAuth mancanti');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=missing_params`
      );
    }
    
    // 1. Decodifica state per recuperare user_id
    let userId;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      userId = stateData.user_id;
    } catch (err) {
      console.error('❌ Errore decodifica state:', err);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=invalid_state`
      );
    }
    
    // 2. Verifica HMAC (sicurezza Shopify)
    const params = Object.fromEntries(searchParams.entries());
    delete params.hmac;
    delete params.signature;
    
    const message = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const generatedHash = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(message)
      .digest('hex');
    
    if (generatedHash !== hmac) {
      console.error('❌ HMAC non valido');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=invalid_hmac`
      );
    }
    
    console.log('✅ HMAC verificato');
    
    // 3. Scambia code con access_token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      })
    });
    
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error('❌ Errore token exchange:', errorText);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=token_exchange`
      );
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    console.log('✅ Access token ottenuto');
    
    // 4. Verifica utente esiste su Firestore
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.error('❌ Utente non trovato:', userId);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=user_not_found`
      );
    }
    
    // 5. Salva token su Firestore
    await updateDoc(userRef, {
      shopify_config: {
        store_url: shop,
        admin_token: accessToken,
        scopes: tokenData.scope,
        connected_at: new Date().toISOString(),
        webhook_configured: false
      }
    });
    
    console.log('✅ Shopify connesso per user:', userId, 'shop:', shop);
    
    // 6. Redirect a dashboard con successo
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=success`
    );
    
  } catch (err) {
    console.error('❌ Errore OAuth callback:', err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/automations?shopify=error&reason=exception`
    );
  }
}
