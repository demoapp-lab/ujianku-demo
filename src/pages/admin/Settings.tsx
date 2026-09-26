import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Plug, Save, School, Shield } from "lucide-react";
import toast from "react-hot-toast";
import SchoolLogo from "../../components/common/SchoolLogo";
import {
  getAiSettingsStatus,
  getSchoolInfo,
  getSecuritySettings,
  listGeminiModels,
  saveAiSettings,
  saveSchoolInfo,
  saveSecuritySettings,
  testGeminiConnection,
} from "../../services/settingsService";
import type { AiConfigStatus, GeminiModel } from "../../types";
import { DEFAULT_MAX_VIOLATIONS } from "../../utils/constants";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [aiStatus, setAiStatus] = useState<AiConfigStatus | null>(null);
  const [busyAi, setBusyAi] = useState(false);
  const [testing, setTesting] = useState(false);

  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busySchool, setBusySchool] = useState(false);

  const [uaList, setUaList] = useState("");
  const [allowMultipleLogin, setAllowMultipleLogin] = useState(true);
  const [maxViolations, setMaxViolations] = useState(DEFAULT_MAX_VIOLATIONS);
  const [busySecurity, setBusySecurity] = useState(false);

  useEffect(() => {
    getAiSettingsStatus()
      .then(setAiStatus)
      .catch(() => undefined);
    getSchoolInfo()
      .then((info) => {
        setSchoolName(info.schoolName);
        setLogoUrl(info.logoUrl);
      })
      .catch(() => undefined);
    getSecuritySettings()
      .then((s) => {
        setUaList(s.allowedUserAgents.join("\n"));
        setAllowMultipleLogin(s.allowMultipleLogin);
        setMaxViolations(s.maxViolations);
      })
      .catch(() => undefined);
  }, []);

  async function loadModels() {
    try {
      const list = await listGeminiModels(apiKey);
      setModels(list);
      if (list.length && !model) setModel(list[0].name);
      if (list.length) toast.success(`Berhasil memuat ${list.length} model`);
    } catch (err) {
      setModels([]);
      toast.error(err instanceof Error ? err.message : "Gagal memuat daftar model");
    }
  }

  async function onSaveAi(e: FormEvent) {
    e.preventDefault();
    setBusyAi(true);
    try {
      await saveAiSettings(apiKey, model);
      setApiKey("");
      const status = await getAiSettingsStatus();
      setAiStatus(status);
      toast.success("Pengaturan AI disimpan");
      loadModels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal menyimpan");
    } finally {
      setBusyAi(false);
    }
  }

  async function onTest() {
    setTesting(true);
    try {
      const res = await testGeminiConnection({ apiKey, model });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Test gagal");
    } finally {
      setTesting(false);
    }
  }

  async function onSaveSchool(e: FormEvent) {
    e.preventDefault();
    setBusySchool(true);
    try {
      await saveSchoolInfo({ schoolName, logoUrl });
      toast.success("Data sekolah disimpan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal menyimpan");
    } finally {
      setBusySchool(false);
    }
  }

  async function onSaveSecurity(e: FormEvent) {
    e.preventDefault();
    setBusySecurity(true);
    try {
      const list = uaList.split("\n").map((s) => s.trim()).filter(Boolean);
      await saveSecuritySettings({
        allowedUserAgents: [...new Set(list)],
        allowMultipleLogin,
        maxViolations,
      });
      setUaList([...new Set(list)].join("\n"));
      toast.success("Pengaturan keamanan disimpan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal menyimpan");
    } finally {
      setBusySecurity(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold">Pengaturan</h1>
      </div>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <School className="h-5 w-5 text-brass" /> Data Sekolah
        </h2>
        <p className="mt-1 text-sm text-ink-mute">
          Nama & logo ditampilkan di halaman login dan bagian atas sidebar.
        </p>
      </div>

      <form onSubmit={onSaveSchool} className="card space-y-4 p-5">
        <div>
          <label className="label">Nama sekolah</label>
          <input
            className="input"
            placeholder="SMA Negeri 1 Contoh"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">URL logo sekolah</label>
          <input
            className="input"
            type="url"
            placeholder="https://…/logo-sekolah.png"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          {logoUrl.trim() && (
            <div className="mt-2 flex items-center gap-2">
              <SchoolLogo url={logoUrl} className="h-10 w-10" />
              <span className="text-xs text-ink-mute">Pratinjau logo</span>
            </div>
          )}
        </div>
        <div>
          <button type="submit" className="btn-primary" disabled={busySchool}>
            <Save className="h-4 w-4" /> {busySchool ? "Menyimpan…" : "Simpan data sekolah"}
          </button>
        </div>
      </form>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Plug className="h-5 w-5 text-brass" /> Gemini AI — penilaian esai
        </h2>
        <p className="mt-1 text-sm text-ink-mute">
          API key disimpan di server dan tidak pernah ditampilkan kembali ke layar ini.
          {aiStatus?.hasApiKey ? (
            <span className="ml-2 font-semibold text-emerald-700">✓ API Key tersimpan{aiStatus.model ? ` · ${aiStatus.model}` : ""}</span>
          ) : (
            <span className="ml-2 font-semibold text-signal">Belum ada API key</span>
          )}
        </p>
      </div>

      <form onSubmit={onSaveAi} className="card space-y-4 p-5">
        <div>
          <label className="label">API key baru (isi hanya jika ingin mengganti)</label>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              type={showKey ? "text" : "password"}
              placeholder={aiStatus?.hasApiKey ? "••••••••" : "AIza..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button type="button" className="btn-secondary px-3" onClick={() => setShowKey((v) => !v)} aria-label="Lihat key">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">Model Gemini</label>
          {models.length > 0 ? (
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName || m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input font-mono"
              placeholder="gemini-2.5-flash"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
          <button type="button" className="btn-secondary mt-2 text-xs" onClick={loadModels}>
            Muat daftar model
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={busyAi || (!apiKey && !model)}>
            <Save className="h-4 w-4" /> {busyAi ? "Menyimpan…" : "Simpan pengaturan AI"}
          </button>
          <button type="button" className="btn-secondary" onClick={onTest} disabled={testing}>
            {testing ? "Menguji…" : "Test koneksi"}
          </button>
        </div>
      </form>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Shield className="h-5 w-5 text-brass" /> Keamanan
        </h2>
        <p className="mt-1 text-sm text-ink-mute">
          Pengaturan login khusus siswa. Guru & admin tidak terpengaruh.
        </p>
      </div>

      <form onSubmit={onSaveSecurity} className="card space-y-5 p-5">
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={allowMultipleLogin}
              onChange={(e) => setAllowMultipleLogin(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-semibold">Izinkan login multiperangkat</span>
              <span className="mt-0.5 block text-ink-mute">
                {allowMultipleLogin
                  ? "Aktif — siswa boleh login bersamaan di dua device atau lebih."
                  : "Nonaktif — siswa hanya boleh login di satu perangkat. Jika sudah login, harus logout dulu (atau direset admin via menu Log) sebelum login lagi."}
              </span>
            </span>
          </label>
        </div>

        <div>
          <label className="label">Daftar User-Agent (satu per baris)</label>
          <textarea
            className="input min-h-28 font-mono text-sm"
            placeholder={"Chrome\nEdg\nFirefox\nCriOS\nFxiOS"}
            value={uaList}
            onChange={(e) => setUaList(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-mute">
            Kosongkan = browser bebas. Jika diisi, siswa hanya lolos jika User-Agent mengandung salah satu entri
            (tidak peka huruf besar/kecil). Isi potongan stabil seperti nama browser, bukan string lengkap per versi.
          </p>
        </div>

        <div>
          <label className="label">Max Pelanggaran</label>
          <input
            className="input w-32 font-mono"
            type="number"
            min={1}
            max={100}
            value={maxViolations}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxViolations(Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1);
            }}
          />
          <p className="mt-1 text-xs text-ink-mute">
            Siswa otomatis <strong>Terblokir</strong> setelah {maxViolations} pelanggaran (keluar fullscreen,
            pindah tab, dll) dan tidak bisa melanjutkan ujian. Guru bisa membuka blokir dari monitor ujian —
            saat dibuka, log pelanggaran dihapus dan hitungan dimulai dari 0.
          </p>
        </div>

        <div>
          <button type="submit" className="btn-primary" disabled={busySecurity}>
            <Save className="h-4 w-4" /> {busySecurity ? "Menyimpan…" : "Simpan pengaturan keamanan"}
          </button>
        </div>
      </form>
    </div>
  );
}
