import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';

// Inizializza OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

export async function POST(req) {
  try {
    const { 
      message, 
      customer_phone, 
      customer_name,
      merchant_id 
    } = await req.json();
    
    if (!message || !merchant_id) {
      return NextResponse.json({ 
        error: 'Parametri mancanti' 
      }, { status: 400 });
    }
    
    console.log('🤖 AI Reply per:', { customer_phone, merchant_id, message: message.slice(0, 50) });
    
    // ===== VERIFICA SE AI È ABILITATA =====
    const userRef = doc(db, 'users', merchant_id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.log('❌ Utente non trovato:', merchant_id);
      return NextResponse.json({ 
        error: 'Utente non trovato' 
      }, { status: 404 });
    }
    
    const userData = userSnap.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      console.log('⏸️ AI non abilitata per questo merchant');
      return NextResponse.json({ 
        ai_enabled: false,
        message: 'AI non abilitata'
      });
    }
    
    // ===== VERIFICA ASSISTANT_ID =====
    if (!ASSISTANT_ID) {
      console.error('❌ OPENAI_ASSISTANT_ID non configurato!');
      return NextResponse.json({ 
        error: 'Assistant ID non configurato' 
      }, { status: 500 });
    }
    
    console.log('✅ AI abilitata, Assistant ID:', ASSISTANT_ID);
    
    // ===== CREA THREAD =====
    console.log('📝 Creazione thread...');
    const thread = await openai.beta.threads.create();
    
    if (!thread || !thread.id) {
      console.error('❌ Errore creazione thread:', thread);
      return NextResponse.json({ 
        error: 'Errore creazione thread' 
      }, { status: 500 });
    }
    
    const threadId = thread.id;
    console.log('✅ Thread creato:', threadId);
    
    // ===== AGGIUNGI MESSAGGIO =====
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });
    
    console.log('✅ Messaggio aggiunto al thread');
    
    // ===== PREPARA ISTRUZIONI CONTESTUALI =====
    let additionalInstructions = `
Cliente: ${customer_name || 'Cliente'}
Telefono: ${customer_phone || 'Non disponibile'}
`;
    
    if (aiConfig.custom_prompt) {
      additionalInstructions += `\n\nIstruzioni personalizzate:\n${aiConfig.custom_prompt}`;
    }
    
    // ===== ESEGUI ASSISTANT =====
    console.log('🚀 Avvio Assistant...');
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      additional_instructions: additionalInstructions
    });
    
    if (!run || !run.id) {
      console.error('❌ Errore creazione run:', run);
      return NextResponse.json({ 
        error: 'Errore avvio Assistant' 
      }, { status: 500 });
    }
    
    const runId = run.id;
    console.log('✅ Run creato:', runId);
    
    // ===== POLLING COMPLETAMENTO =====
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    let attempts = 0;
    const maxAttempts = 30;
    
    while (runStatus.status !== 'completed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
      console.log(`🔄 Run status (${attempts + 1}/${maxAttempts}):`, runStatus.status);
      
      // ===== GESTISCI RICHIESTA FUNCTION CALL =====
      if (runStatus.status === 'requires_action') {
        console.log('🔧 Run richiede azione (function call)');
        
        const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
        
        if (toolCalls.length > 0) {
          const toolOutputs = [];
          
          for (const toolCall of toolCalls) {
            console.log('📞 Function call:', toolCall.function.name);
            
            if (toolCall.function.name === 'get_order_status') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                console.log('📦 Richiesta ordine:', args);
                
                // Chiama API get-order
                const shopifyConfig = userData.shopify_config;
                
                if (!shopifyConfig || !shopifyConfig.admin_token) {
                  toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({
                      found: false,
                      message: 'Shopify non configurato per questo merchant'
                    })
                  });
                  continue;
                }
                
                // Chiama Shopify API direttamente
                const storeUrl = shopifyConfig.store_url;
                const token = shopifyConfig.admin_token;
                const orderId = args.order_id.replace(/[#\s]/g, '');
                
                const shopifyRes = await fetch(
                  `https://${storeUrl}/admin/api/2024-10/orders.json?name=${orderId}&status=any`,
                  {
                    headers: {
                      'X-Shopify-Access-Token': token,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                if (!shopifyRes.ok) {
                  throw new Error(`Shopify API error: ${shopifyRes.status}`);
                }
                
                const shopifyData = await shopifyRes.json();
                
                if (shopifyData.orders && shopifyData.orders.length > 0) {
                  const order = shopifyData.orders[0];
                  
                  toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({
                      found: true,
                      order_number: order.name,
                      status: order.financial_status,
                      fulfillment_status: order.fulfillment_status || 'non ancora spedito',
                      total: `€${order.total_price}`,
                      customer_email: order.email,
                      customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
                      line_items: order.line_items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: `€${item.price}`
                      })),
                      created_at: order.created_at,
                      tracking_number: order.fulfillments?.[0]?.tracking_number || null
                    })
                  });
                } else {
                  toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({
                      found: false,
                      message: `Ordine ${args.order_id} non trovato`
                    })
                  });
                }
                
              } catch (err) {
                console.error('❌ Errore get_order_status:', err);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    found: false,
                    message: 'Errore recupero ordine: ' + err.message
                  })
                });
              }
            } else {
              // Function non gestita
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  error: 'Function non supportata'
                })
              });
            }
          }
          
          // Invia tool outputs
          if (toolOutputs.length > 0) {
            console.log('📤 Invio tool outputs:', toolOutputs.length);
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: toolOutputs
            });
          }
        }
      }
      
      // ===== GESTISCI ERRORI RUN =====
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'expired') {
        console.error('❌ Run fallito:', runStatus.status, runStatus.last_error);
        return NextResponse.json({ 
          error: 'Errore AI: ' + (runStatus.last_error?.message || runStatus.status)
        }, { status: 500 });
      }
      
      attempts++;
    }
    
    // ===== TIMEOUT =====
    if (attempts >= maxAttempts) {
      console.error('⏱️ Timeout AI');
      return NextResponse.json({ 
        error: 'Timeout: AI non ha risposto in tempo' 
      }, { status: 504 });
    }
    
    // ===== RECUPERA RISPOSTA =====
    console.log('📥 Recupero risposta...');
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantMessages = messages.data.filter(m => m.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      console.error('❌ Nessuna risposta dall\'AI');
      return NextResponse.json({ 
        error: 'Nessuna risposta generata' 
      }, { status: 500 });
    }
    
    const lastMessage = assistantMessages[0];
    const responseText = lastMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text.value)
      .join('\n');
    
    console.log('✅ Risposta AI:', responseText.slice(0, 100) + '...');
    
    return NextResponse.json({
      ai_enabled: true,
      response: responseText,
      thread_id: threadId,
      tokens_used: runStatus.usage?.total_tokens || 0
    });
    
  } catch (err) {
    console.error('❌ Errore ai-reply:', err);
    return NextResponse.json({ 
      error: 'Errore AI: ' + err.message 
    }, { status: 500 });
  }
}
