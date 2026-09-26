import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import Badge from "../../components/common/Badge";
import { useConfirm } from "../../context/ConfirmContext";
import { listStudentSessions, resetStudentSession, studentSessionExpired } from "../../services/studentSessionService";
import type { AppUser, ClassData, StudentSession } from "../../types";
import { formatDate } from "../../utils/formatTime";

export default function LoginLog() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StudentSession[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [classByUid, setClassByUid] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessions, classSnap, userSnap] = await Promise.all([
        listStudentSessions(),
        getDocs(query(collection(db, "classes"), orderBy("name"))),
        getDocs(collection(db, "users")),
      ]);
      setRows(sessions);
      setClasses(classSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) })));
      setClassByUid(
        Object.fromEntries(
          userSnap.docs.map((d) => [d.id, ((d.data() as AppUser).classId ?? "") as string])
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal memuat log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      if (classFilter) {
        const cid = s.classId || classByUid[s.uid] || "";
        if (cid !== classFilter) return false;
      }
      return true;
    });
  }, [rows, search, classFilter, classByUid]);

  async function onReset(s: StudentSession) {
    const ok = await confirm({
      title: "Reset login siswa?",
      message: `${s.name} (${s.email}) akan dipaksa logout dan bisa login ulang dari device mana pun.`,
      subject: s.name,
      confirmLabel: "Reset sesi",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await resetStudentSession(s.uid);
      toast.success("Sesi siswa direset");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal mereset");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Log</h1>
          <p className="text-sm text-ink-mute">Sesi login siswa aktif — reset untuk memaksa logout & mengizinkan login ulang.</p>
        </div>
        <button type="button" className="btn-secondary ml-auto" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          type="search"
          placeholder="Cari nama siswa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cari nama siswa"
        />
        <select
          className="input max-w-[200px]"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          aria-label="Filter kelas"
        >
          <option value="">Semua kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(search || classFilter) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearch("");
              setClassFilter("");
            }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="th">Siswa</th>
              <th className="th">Login</th>
              <th className="th">Berlaku s.d.</th>
              <th className="th">Perangkat</th>
              <th className="th">Status</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const expired = studentSessionExpired(s);
              const cid = s.classId || classByUid[s.uid] || "";
              const className = classes.find((c) => c.id === cid)?.name;
              return (
                <tr key={s.id}>
                  <td className="td">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-ink-mute">
                      {s.email}
                      {className ? ` · ${className}` : ""}
                    </div>
                  </td>
                  <td className="td font-mono text-xs">{formatDate(s.loggedInAt)}</td>
                  <td className="td font-mono text-xs">{formatDate(s.expiresAt)}</td>
                  <td className="td max-w-[220px] truncate font-mono text-[10px] text-ink-mute" title={s.userAgent}>
                    {s.userAgent || "—"}
                  </td>
                  <td className="td">
                    <Badge tone={expired ? "default" : "success"}>{expired ? "Kedaluwarsa" : "Aktif"}</Badge>
                  </td>
                  <td className="td">
                    <button
                      type="button"
                      className="btn-danger !px-2 !py-1 text-xs"
                      disabled={busyId === s.id}
                      onClick={() => void onReset(s)}
                    >
                      <LogOut className="h-3.5 w-3.5" /> {busyId === s.id ? "Meriset…" : "Reset"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length > 0 && filtered.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={6}>
                  Tidak ada sesi yang cocok dengan pencarian/filter.
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={6}>
                  Belum ada sesi login siswa yang tercatat.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td className="td text-ink-mute" colSpan={6}>
                  Memuat…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
