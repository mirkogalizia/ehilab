import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req) {
  try {
    const { message, customer_phone, customer_name, merchant_id } = await req.json();
    
    if (!message || !merchant_id) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    
    console.log('🚀 AI CHAT START');
    
    // Verifica utente
    const userDoc = await getDoc(doc(db, 'users', merchant_id));
    
    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userDoc.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ ai_enabled: false });
    }
    
    console.log('✅ AI enabled for merchant');
    
    // SYSTEM PROMPT
    const systemPrompt = `Sei l'assistente virtuale di un e-commerce italiano chiamato "NOT FOR RESALE".

Il tuo compito è aiutare i clienti con:
- Informazioni sugli ordini (tracking, stato spedizione, tempi di consegna)
- Domande sui prodotti
- Politiche di reso e rimborso
- Assistenza generale

Rispondi sempre in italiano, in modo cordiale e professionale.
Usa emoji con moderazione (max 1-2 per messaggio).
Risposte brevi e chiare (max 3-4 frasi).

Se il cliente chiede informazioni su un ordine specifico, spiega che hai bisogno del numero ordine e dell'email usata per l'acquisto per verificare lo stato.

Cliente attuale: ${customer_name || 'Cliente'}
Telefono: ${customer_phone || 'N/A'}`;
    
    // Custom prompt merchant
    const customPrompt = aiConfig.custom_prompt || '';
    
    // CHIAMATA CHAT COMPLETIONS
    console.log('🤖 Calling OpenAI Chat Completions...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt + (customPrompt ? '\n\nIstruzioni aggiuntive: ' + customPrompt : '')
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 1.0,
      max_tokens: 500
    });
    
    const response = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;
    
    console.log('✅ Response received:', response.slice(0, 50));
    console.log('📊 Tokens used:', tokensUsed);
    
    return NextResponse.json({
      ai_enabled: true,
      response: response,
      tokens_used: tokensUsed
    });
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    return NextResponse.json({ 
      error: err.message 
    }, { status: 500 });
  }
}

