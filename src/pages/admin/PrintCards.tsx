import { useEffect, useMemo, useState } from "react";
import { CreditCard, Eye, Search } from "lucide-react";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import Loader from "../../components/common/Loader";
import html2pdf from "html2pdf.js";
import type { ClassData } from "../../types";

interface Student {
  uid: string;
  name: string;
  email: string;
  classId: string;
}

type Scope = "all" | "class" | "student";

type SetArg = Parameters<InstanceType<typeof html2pdf.Worker>["set"]>[0];

/** Ukuran kertas A4 (mm) dengan margin 10 mm → area konten 190 × 277 mm. */
const PAGE_W = 190;
const PAGE_H = 277;
const MARGIN = 10;
/** Kartu 2 kolom × 6 baris = 12 kartu per halaman. */
const CARD_W = 92.8;
const CARD_H = 41;
const GAP = 4;
const COL_X = [0.2, 97];
const ROWS = 6;
const PER_PAGE = COL_X.length * ROWS;
/** Batas halaman per batch render (menjaga ukuran canvas aman di semua browser). */
const CHUNK_PAGES = 10;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function cardHtml(name: string, kelas: string, email: string, left: number, top: number): string {
  const row = (label: string, value: string, extra = "") =>
    `<tr><td style="width:16mm;">${label}</td><td style="width:3mm;">:</td><td${extra}>${esc(value)}</td></tr>`;
  return `<div style="position:absolute; left:${left}mm; top:${top}mm; width:${CARD_W}mm; height:${CARD_H}mm; box-sizing:border-box; border:0.6mm solid #000; background:#fff; color:#000; padding:3.2mm 4mm; overflow:hidden;">
    <div style="text-align:center; font-size:12.5pt; font-weight:bold; border-bottom:0.4mm solid #000; padding-bottom:1.5mm; margin-bottom:2.2mm;">Kartu Login Siswa</div>
    <table style="width:100%; border-collapse:collapse; font-size:9.5pt; line-height:1.6;">
      ${row("Nama", name)}
      ${row("Kelas", kelas)}
      ${row("Email", email, ' style="word-break:break-all;"')}
    </table>
  </div>`;
}

function pageHtml(cards: Student[], className: (id: string) => string): string {
  const totalRows = ROWS * CARD_H + (ROWS - 1) * GAP;
  const startTop = (PAGE_H - totalRows) / 2;
  const inner = cards
    .map((s, i) => {
      const row = Math.floor(i / COL_X.length);
      const col = i % COL_X.length;
      const top = startTop + row * (CARD_H + GAP);
      return cardHtml(s.name, className(s.classId), s.email, COL_X[col], top);
    })
    .join("");
  return `<div style="position:relative; width:${PAGE_W}mm; height:${PAGE_H}mm; background:#fff;">${inner}</div>`;
}

function buildChunkEl(pages: Student[][], className: (id: string) => string): HTMLElement {
  const el = document.createElement("div");
  el.style.width = `${PAGE_W}mm`;
  el.style.background = "#fff";
  el.style.fontFamily = "Helvetica, Arial, sans-serif";
  el.innerHTML = pages.map((p) => pageHtml(p, className)).join("");
  return el;
}

export default function PrintCards() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);

  const [scope, setScope] = useState<Scope>("all");
  const [classId, setClassId] = useState("");
  const [studentUid, setStudentUid] = useState("");
  const [search, setSearch] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "classes"), orderBy("name"))),
    ])
      .then(([u, c]) => {
        const list: Student[] = [];
        u.docs.forEach((d) => {
          const raw = d.data() as { name?: string; email?: string; role?: string; classId?: string };
          if (raw.role !== "student") return;
          list.push({
            uid: d.id,
            name: raw.name ?? "",
            email: raw.email ?? "",
            classId: raw.classId ?? "",
          });
        });
        setStudents(list);
        setClasses(c.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) })));
      })
      .catch(() => toast.error("Gagal memuat data siswa"))
      .finally(() => setLoading(false));
  }, []);

  const className = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [classes]);

  const sorted = useMemo(
    () =>
      [...students].sort((a, b) =>
        className(a.classId).localeCompare(className(b.classId), "id") ||
        a.name.localeCompare(b.name, "id")
      ),
    [students, className]
  );

  const classOptions = useMemo(
    () => classes.filter((c) => students.some((s) => s.classId === c.id)),
    [classes, students]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const selected = useMemo<Student[]>(() => {
    if (scope === "class") return classId ? sorted.filter((s) => s.classId === classId) : [];
    if (scope === "student") {
      const s = sorted.find((x) => x.uid === studentUid);
      return s ? [s] : [];
    }
    return sorted;
  }, [scope, classId, studentUid, sorted]);

  const totalPages = Math.max(1, Math.ceil(selected.length / PER_PAGE));

  async function previewPdf() {
    if (selected.length === 0) {
      toast.error("Tidak ada siswa yang dipilih");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Popup diblokir — izinkan popup untuk membuka tab preview PDF");
      return;
    }
    try {
      win.document.title = "Preview Kartu Login Siswa";
      win.document.body.style.margin = "0";
      win.document.body.style.fontFamily = "sans-serif";
      win.document.body.innerHTML =
        '<p style="padding:24px;font-size:14px;">Menyiapkan PDF kartu, mohon tunggu…</p>';
    } catch {
      /* tab mungkin sudah ditutup */
    }

    setBusy(true);
    const wrappers: HTMLElement[] = [];
    try {
      const pages = chunk(selected, PER_PAGE);
      const batches = chunk(pages, CHUNK_PAGES);
      const opts = {
        margin: [MARGIN, MARGIN, MARGIN, MARGIN] as [number, number, number, number],
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: [] as string[] },
      };

      let shared: unknown = null;
      for (let i = 0; i < batches.length; i++) {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "position:fixed; left:-20000px; top:0; z-index:-1;";
        const el = buildChunkEl(batches[i], className);
        wrapper.appendChild(el);
        document.body.appendChild(wrapper);
        wrappers.push(wrapper);

        const worker = html2pdf().set(opts as unknown as SetArg);
        if (shared) {
          (worker as { set: (o: unknown) => unknown }).set({ pdf: shared });
          (shared as { addPage: () => void }).addPage();
        }
        await worker.from(el).outputPdf("blob");
        if (!shared) shared = await worker.get("pdf");

        wrapper.remove();
        wrappers.splice(wrappers.indexOf(wrapper), 1);
        setProgress({ done: i + 1, total: batches.length });
      }

      const blob = (shared as { output: (t: string) => Blob }).output("blob");
      const url = URL.createObjectURL(blob);
      try {
        win.location.href = url;
      } catch {
        win.location = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 600_000);
      toast.success(`${selected.length} kartu siap — PDF terbuka di tab baru`);
    } catch (err) {
      try {
        win.close();
      } catch {
        /* abaikan */
      }
      toast.error(err instanceof Error ? err.message : "Gagal membuat PDF kartu");
    } finally {
      wrappers.forEach((w) => w.remove());
      setBusy(false);
      setProgress(null);
    }
  }

  if (loading) return <Loader full label="Memuat data siswa…" />;

  const scopeBtn = (value: Scope, label: string) => (
    <button
      key={value}
      type="button"
      className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${
        scope === value ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink"
      }`}
      onClick={() => setScope(value)}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="text-xl font-bold">Cetak Kartu</h1>
      <p className="text-sm text-ink-mute">
        Cetak kartu login siswa (nama, kelas, email) ke PDF — kertas A4, hitam putih, 2 kolom,
        12 kartu per halaman. File terbuka sebagai preview di tab baru.
      </p>

      <div className="card mt-4 space-y-4 p-4">
        <div>
          <span className="label">Cetak</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {scopeBtn("all", "Semua siswa")}
            {scopeBtn("class", "Per kelas")}
            {scopeBtn("student", "Per siswa")}
          </div>
        </div>

        {scope === "class" && (
          <div>
            <label className="label" htmlFor="kelas_cetak">Kelas</label>
            <select
              id="kelas_cetak"
              className="input max-w-xs"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Pilih kelas…</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {classOptions.length === 0 && (
              <p className="mt-1 text-xs text-ink-mute">Belum ada kelas yang berisi siswa.</p>
            )}
          </div>
        )}

        {scope === "student" && (
          <div>
            <label className="label" htmlFor="siswa_cetak">Siswa</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input
                id="siswa_cetak"
                className="input pl-9"
                placeholder="Cari nama atau email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input mt-2"
              value={studentUid}
              onChange={(e) => setStudentUid(e.target.value)}
            >
              <option value="">Pilih siswa…</option>
              {filteredStudents.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.name} — {className(s.classId)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-line pt-4">
          <p className="text-xs text-ink-mute">
            <span className="font-semibold text-ink">{selected.length}</span> kartu ·{" "}
            {selected.length > 0 ? totalPages : 0} halaman A4
            {busy && progress && ` · batch ${progress.done}/${progress.total}`}
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || selected.length === 0}
            onClick={() => void previewPdf()}
          >
            <Eye className="h-4 w-4" />
            {busy ? "Membuat PDF…" : "Preview PDF"}
          </button>
        </div>
      </div>

      <div className="card mt-4 flex items-start gap-3 p-4">
        <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" />
        <p className="text-xs text-ink-mute">
          Isi kartu: judul “Kartu Login Siswa”, nama siswa, kelas, dan email. Kartu tidak
          dipotong di antar halaman — setiap halaman berisi maksimal 12 kartu.
        </p>
      </div>
    </div>
  );
}
