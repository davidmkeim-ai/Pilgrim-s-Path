// Supabase Edge Function: fetches Bible passage text for a human-typed
// reference ("John 3:16") in a chosen translation. Two upstream providers,
// picked per translation -- keys live only here (Deno.env), never client-side.
//
// ESV: Crossway's api.esv.org takes a free-text reference directly.
// CSB: API.Bible (api.scripture.api.bible) needs the reference converted to
//      their USFM-style passage id (e.g. "JHN.3.16") and a bibleId resolved
//      from the CSB abbreviation.

const ESV_API_KEY = Deno.env.get('ESV_API_KEY');
const API_BIBLE_KEY = Deno.env.get('API_BIBLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// USFM 3-letter book codes, keyed by every lowercase name/alias we accept.
const BOOK_CODES: Record<string, string> = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU',
  joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH',
  ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB',
  psalm: 'PSA', psalms: 'PSA', proverbs: 'PRO', ecclesiastes: 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN',
  hosea: 'HOS', joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC',
  nahum: 'NAM', habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1 corinthians': '1CO', '2 corinthians': '2CO', galatians: 'GAL', ephesians: 'EPH',
  philippians: 'PHP', colossians: 'COL', '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB',
  james: 'JAS', '1 peter': '1PE', '2 peter': '2PE', '1 john': '1JN', '2 john': '2JN',
  '3 john': '3JN', jude: 'JUD', revelation: 'REV',
};

interface ParsedReference {
  book: string;
  chapter: string;
  startVerse?: string;
  endVerse?: string;
}

function normalizeBookName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(i|1st)\s/, '1 ')
    .replace(/^(ii|2nd)\s/, '2 ')
    .replace(/^(iii|3rd)\s/, '3 ')
    .replace(/\s+/g, ' ');
}

function parseReference(reference: string): ParsedReference | null {
  const match = reference.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;
  const [, bookRaw, chapter, startVerse, endVerse] = match;
  return { book: normalizeBookName(bookRaw), chapter, startVerse, endVerse };
}

async function lookupEsv(reference: string): Promise<string> {
  if (!ESV_API_KEY) throw new Error('ESV_API_KEY is not configured');
  const url = new URL('https://api.esv.org/v3/passage/text/');
  url.searchParams.set('q', reference);
  url.searchParams.set('include-headings', 'false');
  url.searchParams.set('include-footnotes', 'false');
  url.searchParams.set('include-verse-numbers', 'false');
  url.searchParams.set('include-short-copyright', 'false');
  url.searchParams.set('include-passage-references', 'false');

  const resp = await fetch(url, { headers: { Authorization: `Token ${ESV_API_KEY}` } });
  if (!resp.ok) throw new Error(`ESV API error: ${await resp.text()}`);
  const data = await resp.json();
  const text = (data.passages?.[0] ?? '').trim();
  if (!text) throw new Error(`No ESV text found for "${reference}"`);
  return text;
}

async function lookupCsb(reference: string): Promise<string> {
  if (!API_BIBLE_KEY) throw new Error('API_BIBLE_KEY is not configured');

  const parsed = parseReference(reference);
  if (!parsed) throw new Error(`Couldn't understand the reference "${reference}"`);
  const code = BOOK_CODES[parsed.book];
  if (!code) throw new Error(`Unknown book "${parsed.book}"`);

  const passageId = parsed.startVerse
    ? parsed.endVerse
      ? `${code}.${parsed.chapter}.${parsed.startVerse}-${code}.${parsed.chapter}.${parsed.endVerse}`
      : `${code}.${parsed.chapter}.${parsed.startVerse}`
    : `${code}.${parsed.chapter}`;

  const biblesResp = await fetch('https://api.scripture.api.bible/v1/bibles?abbreviation=CSB', {
    headers: { 'api-key': API_BIBLE_KEY },
  });
  if (!biblesResp.ok) throw new Error(`API.Bible bibles lookup error: ${await biblesResp.text()}`);
  const biblesData = await biblesResp.json();
  const bibleId = biblesData.data?.[0]?.id;
  if (!bibleId) throw new Error('Could not find a CSB Bible via API.Bible');

  const passageUrl = new URL(`https://api.scripture.api.bible/v1/bibles/${bibleId}/passages/${passageId}`);
  passageUrl.searchParams.set('content-type', 'text');
  passageUrl.searchParams.set('include-notes', 'false');
  passageUrl.searchParams.set('include-titles', 'false');
  passageUrl.searchParams.set('include-verse-numbers', 'false');
  passageUrl.searchParams.set('include-verse-spans', 'false');

  const passageResp = await fetch(passageUrl, { headers: { 'api-key': API_BIBLE_KEY } });
  if (!passageResp.ok) throw new Error(`API.Bible passage error: ${await passageResp.text()}`);
  const passageData = await passageResp.json();
  const text = (passageData.data?.content ?? '')
    // API.Bible's plain-text content-type leaves stray '#' markers (poetry line
    // breaks) and an orphan trailing comma (verse-end marker) even with
    // notes/verse-numbers/verse-spans all disabled.
    .replace(/#/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.!?]),/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/,$/, '');
  if (!text) throw new Error(`No CSB text found for "${reference}"`);
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: { reference?: string; translation?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { reference, translation } = body;
  if (!reference || !translation) {
    return json({ error: 'reference and translation are required' }, 400);
  }

  try {
    const text =
      translation === 'ESV'
        ? await lookupEsv(reference)
        : translation === 'CSB'
          ? await lookupCsb(reference)
          : null;
    if (text === null) return json({ error: `Unsupported translation "${translation}"` }, 400);
    return json({ text, reference, translation });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
