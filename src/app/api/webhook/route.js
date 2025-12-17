// ===== 🆕 AI AUTO-REPLY (SOLO PER MESSAGGI TESTUALI) =====
if (aiEnabled && text.trim() && type === 'text') {
  console.log('🤖 Invio richiesta AI per messaggio:', text.slice(0, 50));

  try {
    // 1) Prova a capire se nel messaggio c'è un numero ordine
    let orderData = null;
    const orderMatch = text.match(/#?\d{3,8}/); // es: #3527 o 3527
    
    if (orderMatch) {
      const orderId = orderMatch[0];
      console.log('🔍 Trovato possibile numero ordine nel testo:', orderId);
      
      try {
        const getOrderRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it'}/api/get-order`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderId,
              customer_contact: wa_id,      // numero WhatsApp come contatto
              merchant_id: user_uid
            })
          }
        );
        
        const getOrderJson = await getOrderRes.json();
        
        if (getOrderJson.found) {
          orderData = getOrderJson;
          console.log('✅ Dati ordine trovati per AI:', orderData.order_id);
        } else {
          console.log('ℹ️ get-order:', getOrderJson.message);
        }
      } catch (e) {
        console.error('❌ Errore chiamando get-order:', e);
      }
    }

    // 2) Chiama endpoint AI (CHAT COMPLETIONS)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it';
    const aiResponse = await fetch(`${baseUrl}/api/ai-respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        customer_phone: wa_id,
        customer_name: profile_name,
        merchant_id: user_uid,
        orderData  // può essere null
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();

    if (aiData.ai_enabled && aiData.response) {
      console.log('✅ Risposta AI ricevuta:', aiData.response.slice(0, 100));

      // ===== INVIA RISPOSTA VIA WHATSAPP =====
      const sendResponse = await fetch(
        `https://graph.facebook.com/v21.0/${phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: wa_id,
            type: 'text',
            text: {
              body: aiData.response
            }
          })
        }
      );

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error('❌ Errore invio WhatsApp:', errorText);
      } else {
        const sendData = await sendResponse.json();
        console.log('✅ Risposta AI inviata via WhatsApp');

        // ===== SALVA RISPOSTA AI SU FIRESTORE =====
        await addDoc(collection(db, 'messages'), {
          user_uid,
          from: phone_number_id,
          to: wa_id,
          message_id: sendData.messages?.[0]?.id || `ai_${Date.now()}`,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'text',
          text: aiData.response,
          media_id: '',
          profile_name: 'AI Assistant',
          read: true,
          direction: 'outgoing',
          ai_generated: true,
          ai_tokens: aiData.tokens_used || 0,
          createdAt: serverTimestamp(),
        });

        console.log('💾 Risposta AI salvata su Firestore');
      }
    } else {
      console.log('⚠️ AI non ha generato risposta');
    }

  } catch (aiError) {
    console.error('❌ Errore AI:', aiError);
  }

} else if (aiEnabled && type !== 'text') {
  console.log('⏭️ Tipo messaggio non supportato da AI:', type);
} else {
  console.log('⏸️ AI disabilitata, skip auto-reply');
}

