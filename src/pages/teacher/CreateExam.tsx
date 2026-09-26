import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { createExam, getExam, updateExam } from "../../services/examService";
import { listExamBankQuestions } from "../../services/questionService";
import { QUESTION_TYPES } from "../../utils/constants";
import { toDatetimeLocalValue } from "../../utils/formatTime";
import { examClassIds } from "../../types";
import type { ClassData, Exam, Question, Subject } from "../../types";

export default function CreateExam() {
  const { examId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [bank, setBank] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const hydratedRef = useRef(false);
  const selectedTouchedRef = useRef(false);

  const [form, setForm] = useState({
    title: "",
    subjectId: "",
    classIds: [] as string[],
    duration: 60,
    startTime: toDatetimeLocalValue(new Date()),
    endTime: toDatetimeLocalValue(new Date(Date.now() + 7 * 86400000)),
    shuffleQuestions: true,
    shuffleOptions: true,
    showResultAfterSubmit: true,
    status: "draft" as Exam["status"],
  });

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "subjects"), orderBy("name"))),
      getDocs(query(collection(db, "classes"), orderBy("name"))),
    ]).then(([s, c]) => {
      const subs = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) }));
      const cls = c.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) }));
      setSubjects(subs);
      setClasses(cls);
      setForm((f) => ({
        ...f,
        subjectId: f.subjectId || subs[0]?.id || "",
        classIds: f.classIds.length ? f.classIds : cls[0] ? [cls[0].id] : [],
      }));
    });
  }, []);

  useEffect(() => {
    if (!examId) return;
    getExam(examId).then((e) => {
      if (!e) return;
      const legacy = examClassIds(e);
      setForm({
        title: e.title,
        subjectId: e.subjectId,
        classIds: legacy,
        duration: e.duration,
        startTime: toDatetimeLocalValue(e.startTime.toDate()),
        endTime: toDatetimeLocalValue(e.endTime.toDate()),
        shuffleQuestions: e.shuffleQuestions,
        shuffleOptions: e.shuffleOptions,
        showResultAfterSubmit: e.showResultAfterSubmit,
        status: e.status,
      });
      setSelected(e.questionIds);
      selectedTouchedRef.current = true;
      hydratedRef.current = true;
    });
  }, [examId]);

  const classIdsKey = form.classIds.join(",");

  useEffect(() => {
    if (!form.subjectId || form.classIds.length === 0) {
      setBank([]);
      return;
    }
    let cancelled = false;
    setBankLoading(true);
    listExamBankQuestions({ subjectId: form.subjectId, classIds: form.classIds })
      .then((items) => {
        if (cancelled) return;
        setBank(items);
        if (!examId || !hydratedRef.current || !selectedTouchedRef.current) {
          setSelected(items.map((q) => q.id));
        }
      })
      .catch(() => {
        if (!cancelled) setBank([]);
      })
      .finally(() => {
        if (!cancelled) setBankLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.subjectId, classIdsKey, examId]);

  function toggleClass(id: string) {
    selectedTouchedRef.current = true;
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
    }));
  }

  function toggleQuestion(id: string) {
    selectedTouchedRef.current = true;
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const chosen = bank.filter((q) => selected.includes(q.id));
  const totalPoin = chosen.reduce((a, b) => a + b.points, 0);

  async function save(status: Exam["status"]) {
    if (!form.title.trim()) return toast.error("Judul ujian wajib diisi");
    if (form.classIds.length === 0) return toast.error("Pilih minimal satu kelas");
    if (selected.length === 0) return toast.error("Pilih minimal satu soal");

    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        subjectId: form.subjectId,
        classIds: form.classIds,
        createdBy: user?.uid ?? "",
        questionIds: selected,
        duration: Number(form.duration),
        startTime: new Date(form.startTime) as never,
        endTime: new Date(form.endTime) as never,
        shuffleQuestions: form.shuffleQuestions,
        shuffleOptions: form.shuffleOptions,
        showResultAfterSubmit: form.showResultAfterSubmit,
        status,
      };
      if (examId) {
        await updateExam(examId, payload);
        toast.success(status === "published" ? "Ujian dipublikasikan" : "Ujian diperbarui");
      } else {
        await createExam(payload);
        toast.success(status === "published" ? "Ujian dipublikasikan" : "Ujian disimpan sebagai draf");
      }
      navigate("/teacher/exams");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{examId ? "Edit ujian" : "Buat ujian"}</h1>
        <p className="text-sm text-ink-mute">Atur soal, jadwal, dan durasi ujian.</p>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Judul ujian</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="UTS Matematika — Ganjil"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Mata pelajaran</label>
            <select
              className="input"
              value={form.subjectId}
              onChange={(e) => {
                selectedTouchedRef.current = false;
                setForm({ ...form, subjectId: e.target.value });
                setSelected([]);
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Durasi (menit)</label>
            <input
              className="input"
              type="number"
              min={5}
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Mulai</label>
            <input
              className="input"
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Selesai</label>
            <input
              className="input"
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Kelas (boleh lebih dari satu)</label>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => {
              const on = form.classIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${
                    on ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink"
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleClass(c.id)} />
                  {c.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ["shuffleQuestions", "Acak urutan soal"],
            ["shuffleOptions", "Acak opsi jawaban"],
            ["showResultAfterSubmit", "Tampilkan hasil setelah submit"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-sm border border-ink-line p-3 text-sm">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Pilih soal dari bank</h2>
          <span className="font-mono text-xs text-ink-mute">
            {selected.length} soal · {totalPoin} poin
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-mute">
          Menampilkan semua soal pada mapel &amp; kelas terpilih — otomatis tercentang, boleh dilepas.
        </p>
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {bank.map((q) => (
            <label
              key={q.id}
              className="flex cursor-pointer items-start gap-3 rounded-sm border border-ink-line p-3 hover:border-ink"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(q.id)}
                onChange={() => toggleQuestion(q.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{q.text}</p>
                <p className="font-mono text-[10px] text-ink-mute">
                  {typeLabel(q.type)} · {q.points} poin
                </p>
              </div>
            </label>
          ))}
          {bankLoading && <p className="text-sm text-ink-mute">Memuat bank soal…</p>}
          {!bankLoading && bank.length === 0 && (
            <p className="text-sm text-ink-mute">
              Belum ada soal untuk mapel &amp; kelas ini. Tambahkan lewat Bank Soal.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => save("draft")} disabled={busy}>
          Simpan draf
        </button>
        <button type="button" className="btn-brass" onClick={() => save("published")} disabled={busy}>
          {busy ? "Menyimpan…" : "Publikasikan"}
        </button>
        <Link to="/teacher/exams" className="btn-secondary ml-auto">
          Batal
        </Link>
      </div>
      <p className="font-mono text-[10px] text-ink-mute">
        {form.startTime ? format(new Date(form.startTime), "PPPP", { locale: idLocale }) : ""}
      </p>
    </div>
  );
}
