// app/api/save-media-firebase/route.js
import { NextResponse } from "next/server";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import fetch from "node-fetch";

let app;
if (!getApps().length) {
  app = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
} else {
  app = getApp();
}
const bucket = getStorage(app).bucket();

export async function POST(req) {
  try {
    const { mediaId, fileName, mimeType } = await req.json();
    if (!mediaId || !fileName) {
      return NextResponse.json({ error: "Missing mediaId or fileName" }, { status: 400 });
    }

    const metaToken = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN;

    // 1. Ottieni l'URL del file da Meta
    const urlMeta = `https://graph.facebook.com/v17.0/${mediaId}?fields=url&messaging_product=whatsapp`;
    const urlRes = await fetch(urlMeta, {
      headers: { Authorization: `Bearer ${metaToken}` }
    });
    const urlData = await urlRes.json();
    if (!urlData.url) {
      return NextResponse.json({ error: "No url from Meta", details: urlData }, { status: 400 });
    }

    // 2. Scarica il file binario da Meta
    const fileRes = await fetch(urlData.url, {
      headers: { Authorization: `Bearer ${metaToken}` }
    });
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Unable to download media", details: await fileRes.text() }, { status: 400 });
    }
    const arrayBuffer = await fileRes.arrayBuffer();

    // 3. Carica su Firebase Storage nella cartella 'media-and-file'
    const destination = `media-and-file/${Date.now()}_${fileName}`;
    const file = bucket.file(destination);

    await file.save(Buffer.from(arrayBuffer), {
      contentType: mimeType || fileRes.headers.get("content-type") || undefined,
      public: true,
      metadata: {
        cacheControl: "public,max-age=31536000",
      },
    });

    // 4. Ottieni l'URL pubblico
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return NextResponse.json({ publicUrl }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message, details: err.stack }, { status: 500 });
  }
}
