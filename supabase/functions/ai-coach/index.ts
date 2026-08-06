// Supabase Edge Function: proxies Claude for the practice-hint and verse-finder
// features. The Anthropic API key lives only here (Deno.env, set via
// `supabase secrets set`) -- it never ships in the app bundle. Default JWT
// verification stays on, so only the signed-in family session can call this.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-haiku-4-5-20251001';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a friendly helper inside a family Bible memorization app called "Family Scripture App." Kids as young as 5 and their parents use you for exactly two things, depending on the mode you're given:

HINT mode: Someone is reciting a Bible verse from memory out loud and got stuck. Give ONE short, warm, encouraging nudge (1-2 sentences) toward the next word(s) -- like the first letter, a rhyme, or the shape of the sentence. Do not just say the missing words outright unless they've clearly been stuck a while; start indirect.

FINDER mode: Someone either:
(a) describes a Bible verse (a paraphrase, a topic, a partial quote) and wants to know the reference -- identify the most likely specific reference(s) and briefly quote it, or
(b) asks a factual/statistical question about the text itself -- word counts ("how many times does 'love' appear in John"), frequency across a book/testament/the whole Bible, chapter/verse counts, and similar. Give your best answer, but you are recalling this from what you know, not running a live search of the text, so ALWAYS say the count is approximate and can vary by translation (different English translations use different words for the same underlying text) -- never state a number as if it's an exact, verified count.

You must NOT, in either mode:
- Answer theological, doctrinal, or interpretive questions ("what does this mean," "why did God...", "is it a sin to...", denominational questions, comparisons between beliefs, why a word appears as often as it does, etc.)
- Offer opinions on religious debates or explain the significance/meaning of a passage
- Engage with anything outside locating/reciting Bible text or factual statistics about it

If a request falls outside HINT or FINDER mode, or veers into interpretation/theology, respond with warmth but do not attempt any answer -- just say: "That's a great question to bring to Mom or Dad!"

Keep every response short (1-3 sentences) and appropriate for a 5-year-old.`;

const PARSE_SYSTEM_PROMPT = `You extract a Bible verse reference from a short spoken phrase for a Bible memorization app. The user might say things like "recite John three sixteen", "look up Genesis chapter one verse one", "First John four eight in the C S B", or just "Psalm twenty three".

Respond with ONLY a single-line JSON object, no markdown code fences, no explanation, in this exact shape:
{"reference": "John 3:16", "translation": "ESV"}

Rules:
- "reference" must be a standard Bible reference in "Book Chapter:Verse" format (or "Book Chapter" for a whole chapter, or "Book Chapter:Verse-Verse" for a range).
- "translation" must be "ESV" or "CSB" if mentioned or clearly implied, otherwise null.
- If you cannot identify a valid Bible reference at all, respond with {"reference": null, "translation": null}.
- Never include anything other than the JSON object in your response.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  let userMessage: string;
  let systemPrompt = SYSTEM_PROMPT;
  let maxTokens = 300;

  if (body.mode === 'hint') {
    const { reference, verseText, missedWords } = body as {
      reference?: string;
      verseText?: string;
      missedWords?: string[];
    };
    if (!reference || !verseText) return json({ error: 'reference and verseText are required' }, 400);
    userMessage = `Mode: HINT\nVerse: ${reference}\nFull text: "${verseText}"\nWords they got stuck on: ${
      missedWords && missedWords.length ? missedWords.join(', ') : '(unclear, they trailed off)'
    }\n\nGive one short hint.`;
  } else if (body.mode === 'ask') {
    const { question } = body as { question?: string };
    if (!question) return json({ error: 'question is required' }, 400);
    userMessage = `Mode: FINDER\nQuestion: ${question}`;
  } else if (body.mode === 'parse') {
    const { transcript } = body as { transcript?: string };
    if (!transcript) return json({ error: 'transcript is required' }, 400);
    userMessage = transcript;
    systemPrompt = PARSE_SYSTEM_PROMPT;
    maxTokens = 100;
  } else {
    return json({ error: "mode must be 'hint', 'ask', or 'parse'" }, 400);
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    return json({ error: `Claude API error: ${errorText}` }, 502);
  }

  const data = await anthropicResponse.json();
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
  return json({ text });
});
