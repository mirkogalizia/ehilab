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
      throw new Error('Thread ID non ricevuto da OpenAI');
    }
    
    console.log('✅ Thread ID:', threadId);
    
    // AGGIUNGI MESSAGGIO
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });
    
    console.log('✅ Messaggio aggiunto');
    
    // CREA RUN
    const runResponse = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      additional_instructions: `Cliente: ${customer_name || 'Sconosciuto'}, Tel: ${customer_phone || 'N/A'}`
    });
    
    runId = runResponse.id;
    
    if (!runId) {
      throw new Error('Run ID non ricevuto da OpenAI');
    }
    
    console.log('✅ Run ID:', runId);
    
    // POLLING
    let attempts = 0;
    let status = runResponse.status;
    
    while (status !== 'completed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      
      const runCheck = await openai.beta.threads.runs.retrieve(threadId, runId);
      status = runCheck.status;
      
      console.log(`🔄 Attempt ${attempts + 1}: ${status}`);
      
      if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        throw new Error(`Run failed: ${status}`);
      }
      
      // Gestisci function calls
      if (status === 'requires_action') {
        const toolCalls = runCheck.required_action?.submit_tool_outputs?.tool_calls || [];
        
        if (toolCalls.length > 0) {
          const outputs = [];
          
          for (const call of toolCalls) {
            if (call.function.name === 'get_order_status') {
              const args = JSON.parse(call.function.arguments);
              
              // Chiamata Shopify
              const shopifyConfig = userData.shopify_config;
              
              if (shopifyConfig?.admin_token) {
                try {
                  const orderNum = args.order_id.replace(/[#\s]/g, '');
                  const url = `https://${shopifyConfig.store_url}/admin/api/2024-10/orders.json?name=${orderNum}&status=any`;
                  
                  const res = await fetch(url, {
                    headers: {
                      'X-Shopify-Access-Token': shopifyConfig.admin_token,
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  const data = await res.json();
                  
                  if (data.orders && data.orders.length > 0) {
                    const order = data.orders[0];
                    outputs.push({
                      tool_call_id: call.id,
                      output: JSON.stringify({
                        found: true,
                        order_number: order.name,
                        status: order.financial_status,
                        fulfillment: order.fulfillment_status || 'non spedito',
                        total: `€${order.total_price}`,
                        customer: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`,
                        items: order.line_items.map(i => i.name).join(', ')
                      })
                    });
                  } else {
                    outputs.push({
                      tool_call_id: call.id,
                      output: JSON.stringify({ found: false, message: 'Ordine non trovato' })
                    });
                  }
                } catch (err) {
                  outputs.push({
                    tool_call_id: call.id,
                    output: JSON.stringify({ found: false, error: err.message })
                  });
                }
              } else {
                outputs.push({
                  tool_call_id: call.id,
                  output: JSON.stringify({ found: false, message: 'Shopify non configurato' })
                });
              }
            }
          }
          
          if (outputs.length > 0) {
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: outputs
            });
          }
        }
      }
      
      attempts++;
    }
    
    if (attempts >= 30) {
      throw new Error('Timeout');
    }
    
    // RECUPERA RISPOSTA
    const messages = await openai.beta.threads.messages.list(threadId);
    const aiMessages = messages.data.filter(m => m.role === 'assistant');
    
    if (aiMessages.length === 0) {
      throw new Error('Nessuna risposta AI');
    }
    
    const response = aiMessages[0].content
      .filter(c => c.type === 'text')
      .map(c => c.text.value)
      .join('\n');
    
    console.log('✅ Risposta:', response.slice(0, 50));
    
    return NextResponse.json({
      ai_enabled: true,
      response: response,
      thread_id: threadId
    });
    
  } catch (err) {
    console.error('❌ ERRORE:', err.message);
    console.error('ThreadID:', threadId, 'RunID:', runId);
    
    return NextResponse.json({ 
      error: err.message,
      thread_id: threadId,
      run_id: runId
    }, { status: 500 });
  }
}

