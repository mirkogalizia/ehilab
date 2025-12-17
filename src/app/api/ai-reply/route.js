import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req) {
  let threadId = null;
  let runId = null;
  
  try {
    const { message, customer_phone, customer_name, merchant_id } = await req.json();
    
    if (!message || !merchant_id) {
      return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });
    }
    
    console.log('🤖 AI Reply START');
    
    // Verifica utente
    const userRef = doc(db, 'users', merchant_id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }
    
    const userData = userSnap.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ ai_enabled: false });
    }
    
    const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
    
    if (!ASSISTANT_ID) {
      console.error('❌ ASSISTANT_ID mancante');
      return NextResponse.json({ error: 'Assistant non configurato' }, { status: 500 });
    }
    
    console.log('✅ Assistant ID:', ASSISTANT_ID);
    
    // CREA THREAD
    console.log('📝 Creazione thread...');
    const threadResponse = await openai.beta.threads.create();
    threadId = threadResponse.id;
    
    if (!threadId) {
      throw new Error('Thread ID non ricevuto');
    }
    
    console.log('✅ Thread ID:', threadId);
    
    // AGGIUNGI MESSAGGIO
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });
    
    console.log('✅ Messaggio aggiunto');
    
    // CREA RUN (SENZA FUNCTION CALLS)
    const runResponse = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      additional_instructions: `Cliente: ${customer_name || 'Sconosciuto'}, Tel: ${customer_phone || 'N/A'}`
    });
    
    runId = runResponse.id;
    
    if (!runId) {
      throw new Error('Run ID non ricevuto');
    }
    
    console.log('✅ Run ID:', runId);
    
    // POLLING SEMPLICE (SOLO completed/failed)
    let attempts = 0;
    let runStatus = runResponse;
    
    while (runStatus.status !== 'completed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      
      runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
      
      console.log(`🔄 Status (${attempts + 1}/30):`, runStatus.status);
      
      if (runStatus.status === 'failed') {
        console.error('❌ Run failed:', runStatus.last_error);
        throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      if (runStatus.status === 'cancelled' || runStatus.status === 'expired') {
        throw new Error(`Run ${runStatus.status}`);
      }
      
      attempts++;
    }
    
    if (attempts >= 30) {
      throw new Error('Timeout: AI non ha risposto in 30 secondi');
    }
    
    // RECUPERA RISPOSTA
    console.log('📥 Recupero risposta...');
    const messages = await openai.beta.threads.messages.list(threadId);
    const aiMessages = messages.data.filter(m => m.role === 'assistant');
    
    if (aiMessages.length === 0) {
      throw new Error('Nessuna risposta AI generata');
    }
    
    const response = aiMessages[0].content
      .filter(c => c.type === 'text')
      .map(c => c.text.value)
      .join('\n');
    
    console.log('✅ Risposta AI:', response.slice(0, 100));
    
    return NextResponse.json({
      ai_enabled: true,
      response: response,
      thread_id: threadId
    });
    
  } catch (err) {
    console.error('❌ ERRORE COMPLETO:', err);
    console.error('❌ Message:', err.message);
    console.error('❌ Stack:', err.stack);
    
    return NextResponse.json({ 
      error: err.message,
      thread_id: threadId,
      run_id: runId
    }, { status: 500 });
  }
}

