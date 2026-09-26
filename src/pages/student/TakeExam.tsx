import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import QuestionCard from "../../components/exam/QuestionCard";
import Loader from "../../components/common/Loader";
import Modal from "../../components/common/Modal";
import { useExamTimer } from "../../hooks/useExamTimer";
import { useFullscreenGuard } from "../../hooks/useFullscreenGuard";
import { getExam } from "../../services/examService";
import { getQuestionsByIds } from "../../services/questionService";
import {
  blockSubmission,
  getSubmission,
  listViolationLogs,
  saveAnswers,
  startSubmission,
  submitExam,
} from "../../services/resultService";
import { getSecuritySettings } from "../../services/settingsService";
import { hasEssay, isAnswered, scaleSubmission, totalPoints, SCORE_SCALE } from "../../utils/scoring";
import { prepareQuestionsForStudent } from "../../utils/shuffle";
import { formatSeconds } from "../../utils/formatTime";
import {
  AUTOSAVE_DEBOUNCE_MS,
  BLOCKED_MESSAGE,
  DEFAULT_MAX_VIOLATIONS,
  VIOLATION_LABEL,
} from "../../utils/constants";
import type { AnswerEntry, Exam, Question, Submission, ViolationType } from "../../types";

type StudentQ = ReturnType<typeof prepareQuestionsForStudent>[number];

export default function TakeExam() {
  const { examId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<StudentQ[]>([]);
  const [fullQuestions, setFullQuestions] = useState<Question[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerEntry>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [endMs, setEndMs] = useState<number | null>(null);
  const [violations, setViolations] = useState(0);
  const [maxViolations, setMaxViolations] = useState(DEFAULT_MAX_VIOLATIONS);
  const [started, setStarted] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);
  /** True bila ujian dilanjutkan dari sesi sebelumnya (refresh/close) — perlu cek fullscreen. */
  const resumedRef = useRef(false);

  useEffect(() => {
    if (!examId || !user) return;
    getSecuritySettings()
      .then((s) => setMaxViolations(s.maxViolations))
      .catch(() => undefined);
    let cancelled = false;
    (async () => {
      try {
        const e = await getExam(examId);
        if (!e || cancelled) {
          setLoading(false);
          return;
        }
        setExam(e);
        const qs = await getQuestionsByIds(e.questionIds);
        if (cancelled) return;
        setFullQuestions(qs);
        setQuestions(
          prepareQuestionsForStudent(qs, {
            shuffleQuestions: e.shuffleQuestions,
            shuffleOptions: e.shuffleOptions,
            studentId: user.uid,
          })
        );
        const subId = `${e.id}_${user.uid}`;
        const existing = await getSubmission(subId);
        if (cancelled) return;
        if (existing && existing.status === "blocked") {
          toast.error(BLOCKED_MESSAGE, { id: "blocked" });
          navigate("/student", { replace: true });
          return;
        }
        if (existing && existing.status !== "in_progress") {
          setSubmission(existing);
          setStarted(true);
          setLoading(false);
          return;
        }
        if (existing) {
          setSubmission(existing);
          setAnswers(existing.answers ?? {});
          let pastViolations = 0;
          try {
            pastViolations = (await listViolationLogs(existing.id)).length;
          } catch {
            /* offline — hitungan lokal mulai dari 0 */
          }
          if (cancelled) return;
          setViolations(pastViolations);
          setStarted(true);
          resumedRef.current = true;
          const start = existing.startedAt?.toDate?.().getTime() ?? Date.now();
          setEndMs(start + e.duration * 60_000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, user, navigate]);

  const forceSubmit = useCallback(async () => {
    if (!submission || !exam || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const scaled = scaleSubmission(fullQuestions, answersRef.current);
      await submitExam(submission.id, {
        answers: answersRef.current,
        objectiveScore: scaled.objectiveScore,
        essayScore: scaled.essayScore,
        finalScore: scaled.finalScore,
        totalPoints: scaled.totalPoints,
        needsGrading: hasEssay(fullQuestions),
      });
      toast.success("Ujian dikirim otomatis");
      navigate("/student/results");
    } catch {
      submittingRef.current = false;
      toast.error("Gagal mengirim — coba lagi");
    }
  }, [submission, exam, fullQuestions, navigate]);

  const handleViolation = useCallback((count: number, type: ViolationType) => {
    setViolations(count);
    toast.error(`${VIOLATION_LABEL[type] ?? type}! Pelanggaran ke-${count}`, { id: "violation" });
  }, []);

  const blockingRef = useRef(false);
  /** Max pelanggaran tercapai → ubah status jadi "blocked" lalu lempar ke dasbor. */
  const blockMe = useCallback(async () => {
    if (!submission || blockingRef.current) return;
    blockingRef.current = true;
    try {
      try {
        await saveAnswers(submission.id, answersRef.current);
      } catch {
        /* offline — jawaban terakhir dari autosave tetap dipakai */
      }
      await blockSubmission(submission.id);
      // Status lokal dulu → guard nonaktif, keluar fullscreen tidak dicatat sebagai pelanggaran baru.
      setSubmission((s) => (s ? { ...s, status: "blocked" } : s));
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      toast.error(BLOCKED_MESSAGE, { id: "blocked" });
      navigate("/student", { replace: true });
    } catch {
      blockingRef.current = false;
      toast.error("Gagal memblokir — coba lagi");
    }
  }, [submission, navigate]);

  const guard = useFullscreenGuard({
    active: started && submission?.status === "in_progress",
    submissionId: submission?.id ?? null,
    initialCount: violations,
    maxViolations,
    onViolation: handleViolation,
    onBlocked: blockMe,
  });

  // Setelah refresh/close, browser keluar fullscreen — catat sebagai pelanggaran
  // dan tampilkan banner "Kembali fullscreen" (requestFullscreen butuh gesture user).
  const { report: reportViolation } = guard;
  useEffect(() => {
    if (!started || submission?.status !== "in_progress") return;
    if (!resumedRef.current) return;
    const t = window.setTimeout(() => {
      if (!resumedRef.current) return;
      resumedRef.current = false;
      if (!document.fullscreenElement) void reportViolation("fullscreen_exit");
    }, 800);
    return () => window.clearTimeout(t);
  }, [started, submission?.status, reportViolation]);

  const { remaining } = useExamTimer({ endMs, onExpire: forceSubmit });

  async function begin() {
    if (!exam || !user) return;
    setStarting(true);
    try {
      const res = await startSubmission(exam, user.uid, SCORE_SCALE);
      setSubmission(res.data);
      setStarted(true);
      const startedAt = res.data.startedAt?.toDate?.().getTime() ?? Date.now();
      setEndMs(startedAt + exam.duration * 60_000);
      guard.enterFullscreen();
      toast.success(res.created ? "Ujian dimulai" : "Lanjutkan ujian");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai ujian");
    } finally {
      setStarting(false);
    }
  }

  const flushSave = useCallback(async () => {
    if (!submission || !dirtyRef.current || submittingRef.current) return;
    dirtyRef.current = false;
    try {
      await saveAnswers(submission.id, answersRef.current);
      setSavedAt(new Date());
    } catch {
      dirtyRef.current = true;
    }
  }, [submission]);

  useEffect(() => {
    if (!started || !submission) return;
    const id = window.setInterval(() => {
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      void flushSave();
    };
  }, [started, submission, flushSave]);

  function setAnswer(value: string) {
    const q = questions[idx];
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: { ...a[q.id], value } }));
    dirtyRef.current = true;
    void flushSave();
  }

  async function doSubmit() {
    if (!submission || !exam || submittingRef.current) return;
    if (unansweredIdx.length > 0) {
      toast.error(`Masih ada ${unansweredIdx.length} soal belum dijawab`);
      setConfirmSubmit(true);
      return;
    }
    submittingRef.current = true;
    try {
      await flushSave();
      const scaled = scaleSubmission(fullQuestions, answersRef.current);
      const needs = hasEssay(fullQuestions);
      await submitExam(submission.id, {
        answers: answersRef.current,
        objectiveScore: scaled.objectiveScore,
        essayScore: scaled.essayScore,
        finalScore: scaled.finalScore,
        totalPoints: scaled.totalPoints,
        needsGrading: needs,
      });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      toast.success(needs ? "Ujian terkirim — menunggu koreksi esai" : "Ujian terkirim");
      if (exam?.showResultAfterSubmit) navigate("/student/results");
      else navigate("/student/schedule");
    } catch {
      submittingRef.current = false;
      toast.error("Gagal submit");
    }
  }

  // Realtime flag dari monitoring guru (force submit)
  useEffect(() => {
    if (!submission) return;
    const unsub = onSnapshot(doc(db, "submissions", submission.id), (snap) => {
      const data = snap.data() as Submission | undefined;
      if (data && data.status !== "in_progress" && submission.status === "in_progress") {
        if (data.status === "blocked") {
          toast.error(BLOCKED_MESSAGE, { id: "blocked" });
          navigate("/student", { replace: true });
        } else {
          toast("Ujianmu telah dikirim oleh guru.", { icon: "⚠️" });
          navigate("/student/results");
        }
      }
    });
    return unsub;
  }, [submission?.id, submission?.status, navigate, submission]);

  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(q, answers)).length,
    [questions, answers]
  );

  const unansweredIdx = questions
    .map((q, i) => (isAnswered(q, answers) ? -1 : i))
    .filter((i) => i >= 0);

  if (loading) return <Loader full label="Menyiapkan ujian…" />;

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-lg p-8 text-center">
          <p className="text-sm text-ink-mute">Ujian tidak ditemukan.</p>
          <Link to="/student/schedule" className="btn-secondary mt-4">Kembali ke jadwal</Link>
        </div>
      </div>
    );
  }

  if (submission && submission.status === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-lg p-8 text-center">
          <p className="text-sm text-signal">{BLOCKED_MESSAGE}</p>
          <Link to="/student" className="btn-primary mt-4">Ke Dasbor</Link>
        </div>
      </div>
    );
  }

  if (submission && submission.status !== "in_progress") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-lg p-8 text-center">
          <p className="text-base font-semibold">Ujian sudah selesai dikirim.</p>
          <Link to="/student/results" className="btn-primary mt-4">Lihat hasil</Link>
        </div>
      </div>
    );
  }

  if (!started || !submission) {
    const now = Date.now();
    const start = exam.startTime?.toDate?.()?.getTime() ?? 0;
    const end = exam.endTime?.toDate?.()?.getTime() ?? 0;
    const inWindow = now >= start && now <= end;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="card p-6">
            <div className="font-mono text-xs tracking-widest text-brass">UJIAN</div>
            <h1 className="mt-2 text-xl font-bold">{exam.title}</h1>
            <ul className="mt-4 space-y-2 text-sm text-ink-mute">
              <li>Durasi: <strong className="text-ink font-mono">{exam.duration} menit</strong></li>
              <li>Jumlah soal: <strong className="text-ink font-mono">{fullQuestions.length}</strong></li>
              <li>Total poin: <strong className="text-ink font-mono">{totalPoints(fullQuestions)}</strong></li>
              <li>Layar akan dipaksa fullscreen — keluar akan tercatat.</li>
            </ul>
            {!inWindow && (
              <p className="mt-4 rounded-sm border border-brass/40 bg-brass-soft/50 p-3 text-sm">
                Ujian belum dibuka atau sudah lewat jendela waktu.
              </p>
            )}
            <button type="button" className="btn-brass mt-6 w-full" disabled={!inWindow || starting} onClick={begin}>
              {starting ? "Menyiapkan…" : "Mulai ujian"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[idx];

  return (
    <div className="min-h-screen bg-paper" onCopy={(e) => e.preventDefault()}>
      <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-ink-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{exam.title}</div>
          <div className="font-mono text-[10px] text-ink-mute">
            {answeredCount}/{questions.length} terjawab
            {savedAt ? ` · tersimpan ${savedAt.toLocaleTimeString("id-ID")}` : ""}
            {violations > 0 ? ` · pelanggaran ${violations}` : ""}
          </div>
        </div>
        <div className={`font-mono text-2xl font-semibold tabular-nums ${remaining < 60 ? "text-signal" : "text-ink"}`}>
          {formatSeconds(remaining)}
        </div>
        <button type="button" className="btn-danger" onClick={() => setConfirmSubmit(true)}>
          <Send className="h-4 w-4" /> Kumpulkan
        </button>
      </div>

      {guard.warning && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sm border border-signal/40 bg-signal-soft p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-signal" />
          {guard.warning}
          <button type="button" className="btn-danger ml-auto !py-1 text-xs" onClick={guard.backToFullscreen}>
            Kembali fullscreen
          </button>
        </div>
      )}

      {q && (
        <QuestionCard
          key={q.id}
          question={q}
          index={idx}
          total={questions.length}
          answer={answers[q.id]}
          onChange={setAnswer}
        />
      )}

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap justify-center gap-1">
          {questions.map((qq, i) => (
            <button
              key={qq.id}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-8 w-8 rounded-sm border font-mono text-xs ${
                i === idx
                  ? "border-ink bg-ink text-paper"
                  : isAnswered(qq, answers)
                    ? "border-brass bg-brass-soft text-ink"
                    : "border-ink-line bg-paper-card text-ink-mute"
              }`}
              aria-label={`Soal ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-md gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Sebelumnya
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={idx === questions.length - 1}
            onClick={() => setIdx((i) => i + 1)}
          >
            Berikutnya <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Modal
        open={confirmSubmit}
        title={unansweredIdx.length > 0 ? "Soal belum lengkap" : "Kumpulkan ujian?"}
        description={
          unansweredIdx.length > 0
            ? `${unansweredIdx.length} soal masih belum dijawab`
            : "Jawaban dikunci setelah dikumpulkan"
        }
        onClose={() => setConfirmSubmit(false)}
      >
        {unansweredIdx.length > 0 ? (
          <>
            <p className="text-sm text-ink-mute">
              Semua soal wajib dijawab sebelum mengumpulkan. Klik nomor soal untuk langsung
              mengerjakan:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {unansweredIdx.map((i) => (
                <button
                  key={questions[i].id}
                  type="button"
                  onClick={() => {
                    setIdx(i);
                    setConfirmSubmit(false);
                  }}
                  className="h-9 w-9 rounded-sm border border-signal bg-signal-soft font-mono text-xs font-semibold text-signal"
                  aria-label={`Ke soal ${i + 1}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setConfirmSubmit(false)}>
                Kembali mengerjakan
              </button>
              <button type="button" className="btn-danger" disabled>
                Ya, kumpulkan
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-mute">
              Pastikan semua soal sudah dijawab. Setelah dikumpulkan, jawaban tidak bisa diubah
              {hasEssay(fullQuestions) ? " dan menunggu koreksi esai." : "."}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setConfirmSubmit(false)}>
                Lanjut mengerjakan
              </button>
              <button type="button" className="btn-danger" onClick={doSubmit}>
                Ya, kumpulkan
              </button>
            </div>
          </>
        )}
      </Modal>
      </div>
    </div>
  );
}
