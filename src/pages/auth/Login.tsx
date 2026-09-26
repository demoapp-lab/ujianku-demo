import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { useDbStatus } from "../../hooks/useDbStatus";
import SchoolLogo from "../../components/common/SchoolLogo";
import { getSchoolInfo } from "../../services/settingsService";
import { ROLE_HOME } from "../../utils/constants";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const dbStatus = useDbStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    getSchoolInfo()
      .then((info) => {
        setSchoolName(info.schoolName);
        setLogoUrl(info.logoUrl);
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login(email, password);
      toast.success("Berhasil masuk");
      navigate(ROLE_HOME[user.role] ?? "/login", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal masuk";
      toast.error(msg.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  const brand = (
    <div className="flex items-center gap-3">
      <SchoolLogo url={logoUrl} className="h-10 w-10" />
      <div>
        <div className="text-sm font-bold">Ujianku</div>
        {schoolName.trim() && (
          <div className="text-xs text-ink-mute lg:text-paper/70">{schoolName.trim()}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-10 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <SchoolLogo url={logoUrl} className="h-12 w-12" />
          <div>
            <div className="font-mono text-xs tracking-widest text-brass-soft">UJIANKU</div>
            {schoolName.trim() && (
              <div className="mt-1 text-sm font-semibold text-paper/80">{schoolName.trim()}</div>
            )}
          </div>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">
            Ruang ujian digital untuk sekolah.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper/70">
            Bank soal, penjadwalan, pengerjaan berfullscreen, dan koreksi esai —
            satu alur untuk admin, guru, dan siswa.
          </p>
        </div>
        <div
          className="flex items-center gap-2 font-mono text-xs text-paper/60"
          role="status"
          aria-live="polite"
          title="Status koneksi database"
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              dbStatus === "connected"
                ? "bg-emerald-400"
                : dbStatus === "disconnected"
                  ? "bg-red-400"
                  : "bg-paper/40"
            }`}
          />
          {dbStatus === "checking" ? "Memeriksa…" : dbStatus === "connected" ? "Tersambung" : "Terputus"}
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">{brand}</div>
          <h2 className="text-2xl font-bold">Masuk</h2>
          <p className="mt-1 text-sm text-ink-mute">
            Gunakan akun yang diberikan sekolah.
            {schoolName.trim() ? ` ${schoolName.trim()}.` : ""}
          </p>

          <div className="mt-6">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@sekolah.sch.id"
            />
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="password">
              Kata sandi
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
