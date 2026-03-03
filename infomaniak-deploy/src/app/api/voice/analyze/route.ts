import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseJsonFromText(input: string): any {
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const codeBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    return JSON.parse(codeBlockMatch[1]);
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('Impossible de parser la reponse JSON IA');
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY manquant dans les variables d environnement' },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Texte manquant' }, { status: 400 });
    }

    const prompt = `
Tu extrais une demande de location depuis un texte francais.
Retourne UNIQUEMENT un JSON valide, sans texte autour, avec ce schema:
{
  "items": [{"itemId":"", "serialNumber":"", "name":"", "quantity":1}],
  "renterName": "",
  "renterEmail": "",
  "renterPhone": "",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "rentalPrice": 0,
  "rentalDeposit": 0,
  "notes": ""
}

Regles:
- "items" peut etre vide.
- quantity minimum 1.
- Si une info est absente, mettre une valeur vide/0.
- notes doit contenir le texte original.
`;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
      }),
    });

    const raw = await openAiResponse.text();
    if (!openAiResponse.ok) {
      return NextResponse.json(
        { error: `OpenAI analyze error: ${raw.slice(0, 400)}` },
        { status: openAiResponse.status },
      );
    }

    const aiData = JSON.parse(raw);
    const content = aiData?.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonFromText(content);

    return NextResponse.json({
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      renterName: String(parsed?.renterName || ''),
      renterEmail: String(parsed?.renterEmail || ''),
      renterPhone: String(parsed?.renterPhone || ''),
      startDate: String(parsed?.startDate || ''),
      endDate: String(parsed?.endDate || ''),
      rentalPrice: Number(parsed?.rentalPrice || 0),
      rentalDeposit: Number(parsed?.rentalDeposit || 0),
      notes: String(parsed?.notes || text),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur analyse inconnue' },
      { status: 500 },
    );
  }
}
