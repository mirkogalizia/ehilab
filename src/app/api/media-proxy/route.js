export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const media_id = searchParams.get('media_id');
  if (!media_id) {
    return new Response('media_id mancante', { status: 400 });
  }

  const token = process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN; // oppure usa un server env come WA_ACCESS_TOKEN

  // Chiedi l'URL del media
  const metaUrl = `https://graph.facebook.com/v17.0/${media_id}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metaRes.ok) {
    const err = await metaRes.text();
    return new Response(`Errore Meta: ${err}`, { status: 500 });
  }

  // Ottieni il contenuto (buffer)
  const buffer = await metaRes.arrayBuffer();
  const contentType = metaRes.headers.get('Content-Type') || 'application/octet-stream';

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
