import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmContext";
import Modal from "../../components/common/Modal";
import {
  downloadClassTemplate,
  downloadSubjectTemplate,
  importClasses,
  importSubjects,
  parseClassImport,
  parseSubjectImport,
  type NameImportRow,
} from "../../services/classSubjectImportService";
import type { AppUser, ClassData, Subject } from "../../types";

type ImportKind = "class" | "subject";

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message.replace("Firebase: ", "");
  return fallback;
}

export default function ManageClasses() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [openClass, setOpenClass] = useState(false);
  const [openSubject, setOpenSubject] = useState(false);
  const [className, setClassName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [importKind, setImportKind] = useState<ImportKind | null>(null);
  const [importRows, setImportRows] = useState<NameImportRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const classFileRef = useRef<HTMLInputElement>(null);
  const subjectFileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [c, s, u] = await Promise.all([
      getDocs(query(collection(db, "classes"), orderBy("name"))),
      getDocs(query(collection(db, "subjects"), orderBy("name"))),
      getDocs(collection(db, "users")),
    ]);
    setClasses(c.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) })));
    setSubjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) })));
    setAllUsers(u.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) })));
  }

  function studentCount(classId: string): number {
    return allUsers.filter((u) => u.role === "student" && u.classId === classId).length;
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function saveClass(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "classes", editingId), { name: className });
        toast.success("Kelas diperbarui");
      } else {
        await addDoc(collection(db, "classes"), {
          name: className,
          createdAt: serverTimestamp(),
        });
        toast.success("Kelas ditambahkan");
      }
      setOpenClass(false);
      setEditingId(null);
      setClassName("");
      load();
    } catch (err) {
      toast.error(formatError(err, "Gagal menyimpan"));
    }
  }

  async function saveSubject(e: FormEvent) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "subjects"), { name: subjectName, createdBy: user?.uid ?? "" });
      toast.success("Mata pelajaran ditambahkan");
      setOpenSubject(false);
      setSubjectName("");
      load();
    } catch (err) {
      toast.error(formatError(err, "Gagal menyimpan"));
    }
  }

  function openImport(kind: ImportKind) {
    setImportKind(kind);
    setImportRows([]);
    setImportFile(null);
    const ref = kind === "class" ? classFileRef : subjectFileRef;
    if (ref.current) ref.current.value = "";
  }

  function closeImport() {
    if (importing) return;
    setImportKind(null);
    setImportRows([]);
    setImportFile(null);
    if (classFileRef.current) classFileRef.current.value = "";
    if (subjectFileRef.current) subjectFileRef.current.value = "";
  }

  async function onImportFile(file: File | undefined) {
    if (!file || !importKind) return;
    setImportFile(file);
    setImportRows([]);
    try {
      const collectionName = importKind === "class" ? "classes" : "subjects";
      const snap = await getDocs(collection(db, collectionName));
      const existing = new Set(
        snap.docs.map((d) => String((d.data() as { name?: string }).name ?? "").trim().toLowerCase()).filter(Boolean)
      );
      const rows =
        importKind === "class" ? await parseClassImport(file, existing) : await parseSubjectImport(file, existing);
      setImportRows(rows);
      const invalid = rows.filter((r) => r.error).length;
      if (invalid) toast.error(`${invalid} baris bermasalah — lihat rincian di bawah`);
    } catch (err) {
      setImportFile(null);
      setImportRows([]);
      const ref = importKind === "class" ? classFileRef : subjectFileRef;
      if (ref.current) ref.current.value = "";
      toast.error(formatError(err, "Gagal membaca file"));
    }
  }

  async function runImport() {
    const valid = importRows.filter((r) => !r.error);
    if (!valid.length || !importKind) return;
    const label = importKind === "class" ? "kelas" : "mapel";
    const ok = await confirm({
      title: `Impor ${valid.length} ${label}?`,
      message:
        importKind === "class"
          ? "Nama kelas yang sudah ada akan dilewati. Setelah impor, petakan siswa lewat menu Pengguna."
          : "Nama mapel yang sudah ada akan dilewati. Mapel menjadi dasar bank soal dan ujian.",
      subject: importFile?.name,
      confirmLabel: "Impor",
      tone: "info",
    });
    if (!ok) return;

    setImporting(true);
    setImportProgress({ done: 0, total: valid.length });
    try {
      const res =
        importKind === "class"
          ? await importClasses(importRows, (done, total) => setImportProgress({ done, total }))
          : await importSubjects(importRows, user?.uid ?? "", (done, total) => setImportProgress({ done, total }));
      const invalid = importRows.filter((r) => r.error).length;
      const parts = [`${res.success} berhasil diimpor`];
      if (res.failed.length) parts.push(`${res.failed.length} gagal`);
      if (invalid) parts.push(`${invalid} baris dilewati (tidak valid)`);
      if (res.failed.length) {
        const first = res.failed[0];
        toast.error(`${parts.join(" · ")} — contoh gagal: baris ${first.line} (${first.message})`, {
          duration: 8000,
        });
      } else {
        toast.success(parts.join(" · "));
      }
      closeImport();
      await load();
    } catch (err) {
      toast.error(formatError(err, "Gagal mengimpor"));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  const isClassImport = importKind === "class";
  const importTitle = isClassImport ? "Import kelas dari Excel" : "Import mapel dari Excel";
  const importDesc = isClassImport
    ? "Unduh template kelas, isi datanya, lalu pilih file. Baris tidak valid akan dilewati."
    : "Unduh template mapel, isi datanya, lalu pilih file. Baris tidak valid akan dilewati.";
  const downloadTemplate = isClassImport ? downloadClassTemplate : downloadSubjectTemplate;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">Kelas</h1>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => openImport("class")}>
              <FileSpreadsheet className="h-4 w-4" /> Import
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingId(null);
                setClassName("");
                setOpenClass(true);
              }}
            >
              <Plus className="h-4 w-4" /> Kelas
            </button>
          </div>
        </div>
        <div className="card mt-4 divide-y divide-ink-line/60">
          {classes.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <div className="flex-1">
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-ink-mute">{studentCount(c.id)} siswa</div>
              </div>
              <button
                type="button"
                className="text-ink-mute hover:text-ink"
                aria-label="Edit"
                onClick={() => {
                  setEditingId(c.id);
                  setClassName(c.name);
                  setOpenClass(true);
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="text-ink-mute hover:text-signal"
                aria-label="Hapus"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Hapus kelas ${c.name}?`,
                    message: "Siswa di kelas ini tidak ikut terhapus, hanya data kelas.",
                    subject: c.name,
                    confirmLabel: "Hapus kelas",
                    tone: "danger",
                  });
                  if (ok) {
                    await deleteDoc(doc(db, "classes", c.id));
                    load();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {classes.length === 0 && <p className="p-4 text-sm text-ink-mute">Belum ada kelas.</p>}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">Mata Pelajaran</h1>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => openImport("subject")}>
              <FileSpreadsheet className="h-4 w-4" /> Import
            </button>
            <button type="button" className="btn-primary" onClick={() => setOpenSubject(true)}>
              <Plus className="h-4 w-4" /> Mapel
            </button>
          </div>
        </div>
        <div className="card mt-4 divide-y divide-ink-line/60">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 text-sm font-semibold">{s.name}</div>
              <button
                type="button"
                className="text-ink-mute hover:text-signal"
                aria-label="Hapus"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Hapus mata pelajaran?",
                    message: "Soal yang terkait mapel ini tidak otomatis terhapus.",
                    subject: s.name,
                    confirmLabel: "Hapus mapel",
                    tone: "danger",
                  });
                  if (ok) {
                    await deleteDoc(doc(db, "subjects", s.id));
                    load();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {subjects.length === 0 && <p className="p-4 text-sm text-ink-mute">Belum ada mata pelajaran.</p>}
        </div>
      </section>

      <Modal open={openClass} title={editingId ? "Edit kelas" : "Tambah kelas"} onClose={() => setOpenClass(false)}>
        <form onSubmit={saveClass} className="space-y-4">
          <div>
            <label className="label">Nama kelas</label>
            <input className="input" required placeholder="XII IPA 1" value={className} onChange={(e) => setClassName(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpenClass(false)}>Batal</button>
            <button type="submit" className="btn-primary">Simpan</button>
          </div>
        </form>
      </Modal>

      <Modal open={openSubject} title="Tambah mata pelajaran" onClose={() => setOpenSubject(false)}>
        <form onSubmit={saveSubject} className="space-y-4">
          <div>
            <label className="label">Nama mata pelajaran</label>
            <input className="input" required placeholder="Matematika" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpenSubject(false)}>Batal</button>
            <button type="submit" className="btn-primary">Simpan</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importKind !== null}
        title={importTitle}
        onClose={closeImport}
        wide
        description={importDesc}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Unduh template
            </button>
            <input
              ref={isClassImport ? classFileRef : subjectFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onImportFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => (isClassImport ? classFileRef : subjectFileRef).current?.click()}
              disabled={importing}
            >
              <FileSpreadsheet className="h-4 w-4" /> Pilih file…
            </button>
            {importFile && (
              <span className="truncate font-mono text-xs text-ink-mute">{importFile.name}</span>
            )}
          </div>

          {importRows.length > 0 && (
            <div className="card max-h-72 overflow-y-auto p-0">
              <table className="w-full">
                <thead className="sticky top-0 bg-paper-card">
                  <tr>
                    <th className="th">Baris</th>
                    <th className="th">Nama</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r) => (
                    <tr key={r.line}>
                      <td className="td font-mono text-xs">{r.line}</td>
                      <td className="td">{r.name || <span className="text-signal">—</span>}</td>
                      <td className="td text-xs">
                        {r.error ? (
                          <span className="text-signal">{r.error}</span>
                        ) : (
                          <span className="text-emerald-700">Siap</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importRows.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink-mute">
                {importRows.filter((r) => !r.error).length} siap ·{" "}
                {importRows.filter((r) => r.error).length} dilewati
                {importProgress && importing && ` · ${importProgress.done}/${importProgress.total}`}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={closeImport} disabled={importing}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={runImport}
                  disabled={importing || !importRows.some((r) => !r.error)}
                >
                  {importing
                    ? `Mengimpor ${importProgress?.done ?? 0}/${importProgress?.total ?? 0}…`
                    : `Impor ${importRows.filter((r) => !r.error).length} ${isClassImport ? "kelas" : "mapel"}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
