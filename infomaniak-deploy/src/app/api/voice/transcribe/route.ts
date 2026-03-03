import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY manquant dans les variables d environnement' },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const audio = formData.get('audio');
    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'Fichier audio manquant' }, { status: 400 });
    }

    const upstreamForm = new FormData();
    const filename = (audio as any).name || 'recording.webm';
    upstreamForm.append('file', audio as Blob, filename);
    upstreamForm.append('model', 'whisper-1');
    upstreamForm.append('language', 'fr');

    const openAiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstreamForm,
    });

    const raw = await openAiResponse.text();
    if (!openAiResponse.ok) {
      return NextResponse.json(
        { error: `OpenAI transcription error: ${raw.slice(0, 400)}` },
        { status: openAiResponse.status },
      );
    }

    const data = JSON.parse(raw);
    return NextResponse.json({ text: data.text || '' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur transcription inconnue' },
      { status: 500 },
    );
  }
}
