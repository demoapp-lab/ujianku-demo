import type { Question, QuestionOption } from "../types";

/** Mulberry32 PRNG berbasis seed agar shuffle konsisten antar reload. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function prepareQuestionsForStudent(
  questions: Question[],
  opts: { shuffleQuestions: boolean; shuffleOptions: boolean; studentId: string }
): (Omit<Question, "correctAnswer" | "acceptedAnswers" | "rubric"> & {
  options?: QuestionOption[];
})[] {
  const seed = hashSeed(opts.studentId);
  let list = [...questions];
  if (opts.shuffleQuestions) list = seededShuffle(list, seed);

  return list.map((q) => {
    const { correctAnswer: _c, acceptedAnswers: _a, rubric: _r, ...rest } = q;
    let options = rest.options;
    if (opts.shuffleOptions && options) options = seededShuffle(options, seed + q.id.length);
    return { ...rest, options };
  });
}
