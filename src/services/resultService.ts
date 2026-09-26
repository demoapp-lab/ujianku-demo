import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AnswerEntry, Exam, Question, Submission, SubmissionLog, ViolationType } from "../types";
import { scaleSubmission } from "../utils/scoring";

const col = collection(db, "submissions");

export function submissionId(examId: string, studentId: string) {
  return `${examId}_${studentId}`;
}

/** Cek/buat submission dalam transaction agar tidak duplikat saat double-click / refresh. */
export async function startSubmission(exam: Exam, studentId: string, totalPoints: number) {
  const id = submissionId(exam.id, studentId);
  const ref = doc(db, "submissions", id);

  const result = await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      return {
        created: false as const,
        data: { id, ...(existing.data() as Omit<Submission, "id">) },
      };
    }
    const answers: Record<string, AnswerEntry> = {};
    const payload = {
      examId: exam.id,
      studentId,
      answers,
      objectiveScore: 0,
      totalPoints,
      status: "in_progress" as const,
      startedAt: serverTimestamp(),
    };
    tx.set(ref, payload);
    return {
      created: true as const,
      data: {
        id,
        ...payload,
        startedAt: new Date() as never,
      } as Submission,
    };
  });
  return { id, ...result };
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const snap = await getDoc(doc(db, "submissions", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Submission, "id">) };
}

export async function saveAnswers(
  id: string,
  answers: Record<string, AnswerEntry>,
  extra: Partial<Submission> = {}
) {
  await updateDoc(doc(db, "submissions", id), { answers, ...extra });
}

export async function submitExam(
  id: string,
  payload: {
    answers: Record<string, AnswerEntry>;
    objectiveScore: number;
    essayScore?: number;
    finalScore?: number;
    totalPoints: number;
    needsGrading: boolean;
  }
) {
  await updateDoc(doc(db, "submissions", id), {
    answers: payload.answers,
    objectiveScore: payload.objectiveScore,
    essayScore: payload.essayScore ?? 0,
    finalScore: payload.finalScore ?? payload.objectiveScore,
    totalPoints: payload.totalPoints,
    status: payload.needsGrading ? "pending_grading" : "graded",
    submittedAt: serverTimestamp(),
    gradedAt: payload.needsGrading ? null : serverTimestamp(),
  });
}

export async function addViolationLog(submissionRefId: string, type: ViolationType, count?: number) {
  const logsRef = collection(db, "submissions", submissionRefId, "logs");
  await setDoc(doc(logsRef), { type, timestamp: serverTimestamp() });
  if (count !== undefined) {
    await updateDoc(doc(col, submissionRefId), { violationCount: count });
  }
}

/** Siswa melebihi max pelanggaran → status berubah "blocked". */
export async function blockSubmission(submissionRefId: string) {
  await updateDoc(doc(col, submissionRefId), { status: "blocked" as const });
}

/** Guru membuka blokir: status kembali mengerjakan, log & hitungan pelanggaran direset ke 0. */
export async function unblockSubmission(submissionRefId: string) {
  const logsSnap = await getDocs(collection(db, "submissions", submissionRefId, "logs"));
  const batch = writeBatch(db);
  logsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.update(doc(col, submissionRefId), { status: "in_progress" as const, violationCount: 0 });
  await batch.commit();
}

export async function listViolationLogs(submissionRefId: string): Promise<SubmissionLog[]> {
  const snap = await getDocs(
    query(collection(db, "submissions", submissionRefId, "logs"), orderBy("timestamp", "desc"), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SubmissionLog, "id">) }));
}

export async function listSubmissionsByExam(examId: string): Promise<Submission[]> {
  const snap = await getDocs(query(col, where("examId", "==", examId), limit(500)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) })) as Submission[];
}

export async function listSubmissionsByStudent(studentId: string): Promise<Submission[]> {
  const snap = await getDocs(query(col, where("studentId", "==", studentId), orderBy("submittedAt", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) })) as Submission[];
}

export async function listPendingGrading(): Promise<Submission[]> {
  const snap = await getDocs(query(col, where("status", "==", "pending_grading"), orderBy("submittedAt", "desc"), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) })) as Submission[];
}

/** Simpan semua nilai esai satu siswa sekaligus (massal). */
export async function gradeAllAnswers(
  submissionIdStr: string,
  grades: { questionId: string; finalScore: number }[],
  gradedBy: string,
  recompute: { essayScore: number; finalScore: number; done: boolean }
) {
  const ref = doc(db, "submissions", submissionIdStr);
  const snap = await getDoc(ref);
  const data = snap.data() as Submission;
  const answers = { ...(data.answers ?? {}) };
  for (const { questionId, finalScore } of grades) {
    const prev = answers[questionId];
    answers[questionId] = {
      ...(prev ?? { value: "" }),
      value: prev?.value ?? "",
      finalScore,
      gradedBy,
    };
  }
  await updateDoc(ref, {
    answers,
    essayScore: recompute.essayScore,
    finalScore: recompute.finalScore,
    ...(recompute.done ? { status: "graded", gradedAt: serverTimestamp() } : {}),
  });
}

export async function forceSubmit(submission: Submission, questions: Question[]) {
  const scaled = scaleSubmission(questions, submission.answers ?? {});
  const needsEssay = questions.some((q) => q.type === "essay");
  await updateDoc(doc(db, "submissions", submission.id), {
    objectiveScore: scaled.objectiveScore,
    essayScore: scaled.essayScore,
    finalScore: scaled.finalScore,
    totalPoints: scaled.totalPoints,
    status: needsEssay ? "pending_grading" : "graded",
    submittedAt: serverTimestamp(),
    gradedAt: needsEssay ? null : serverTimestamp(),
    isFlagged: true,
  });
}

/** Hapus satu submission (data ujian siswa). */
export async function deleteSubmission(id: string) {
  await deleteDoc(doc(db, "submissions", id));
}
