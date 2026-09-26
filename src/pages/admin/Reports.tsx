import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { db } from "../../lib/firebase";
import { getExam } from "../../services/examService";
import type { Exam, Submission } from "../../types";
import { formatDate } from "../../utils/formatTime";
import { SUBMISSION_STATUS_LABEL } from "../../utils/constants";

export default function AdminReports() {
  const [rows, setRows] = useState<{ exam: Exam; avg: number; count: number }[]>([]);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(query(collection(db, "submissions"), where("status", "==", "graded"), limit(500)));
      const subs = snap.docs.map((d) => d.data() as Submission);
      const byExam = new Map<string, Submission[]>();
      for (const s of subs) {
        const list = byExam.get(s.examId) ?? [];
        list.push(s);
        byExam.set(s.examId, list);
      }
      const result: { exam: Exam; avg: number; count: number }[] = [];
      for (const [examId, list] of byExam) {
        const exam = await getExam(examId);
        if (!exam) continue;
        const avg = list.reduce((a, b) => a + (b.finalScore ?? 0), 0) / list.length;
        result.push({ exam, avg: Math.round(avg * 10) / 10, count: list.length });
      }
      setRows(result);
    }
    load().catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold">Laporan Nilai</h1>
      <p className="text-sm text-ink-mute">Rekap rata-rata ujian yang sudah dinilai.</p>

      <div className="card mt-4 p-4" style={{ height: 320 }}>
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((r) => ({ name: r.exam.title.slice(0, 18), avg: r.avg }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#C9D2CC" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="avg" fill="#A67B1E" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-ink-mute">
            Belum ada submission berstatus “Selesai dinilai”.
          </p>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">Ujian</th>
              <th className="th">Selesai</th>
              <th className="th">Rata-rata</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exam.id}>
                <td className="td font-medium">{r.exam.title}</td>
                <td className="td font-mono">{formatDate(r.exam.endTime)}</td>
                <td className="td font-mono">{r.avg}</td>
                <td className="td text-ink-mute">{r.count} siswa</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={4}>Belum ada data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-ink-mute">{SUBMISSION_STATUS_LABEL.graded}</p>
    </div>
  );
}
