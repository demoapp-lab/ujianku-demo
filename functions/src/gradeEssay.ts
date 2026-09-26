import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminField, db } from "./firebaseAdmin";

async function gradeEssayWithGemini(
  questionText: string,
  rubric: string,
  studentAnswer: string,
  maxPoints: number
): Promise<{ score: number; feedback: string }> {
  const settings = (await db.doc("settings/aiConfig").get()).data();
  if (!settings?.geminiApiKey) throw new Error("Gemini API key belum diatur di Settings");

  const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: settings.geminiModel ?? "gemini-2.5-flash" });

  const prompt = `
Kamu adalah penilai esai ujian sekolah Indonesia.
Soal: "${questionText}"
Kunci jawaban/rubrik: "${rubric}"
Jawaban siswa: """${studentAnswer}"""
Poin maksimal: ${maxPoints}
Balas HANYA dalam format JSON: {"score": number, "feedback": string}
Skor antara 0 dan ${maxPoints}. Feedback dalam Bahasa Indonesia, maksimal 1 kalimat.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(text) as { score: number; feedback: string };
  return {
    score: Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0)),
    feedback: String(parsed.feedback ?? ""),
  };
}

export const gradeEssay = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login diperlukan");
  const { submissionId, examId } = (request.data ?? {}) as {
    submissionId?: string;
    examId?: string;
  };
  if (!submissionId || !examId) {
    throw new HttpsError("invalid-argument", "submissionId & examId wajib");
  }

  try {
    const examSnap = await db.doc(`exams/${examId}`).get();
    if (!examSnap.exists) throw new HttpsError("not-found", "Exam not found");
    const exam = examSnap.data()!;
    const mode = (exam.essayGradingMode as string) ?? "hybrid";
    if (mode === "manual") return { success: true, mode, skipped: true };

    const subRef = db.doc(`submissions/${submissionId}`);
    const subSnap = await subRef.get();
    if (!subSnap.exists) throw new HttpsError("not-found", "Submission not found");
    const sub = subSnap.data()!;

    const qSnaps = await Promise.all(
      (exam.questionIds as string[]).map((id) => db.doc(`questions/${id}`).get())
    );
    const questions = qSnaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...s.data() } as Record<string, unknown> & { id: string }));

    const answers: Record<string, Record<string, unknown>> = { ...(sub.answers ?? {}) };
    let anyGraded = false;

    for (const q of questions) {
      if (q.type !== "essay") continue;
      const ans = answers[q.id] ?? {};
      const value = String(ans.value ?? "");
      if (!value.trim()) {
        answers[q.id] = { ...ans, autoScore: 0, finalScore: 0, gradedBy: "system" };
        anyGraded = true;
        continue;
      }
      if (mode === "hybrid" && ans.autoScore !== undefined) continue;

      try {
        const { score, feedback } = await gradeEssayWithGemini(
          String(q.text ?? ""),
          String(q.rubric ?? ""),
          value,
          Number(q.points ?? 0)
        );
        answers[q.id] = {
          ...ans,
          autoScore: score,
          autoFeedback: feedback,
          ...(mode === "auto" ? { finalScore: score, gradedBy: "system" } : {}),
        };
        anyGraded = true;
      } catch (err) {
        logger.error("grade essay question", err);
      }
    }

    const essayQuestions = questions.filter((q) => q.type === "essay");
    const rawEssay = essayQuestions.reduce(
      (a, q) => a + Number(answers[q.id]?.finalScore ?? 0),
      0
    );
    let rawObjective = 0;
    let totalPoin = 0;
    for (const q of questions) {
      const points = Number(q.points ?? 0);
      totalPoin += points;
      if (q.type === "essay") continue;
      const ans = answers[q.id] ?? {};
      const value = String(ans.value ?? "").toLowerCase().trim();
      if (!value) continue;
      if (q.type === "multiple_choice" || q.type === "true_false") {
        if (value === String(q.correctAnswer ?? "").toLowerCase().trim()) rawObjective += points;
      } else if (q.type === "short_answer") {
        const accepted = (
          Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length
            ? (q.acceptedAnswers as string[])
            : [String(q.correctAnswer ?? "")]
        ).map((s) => String(s).toLowerCase().trim());
        if (accepted.includes(value)) rawObjective += points;
      }
    }
    const toScale = (p: number) => (totalPoin > 0 ? Math.round((p / totalPoin) * 100) : 0);
    const objectiveScore = toScale(rawObjective);
    const essayScore = toScale(rawEssay);
    const finalScore = toScale(rawObjective + rawEssay);

    if (mode === "auto") {
      await subRef.update({
        answers,
        objectiveScore,
        essayScore,
        finalScore,
        totalPoints: 100,
        status: "graded",
        gradedAt: adminField.serverTimestamp(),
      });
    } else {
      await subRef.update({
        answers,
        objectiveScore,
        essayScore,
        finalScore,
        totalPoints: 100,
        ...(anyGraded ? { status: "pending_grading" } : {}),
      });
    }

    return { success: true, mode, anyGraded };
  } catch (err) {
    logger.error("gradeEssay", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err instanceof Error ? err.message : "failed");
  }
});
