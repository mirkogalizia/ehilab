import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

export async function POST(req) {
  try {
    const body = await req.json();

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phone_number_id = value?.metadata?.phone_number_id;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    if (!phone_number_id || messages.length === 0) {
      return new Response("No messages to process", { status: 200 });
    }

    // Trova l'utente associato al phone_number_id
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone_number_id', '==', phone_number_id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('Nessun utente trovato per questo phone_number_id:', phone_number_id);
      return new Response('Utente non trovato', { status: 200 });
    }

    const userDoc = querySnapshot.docs[0];
    const user_uid = userDoc.id;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const contact = contacts?.[i];
      const wa_id = contact?.wa_id || message.from;
      const profile_name = contact?.profile?.name || "";

      let text = message.text?.body || '';
      let media_id = '';
      let type = message.type;

      // Se è media, salva media_id (WhatsApp ti manda l'id lato inbound)
      if (message.type === 'image' && message.image?.id) {
        media_id = message.image.id;
      } else if (message.type === 'document' && message.document?.id) {
        media_id = message.document.id;
        text = message.document.filename || 'Documento allegato';
      }

      await addDoc(collection(db, 'messages'), {
        user_uid,
        from: wa_id,
        message_id: message.id,
        timestamp: message.timestamp,
        type,
        text,
        media_id,
        profile_name,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Salva nome contatto per filtro frontend
      if (profile_name) {
        await setDoc(doc(db, 'contacts', wa_id), {
          name: profile_name,
          createdBy: user_uid,
        }, { merge: true });
      }
    }

    return new Response('Messaggi salvati', { status: 200 });
  } catch (error) {
    console.error('❌ Errore nel webhook:', error);
    return new Response('Errore interno', { status: 500 });
  }
}
