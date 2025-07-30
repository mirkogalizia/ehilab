import { db, storage } from '@/lib/firebase';
import {
  collection, addDoc, doc, setDoc, serverTimestamp, query, where, getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

    // Recupera user_uid
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone_number_id', '==', phone_number_id));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.warn('No user found:', phone_number_id);
      return new Response('Utente non trovato', { status: 200 });
    }
    const user_uid = querySnapshot.docs[0].id;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const contact = contacts?.[i];
      const wa_id = contact?.wa_id || message.from;
      const profile_name = contact?.profile?.name || "";

      let text = message.text?.body || '';
      let mediaUrl = '';

      // MEDIA: se ricevi un'immagine o un file, recupera la URL pubblica tramite Graph API + salva su Firebase Storage
      if ((message.type === 'image' || message.type === 'document') && message[message.type]?.id) {
        const mediaId = message[message.type].id;

        // 1. Recupera la url privata dal Graph
        const waRes = await fetch(
          `https://graph.facebook.com/v17.0/${mediaId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            },
          }
        );
        const waData = await waRes.json();
        const url = waData.url;
        if (!url) {
          console.error('No media url found from graph', waData);
        } else {
          // 2. Scarica il file come blob
          const mediaRes = await fetch(url, {
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
            },
          });
          const arrayBuffer = await mediaRes.arrayBuffer();
          const mimeType =
            message.type === 'image'
              ? 'image/jpeg'
              : message.document?.mime_type || 'application/octet-stream';
          const ext =
            message.type === 'image'
              ? 'jpg'
              : (message.document?.filename?.split('.').pop() || 'bin');
          const fileName = `${mediaId}-${Date.now()}.${ext}`;

          // 3. Upload su Firebase Storage
          const storagePath =
            message.type === 'image'
              ? `media/${fileName}`
              : `files/${fileName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, new Uint8Array(arrayBuffer), { contentType: mimeType });
          mediaUrl = await getDownloadURL(storageRef);

          // Metti la descrizione/nome giusto
          text =
            message.type === 'image'
              ? message.image?.caption || 'immagine'
              : message.document?.filename || 'documento';
        }
      }

      await addDoc(collection(db, 'messages'), {
        user_uid,
        from: wa_id,
        message_id: message.id,
        timestamp: Number(message.timestamp) * 1000,
        type: message.type,
        text,
        mediaUrl,
        profile_name,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Aggiorna rubrica se serve
      if (profile_name) {
        await setDoc(
          doc(db, 'contacts', wa_id),
          {
            name: profile_name,
            createdBy: user_uid,
          },
          { merge: true }
        );
      }
    }

    return new Response('Messaggi salvati', { status: 200 });
  } catch (error) {
    console.error('❌ Errore nel webhook:', error);
    return new Response('Errore interno', { status: 500 });
  }
}
