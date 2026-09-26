import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, KeyRound, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { db } from "../../lib/firebase";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { ROLES } from "../../utils/constants";
import { createUserByAdmin, resetLocalUserPassword, sendPasswordResetEmail } from "../../services/userService";
import {
  downloadUserTemplate,
  importUsers,
  parseUserImport,
  type ImportRow,
} from "../../services/userImportService";
import { useConfirm } from "../../context/ConfirmContext";
import type { AppUser, ClassData, Role } from "../../types";

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message.replace("Firebase: ", "");
  return fallback;
}

export default function ManageUsers() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filter, setFilter] = useState<Role | "">("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teacher" as Role, classId: "" });
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    setUsers(
      snap.docs.map((d) => {
        const raw = d.data() as Omit<AppUser, "uid"> & { passwordHash?: string };
        const { passwordHash: _ph, ...rest } = raw;
        return { uid: d.id, ...rest };
      })
    );
  }

  useEffect(() => {
    load().catch(() => undefined);
    getDocs(collection(db, "classes")).then((s) =>
      setClasses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) })))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchLower = search.trim().toLowerCase();
  const shown = users.filter((u) => {
    if (filter && u.role !== filter) return false;
    if (classFilter && u.classId !== classFilter) return false;
    if (searchLower && !u.name.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "teacher", classId: "" });
    setOpen(true);
    window.setTimeout(() => {
      document.getElementById("user-email")?.blur();
      const pwd = document.getElementById("user-password") as HTMLInputElement | null;
      if (pwd) pwd.value = "";
    }, 0);
  }

  function openEdit(u: AppUser) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, classId: u.classId ?? "" });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "users", editing.uid), {
          name: form.name,
          role: form.role,
          classId: form.role === "student" ? form.classId : "",
        });
        toast.success("Pengguna diperbarui");
      } else {
        if (form.password.length < 6) {
          toast.error("Kata sandi minimal 6 karakter");
          return;
        }
        await createUserByAdmin({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          name: form.name,
          role: form.role,
          classId: form.role === "student" ? form.classId : undefined,
        });
        toast.success(
          form.role === "admin"
            ? "Admin ditambahkan — sesi Anda tidak terpengaruh"
            : "Pengguna ditambahkan (hanya di database, tidak di Authentication)"
        );
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatError(err, "Gagal menyimpan"));
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImportFile(file);
    setImportRows([]);
    try {
      const emailSnap = await getDocs(collection(db, "users"));
      const existing = new Set(
        emailSnap.docs.map((d) => String((d.data() as { email?: string }).email ?? "").toLowerCase()).filter(Boolean)
      );
      const rows = await parseUserImport(file, classes, existing);
      setImportRows(rows);
      const invalid = rows.filter((r) => r.error).length;
      if (invalid) toast.error(`${invalid} baris bermasalah — lihat rincian di bawah`);
    } catch (err) {
      setImportFile(null);
      setImportRows([]);
      if (fileRef.current) fileRef.current.value = "";
      toast.error(err instanceof Error ? err.message : "Gagal membaca file");
    }
  }

  async function runImport() {
    const valid = importRows.filter((r) => !r.error);
    if (!valid.length) return;
    const ok = await confirm({
      title: `Impor ${valid.length} pengguna?`,
      message:
        "Admin otomatis dibuat di Firebase Authentication. Guru & siswa hanya tersimpan di database. Password mengikuti kolom file (default 123456).",
      subject: importFile?.name,
      confirmLabel: "Impor",
      tone: "info",
    });
    if (!ok) return;

    setImporting(true);
    setImportProgress({ done: 0, total: valid.length });
    try {
      const res = await importUsers(importRows, (done, total) => setImportProgress({ done, total }));
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
      setImportOpen(false);
      setImportRows([]);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      toast.error(formatError(err, "Gagal mengimpor"));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  function closeImport() {
    if (importing) return;
    setImportOpen(false);
    setImportRows([]);
    setImportFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(u: AppUser) {
    const isAdminAccount = u.role === "admin";
    const ok = await confirm({
      title: `Hapus pengguna ${u.name}?`,
      message: isAdminAccount
        ? "Profil dihapus dari database. Akun Authentication perlu dihapus manual di Firebase Console → Authentication."
        : "Profil dan sesi login dihapus dari database. Tidak ada akun di Authentication untuk peran ini.",
      subject: u.email,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    await deleteDoc(doc(db, "users", u.uid));
    toast.success(isAdminAccount ? "Profil dihapus — bersihkan Auth di console bila perlu" : "Pengguna dihapus");
    load();
  }

  async function resetPassword(u: AppUser) {
    if (u.role === "admin") {
      const ok = await confirm({
        title: "Kirim email reset password?",
        message: "Tautan atur ulang dikirim ke email admin. Masa berlaku tautan terbatas.",
        subject: u.email,
        confirmLabel: "Kirim email",
        tone: "warning",
      });
      if (!ok) return;
      try {
        await sendPasswordResetEmail(u.email);
        toast.success(`Email reset password terkirim ke ${u.email}.`, { duration: 6000 });
      } catch (err) {
        toast.error(formatError(err, "Gagal kirim email reset"));
      }
      return;
    }

    const ok = await confirm({
      title: "Reset password ke default?",
      message: "Password guru/siswa di database diatur ulang ke 123456.",
      subject: u.email,
      confirmLabel: "Reset ke 123456",
      tone: "warning",
    });
    if (!ok) return;
    try {
      await resetLocalUserPassword(u.uid, u.email, "123456");
      toast.success(`Password ${u.name} direset ke default: 123456`, { duration: 6000 });
    } catch (err) {
      toast.error(formatError(err, "Gagal reset password"));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Pengguna</h1>
          <p className="text-sm text-ink-mute">Kelola akun guru, siswa, dan admin.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setImportOpen(true);
            }}
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Excel
          </button>
          <button type="button" className="btn-primary" onClick={openCreate}>
            <UserPlus className="h-4 w-4" /> Tambah pengguna
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input
            type="search"
            className="input w-56 pl-8"
            placeholder="Cari nama…"
            aria-label="Cari berdasarkan nama"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-44"
          aria-label="Filter kelas"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">Semua kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(["", "admin", "teacher", "student"] as const).map((r) => (
          <button
            key={r || "all"}
            type="button"
            onClick={() => setFilter(r as Role | "")}
            className={`rounded-sm border px-3 py-1 text-xs font-semibold ${
              filter === r ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink-mute"
            }`}
          >
            {r ? ROLES.find((x) => x.value === r)?.label : "Semua"}
          </button>
        ))}
        {(search || classFilter || filter) && (
          <button
            type="button"
            className="text-xs font-semibold text-ink-mute underline-offset-2 hover:text-ink hover:underline"
            onClick={() => {
              setSearch("");
              setClassFilter("");
              setFilter("");
            }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">Nama</th>
              <th className="th">Email</th>
              <th className="th">Peran</th>
              <th className="th">Kelas</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.uid}>
                <td className="td font-medium">{u.name}</td>
                <td className="td text-ink-mute">{u.email}</td>
                <td className="td">
                  <Badge tone={u.role === "admin" ? "danger" : u.role === "teacher" ? "info" : "success"}>
                    {ROLES.find((x) => x.value === u.role)?.label ?? u.role}
                  </Badge>
                </td>
                <td className="td text-ink-mute">
                  {u.role === "student"
                    ? classes.find((c) => c.id === u.classId)?.name || "—"
                    : "—"}
                </td>
                <td className="td">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-ink-mute hover:text-brass"
                      onClick={() => resetPassword(u)}
                      aria-label={
                        u.role === "admin" ? "Kirim email reset password" : "Reset password ke 123456"
                      }
                      title={
                        u.role === "admin" ? "Kirim email reset password" : "Reset password ke 123456"
                      }
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button type="button" className="text-ink-mute hover:text-ink" onClick={() => openEdit(u)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="text-ink-mute hover:text-signal" onClick={() => remove(u)} aria-label="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td className="td text-ink-mute" colSpan={5}>
                  {search || classFilter || filter ? "Tidak ada pengguna yang cocok dengan filter." : "Belum ada pengguna."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? "Edit pengguna" : "Tambah pengguna"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4" autoComplete="off" noValidate>
          <div>
            <label className="label" htmlFor="user-name">Nama lengkap</label>
            <input
              id="user-name"
              name="user-name"
              className="input"
              required
              autoComplete="off"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          {!editing && (
            <>
              <div>
                <label className="label" htmlFor="user-email">Email</label>
                <input
                  id="user-email"
                  name="user-email"
                  className="input"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="guru@sekolah.sch.id"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="user-password">Kata sandi</label>
                <input
                  id="user-password"
                  name="user-password"
                  className="input"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Minimal 6 karakter"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </>
          )}
          <div>
            <label className="label">Peran</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {form.role === "student" && (
            <div>
              <label className="label">Kelas</label>
              <select className="input" required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Pilih kelas…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importOpen}
        title="Import pengguna dari Excel"
        onClose={closeImport}
        wide
        description="Unduh template dulu, isi datanya, lalu pilih file. Baris tidak valid akan dilewati."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={downloadUserTemplate}>
              <Download className="h-4 w-4" /> Unduh template
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onImportFile(e.target.files?.[0])}
            />
            <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()} disabled={importing}>
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
                    <th className="th">Email</th>
                    <th className="th">Peran</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r) => (
                    <tr key={r.line}>
                      <td className="td font-mono text-xs">{r.line}</td>
                      <td className="td">{r.name || <span className="text-signal">—</span>}</td>
                      <td className="td text-ink-mute">{r.email || <span className="text-signal">—</span>}</td>
                      <td className="td text-xs">
                        {ROLES.find((x) => x.value === r.role)?.label ?? r.role}
                      </td>
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
                    : `Impor ${importRows.filter((r) => !r.error).length} pengguna`}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
