import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, customer_phone, customer_name, merchant_id } = body;
    
    if (!message || !merchant_id) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    
    console.log('🚀 AI START - Message:', message.slice(0, 30));
    
    // Verifica utente
    const userDoc = await getDoc(doc(db, 'users', merchant_id));
    
    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const aiConfig = userDoc.data().ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ ai_enabled: false });
    }
    
    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    
    if (!assistantId) {
      return NextResponse.json({ error: 'No assistant' }, { status: 500 });
    }
    
    console.log('✅ Using assistant:', assistantId);
    
    // CREA THREAD - DESTRUCTURE ESPLICITO
    const threadObj = await openai.beta.threads.create();
    const threadId = String(threadObj.id); // Force string
    
    console.log('✅ Thread ID type:', typeof threadId, 'value:', threadId);
    
    if (!threadId || threadId === 'undefined') {
      throw new Error('Invalid thread ID: ' + threadId);
    }
    
    // AGGIUNGI MESSAGGIO
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });
    
    console.log('✅ Message added');
    
    // CREA RUN - DESTRUCTURE ESPLICITO
    const runObj = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });
    
    const runId = String(runObj.id); // Force string
    
    console.log('✅ Run ID type:', typeof runId, 'value:', runId);
    
    if (!runId || runId === 'undefined') {
      throw new Error('Invalid run ID: ' + runId);
    }
    
    // POLLING - USA VARIABILI ESPLICITE
    let currentStatus = String(runObj.status);
    let attempts = 0;
    
    console.log('🔄 Initial status:', currentStatus);
    
    while (currentStatus !== 'completed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      
      // RETRIEVE CON VARIABILI FORZATE A STRING
      console.log(`🔍 Retrieving - threadId: "${threadId}", runId: "${runId}"`);
      
      const statusObj = await openai.beta.threads.runs.retrieve(
        String(threadId), 
        String(runId)
      );
      
      currentStatus = String(statusObj.status);
      
      console.log(`🔄 Attempt ${attempts + 1}: ${currentStatus}`);
      
      if (currentStatus === 'failed') {
        throw new Error('Run failed: ' + (statusObj.last_error?.message || 'Unknown'));
      }
      
      if (currentStatus === 'cancelled' || currentStatus === 'expired') {
        throw new Error('Run ' + currentStatus);
      }
      
      attempts++;
    }
    
    if (currentStatus !== 'completed') {
      throw new Error('Timeout after ' + attempts + ' attempts');
    }
    
    // RECUPERA MESSAGGIO
    const messagesList = await openai.beta.threads.messages.list(String(threadId));
    const assistantMsg = messagesList.data.find(m => m.role === 'assistant');
    
    if (!assistantMsg) {
      throw new Error('No AI response');
    }
    
    const textContent = assistantMsg.content.find(c => c.type === 'text');
    const response = textContent?.text?.value || 'No text response';
    
    console.log('✅ Response:', response.slice(0, 50));
    
    return NextResponse.json({
      ai_enabled: true,
      response: response,
      thread_id: threadId
    });
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error('❌ Stack:', err.stack);
    
    return NextResponse.json({ 
      error: err.message 
    }, { status: 500 });
  }
}

