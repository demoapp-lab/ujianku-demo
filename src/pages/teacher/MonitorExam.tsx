import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { onSnapshot, collection, query, where, limit, getDoc, doc } from "firebase/firestore";
import toast from "react-hot-toast";
import { Flag, LockOpen, ShieldAlert, ArrowRightCircle } from "lucide-react";
import { db } from "../../lib/firebase";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import Loader from "../../components/common/Loader";
import { useConfirm } from "../../context/ConfirmContext";
import { getExam } from "../../services/examService";
import { getQuestionsByIds } from "../../services/questionService";
import { forceSubmit, listViolationLogs, unblockSubmission } from "../../services/resultService";
import type { Exam, Question, Submission, SubmissionLog } from "../../types";
import { SUBMISSION_STATUS_LABEL, VIOLATION_LABEL } from "../../utils/constants";
import { formatDate, formatSeconds } from "../../utils/formatTime";

type Row = {
  sub: Submission;
  name: string;
  lastQ: number;
  remainSec: number | null;
  violationCount: number;
};

export default function MonitorExam() {
  const confirm = useConfirm();
  const { examId } = useParams();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [logsFor, setLogsFor] = useState<{ id: string; name: string } | null>(null);
  const [logs, setLogs] = useState<SubmissionLog[]>([]);
  const [loading, setLoading] = useState(true);
  /** Cache hitungan log untuk submission lama yang belum punya field violationCount. */
  const legacyLogsCount = useRef(new Map<string, number>());

  useEffect(() => {
    if (!examId) return;
    getExam(examId).then(async (e) => {
      setExam(e);
      if (e) {
        const qs = await getQuestionsByIds(e.questionIds);
        setQuestions(qs);
      }
      setLoading(false);
    });
  }, [examId]);

  useEffect(() => {
    if (!examId) return;
    const q = query(collection(db, "submissions"), where("examId", "==", examId), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const subs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) })) as Submission[];
      void (async () => {
        const uids = [...new Set(subs.map((s) => s.studentId))];
        const map: Record<string, string> = {};
        await Promise.all(
          uids.map(async (uid) => {
            try {
              const s = await getDoc(doc(db, "users", uid));
              if (s.exists()) map[uid] = (s.data() as { name: string }).name;
            } catch {
              map[uid] = uid.slice(0, 8);
            }
          })
        );
        // Submission lama belum punya violationCount → hitung dari log (sekali saja per id).
        await Promise.all(
          subs.map(async (sub) => {
            if (typeof sub.violationCount === "number") return;
            const cached = legacyLogsCount.current.get(sub.id);
            if (cached !== undefined) return;
            try {
              const logsList = await listViolationLogs(sub.id);
              legacyLogsCount.current.set(sub.id, logsList.length);
            } catch {
              legacyLogsCount.current.set(sub.id, sub.isFlagged ? 1 : 0);
            }
          })
        );
        const now = Date.now();
        setRows(
          subs.map((sub) => {
            const start = sub.startedAt?.toDate?.().getTime() ?? now;
            const remain =
              sub.status === "in_progress" && exam
                ? Math.max(0, Math.floor((start + exam.duration * 60_000 - now) / 1000))
                : null;
            const answered = Object.values(sub.answers ?? {}).filter((a) => a?.value).length;
            return {
              sub,
              name: map[sub.studentId] ?? sub.studentId.slice(0, 8),
              lastQ: answered,
              remainSec: remain,
              violationCount:
                sub.violationCount ??
                legacyLogsCount.current.get(sub.id) ??
                (sub.isFlagged ? 1 : 0),
            };
          })
        );
      })();
    });
    return unsub;
  }, [examId, exam]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.sub.status !== "in_progress" && r.sub.status !== "blocked").length;
    const active = rows.filter((r) => r.sub.status === "in_progress").length;
    const flagged = rows.filter((r) => r.sub.isFlagged).length;
    return { total: rows.length, done, active, flagged };
  }, [rows]);

  async function openLogs(id: string, name: string) {
    setLogsFor({ id, name });
    setLogs(await listViolationLogs(id));
  }

  if (loading) return <Loader full label="Memuat monitor…" />;
  if (!exam) return <div className="card p-6">Ujian tidak ditemukan.</div>;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-signal" aria-hidden />
            <span className="font-mono text-xs tracking-widest text-signal">LIVE</span>
          </div>
          <h1 className="mt-1 text-xl font-bold">{exam.title}</h1>
          <p className="text-sm text-ink-mute">Pantau realtime — {questions.length} soal</p>
        </div>
        <Link to="/teacher/exams" className="btn-secondary ml-auto">
          Kembali
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["TERDAFTAR", stats.total],
          ["SEDANG MENGERJAKAN", stats.active],
          ["SUDAH SUBMIT", stats.done],
          ["TANDAI FLAG", stats.flagged],
        ].map(([label, val]) => (
          <div key={label as string} className="card p-3">
            <div className="font-mono text-[10px] text-ink-mute">{label}</div>
            <div className="font-mono text-2xl font-semibold">{val as number}</div>
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">Siswa</th>
              <th className="th">Status</th>
              <th className="th">Progres</th>
              <th className="th">Sisa waktu</th>
              <th className="th">Pelanggaran</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sub.id}>
                <td className="td font-medium">{r.name}</td>
                <td className="td">
                  <Badge
                    tone={
                      r.sub.status === "blocked"
                        ? "danger"
                        : r.sub.status === "in_progress"
                          ? "info"
                          : r.sub.status === "pending_grading"
                            ? "warning"
                            : "success"
                    }
                  >
                    {SUBMISSION_STATUS_LABEL[r.sub.status]}
                  </Badge>
                </td>
                <td className="td font-mono text-xs">
                  {r.lastQ}/{exam.questionIds.length} soal
                </td>
                <td className="td font-mono text-xs">
                  {r.remainSec !== null ? formatSeconds(r.remainSec) : "—"}
                </td>
                <td className="td">
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-xs ${
                      r.violationCount > 0 ? "text-signal" : "text-ink-mute"
                    }`}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> {r.violationCount}
                    {r.sub.isFlagged && <Flag className="h-3.5 w-3.5" />}
                  </span>
                </td>
                <td className="td">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1 text-xs"
                      onClick={() => openLogs(r.sub.id, r.name)}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Log
                    </button>
                    {r.sub.status === "blocked" && (
                      <button
                        type="button"
                        className="btn-secondary !px-2 !py-1"
                        title="Buka blokir"
                        aria-label="Buka blokir"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Buka blokir siswa?",
                            message:
                              "Status kembali menjadi Sedang mengerjakan. Log pelanggaran dihapus dan hitungan dimulai dari 0.",
                            subject: r.name,
                            confirmLabel: "Buka blokir",
                            tone: "warning",
                          });
                          if (!ok) return;
                          try {
                            await unblockSubmission(r.sub.id);
                            toast.success("Blokir dibuka — siswa bisa melanjutkan ujian");
                          } catch {
                            toast.error("Gagal membuka blokir");
                          }
                        }}
                      >
                        <LockOpen className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {r.sub.status === "in_progress" && (
                      <button
                        type="button"
                        className="btn-danger !px-2 !py-1 text-xs"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Paksa submit ujian?",
                            message:
                              "Jawaban siswa dikunci dan dinilai sesuai progres saat ini. Tindakan ini tidak bisa dibatalkan.",
                            subject: r.name,
                            confirmLabel: "Paksa submit",
                            tone: "warning",
                          });
                          if (!ok) return;
                          await forceSubmit(r.sub, questions);
                          toast.success("Force-submit dikirim");
                        }}
                      >
                        <ArrowRightCircle className="h-3.5 w-3.5" /> Submit
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={6}>
                  Belum ada siswa yang memulai ujian ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!logsFor} title={`Log pelanggaran — ${logsFor?.name ?? ""}`} onClose={() => setLogsFor(null)}>
        {logs.length === 0 ? (
          <p className="text-sm text-ink-mute">Tidak ada pelanggaran tercatat.</p>
        ) : (
          <ul className="divide-y divide-ink-line/60">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span>{VIOLATION_LABEL[l.type] ?? l.type}</span>
                <span className="font-mono text-xs text-ink-mute">{formatDate(l.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
