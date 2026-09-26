import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/common/Badge";
import { listPublishedExamsForClass } from "../../services/examService";
import { getSubmission, listSubmissionsByStudent, submissionId } from "../../services/resultService";
import { BLOCKED_MESSAGE } from "../../utils/constants";
import { formatDate } from "../../utils/formatTime";
import type { ClassData, Exam, Subject } from "../../types";

type ExamState = "upcoming" | "live" | "ended";

function stateOf(e: Exam): ExamState {
  const now = Date.now();
  const start = e.startTime?.toDate?.()?.getTime() ?? 0;
  const end = e.endTime?.toDate?.()?.getTime() ?? 0;
  if (now < start) return "upcoming";
  if (now <= end) return "live";
  return "ended";
}

const STATE_LABEL: Record<ExamState, { label: string; tone: "warning" | "success" | "default" }> = {
  upcoming: { label: "Akan datang", tone: "warning" },
  live: { label: "Sedang berlangsung", tone: "success" },
  ended: { label: "Selesai", tone: "default" },
};

export default function ExamSchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [className, setClassName] = useState("");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.classId) return;
    listPublishedExamsForClass(user.classId).then(setExams).catch(() => undefined);
    listSubmissionsByStudent(user.uid)
      .then((subs) => {
        setDoneIds(
          new Set(
            subs
              .filter((s) => s.status !== "in_progress" && s.status !== "blocked")
              .map((s) => s.examId)
          )
        );
        setBlockedIds(new Set(subs.filter((s) => s.status === "blocked").map((s) => s.examId)));
      })
      .catch(() => undefined);
    getDocs(query(collection(db, "subjects"), orderBy("name"))).then((s) =>
      setSubjects(Object.fromEntries(s.docs.map((d) => [d.id, (d.data() as Subject).name])))
    );
    getDocs(collection(db, "classes")).then((c) => {
      const found = c.docs.find((d) => d.id === user.classId);
      if (found) setClassName((found.data() as ClassData).name);
    });
  }, [user]);

  async function enterExam(exam: Exam) {
    if (!user) return;
    try {
      const sub = await getSubmission(submissionId(exam.id, user.uid));
      if (sub?.status === "blocked") {
        toast.error(BLOCKED_MESSAGE, { id: "blocked" });
        return;
      }
    } catch {
      /* offline — biarkan TakeExam yang cek ulang */
    }
    navigate(`/student/exam/${exam.id}`);
  }

  const sorted = useMemo(
    () =>
      exams
        .filter((e) => !doneIds.has(e.id))
        .sort((a, b) => {
          const order: Record<ExamState, number> = { live: 0, upcoming: 1, ended: 2 };
          return order[stateOf(a)] - order[stateOf(b)];
        }),
    [exams, doneIds]
  );

  return (
    <div>
      <h1 className="text-xl font-bold">Jadwal Ujian</h1>
      <p className="text-sm text-ink-mute">
        {className ? `Kelas ${className}` : "Ujian yang dijadwalkan untuk kelasmu."}
      </p>

      <div className="mt-4 space-y-3">
        {sorted.map((e) => {
          const st = stateOf(e);
          const { label, tone } = STATE_LABEL[st];
          return (
            <div key={e.id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold">{e.title}</h2>
                  <Badge tone={tone}>{label}</Badge>
                  {blockedIds.has(e.id) && <Badge tone="danger">Terblokir</Badge>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {subjects[e.subjectId] ?? "Mapel"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> {formatDate(e.startTime)} — {formatDate(e.endTime)}
                  </span>
                  <span className="font-mono">{e.duration} menit · {e.questionIds.length} soal</span>
                </p>
              </div>
              {st === "live" ? (
                <button type="button" className="btn-brass" onClick={() => void enterExam(e)}>
                  Masuk ujian
                </button>
              ) : st === "ended" ? (
                <span className="btn-secondary cursor-not-allowed opacity-60">Waktu habis</span>
              ) : (
                <span className="btn-secondary cursor-not-allowed opacity-60">Belum dibuka</span>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="card p-8 text-center text-sm text-ink-mute">
            Belum ada ujian untuk kelasmu. Cek lagi nanti.
          </div>
        )}
      </div>
    </div>
  );
}
