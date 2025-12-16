import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';

// Inizializza OpenAI con le TUE credenziali
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
    
    // ===== VERIFICA SE AI È ABILITATA PER QUESTO MERCHANT =====
    const userRef = doc(db, 'users', merchant_id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return NextResponse.json({ 
        error: 'Utente non trovato' 
      }, { status: 404 });
    }
    
    const userData = userSnap.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ 
        ai_enabled: false,
        message: 'AI non abilitata per questo merchant'
      });
    }
    
    // ===== CREA O RECUPERA THREAD =====
    // Per semplicità creiamo un nuovo thread ogni volta
    // TODO: In futuro salva thread_id su Firestore per mantenere contesto
    const thread = await openai.beta.threads.create();
    
    console.log('📝 Thread creato:', thread.id);
    
    // ===== AGGIUNGI MESSAGGIO UTENTE AL THREAD =====
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });
    
    // ===== PREPARA ISTRUZIONI CONTESTUALI =====
    let additionalInstructions = `
Cliente: ${customer_name || 'Cliente'}
Telefono: ${customer_phone || 'Non disponibile'}
Merchant ID: ${merchant_id}
`;
    
    // Aggiungi prompt personalizzato se presente
    if (aiConfig.custom_prompt) {
      additionalInstructions += `\n\nISTRUZIONI PERSONALIZZATE MERCHANT:\n${aiConfig.custom_prompt}`;
    }
    
    // ===== ESEGUI ASSISTANT =====
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
      additional_instructions: additionalInstructions,
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_order_status',
            description: 'Recupera informazioni su un ordine Shopify verificando email o telefono del cliente',
            parameters: {
              type: 'object',
              properties: {
                order_id: {
                  type: 'string',
                  description: 'Numero ordine (es: #1234 o 5678901234)'
                },
                customer_contact: {
                  type: 'string',
                  description: 'Email o telefono del cliente per verificare l\'ordine'
                }
              },
              required: ['order_id', 'customer_contact']
            }
          }
        }
      ]
    });
    
    console.log('⏳ Run creato:', run.id);
    
    // ===== POLLING PER COMPLETAMENTO =====
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = 30; // 30 secondi max
    
    while (runStatus.status !== 'completed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Attendi 1 secondo
      
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('🔄 Run status:', runStatus.status);
      
      // ===== GESTISCI FUNCTION CALLS =====
      if (runStatus.status === 'requires_action') {
        const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'get_order_status') {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('📞 Function call: get_order_status', args);
            
            // Chiama il nostro endpoint get-order
            try {
              const orderRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/api/get-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  order_id: args.order_id,
                  customer_contact: args.customer_contact || customer_phone,
                  merchant_id: merchant_id
                })
              });
              
              const orderData = await orderRes.json();
              
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(orderData)
              });
              
              // ===== APRI TICKET SE ORDINE IN RITARDO =====
              if (orderData.found && orderData.is_delayed) {
                console.log('⚠️ Ordine in ritardo, apertura ticket automatico');
                
                try {
                  await addDoc(collection(db, 'tickets'), {
                    merchant_id: merchant_id,
                    customer_phone: customer_phone,
                    customer_name: customer_name || 'Cliente',
                    order_id: orderData.order_id,
                    subject: `Ordine in ritardo: ${orderData.order_id}`,
                    description: `Il cliente ${customer_name} ha richiesto informazioni sull'ordine ${orderData.order_id} effettuato ${orderData.days_since_order} giorni fa. L'ordine non ha ancora tracking number.`,
                    status: 'open',
                    priority: 'high',
                    category: 'order_delay',
                    created_at: new Date().toISOString(),
                    auto_created: true,
                    ai_context: {
                      customer_message: message,
                      order_details: orderData
                    }
                  });
                  
                  console.log('✅ Ticket automatico creato');
                } catch (ticketErr) {
                  console.error('❌ Errore creazione ticket:', ticketErr);
                }
              }
              
            } catch (err) {
              console.error('❌ Errore get-order:', err);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({ found: false, message: 'Errore recupero ordine' })
              });
            }
          }
        }
        
        // Invia tool outputs
        if (toolOutputs.length > 0) {
          await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
            tool_outputs: toolOutputs
          });
        }
      }
      
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'expired') {
        console.error('❌ Run fallito:', runStatus.status, runStatus.last_error);
        return NextResponse.json({ 
          error: 'Errore generazione risposta AI',
          details: runStatus.last_error 
        }, { status: 500 });
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return NextResponse.json({ 
        error: 'Timeout: l\'AI non ha risposto in tempo' 
      }, { status: 504 });
    }
    
    // ===== RECUPERA RISPOSTA =====
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data.filter(m => m.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      return NextResponse.json({ 
        error: 'Nessuna risposta dall\'AI' 
      }, { status: 500 });
    }
    
    const lastMessage = assistantMessages[0];
    const responseText = lastMessage.content
      .filter(c => c.type === 'text')
      .map(c => c.text.value)
      .join('\n');
    
    console.log('✅ Risposta AI generata:', responseText.slice(0, 100));
    
    return NextResponse.json({
      ai_enabled: true,
      response: responseText,
      thread_id: thread.id,
      tokens_used: runStatus.usage?.total_tokens || 0
    });
    
  } catch (err) {
    console.error('❌ Errore ai-reply:', err);
    return NextResponse.json({ 
      error: 'Errore AI: ' + err.message 
    }, { status: 500 });
  }
}
