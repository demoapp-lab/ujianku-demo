import { useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import type { Question, QuestionOption, QuestionType } from "../../types";
import { QUESTION_TYPES } from "../../utils/constants";
import { Field, Input, Textarea } from "../common/Input";
import { driveImageUrl, extractDriveFileId } from "../../services/driveService";
import QuestionImage from "../common/QuestionImage";

const newOption = (text = ""): QuestionOption => ({
  id: Math.random().toString(36).slice(2, 9),
  text,
});

export default function QuestionForm({
  initial,
  subjectId,
  packageId,
  classIds,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Question;
  subjectId: string;
  packageId: string;
  classIds: string[];
  onSubmit: (data: Omit<Question, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? "multiple_choice");
  const [text, setText] = useState(initial?.text ?? "");
  const [points, setPoints] = useState(initial?.points ?? 10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(initial?.difficulty ?? "medium");
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options?.length ? initial.options : [newOption(), newOption()]
  );
  const [correctAnswer, setCorrectAnswer] = useState(initial?.correctAnswer ?? "");
  const [tf, setTf] = useState(initial?.correctAnswer === "true" ? "true" : "false");
  const [accepted, setAccepted] = useState((initial?.acceptedAnswers ?? []).join(", "));
  const [rubric, setRubric] = useState(initial?.rubric ?? "");
  const [imageFileId, setImageFileId] = useState(initial?.imageDriveFileId ?? "");
  const extractedId = extractDriveFileId(imageFileId);
  const previewUrl = extractedId ? driveImageUrl(extractedId) : "";

  function validate(): boolean {
    if (!text.trim()) {
      toast.error("Teks soal wajib diisi");
      return false;
    }
    if (points <= 0) {
      toast.error("Poin harus lebih dari 0");
      return false;
    }
    if (type === "multiple_choice") {
      if (options.filter((o) => o.text.trim()).length < 2) {
        toast.error("Minimal 2 opsi jawaban");
        return false;
      }
      if (!correctAnswer) {
        toast.error("Pilih opsi yang benar");
        return false;
      }
    }
    if (type === "short_answer" && !accepted.trim() && !correctAnswer.trim()) {
      toast.error("Isi setidaknya satu kunci jawaban");
      return false;
    }
    if (type === "essay" && !rubric.trim()) {
      toast.error("Rubrik/kunci jawaban wajib diisi untuk esai");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const fileId = extractDriveFileId(imageFileId);
    const payload: Omit<Question, "id" | "createdAt"> = {
      subjectId,
      packageId,
      classIds,
      createdBy: initial?.createdBy ?? "",
      type,
      text: text.trim(),
      points,
      difficulty,
      imageUrl: fileId ? driveImageUrl(fileId) : "",
      imageDriveFileId: fileId,
    };

    if (type === "multiple_choice") {
      const cleaned = options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() }));
      payload.options = cleaned;
      payload.correctAnswer = correctAnswer;
    } else if (type === "true_false") {
      payload.options = [
        { id: "true", text: "Benar" },
        { id: "false", text: "Salah" },
      ];
      payload.correctAnswer = tf;
    } else if (type === "short_answer") {
      payload.acceptedAnswers = accepted.split(",").map((s) => s.trim()).filter(Boolean);
      payload.correctAnswer = payload.acceptedAnswers[0] ?? "";
    } else if (type === "essay") {
      payload.rubric = rubric.trim();
    }

    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Jenis soal">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUESTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-sm border px-2 py-2 text-left text-xs font-semibold ${
                type === t.value ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink"
              }`}
            >
              {t.label}
              <span className={`mt-0.5 block font-normal ${type === t.value ? "text-paper/60" : "text-ink-mute"}`}>
                {t.hint}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Teks soal" htmlFor="qtext">
        <Textarea id="qtext" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tuliskan pertanyaan…" />
      </Field>

      <Field
        label="ID file gambar di Google Drive (opsional)"
        htmlFor="driveFileId"
        hint="Upload gambar ke Google Drive milikmu → set akses “Siapa saja yang memiliki link → Pelihat” → salin ID file dari URL (bagian setelah /file/d/ dan sebelum /view), lalu tempel di sini."
      >
        <Input
          id="driveFileId"
          className="font-mono"
          value={imageFileId}
          onChange={(e) => setImageFileId(e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
          autoComplete="off"
        />
      </Field>

      {extractedId && (
        <div className="relative inline-block">
          <QuestionImage
            key={previewUrl}
            src={previewUrl}
            fileId={extractedId}
            alt="Pratinjau gambar soal"
            className="max-h-40 rounded-sm border border-ink-line"
          />
          <button
            type="button"
            className="absolute -right-2 -top-2 rounded-full bg-signal p-1 text-white"
            onClick={() => setImageFileId("")}
            aria-label="Hapus ID gambar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {imageFileId && !extractedId && (
        <p className="mt-1 text-xs text-signal">ID file tidak valid — tempel ID saja, bukan URL panjang.</p>
      )}

      {type === "multiple_choice" && (
        <div className="space-y-2">
          <span className="label">Opsi jawaban — tandai kunci</span>
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={correctAnswer === o.id}
                onChange={() => setCorrectAnswer(o.id)}
                aria-label={`Kunci opsi ${i + 1}`}
              />
              <Input
                value={o.text}
                onChange={(e) =>
                  setOptions(options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))
                }
                placeholder={`Opsi ${i + 1}`}
              />
              <button
                type="button"
                className="text-ink-mute hover:text-signal disabled:opacity-30"
                disabled={options.length <= 2}
                onClick={() => setOptions(options.filter((x) => x.id !== o.id))}
                aria-label="Hapus opsi"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary text-xs" onClick={() => setOptions([...options, newOption()])}>
            + Tambah opsi
          </button>
        </div>
      )}

      {type === "true_false" && (
        <Field label="Kunci jawaban">
          <div className="flex gap-2">
            {(["true", "false"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTf(v)}
                className={`btn ${tf === v ? "btn-primary" : "btn-secondary"}`}
              >
                {v === "true" ? "Benar" : "Salah"}
              </button>
            ))}
          </div>
        </Field>
      )}

      {type === "short_answer" && (
        <Field
          label="Kunci jawaban (pisahkan variasi dengan koma)"
          htmlFor="accepted"
          hint='Contoh: "Jakarta, DKI Jakarta"'
        >
          <Input id="accepted" value={accepted} onChange={(e) => setAccepted(e.target.value)} placeholder="Jakarta, DKI Jakarta" />
        </Field>
      )}

      {type === "essay" && (
        <Field label="Rubrik / kunci jawaban" htmlFor="rubric" hint="Dipakai AI (hybrid/auto) dan panduan koreksi guru.">
          <Textarea id="rubric" value={rubric} onChange={(e) => setRubric(e.target.value)} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Poin" htmlFor="points">
          <Input
            id="points"
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </Field>
        <Field label="Tingkat kesulitan" htmlFor="diff">
          <select id="diff" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}>
            <option value="easy">Mudah</option>
            <option value="medium">Sedang</option>
            <option value="hard">Sulit</option>
          </select>
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Batal
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan soal"}
        </button>
      </div>
    </form>
  );
}
