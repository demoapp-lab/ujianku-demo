import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Pencil, Radio, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmContext";
import Badge from "../../components/common/Badge";
import { deleteExam, listExamsByTeacher, publishExam, updateExam } from "../../services/examService";
import { formatDate } from "../../utils/formatTime";
import type { ClassData, Exam, Subject } from "../../types";
import { examClassIds } from "../../types";

const STATUS_TONE = {
  draft: "default" as const,
  published: "success" as const,
  closed: "danger" as const,
};

export default function ExamList() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [exams, setExams] = useState<Exam[]>([]);
  const [meta, setMeta] = useState<{ subjects: Record<string, string>; classes: Record<string, string> }>({
    subjects: {},
    classes: {},
  });

  async function load() {
    if (!user) return;
    const list = await listExamsByTeacher(user.uid);
    setExams(list);
    const [s, c] = await Promise.all([
      getDocs(query(collection(db, "subjects"), orderBy("name"))),
      getDocs(query(collection(db, "classes"), orderBy("name"))),
    ]);
    setMeta({
      subjects: Object.fromEntries(s.docs.map((d) => [d.id, (d.data() as Subject).name])),
      classes: Object.fromEntries(c.docs.map((d) => [d.id, (d.data() as ClassData).name])),
    });
  }

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Ujian</h1>
          <p className="text-sm text-ink-mute">Draf, publikasi, dan pantau ujianmu.</p>
        </div>
        <Link to="/teacher/exams/new" className="btn-primary ml-auto">
          <CalendarClock className="h-4 w-4" /> Buat ujian
        </Link>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">Judul</th>
              <th className="th">Kelas</th>
              <th className="th">Jadwal</th>
              <th className="th">Status</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e) => (
              <tr key={e.id}>
                <td className="td">
                  <div className="font-semibold">{e.title}</div>
                  <div className="text-xs text-ink-mute">
                    {meta.subjects[e.subjectId] ?? "—"} · {e.questionIds.length} soal · {e.duration} menit
                  </div>
                </td>
                <td className="td">
                  {examClassIds(e)
                    .map((id) => meta.classes[id] ?? id)
                    .join(", ") || "—"}
                </td>
                <td className="td font-mono text-xs">
                  {formatDate(e.startTime)}
                  <br />
                  {formatDate(e.endTime)}
                </td>
                <td className="td">
                  <Badge tone={STATUS_TONE[e.status]}>
                    {e.status === "draft" ? "Draf" : e.status === "published" ? "Terbit" : "Ditutup"}
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex flex-wrap gap-2">
                    {e.status === "draft" && (
                      <button
                        type="button"
                        className="btn-brass !px-2 !py-1 text-xs"
                        onClick={async () => {
                          await publishExam(e.id);
                          toast.success("Ujian dipublikasikan");
                          load();
                        }}
                      >
                        Terbitkan
                      </button>
                    )}
                    {e.status === "published" && (
                      <>
                        <Link
                          to={`/teacher/exams/${e.id}/monitor`}
                          className="btn-secondary !px-2 !py-1"
                          title="Monitor"
                          aria-label="Monitor"
                        >
                          <Radio className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          className="btn-secondary !px-2 !py-1"
                          title="Tutup"
                          aria-label="Tutup ujian"
                          onClick={async () => {
                            await updateExam(e.id, { status: "closed" });
                            toast.success("Ujian ditutup");
                            load();
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <Link to={`/teacher/exams/${e.id}/edit`} className="text-ink-mute hover:text-ink" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      className="text-ink-mute hover:text-signal"
                      aria-label="Hapus"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Hapus ujian ini?",
                          message: "Jadwal, pengerjaan, dan nilai terkait ujian ini ikut terpengaruh.",
                          subject: e.title,
                          confirmLabel: "Hapus ujian",
                          tone: "danger",
                        });
                        if (ok) {
                          await deleteExam(e.id);
                          load();
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={5}>
                  Belum ada ujian. Mulai dari “Buat ujian”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
