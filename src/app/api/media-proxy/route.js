// /src/app/api/media-proxy/route.js

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const media_id = searchParams.get('media_id');
  if (!media_id) {
    return new Response('media_id mancante', { status: 400 });
  }

  const token = process.env.WA_ACCESS_TOKEN || process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN;

  // 1. Ottieni URL privata media
  const metaUrl = `https://graph.facebook.com/v17.0/${media_id}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const metaJson = await metaRes.json();
  if (!metaJson.url) {
    return new Response(`Errore nel recupero URL media: ${JSON.stringify(metaJson)}`, { status: 500 });
  }

  // 2. Scarica il file vero dalla url ottenuta (sempre col token!)
  const fileRes = await fetch(metaJson.url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!fileRes.ok) {
    const err = await fileRes.text();
    return new Response(`Errore download media: ${err}`, { status: 500 });
  }

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';

  return new Response(fileRes.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
