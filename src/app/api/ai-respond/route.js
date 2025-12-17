import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req) {
  try {
    const { 
      message, 
      customer_phone, 
      customer_name, 
      merchant_id,
      orderData
    } = await req.json();
    
    if (!message || !merchant_id) {
      return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });
    }
    
    console.log('🚀 AI CHAT START:', message.slice(0, 50));
    
    // Verifica utente
    const userDoc = await getDoc(doc(db, 'users', merchant_id));
    
    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }
    
    const userData = userDoc.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ ai_enabled: false });
    }
    
    // ===== COSTRUISCI SYSTEM PROMPT =====
    let systemPrompt = `Sei l'assistente virtuale di un e-commerce italiano chiamato "NOT FOR RESALE".

OBIETTIVO:
- Dare al cliente informazioni chiare sullo stato dell'ordine.
- Se NON hai dati ordine, chiedi SEMPRE:
  1) Numero ordine (es: #3527)
  2) Email o numero di telefono usati per l'acquisto.

COMPORTAMENTO:
- Rispondi in italiano, tono cordiale ma diretto.
- Max 3-4 frasi per risposta.
- Usa al massimo 1 emoji, solo se utile.
- Non inventare mai tracking o date se non presenti nei dati.`;

    if (orderData && orderData.found) {
      systemPrompt += `

DATI ORDINE (NON MOSTRARE IL JSON, RIASSUMI IN LINGUAGGIO NATURALE):
- Numero ordine: ${orderData.order_id}
- Stato: ${orderData.status_description}
- Tracking: ${orderData.tracking_number || 'non disponibile'}
- Corriere: ${orderData.carrier}
- Consegna stimata: ${orderData.estimated_delivery}
- Articoli: ${orderData.items}
- Città spedizione: ${orderData.shipping_address}
- Giorni dall'ordine: ${orderData.days_since_order}
- Ordine in ritardo: ${orderData.is_delayed ? 'sì' : 'no'}

ISTRUZIONI:
- Se l'ordine è "Spedito" o "Consegnato", comunica chiaramente lo stato e il tracking.
- Se non c'è tracking, spiega che il pacco è in preparazione o affidato al corriere ma senza tracking visibile.
- Se l'ordine è in ritardo (is_delayed = true), scusati e spiega che segnali il problema al team.`;
    } else {
      systemPrompt += `

NON hai dati ordine strutturati (orderData == null).
- Chiedi educatamente numero ordine + email/telefono per poter verificare.
- Non fingere di aver controllato il sistema.`;
    }

    if (aiConfig.custom_prompt) {
      systemPrompt += `

ISTRUZIONI PERSONALIZZATE MERCHANT:
${aiConfig.custom_prompt}`;
    }
    
    // ===== CHIAMATA CHAT COMPLETIONS =====
    console.log('🤖 Chiamata Chat Completions...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.8,
      max_tokens: 400
    });
    
    const response = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;
    
    console.log('✅ Response:', response.slice(0, 100));
    console.log('📊 Tokens used:', tokensUsed);
    
    return NextResponse.json({
      ai_enabled: true,
      response,
      tokens_used: tokensUsed
    });
    
  } catch (err) {
    console.error('❌ ERROR AI-RESPOND:', err);
    return NextResponse.json({ 
      error: err.message 
    }, { status: 500 });
  }
}

