import { useEffect, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="font-mono text-[10px] tracking-wider text-ink-mute">{label}</div>
      <div className="mt-1 font-mono text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({
    teachers: 0,
    students: 0,
    classes: 0,
    subjects: 0,
    packages: 0,
  });

  useEffect(() => {
    async function load() {
      const [u, c, s, p] = await Promise.all([
        getDocs(query(collection(db, "users"), limit(1000))),
        getDocs(query(collection(db, "classes"), limit(1000))),
        getDocs(query(collection(db, "subjects"), limit(1000))),
        getDocs(query(collection(db, "questionPackages"), limit(1000))),
      ]);
      let teachers = 0;
      let students = 0;
      u.forEach((d) => {
        const role = d.data().role;
        if (role === "teacher") teachers += 1;
        else if (role === "student") students += 1;
      });
      setCounts({
        teachers,
        students,
        classes: c.size,
        subjects: s.size,
        packages: p.size,
      });
    }
    load().catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold">Dasbor Admin</h1>
      <p className="mt-1 text-sm text-ink-mute">Selamat bertugas, {user?.name}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="GURU" value={counts.teachers} />
        <Stat label="SISWA" value={counts.students} />
        <Stat label="PAKET SOAL" value={counts.packages} />
        <Stat label="KELAS" value={counts.classes} />
        <Stat label="MATA PELAJARAN" value={counts.subjects} />
      </div>
    </div>
  );
}
