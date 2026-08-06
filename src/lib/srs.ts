/**
 * SM-2 spaced repetition scheduling.
 * https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm
 */

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export const initialSrsState: SrsState = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
};

/** Map a 0-100 practice score to SM-2's 0-5 quality-of-recall scale. */
export function scoreToQuality(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  if (score >= 25) return 1;
  return 0;
}

export function nextSrsState(current: SrsState, quality: number): SrsState {
  const clampedQuality = Math.max(0, Math.min(5, quality));

  let { easeFactor, repetitions } = current;
  let intervalDays: number;

  if (clampedQuality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(current.intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor =
    easeFactor + (0.1 - (5 - clampedQuality) * (0.08 + (5 - clampedQuality) * 0.02));
  easeFactor = Math.max(1.3, easeFactor);

  return { easeFactor, intervalDays, repetitions };
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
