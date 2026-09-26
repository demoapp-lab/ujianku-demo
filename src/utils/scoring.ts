import type { AnswerEntry, Question } from "../types";

/** Nilai akhir selalu skala 0–100, bukan total poin mentah. */
export const SCORE_SCALE = 100;

/** Konversi poin mentah → skala 0–100: (poin benar / total poin paket) × 100. */
export function toScale(points: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((points / total) * SCORE_SCALE);
}

export function scoreObjective(
  questions: Question[],
  answers: Record<string, AnswerEntry>
): number {
  let total = 0;
  for (const q of questions) {
    const value = answers[q.id]?.value ?? "";
    if (!value) continue;
    if (q.type === "multiple_choice" || q.type === "true_false") {
      if (value === q.correctAnswer) total += q.points;
    } else if (q.type === "short_answer") {
      const accepted = (q.acceptedAnswers?.length ? q.acceptedAnswers : [q.correctAnswer ?? ""])
        .map((s) => s.toLowerCase().trim());
      if (accepted.includes(value.toLowerCase().trim())) total += q.points;
    }
  }
  return total;
}

export function scoreEssayRaw(
  questions: Question[],
  answers: Record<string, AnswerEntry>
): number {
  return questions
    .filter((q) => q.type === "essay")
    .reduce((sum, q) => sum + (answers[q.id]?.finalScore ?? 0), 0);
}

/** Skor submission 0–100 dari poin mentah objektif + esai. */
export function scaleSubmission(
  questions: Question[],
  answers: Record<string, AnswerEntry>
): { objectiveScore: number; essayScore: number; finalScore: number; totalPoints: number } {
  const total = totalPoints(questions);
  const rawObj = scoreObjective(questions, answers);
  const rawEssay = scoreEssayRaw(questions, answers);
  return {
    objectiveScore: toScale(rawObj, total),
    essayScore: toScale(rawEssay, total),
    finalScore: toScale(rawObj + rawEssay, total),
    totalPoints: SCORE_SCALE,
  };
}

export function hasEssay(questions: Question[]): boolean {
  return questions.some((q) => q.type === "essay");
}

export function totalPoints(questions: Question[]): number {
  return questions.reduce((sum, q) => sum + q.points, 0);
}

export function isAnswered(q: Question, answers: Record<string, AnswerEntry>): boolean {
  return Boolean((answers[q.id]?.value ?? "").trim());
}
