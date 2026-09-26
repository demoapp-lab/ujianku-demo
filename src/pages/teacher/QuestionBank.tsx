import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Plus, Pencil, Sparkles, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import QuestionImage from "../../components/common/QuestionImage";
import QuestionForm from "../../components/exam/QuestionForm";
import AiGenerateModal from "../../components/exam/AiGenerateModal";
import { useConfirm } from "../../context/ConfirmContext";
import { createQuestion, deleteQuestion, listQuestions, updateQuestion } from "../../services/questionService";
import {
  countQuestionsInPackage,
  createPackage,
  deletePackageCascade,
  listPackages,
} from "../../services/questionPackageService";
import {
  downloadQuestionTemplate,
  parseQuestionImport,
  type ImportQuestionRow,
} from "../../services/questionImportService";
import { DIFFICULTIES, QUESTION_TYPES } from "../../utils/constants";
import type { ClassData, Question, QuestionPackage, QuestionType, Subject } from "../../types";

type PackageWithCount = QuestionPackage & { questionCount: number };

export default function QuestionBank() {
  const { user } = useAuth();
  const confirm = useConfirm();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [packages, setPackages] = useState<PackageWithCount[]>([]);
  const [activePkg, setActivePkg] = useState<QuestionPackage | null>(null);
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass] = useState("");

  const [type, setType] = useState<QuestionType | "">("");
  const [items, setItems] = useState<Question[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<Awaited<ReturnType<typeof listQuestions>>["cursor"]>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportQuestionRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pkgModal, setPkgModal] = useState(false);
  const [pkgForm, setPkgForm] = useState({ subjectId: "", classIds: [] as string[] });
  const [pkgBusy, setPkgBusy] = useState(false);

  const subjectName = useCallback(
    (id: string) => subjects.find((s) => s.id === id)?.name ?? "—",
    [subjects]
  );
  const classNames = useCallback(
    (ids: string[]) => ids.map((id) => classes.find((c) => c.id === id)?.name ?? id),
    [classes]
  );

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "subjects"), orderBy("name"))),
      getDocs(query(collection(db, "classes"), orderBy("name"))),
    ]).then(([s, c]) => {
      setSubjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) })));
      setClasses(c.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassData, "id">) })));
    });
  }, []);

  const loadPackages = useCallback(async () => {
    const list = await listPackages(user?.uid);
    const withCount = await Promise.all(
      list.map(async (p) => ({ ...p, questionCount: await countQuestionsInPackage(p.id) }))
    );
    setPackages(withCount);
  }, [user?.uid]);

  useEffect(() => {
    loadPackages().catch(() => undefined);
  }, [loadPackages]);

  async function loadQuestions(reset = true, cur = cursor) {
    if (!activePkg) {
      setItems([]);
      return;
    }
    try {
      const res = await listQuestions({
        packageId: activePkg.id,
        type: type || undefined,
        cursor: reset ? undefined : (cur ?? undefined),
      });
      setItems(reset ? res.items : [...items, ...res.items]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat soal");
    }
  }

  useEffect(() => {
    setCursor(null);
    if (!activePkg) {
      setItems([]);
      return;
    }
    loadQuestions(true).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePkg?.id, type]);

  function openPkgCreate() {
    setPkgForm({ subjectId: subjects[0]?.id ?? "", classIds: [] });
    setPkgModal(true);
  }

  async function handleSavePackage() {
    if (!pkgForm.subjectId) return toast.error("Pilih mata pelajaran");
    if (pkgForm.classIds.length === 0) return toast.error("Pilih minimal satu kelas");

    setPkgBusy(true);
    try {
      const id = await createPackage({
        subjectId: pkgForm.subjectId,
        classIds: pkgForm.classIds,
        createdBy: user?.uid ?? "",
      });
      toast.success("Paket soal dibuat");
      setPkgModal(false);
      await loadPackages();
      setActivePkg({
        id,
        subjectId: pkgForm.subjectId,
        classIds: pkgForm.classIds,
        createdBy: user?.uid ?? "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat paket");
    } finally {
      setPkgBusy(false);
    }
  }

  async function handleSaveQuestion(data: Omit<Question, "id" | "createdAt">) {
    if (!activePkg) return;
    setBusy(true);
    try {
      if (editing) {
        await updateQuestion(editing.id, data);
        toast.success("Soal diperbarui");
      } else {
        await createQuestion(data);
        toast.success("Soal disimpan");
      }
      setOpen(false);
      setEditing(null);
      await loadQuestions(true);
      await loadPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGenerated(payloads: Omit<Question, "id" | "createdAt">[]) {
    if (!payloads.length) return;
    setBusy(true);
    try {
      for (const payload of payloads) {
        await createQuestion(payload);
      }
      toast.success(`${payloads.length} soal AI disimpan ke paket`);
      setAiOpen(false);
      await loadQuestions(true);
      await loadPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan soal AI");
    } finally {
      setBusy(false);
    }
  }

  function closeImport() {
    if (importing) return;
    setImportOpen(false);
    setImportRows([]);
    setImportFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onImportFile(file?: File) {
    if (!file || !activePkg) return;
    setImportFile(file);
    setImportRows([]);
    try {
      const rows = await parseQuestionImport(file, {
        subjectId: activePkg.subjectId,
        packageId: activePkg.id,
        classIds: activePkg.classIds,
        createdBy: user?.uid ?? "",
      });
      setImportRows(rows);
    } catch (err) {
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.error(err instanceof Error ? err.message : "Gagal membaca file Excel");
    }
  }

  async function runImport() {
    const valid = importRows.filter((r) => r.payload);
    if (!valid.length) return;
    setImporting(true);
    setImportProgress({ done: 0, total: valid.length });
    let success = 0;
    let failed = 0;
    try {
      for (let i = 0; i < valid.length; i++) {
        try {
          await createQuestion(valid[i].payload!);
          success++;
        } catch {
          failed++;
        }
        setImportProgress({ done: i + 1, total: valid.length });
      }
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
    if (success) {
      toast.success(
        `${success} soal diimpor ke paket${failed ? ` · ${failed} gagal disimpan` : ""}`,
        { duration: 6000 }
      );
      await loadQuestions(true);
      await loadPackages();
    } else {
      toast.error("Gagal menyimpan soal dari file — coba lagi");
    }
    if (!failed) closeImport();
  }

  const typeLabel = (t: QuestionType) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

  function toggleClass(id: string) {
    setPkgForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
    }));
  }

  const filteredPackages = packages.filter((p) => {
    if (filterSubject && p.subjectId !== filterSubject) return false;
    if (filterClass && !p.classIds.includes(filterClass)) return false;
    return true;
  });

  /* ---------- daftar paket ---------- */
  if (!activePkg) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">Bank Soal</h1>
            <p className="text-sm text-ink-mute">
              Buat paket soal (mapel + kelas) terlebih dahulu, lalu tambahkan soal ke dalamnya.
            </p>
          </div>
          <button type="button" className="btn-primary ml-auto" onClick={openPkgCreate}>
            <Plus className="h-4 w-4" /> Paket baru
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            className="input max-w-xs"
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            aria-label="Filter mapel"
          >
            <option value="">Semua mapel</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            className="input max-w-[200px]"
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            aria-label="Filter kelas"
          >
            <option value="">Semua kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(filterSubject || filterClass) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFilterSubject("");
                setFilterClass("");
              }}
            >
              Reset
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {filteredPackages.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card w-full p-4 text-left transition-colors hover:border-ink"
              onClick={() => setActivePkg(p)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{subjectName(p.subjectId)}</span>
                <Badge tone="info">{p.questionCount} soal</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {classNames(p.classIds).map((n) => (
                  <Badge key={n}>{n}</Badge>
                ))}
              </div>
            </button>
          ))}
          {filteredPackages.length === 0 && (
            <div className="card p-6 text-sm text-ink-mute">
              {packages.length === 0
                ? "Belum ada paket soal. Klik “Paket baru” untuk memulai."
                : "Tidak ada paket yang cocok dengan filter."}
            </div>
          )}
        </div>

        <Modal open={pkgModal} title="Paket soal baru" onClose={() => setPkgModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Mata pelajaran</label>
              <select
                className="input"
                value={pkgForm.subjectId}
                onChange={(e) => setPkgForm({ ...pkgForm, subjectId: e.target.value })}
              >
                <option value="">Pilih mapel…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Kelas (boleh lebih dari satu)</label>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const on = pkgForm.classIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${
                        on ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink"
                      }`}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleClass(c.id)} />
                      {c.name}
                    </label>
                  );
                })}
                {classes.length === 0 && (
                  <p className="text-sm text-ink-mute">Belum ada kelas — buat dulu di menu Kelas &amp; Mapel.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPkgModal(false)}>
                Batal
              </button>
              <button type="button" className="btn-primary" disabled={pkgBusy} onClick={handleSavePackage}>
                {pkgBusy ? "Menyimpan…" : "Buat paket"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  /* ---------- detail paket + daftar soal ---------- */
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => setActivePkg(null)}>
          <ArrowLeft className="h-4 w-4" /> Semua paket
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{subjectName(activePkg.subjectId)}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {classNames(activePkg.classIds).map((n) => (
              <Badge key={n}>{n}</Badge>
            ))}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn-secondary text-signal"
            onClick={async () => {
              const ok = await confirm({
                title: "Hapus paket soal ini?",
                message: "Semua soal di dalam paket ikut terhapus.",
                subject: `${subjectName(activePkg.subjectId)} — ${classNames(activePkg.classIds).join(", ")}`,
                confirmLabel: "Hapus paket",
                tone: "danger",
              });
              if (ok) {
                await deletePackageCascade(activePkg.id);
                toast.success("Paket dihapus");
                setActivePkg(null);
                await loadPackages();
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Hapus paket
          </button>
          <button
            type="button"
            className="btn-brass"
            onClick={() => setAiOpen(true)}
          >
            <Sparkles className="h-4 w-4" /> Generate AI
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setImportRows([]);
              setImportFile(null);
              setImportOpen(true);
            }}
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Excel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Soal baru
          </button>
        </div>
      </div>

      <div className="mt-4">
        <select
          className="input max-w-[200px]"
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType | "")}
        >
          <option value="">Semua jenis</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="card mt-4 divide-y divide-ink-line/60">
        {items.map((q) => (
          <div key={q.id} className="flex items-start gap-3 p-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{typeLabel(q.type)}</Badge>
                <Badge>{q.points} poin</Badge>
                {q.difficulty && (
                  <Badge tone="warning">
                    {DIFFICULTIES.find((d) => d.value === q.difficulty)?.label ?? q.difficulty}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{q.text}</p>
              {(q.imageUrl || q.imageDriveFileId) && (
                <QuestionImage
                  src={q.imageUrl}
                  fileId={q.imageDriveFileId}
                  alt=""
                  className="mt-2 max-h-24 rounded-sm border border-ink-line"
                />
              )}

              {q.type === "multiple_choice" && q.options && (
                <ul className="mt-2 space-y-1">
                  {q.options.map((o, i) => {
                    const isKey = o.id === q.correctAnswer;
                    return (
                      <li
                        key={o.id}
                        className={`flex items-start gap-2 rounded-sm border px-2 py-1 text-xs ${
                          isKey
                            ? "border-brass bg-brass-soft font-semibold text-ink"
                            : "border-ink-line/60 bg-paper text-ink-mute"
                        }`}
                      >
                        <span className="font-mono">{String.fromCharCode(65 + i)}.</span>
                        <span className="min-w-0 flex-1 break-words">{o.text}</span>
                        {isKey && <span className="font-semibold text-brass">Kunci</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

              {q.type === "true_false" &&
                (q.correctAnswer === "true" || q.correctAnswer === "false") && (
                <p className="mt-2 text-xs text-ink-mute">
                  Kunci:{" "}
                  <span className="font-semibold text-ink">
                    {q.correctAnswer === "true" ? "Benar" : "Salah"}
                  </span>
                </p>
              )}

              {q.type === "short_answer" && (
                <p className="mt-2 text-xs text-ink-mute">
                  Jawaban diterima:{" "}
                  <span className="font-semibold text-ink">
                    {(q.acceptedAnswers?.length ? q.acceptedAnswers : [q.correctAnswer ?? "—"])
                      .join(", ")}
                  </span>
                </p>
              )}

              {q.type === "essay" && q.rubric && (
                <p className="mt-2 rounded-sm bg-paper p-2 text-xs text-ink-mute">
                  <span className="font-semibold text-ink">Rubrik:</span> {q.rubric}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-ink-mute hover:text-ink"
                aria-label="Edit soal"
                onClick={() => {
                  setEditing(q);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="text-ink-mute hover:text-signal"
                aria-label="Hapus soal"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Hapus soal ini?",
                    message: "Soal hilang dari bank soal dan tidak muncul di ujian berikutnya.",
                    subject: q.text.slice(0, 80),
                    confirmLabel: "Hapus soal",
                    tone: "danger",
                  });
                  if (ok) {
                    await deleteQuestion(q.id);
                    loadQuestions(true);
                    await loadPackages();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="p-6 text-sm text-ink-mute">
            Belum ada soal di paket ini. Klik “Soal baru” atau “Import Excel” untuk menambahkan.
          </p>
        )}
        {hasMore && (
          <div className="p-3">
            <button type="button" className="btn-secondary" onClick={() => loadQuestions(false)}>
              Muat lebih banyak
            </button>
          </div>
        )}
      </div>

      <Modal open={open} wide title={editing ? "Edit soal" : "Soal baru"} onClose={() => setOpen(false)}>
        <QuestionForm
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          subjectId={activePkg.subjectId}
          packageId={activePkg.id}
          classIds={activePkg.classIds}
          onSubmit={handleSaveQuestion}
          onCancel={() => setOpen(false)}
          busy={busy}
        />
      </Modal>

      <Modal
        open={importOpen}
        wide
        title="Import soal dari Excel"
        onClose={closeImport}
        description="Unduh template, isi soalnya di Excel, lalu pilih file. Baris tidak valid akan dilewati."
      >
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brass-soft text-ink">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">1. Download template</p>
              <p className="text-xs text-ink-mute">
                Berisi contoh pengisian semua jenis soal: pilihan ganda, benar/salah, isian
                singkat, dan esai.
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={downloadQuestionTemplate}>
              <Download className="h-4 w-4" /> Unduh template
            </button>
          </div>

          <div className="card flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-brass-soft text-ink">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">2. Pilih file (upload)</p>
              <p className="truncate text-xs text-ink-mute">
                {importFile ? importFile.name : "Format .xlsx / .xls sesuai template"}
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                void onImportFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="h-4 w-4" /> Pilih file…
            </button>
          </div>

          {importRows.length > 0 && (
            <div className="card max-h-72 overflow-y-auto p-0">
              <table className="w-full">
                <thead className="sticky top-0 bg-paper-card">
                  <tr>
                    <th className="th">Baris</th>
                    <th className="th">Jenis</th>
                    <th className="th">Soal</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r) => (
                    <tr key={r.line}>
                      <td className="td font-mono text-xs">{r.line}</td>
                      <td className="td text-xs">{r.type ? typeLabel(r.type) : "—"}</td>
                      <td className="td text-xs">
                        <span className="block max-w-md truncate">{r.text || "—"}</span>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                  onClick={() => void runImport()}
                  disabled={importing || !importRows.some((r) => !r.error)}
                >
                  {importing
                    ? `Mengimpor ${importProgress?.done ?? 0}/${importProgress?.total ?? 0}…`
                    : `Impor ${importRows.filter((r) => !r.error).length} soal`}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <AiGenerateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        subjectId={activePkg.subjectId}
        subjectName={subjectName(activePkg.subjectId)}
        classIds={activePkg.classIds}
        classNames={classNames(activePkg.classIds)}
        packageId={activePkg.id}
        createdBy={user?.uid ?? ""}
        onSave={handleSaveGenerated}
      />
    </div>
  );
}
