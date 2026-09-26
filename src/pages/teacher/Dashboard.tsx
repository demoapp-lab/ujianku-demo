import { useAuth } from "../../context/AuthContext";

export default function TeacherDashboard() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-xl font-bold">Dasbor Guru</h1>
      <p className="mt-1 text-sm text-ink-mute">Selamat mengajar, {user?.name}.</p>
      <div className="card mt-6 p-6 text-sm text-ink-mute">
        Mulai dari <strong className="text-ink">Bank Soal</strong> untuk menyimpan soal,
        lalu <strong className="text-ink">Buat Ujian</strong> untuk menjadwalkannya ke kelas.
      </div>
    </div>
  );
}
