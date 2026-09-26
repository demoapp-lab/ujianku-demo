import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Save, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/common/Badge";
import Loader from "../../components/common/Loader";
import { listExamsByTeacher } from "../../services/examService";
import { getQuestionsByIds } from "../../services/questionService";
import { gradeAllAnswers, listSubmissionsByExam } from "../../services/resultService";
import { generateText } from "../../services/settingsService";
import { scaleSubmission } from "../../utils/scoring";
import type { Exam, Question, Submission } from "../../types";

function isEssayGraded(sub: Submission, essayQs: Question[]): boolean {
  return essayQs.every((q) => sub.answers[q.id]?.finalScore !== undefined);
}

function hasEssayData(sub: Submission, essayQs: Question[]): boolean {
  return essayQs.some((q) => {
    const a = sub.answers[q.id];
    return Boolean((a?.value ?? "").trim()) || a?.finalScore !== undefined;
  });
}

async function studentName(uid: string): Promise<string> {
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) return (s.data() as { name: string }).name || uid.slice(0, 8);
  } catch {
    /* ignore */
  }
  return uid.slice(0, 8);
}

interface ExamRow {
  exam: Exam;
  essayQs: Question[];
  studentCount: number;
  gradedCount: number;
}

interface StudentRow {
  sub: Submission;
  name: string;
  graded: boolean;
  gradedCount: number;
  totalEssays: number;
}

async function aiScoreEssay(
  question: Question,
  answer: string
): Promise<{ score: number; feedback: string }> {
  const prompt = [
    "Kamu adalah penilai esai ujian sekolah Indonesia.",
    `Soal: "${question.text}"`,
    `Rubrik/kunci: "${question.rubric ?? "-"}"`,
    `Poin maksimal: ${question.points}`,
    `Jawaban siswa: """${answer}"""`,
    'Balas HANYA JSON: {"score": number, "feedback": string}',
    `Skor 0–${question.points}. Feedback bahasa Indonesia maksimal 1 kalimat.`,
  ].join("\n");

  const raw = await generateText(prompt);
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Respons AI tidak valid");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    score?: number;
    feedback?: string;
  };
  const score = Math.max(0, Math.min(question.points, Number(parsed.score) || 0));
  return { score: Math.round(score), feedback: String(parsed.feedback ?? "") };
}

export default function GradeEssay() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [examRows, setExamRows] = useState<ExamRow[]>([]);
  const [studentRows, setStudentRows] = useState<StudentRow[] | null>(null);
  const [activeExam, setActiveExam] = useState<{ exam: Exam; essayQs: Question[] } | null>(null);
  const [activeStudent, setActiveStudent] = useState<{
    sub: Submission;
    name: string;
    essayQs: Question[];
    exam: Exam;
  } | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const exams = await listExamsByTeacher(user.uid);
      const rows: ExamRow[] = [];
      for (const exam of exams) {
        const questions = await getQuestionsByIds(exam.questionIds);
        const essayQs = questions.filter((q) => q.type === "essay");
        if (essayQs.length === 0) continue;
        const subs = await listSubmissionsByExam(exam.id);
        const withEssay = subs.filter(
          (s) => s.status !== "in_progress" && s.status !== "blocked" && hasEssayData(s, essayQs)
        );
        if (withEssay.length === 0) continue;
        const gradedCount = withEssay.filter((s) => isEssayGraded(s, essayQs)).length;
        rows.push({
          exam,
          essayQs,
          studentCount: withEssay.length,
          gradedCount,
        });
      }
      setExamRows(rows);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadExams().catch(() => undefined);
  }, [loadExams]);

  async function openExam(row: ExamRow) {
    setActiveExam({ exam: row.exam, essayQs: row.essayQs });
    setActiveStudent(null);
    setStudentRows(null);
    setLoading(true);
    try {
      const subs = await listSubmissionsByExam(row.exam.id);
      const withEssay = subs.filter(
        (s) => s.status !== "in_progress" && s.status !== "blocked" && hasEssayData(s, row.essayQs)
      );
      const rows: StudentRow[] = await Promise.all(
        withEssay.map(async (sub) => {
          const name = await studentName(sub.studentId);
          const gradedCount = row.essayQs.filter(
            (q) => sub.answers[q.id]?.finalScore !== undefined
          ).length;
          return {
            sub,
            name,
            graded: isEssayGraded(sub, row.essayQs),
            gradedCount,
            totalEssays: row.essayQs.length,
          };
        })
      );
      rows.sort((a, b) => Number(a.graded) - Number(b.graded));
      setStudentRows(rows);
    } finally {
      setLoading(false);
    }
  }

  function backToExams() {
    setActiveExam(null);
    setActiveStudent(null);
    setStudentRows(null);
    setScores({});
    setFeedbacks({});
    loadExams().catch(() => undefined);
  }

  function backToStudents() {
    setActiveStudent(null);
    setScores({});
    setFeedbacks({});
    if (activeExam) {
      const row = examRows.find((r) => r.exam.id === activeExam.exam.id);
      if (row) void openExam(row);
    }
  }

  function openStudent(row: StudentRow) {
    if (!activeExam) return;
    setActiveStudent({
      sub: row.sub,
      name: row.name,
      essayQs: activeExam.essayQs,
      exam: activeExam.exam,
    });
    const init: Record<string, string> = {};
    const fb: Record<string, string> = {};
    for (const q of activeExam.essayQs) {
      const a = row.sub.answers[q.id];
      if (a?.finalScore !== undefined) init[q.id] = String(a.finalScore);
      else if (a?.autoScore !== undefined) init[q.id] = String(a.autoScore);
      if (a?.autoFeedback) fb[q.id] = a.autoFeedback;
    }
    setScores(init);
    setFeedbacks(fb);
  }

  async function runAiOne(q: Question): Promise<{ score: number; feedback: string } | null> {
    if (!activeStudent) return null;
    const answer = activeStudent.sub.answers[q.id]?.value ?? "";
    if (!answer.trim()) {
      toast.error("Jawaban kosong — nilai manual saja");
      return null;
    }
    const key = `ai_${q.id}`;
    setBusyKey(key);
    try {
      const result = await aiScoreEssay(q, answer);
      setScores((s) => ({ ...s, [q.id]: String(result.score) }));
      setFeedbacks((f) => ({ ...f, [q.id]: result.feedback }));
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menilai otomatis");
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAutoOne(q: Question) {
    const r = await runAiOne(q);
    if (r) toast.success(`Saran skor: ${r.score}`);
  }

  async function handleAutoAll() {
    if (!activeStudent) return;
    const unanswered = activeStudent.essayQs.filter(
      (q) => activeStudent.sub.answers[q.id]?.finalScore === undefined
    );
    const targets = unanswered.length ? unanswered : activeStudent.essayQs;
    setBusyKey("all");
    let ok = 0;
    let failMsg: string | null = null;
    try {
      for (const q of targets) {
        const answer = activeStudent.sub.answers[q.id]?.value ?? "";
        if (!answer.trim()) {
          setScores((s) => ({ ...s, [q.id]: "0" }));
          continue;
        }
        try {
          const r = await aiScoreEssay(q, answer);
          setScores((s) => ({ ...s, [q.id]: String(r.score) }));
          setFeedbacks((f) => ({ ...f, [q.id]: r.feedback }));
          ok += 1;
        } catch (err) {
          failMsg = err instanceof Error ? err.message : "Gagal menilai dengan AI";
          break;
        }
      }
    } finally {
      setBusyKey(null);
    }
    if (failMsg) {
      toast.error(failMsg);
      toast(`${ok} saran skor dari AI sudah masuk dan tetap tersimpan. Perbaiki lalu klik Nilai Semua lagi.`, {
        icon: "ℹ️",
      });
    } else {
      toast.success(`Selesai — ${ok} jawaban dinilai AI. Periksa lalu klik Simpan Nilai.`);
    }
  }

  /** Skor valid = input terisi dan berada di rentang 0–poin soal. */
  function isScoreFilled(q: Question): boolean {
    const raw = (scores[q.id] ?? "").trim();
    if (raw === "") return false;
    const n = Number(raw);
    return !Number.isNaN(n) && n >= 0 && n <= q.points;
  }

  /** Simpan semua nilai esai siswa sekaligus (massal). */
  async function saveAll() {
    if (!activeStudent || !user) return;
    const entries: { questionId: string; finalScore: number }[] = [];
    for (const q of activeStudent.essayQs) {
      if (!isScoreFilled(q)) {
        toast.error("Masih ada soal yang belum dinilai");
        return;
      }
      entries.push({ questionId: q.id, finalScore: Number((scores[q.id] ?? "").trim()) });
    }
    setBusyKey("save_all");
    try {
      const answers = { ...activeStudent.sub.answers };
      for (const e of entries) {
        const prev = answers[e.questionId];
        answers[e.questionId] = {
          ...(prev ?? { value: "" }),
          value: prev?.value ?? "",
          finalScore: e.finalScore,
          gradedBy: user.uid,
        };
      }
      const examQuestions = await getQuestionsByIds(activeStudent.exam.questionIds);
      const scaled = scaleSubmission(examQuestions, answers);
      const done = activeStudent.essayQs.every((q) => answers[q.id]?.finalScore !== undefined);
      await gradeAllAnswers(activeStudent.sub.id, entries, user.uid, {
        essayScore: scaled.essayScore,
        finalScore: scaled.finalScore,
        done,
      });
      const essayQuestions = activeStudent.essayQs;
      const subId = activeStudent.sub.id;
      setActiveStudent((prev) =>
        prev ? { ...prev, sub: { ...prev.sub, answers } } : prev
      );
      setStudentRows((rows) =>
        rows?.map((r) =>
          r.sub.id === subId
            ? {
                ...r,
                sub: { ...r.sub, answers },
                gradedCount: essayQuestions.filter(
                  (x) => answers[x.id]?.finalScore !== undefined
                ).length,
                graded: done,
              }
            : r
        ) ?? rows
      );
      toast.success(done ? "Nilai disimpan — koreksi selesai" : "Nilai disimpan");
    } catch {
      toast.error("Gagal menyimpan nilai");
    } finally {
      setBusyKey(null);
    }
  }

  const examStatus = useMemo(() => {
    if (!examRows.length) return null;
    const pending = examRows.reduce((a, r) => a + (r.studentCount - r.gradedCount), 0);
    return pending;
  }, [examRows]);

  if (loading && !activeExam && examRows.length === 0 && !studentRows) {
    return <Loader full label="Memuat ujian berjawaban esai…" />;
  }

  // Level 3: jawaban esai per siswa
  if (activeStudent) {
    const { sub, name, essayQs, exam } = activeStudent;
    const allGraded = essayQs.every((q) => sub.answers[q.id]?.finalScore !== undefined);
    const ungradedCount = essayQs.filter((q) => !isScoreFilled(q)).length;
    const canSave = ungradedCount === 0 && busyKey === null;
    return (
      <div>
        <button type="button" className="btn-secondary mb-3" onClick={backToStudents}>
          <ChevronLeft className="h-4 w-4" /> Kembali
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{name}</h1>
          <Badge tone={allGraded ? "success" : "warning"}>
            {allGraded ? "Sudah dikoreksi" : "Belum dikoreksi"}
          </Badge>
        </div>
        <p className="text-sm text-ink-mute">{exam.title}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-brass"
            disabled={busyKey !== null}
            onClick={handleAutoAll}
          >
            {busyKey === "all" ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" /> Menilai semua…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Nilai Semua
              </>
            )}
          </button>
          <p className="self-center text-xs text-ink-mute">
            Isi skor semua soal (manual atau lewat Nilai Semua), lalu klik Simpan Nilai di bawah
            untuk menyimpan sekaligus.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {essayQs.map((q, i) => {
            const a = sub.answers[q.id];
            const saved = a?.finalScore;
            const key = q.id;
            return (
              <div key={q.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-mute">
                    Esai #{i + 1} · {q.points} poin
                  </span>
                  <div className="flex items-center gap-2">
                    {saved !== undefined ? (
                      <Badge tone="success">Sudah dinilai: {saved}</Badge>
                    ) : (
                      <Badge tone="warning">Belum dinilai</Badge>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold">{q.text}</p>
                {q.rubric && (
                  <p className="mt-1 rounded-sm bg-paper p-2 text-xs text-ink-mute">
                    Rubrik: {q.rubric}
                  </p>
                )}
                <div className="mt-2 rounded-sm border border-ink-line/60 bg-white p-3 text-sm whitespace-pre-wrap">
                  {a?.value || <em className="text-ink-mute">Tidak dijawab</em>}
                </div>
                {feedbacks[key] && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-brass">
                    <Sparkles className="h-3 w-3" /> {feedbacks[key]}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-mute" htmlFor={`score_${key}`}>
                    Skor
                  </label>
                  <input
                    id={`score_${key}`}
                    className="input max-w-24 font-mono"
                    type="number"
                    min={0}
                    max={q.points}
                    value={scores[key] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
                    placeholder={`0–${q.points}`}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyKey !== null}
                    onClick={() => handleAutoOne(q)}
                  >
                    {busyKey === `ai_${key}` ? (
                      <>
                        <Sparkles className="h-4 w-4 animate-pulse" /> AI…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> Nilai Otomatis
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-line pt-4">
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave}
            onClick={() => void saveAll()}
            title={canSave ? "Simpan semua nilai esai" : "Masih ada soal yang belum dinilai"}
          >
            <Save className="h-4 w-4" /> Simpan Nilai
          </button>
          {ungradedCount > 0 && (
            <p className="text-xs font-semibold text-signal">
              Masih ada {ungradedCount} soal yang belum dinilai
            </p>
          )}
        </div>
      </div>
    );
  }

  // Level 2: daftar siswa
  if (activeExam && studentRows) {
    return (
      <div>
        <button type="button" className="btn-secondary mb-3" onClick={backToExams}>
          <ChevronLeft className="h-4 w-4" /> Semua ujian
        </button>
        <h1 className="text-xl font-bold">{activeExam.exam.title}</h1>
        <p className="text-sm text-ink-mute">
          {studentRows.length} siswa · {activeExam.essayQs.length} soal esai
        </p>

        <div className="mt-4 space-y-3">
          {studentRows.map((row) => (
            <div key={row.sub.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{row.name}</div>
                <div className="font-mono text-[10px] text-ink-mute">
                  {row.gradedCount}/{row.totalEssays} esai dinilai
                </div>
              </div>
              <Badge tone={row.graded ? "success" : "warning"}>
                {row.graded ? "Sudah dikoreksi" : "Belum dikoreksi"}
              </Badge>
              <button type="button" className="btn-primary" onClick={() => openStudent(row)}>
                Koreksi
              </button>
            </div>
          ))}
          {studentRows.length === 0 && (
            <div className="card p-8 text-center text-sm text-ink-mute">
              Belum ada jawaban esai untuk ujian ini.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Level 1: daftar ujian
  return (
    <div>
      <h1 className="text-xl font-bold">Koreksi Esai</h1>
      <p className="text-sm text-ink-mute">
        Pilih ujian yang memiliki jawaban esai, lalu pilih siswa untuk menilai.
        {examStatus !== null && examStatus > 0 && ` ${examStatus} jawaban menunggu koreksi.`}
      </p>

      {loading && (
        <div className="mt-4">
          <Loader label="Memuat…" />
        </div>
      )}

      {!loading && examRows.length === 0 && (
        <div className="card mt-4 p-8 text-center text-sm text-ink-mute">
          Belum ada ujian dengan jawaban esai. Jawaban esai muncul di sini setelah siswa mengumpulkan ujian.
        </div>
      )}

      <div className="mt-4 space-y-3">
        {examRows.map((row) => {
          const done = row.gradedCount >= row.studentCount;
          return (
            <div key={row.exam.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{row.exam.title}</div>
                <div className="font-mono text-[10px] text-ink-mute">
                  {row.studentCount} siswa · {row.essayQs.length} soal esai ·{" "}
                  {row.gradedCount}/{row.studentCount} dikoreksi
                </div>
              </div>
              <Badge tone={done ? "success" : "warning"}>
                {done ? "Sudah Dikoreksi" : "Belum Dikoreksi"}
              </Badge>
              <button type="button" className="btn-primary" onClick={() => openExam(row)}>
                Pilih
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
