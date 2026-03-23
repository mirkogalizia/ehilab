import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

export async function GET(req) {
  // Verifica webhook WhatsApp
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verificato');
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(req) {
  try {
    const body = await req.json();
    console.log('📥 Webhook ricevuto:', JSON.stringify(body, null, 2));

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phone_number_id = value?.metadata?.phone_number_id;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];
    const statuses = value?.statuses || [];

    // ===== GESTIONE STATUS UPDATES (sent/delivered/read) =====
    if (statuses.length > 0 && phone_number_id) {
      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status; // 'sent' | 'delivered' | 'read' | 'failed'
        const statusTimestamp = status.timestamp;

        if (!messageId || !statusValue) continue;

        try {
          // Trova il messaggio in Firestore tramite message_id
          const msgQuery = query(
            collection(db, 'messages'),
            where('message_id', '==', messageId)
          );
          const msgSnap = await getDocs(msgQuery);

          if (!msgSnap.empty) {
            const msgDoc = msgSnap.docs[0];
            const updateData = {
              wa_status: statusValue,
              [`wa_status_${statusValue}_at`]: statusTimestamp
                ? Number(statusTimestamp) * 1000
                : Date.now(),
            };

            // Se failed, salva anche i dettagli dell'errore
            if (statusValue === 'failed' && status.errors?.length > 0) {
              updateData.wa_error = status.errors[0]?.title || 'Unknown error';
              updateData.wa_error_code = status.errors[0]?.code || 0;
            }

            await updateDoc(doc(db, 'messages', msgDoc.id), updateData);
            console.log(`📬 Status ${statusValue} aggiornato per msg ${messageId}`);
          }
        } catch (err) {
          console.error('Errore aggiornamento status:', err);
        }
      }
    }

    if (!phone_number_id || messages.length === 0) {
      // Se ci sono solo status updates, rispondi OK
      if (statuses.length > 0) {
        return new Response("Status updates processati", { status: 200 });
      }
      return new Response("No messages to process", { status: 200 });
    }

    // ===== TROVA UTENTE ASSOCIATO AL phone_number_id =====
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone_number_id', '==', phone_number_id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('⚠️ Nessun utente trovato per phone_number_id:', phone_number_id);
      return new Response('Utente non trovato', { status: 200 });
    }

    const userDoc = querySnapshot.docs[0];
    const user_uid = userDoc.id;
    const userData = userDoc.data();

    console.log('✅ Utente identificato:', user_uid);

    // ===== VERIFICA SE AI È ABILITATA =====
    const aiConfig = userData.ai_config || {};
    const aiEnabled = aiConfig.enabled === true;
    // USA LA VARIABILE DI VERCEL CHE HAI IMPOSTATO: WHATSAPP_ACCESS_TOKEN
    const whatsappToken = userData.whatsapp_token || process.env.WHATSAPP_ACCESS_TOKEN;

    console.log('🤖 AI abilitata:', aiEnabled);

    // ===== PROCESSA MESSAGGI =====
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const contact = contacts?.[i];
      const wa_id = contact?.wa_id || message.from;
      const profile_name = contact?.profile?.name || "Sconosciuto";

      let text = message.text?.body || '';
      let media_id = '';
      let type = message.type;

      // Gestione media
      if (message.type === 'image' && message.image?.id) {
        media_id = message.image.id;
        text = message.image.caption || '[Immagine]';
      } else if (message.type === 'document' && message.document?.id) {
        media_id = message.document.id;
        text = message.document.filename || '[Documento allegato]';
      } else if (message.type === 'audio' && message.audio?.id) {
        media_id = message.audio.id;
        text = '[Messaggio vocale]';
      } else if (message.type === 'video' && message.video?.id) {
        media_id = message.video.id;
        text = '[Video]';
      } else if (message.type === 'interactive') {
        const interactive = message.interactive;
        if (interactive?.type === 'button_reply') {
          text = interactive.button_reply?.title || '';
        } else if (interactive?.type === 'list_reply') {
          text = interactive.list_reply?.title || '';
        }
      }

      // ===== SALVA MESSAGGIO INCOMING =====
      const messageRef = await addDoc(collection(db, 'messages'), {
        user_uid,
        from: wa_id,
        message_id: message.id,
        timestamp: message.timestamp,
        type,
        text,
        media_id,
        profile_name,
        read: false,
        direction: 'incoming',
        createdAt: serverTimestamp(),
      });

      console.log('💾 Messaggio salvato:', messageRef.id);

      // ===== SALVA NOME CONTATTO =====
      if (profile_name && profile_name !== 'Sconosciuto') {
        await setDoc(doc(db, 'contacts', wa_id), {
          name: profile_name,
          createdBy: user_uid,
          lastMessage: text.slice(0, 100),
          lastMessageAt: serverTimestamp(),
        }, { merge: true });
      }

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
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ehi-lab.it';
              const getOrderRes = await fetch(`${baseUrl}/api/get-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  order_id: orderId,
                  customer_contact: wa_id,      // numero WhatsApp come contatto
                  merchant_id: user_uid
                })
              });
              
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
          // Non bloccare il webhook se l'AI fallisce
        }

      } else if (aiEnabled && type !== 'text') {
        console.log('⏭️ Tipo messaggio non supportato da AI:', type);
      } else {
        console.log('⏸️ AI disabilitata, skip auto-reply');
      }
    }

    return new Response('Messaggi processati con successo', { status: 200 });

  } catch (error) {
    console.error('❌ Errore nel webhook:', error);
    return new Response('Errore interno: ' + error.message, { status: 500 });
  }
}

