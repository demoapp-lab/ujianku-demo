import type { Question, QuestionOption, QuestionType } from "../types";
import { DIFFICULTIES, QUESTION_TYPES } from "../utils/constants";
import { generateText } from "./settingsService";

export type Difficulty = "easy" | "medium" | "hard";

/** Draft soal hasil AI — belum punya id/packageId. */
export interface GeneratedQuestion {
  type: QuestionType;
  text: string;
  points: number;
  difficulty: Difficulty;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  rubric?: string;
}

function typeSpecificRules(type: QuestionType, lang: "id" | "en", optionCount?: number): string {
  if (type === "multiple_choice") {
    const n = optionCount && optionCount >= 2 ? optionCount : 4;
    if (lang === "en") {
      return `- "options": array of exactly ${n} option strings (in English)\n- "correctIndex": 0-based index of the correct option`;
    }
    return `- "options": array tepat ${n} string opsi jawaban (bahasa Indonesia)\n- "correctIndex": integer 0-based indeks opsi yang benar`;
  }
  if (type === "true_false") {
    return lang === "en" ? `- "correctAnswer": "true" or "false"` : `- "correctAnswer": "true" atau "false"`;
  }
  if (type === "short_answer") {
    return lang === "en"
      ? `- "acceptedAnswers": array of 1–3 accepted answer variants (in English)`
      : `- "acceptedAnswers": array 1–3 variasi jawaban benar (bahasa Indonesia)`;
  }
  return lang === "en"
    ? `- "rubric": scoring rubric / correct-answer guide (in English)`
    : `- "rubric": rubrik/kunci jawaban untuk koreksi (bahasa Indonesia)`;
}

function typeLabel(t: QuestionType): string {
  return QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;
}

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES.find((x) => x.value === d)?.label ?? d;
}

export async function generateQuestions(opts: {
  subjectName: string;
  classNames: string[];
  topic: string;
  type: QuestionType;
  count: number;
  difficulty: Difficulty;
  language?: "id" | "en";
  /** Khusus pilihan ganda — jumlah opsi yang diminta (default 4). */
  optionCount?: number;
}): Promise<GeneratedQuestion[]> {
  const count = Math.max(1, Math.floor(opts.count));
  const lang = opts.language === "en" ? "en" : "id";
  const optionCount =
    opts.type === "multiple_choice"
      ? Math.max(2, Math.floor(opts.optionCount ?? 4))
      : undefined;
  const localeRules =
    lang === "en"
      ? "Language of the questions and all fields: English."
      : "Bahasa soal dan semua field: Indonesia.";

  const prompt = [
    lang === "en"
      ? "You are a CBT exam question writer for schools. " + localeRules
      : "Kamu adalah pembuat soal ujian CBT untuk sekolah Indonesia. " + localeRules,
    lang === "en"
      ? `Create exactly ${count} ${typeLabel(opts.type)} question(s).`
      : `Buat tepat ${count} soal ${typeLabel(opts.type)}.`,
    lang === "en" ? `Subject: ${opts.subjectName}.` : `Mata pelajaran: ${opts.subjectName}.`,
    lang === "en"
      ? `Classes: ${opts.classNames.join(", ") || "—"}.`
      : `Kelas: ${opts.classNames.join(", ") || "—"}.`,
    lang === "en"
      ? `Difficulty: ${difficultyLabel(opts.difficulty)}.`
      : `Tingkat kesulitan: ${difficultyLabel(opts.difficulty)}.`,
    ...(optionCount
      ? [
          lang === "en"
            ? `Each multiple-choice question must have exactly ${optionCount} options.`
            : `Setiap soal pilihan ganda harus punya tepat ${optionCount} opsi.`,
        ]
      : []),
    lang === "en" ? `Topic / material: ${opts.topic.trim()}` : `Topik / bahan soal: ${opts.topic.trim()}`,
    "",
    lang === "en" ? "Rules:" : "Aturan:",
    lang === "en"
      ? "- Each question must be clear, unique, and relevant to the topic."
      : "- Setiap soal jelas, unik, dan relevan dengan topik.",
    "- " + typeSpecificRules(opts.type, lang, optionCount),
    lang === "en"
      ? '- Every item must include: "type", "text", "points" (number, e.g. 10), "difficulty" ("easy"|"medium"|"hard").'
      : '- Setiap elemen punya field: "type", "text", "points" (angka, mis. 10), "difficulty" ("easy"|"medium"|"hard").',
    lang === "en"
      ? '- Reply with a valid JSON array only — no explanation, no markdown, no other text.'
      : '- Balas HANYA dengan JSON array valid, tanpa penjelasan, tanpa markdown, tanpa teks lain.',
    "",
    'Example object: {"type":"' + opts.type + '","text":"…","points":10,"difficulty":"' + opts.difficulty + '"}',
  ].join("\n");

  const raw = await generateText(prompt);
  return parseGenerated(raw, opts.type, count, optionCount);
}

function parseGenerated(
  raw: string,
  expectedType: QuestionType,
  count: number,
  optionCount?: number
): GeneratedQuestion[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Format respons AI tidak berupa JSON array — coba generate ulang");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Respons AI bukan JSON valid — coba generate ulang");
  }
  if (!Array.isArray(parsed)) throw new Error("Format respons AI tidak valid — coba generate ulang");

  const items: GeneratedQuestion[] = [];
  for (const entry of parsed) {
    if (items.length >= count) break;
    const q = normalizeDraft(entry, expectedType, optionCount);
    if (q) items.push(q);
  }
  if (items.length === 0) {
    throw new Error("AI tidak menghasilkan soal yang valid — coba ubah topik atau generate ulang");
  }
  return items;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function asDifficulty(v: unknown): Difficulty {
  const s = asString(v).toLowerCase();
  if (s === "easy" || s === "mudah") return "easy";
  if (s === "hard" || s === "sulit") return "hard";
  return "medium";
}

function normalizeDraft(
  entry: unknown,
  expectedType: QuestionType,
  optionCount?: number
): GeneratedQuestion | null {
  if (!entry || typeof entry !== "object") return null;
  const o = entry as Record<string, unknown>;
  const text = asString(o.text);
  if (!text) return null;

  const rawType = asString(o.type) as QuestionType | "";
  const type: QuestionType =
    rawType === "multiple_choice" ||
    rawType === "true_false" ||
    rawType === "short_answer" ||
    rawType === "essay"
      ? rawType
      : expectedType;

  const draft: GeneratedQuestion = {
    type,
    text,
    points: asNumber(o.points, 10),
    difficulty: asDifficulty(o.difficulty),
  };

  if (type === "multiple_choice") {
    const desired = optionCount && optionCount >= 2 ? optionCount : undefined;
    let opts = Array.isArray(o.options)
      ? o.options.map((x) => asString(x)).filter(Boolean)
      : [];
    if (desired) {
      if (opts.length < desired) return null;
      opts = opts.slice(0, desired);
    }
    if (opts.length < 2) return null;
    let idx = asNumber(o.correctIndex, -1);
    if (idx < 0 || idx >= opts.length) {
      const byText = opts.findIndex((x) => x === asString(o.correctAnswer));
      idx = byText >= 0 ? byText : 0;
    }
    draft.options = opts;
    draft.correctIndex = idx;
    return draft;
  }

  if (type === "true_false") {
    const a = asString(o.correctAnswer).toLowerCase();
    draft.correctAnswer = a === "true" || a === "benar" || a === "t" ? "true" : "false";
    return draft;
  }

  if (type === "short_answer") {
    const list = Array.isArray(o.acceptedAnswers)
      ? o.acceptedAnswers.map((x) => asString(x)).filter(Boolean)
      : [asString(o.correctAnswer)].filter(Boolean);
    if (list.length === 0) return null;
    draft.acceptedAnswers = list;
    draft.correctAnswer = list[0];
    return draft;
  }

  const rubric = asString(o.rubric) || asString(o.correctAnswer);
  if (!rubric) return null;
  draft.rubric = rubric;
  return draft;
}

const newOptionId = () => Math.random().toString(36).slice(2, 9);

/** Ubah draft AI menjadi payload siap simpan ke Firestore. */
export function draftToPayload(
  draft: GeneratedQuestion,
  ctx: { subjectId: string; packageId: string; classIds: string[]; createdBy: string }
): Omit<Question, "id" | "createdAt"> {
  const payload: Omit<Question, "id" | "createdAt"> = {
    subjectId: ctx.subjectId,
    packageId: ctx.packageId,
    classIds: ctx.classIds,
    createdBy: ctx.createdBy,
    type: draft.type,
    text: draft.text,
    points: draft.points > 0 ? draft.points : 10,
    difficulty: draft.difficulty,
  };

  if (draft.type === "multiple_choice") {
    const options: QuestionOption[] = (draft.options ?? []).map((text) => ({
      id: newOptionId(),
      text,
    }));
    const idx = Math.min(Math.max(draft.correctIndex ?? 0, 0), Math.max(options.length - 1, 0));
    payload.options = options;
    payload.correctAnswer = options[idx]?.id ?? "";
  } else if (draft.type === "true_false") {
    payload.options = [
      { id: "true", text: "Benar" },
      { id: "false", text: "Salah" },
    ];
    payload.correctAnswer = draft.correctAnswer === "true" ? "true" : "false";
  } else if (draft.type === "short_answer") {
    const accepted = (draft.acceptedAnswers ?? []).filter(Boolean);
    payload.acceptedAnswers = accepted;
    payload.correctAnswer = accepted[0] ?? "";
  } else {
    payload.rubric = draft.rubric ?? "";
  }

  return payload;
}
