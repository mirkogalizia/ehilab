import { NextResponse } from 'next/server';

export async function POST(req) {
  const { name, category, language, bodyText, waba_id } = await req.json();

  if (!name || !category || !language || !bodyText || !waba_id) {
    return NextResponse.json({ error: 'Campi mancanti' }, { status: 400 });
  }

  try {
    const token = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;

    const res = await fetch(`https://graph.facebook.com/v17.0/${waba_id}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category,
        language,
        parameter_format: 'POSITIONAL',
        allow_category_change: false,
        components: [
          {
            type: 'BODY',
            text: bodyText,
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data }, { status: res.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
