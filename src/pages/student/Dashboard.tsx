import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function StudentDashboard() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-xl font-bold">Halo, {user?.name?.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-ink-mute">Periksa jadwal ujianmu hari ini.</p>
      <Link
        to="/student/schedule"
        className="card mt-6 flex items-center gap-3 p-5 hover:border-ink"
      >
        <CalendarClock className="h-5 w-5 text-brass" />
        <div>
          <div className="text-sm font-semibold">Lihat jadwal ujian</div>
          <div className="text-xs text-ink-mute">Ujian aktif dan yang akan datang</div>
        </div>
      </Link>
    </div>
  );
}
