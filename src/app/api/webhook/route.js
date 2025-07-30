import { NextResponse } from "next/server";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp, getApps, getApp } from "firebase/app";

// 🔥 Prende le ENV giuste (assicurati che siano queste, come hai in Vercel!)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const storage = getStorage(app);

export async function POST(req) {
  try {
    const { mediaId, fileName, mimeType } = await req.json();
    console.log("🔥 REQUEST BODY", { mediaId, fileName, mimeType });

    // 1. Recupera la URL privata dal Graph
    const waRes = await fetch(
      `https://graph.facebook.com/v17.0/${mediaId}?fields=url`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
        },
      }
    );
    const waData = await waRes.json();
    console.log("🔥 waData:", waData);

    const url = waData.url;
    if (!url) throw new Error("Media url not found!");

    // 2. Scarica il file binario da WhatsApp
    const mediaRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
      },
    });
    const buffer = await mediaRes.arrayBuffer();
    console.log("🔥 buffer length:", buffer.byteLength);

    // 3. Upload su Firebase Storage
    const ext = fileName.split('.').pop() || (mimeType.includes('image') ? 'jpg' : 'bin');
    const storageRef = ref(storage, `media/${mediaId}-${Date.now()}.${ext}`);
    await uploadBytes(storageRef, new Uint8Array(buffer), { contentType: mimeType });

    // 4. Ottieni URL pubblico
    const publicUrl = await getDownloadURL(storageRef);
    console.log("🔥 publicUrl:", publicUrl);

    return NextResponse.json({ publicUrl }, { status: 200 });
  } catch (error) {
    console.error("❌ Errore save-media-firebase:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
