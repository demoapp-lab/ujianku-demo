import { useEffect, useState } from "react";
import { collection, getDocs, where, query } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Download, Eye, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmContext";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { listExamsByTeacher } from "../../services/examService";
import { deleteSubmission, listSubmissionsByExam } from "../../services/resultService";
import { getQuestionsByIds } from "../../services/questionService";
import type { Exam, Question, Submission } from "../../types";

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Pilihan Ganda",
  true_false: "Benar / Salah",
  short_answer: "Isian Singkat",
  essay: "Esai",
};

export default function TeacherResults() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [subs, setSubs] = useState<Submission[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewSub, setViewSub] = useState<Submission | null>(null);
  const [viewQuestions, setViewQuestions] = useState<Question[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  async function loadSubs(id: string) {
    if (!id) return;
    const list = await listSubmissionsByExam(id);
    setSubs(list.filter((s) => s.status !== "in_progress" && s.status !== "blocked"));
    const map: Record<string, string> = {};
    await Promise.all(
      list.map(async (s) => {
        const snap = await getDocs(
          query(collection(db, "users"), where("__name__", "==", s.studentId))
        );
        const d = snap.docs[0];
        if (d) map[s.studentId] = (d.data() as { name: string }).name;
        else map[s.studentId] = s.studentId.slice(0, 8);
      })
    );
    setNames(map);
  }

  useEffect(() => {
    if (!user) return;
    listExamsByTeacher(user.uid).then((list) => {
      setExams(list);
      if (list[0]) setExamId(list[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!examId) return;
    loadSubs(examId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function openAnswers(s: Submission) {
    setViewSub(s);
    setViewLoading(true);
    try {
      const exam = exams.find((e) => e.id === s.examId);
      const qs = exam ? await getQuestionsByIds(exam.questionIds) : [];
      setViewQuestions(qs);
    } finally {
      setViewLoading(false);
    }
  }

  async function handleDelete(s: Submission) {
    const name = names[s.studentId] ?? s.studentId;
    const ok = await confirm({
      title: "Hapus data ujian siswa ini?",
      message: "Jawaban dan nilai siswa pada ujian ini akan dihapus permanen.",
      subject: name,
      confirmLabel: "Hapus data",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSubmission(s.id);
      toast.success("Data ujian siswa dihapus");
      await loadSubs(examId);
    } catch {
      toast.error("Gagal menghapus data");
    }
  }

  function answerDisplay(s: Submission | null, q: Question): string {
    if (!s) return "—";
    const a = s.answers[q.id];
    const raw = a?.value ?? "";
    if (!raw) return "—";
    if (q.type === "multiple_choice") {
      const opt = q.options?.find((o) => o.id === raw);
      return opt?.text ?? raw;
    }
    if (q.type === "true_false") return raw === "true" ? "Benar" : "Salah";
    return raw;
  }

  function isCorrect(s: Submission | null, q: Question): boolean | null {
    if (!s || q.type === "essay") return null;
    const a = s.answers[q.id];
    if (!a?.value) return null;
    if (q.type === "multiple_choice" || q.type === "true_false") {
      return a.value === q.correctAnswer;
    }
    if (q.type === "short_answer") {
      const accepted = (q.acceptedAnswers?.length ? q.acceptedAnswers : [q.correctAnswer ?? ""])
        .map((x) => x.toLowerCase().trim());
      return accepted.includes(a.value.toLowerCase().trim());
    }
    return null;
  }

  const chartData = subs.map((s) => ({
    name: (names[s.studentId] ?? s.studentId).slice(0, 12),
    nilai: s.finalScore ?? s.objectiveScore ?? 0,
  }));

  function exportCsv() {
    const header = "Nama,StudentId,Objektif,Esai,Final,Status\n";
    const body = subs
      .map((s) =>
        [
          `"${names[s.studentId] ?? s.studentId}"`,
          s.studentId,
          s.objectiveScore,
          s.essayScore ?? 0,
          s.finalScore ?? s.objectiveScore,
          s.status,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nilai-${examId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const avg =
    subs.length > 0
      ? subs.reduce((a, b) => a + (b.finalScore ?? b.objectiveScore ?? 0), 0) / subs.length
      : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Rekap Nilai</h1>
          <p className="text-sm text-ink-mute">Per ujian, per kelas.</p>
        </div>
        <button type="button" className="btn-secondary ml-auto" onClick={exportCsv} disabled={!subs.length}>
          <Download className="h-4 w-4" /> Ekspor CSV
        </button>
      </div>

      <select className="input mt-4 max-w-md" value={examId} onChange={(e) => setExamId(e.target.value)}>
        {exams.map((e) => (
          <option key={e.id} value={e.id}>{e.title}</option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="font-mono text-[10px] text-ink-mute">DINILAI</div>
          <div className="font-mono text-2xl font-semibold">{subs.filter((s) => s.status === "graded").length}</div>
        </div>
        <div className="card p-3">
          <div className="font-mono text-[10px] text-ink-mute">RATA-RATA (0–100)</div>
          <div className="font-mono text-2xl font-semibold">{avg.toFixed(1)}</div>
        </div>
        <div className="card p-3">
          <div className="font-mono text-[10px] text-ink-mute">PERLU KOREKSI</div>
          <div className="font-mono text-2xl font-semibold">
            {subs.filter((s) => s.status === "pending_grading").length}
          </div>
        </div>
      </div>

      <div className="card mt-4 p-4" style={{ height: 280 }}>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#C9D2CC" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="nilai" fill="#0C2E24" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-ink-mute">
            Belum ada submission untuk ujian ini.
          </p>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">Siswa</th>
              <th className="th text-right">Objektif</th>
              <th className="th text-right">Esai</th>
              <th className="th text-right">Final</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td className="td">{names[s.studentId] ?? s.studentId}</td>
                <td className="td text-right font-mono">{s.objectiveScore}</td>
                <td className="td text-right font-mono">{s.essayScore ?? 0}</td>
                <td className="td text-right font-mono font-semibold">{s.finalScore ?? s.objectiveScore}</td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1"
                      title="Lihat jawaban"
                      aria-label="Lihat jawaban"
                      onClick={() => openAnswers(s)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !px-2 !py-1 hover:!border-signal hover:!text-signal"
                      title="Hapus data ujian siswa"
                      aria-label="Hapus data ujian siswa"
                      onClick={() => handleDelete(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={5}>Belum ada data nilai.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-ink-mute">
        Menampilkan data hasil ujian terpilih — maksimal 500 submission per ujian.
      </p>

      <Modal
        open={!!viewSub}
        wide
        title={`Jawaban — ${viewSub ? (names[viewSub.studentId] ?? viewSub.studentId) : ""}`}
        description={
          viewSub
            ? `Objektif ${viewSub.objectiveScore} · Esai ${viewSub.essayScore ?? 0} · Final ${viewSub.finalScore ?? viewSub.objectiveScore} · ${
                viewSub.status === "graded" ? "Selesai dinilai" : viewSub.status === "pending_grading" ? "Menunggu koreksi" : viewSub.status
              }`
            : undefined
        }
        onClose={() => {
          setViewSub(null);
          setViewQuestions([]);
        }}
      >
        {!viewSub ? null : viewLoading ? (
          <p className="text-sm text-ink-mute">Memuat soal…</p>
        ) : (
          <div className="space-y-4">
            {viewQuestions.map((q, i) => {
              const a = viewSub.answers[q.id];
              const correct = isCorrect(viewSub, q);
              return (
                <div key={q.id} className="rounded-sm border border-ink-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-mute">
                      #{i + 1} · {TYPE_LABEL[q.type] ?? q.type} · {q.points} poin
                    </span>
                    <div className="flex items-center gap-2">
                      {correct === true && <Badge tone="success">Benar</Badge>}
                      {correct === false && <Badge tone="danger">Salah</Badge>}
                      {q.type === "essay" && a?.finalScore !== undefined && (
                        <Badge tone="info">Skor: {a.finalScore}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{q.text}</p>
                  <div className="mt-2 rounded-sm border border-ink-line/60 bg-white p-3 text-sm whitespace-pre-wrap">
                    <span className="text-xs text-ink-mute">Jawaban siswa: </span>
                    {answerDisplay(viewSub, q)}
                    {q.type === "essay" && a?.autoFeedback && (
                      <p className="mt-2 text-xs text-brass">AI: {a.autoFeedback}</p>
                    )}
                  </div>
                  {q.rubric && q.type === "essay" && (
                    <p className="mt-2 rounded-sm bg-paper p-2 text-xs text-ink-mute">
                      Rubrik: {q.rubric}
                    </p>
                  )}
                </div>
              );
            })}
            {viewQuestions.length === 0 && (
              <p className="text-sm text-ink-mute">Soal tidak ditemukan.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
