import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/common/Badge";
import { getExam } from "../../services/examService";
import { listSubmissionsByStudent } from "../../services/resultService";
import type { Exam, Submission } from "../../types";
import { SUBMISSION_STATUS_LABEL } from "../../utils/constants";
import { formatDate } from "../../utils/formatTime";

const TONE: Record<Submission["status"], "default" | "warning" | "info" | "success" | "danger"> = {
  in_progress: "info",
  blocked: "danger",
  submitted: "warning",
  pending_grading: "warning",
  graded: "success",
};

export default function StudentResults() {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ sub: Submission; exam: Exam | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const subs = await listSubmissionsByStudent(user.uid);
        const withExams = await Promise.all(
          subs.map(async (sub) => ({ sub, exam: await getExam(sub.examId) }))
        );
        setRows(withExams);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <div>
      <h1 className="text-xl font-bold">Hasil Saya</h1>
      <p className="text-sm text-ink-mute">Nilai ujian yang sudah kamu kerjakan.</p>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr>
              <th className="th">Ujian</th>
              <th className="th">Dikirim</th>
              <th className="th">Status</th>
              <th className="th text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sub, exam }) => (
              <tr key={sub.id}>
                <td className="td font-medium">{exam?.title ?? sub.examId}</td>
                <td className="td font-mono text-xs">{formatDate(sub.submittedAt)}</td>
                <td className="td">
                  <Badge tone={TONE[sub.status]}>{SUBMISSION_STATUS_LABEL[sub.status]}</Badge>
                </td>
                <td className="td text-right font-mono text-base font-semibold">
                  {exam?.showResultAfterSubmit || sub.status === "graded"
                    ? `${sub.finalScore ?? sub.objectiveScore ?? 0}`
                    : "—"}
                  <span className="text-xs font-normal text-ink-mute"> / {sub.totalPoints || 100}</span>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={4}>
                  Belum ada ujian yang dikerjakan.{" "}
                  <Link to="/student/schedule" className="underline">Lihat jadwal</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (
        <p className="mt-4 font-mono text-[10px] text-ink-mute">
          Riwayat diambil dari Firestore · limit 50
        </p>
      )}
    </div>
  );
}
