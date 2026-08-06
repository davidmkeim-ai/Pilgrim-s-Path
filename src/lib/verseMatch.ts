export interface WordResult {
  word: string;
  matched: boolean;
}

export interface VerseMatchResult {
  /** 0-100 */
  score: number;
  words: WordResult[];
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Aligns the spoken transcript against the target verse text using an LCS-based
 * word alignment, so word order/skips matter but minor filler words don't tank
 * the whole match. Returns a 0-100 score plus per-target-word matched flags for
 * highlighting misses in the UI.
 */
export function scoreVerseAttempt(targetText: string, transcript: string): VerseMatchResult {
  const target = normalizeWords(targetText);
  const spoken = normalizeWords(transcript);

  if (target.length === 0) {
    return { score: 0, words: [] };
  }

  const dp: number[][] = Array.from({ length: target.length + 1 }, () =>
    new Array(spoken.length + 1).fill(0)
  );

  for (let i = 1; i <= target.length; i++) {
    for (let j = 1; j <= spoken.length; j++) {
      if (target[i - 1] === spoken[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedIndices = new Set<number>();
  let i = target.length;
  let j = spoken.length;
  while (i > 0 && j > 0) {
    if (target[i - 1] === spoken[j - 1]) {
      matchedIndices.add(i - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const words: WordResult[] = target.map((word, index) => ({
    word,
    matched: matchedIndices.has(index),
  }));

  const score = Math.round((dp[target.length][spoken.length] / target.length) * 100);

  return { score, words };
}
