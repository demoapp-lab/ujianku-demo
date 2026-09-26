import { useEffect, useState } from "react";
import { Check, Sparkles, Wand2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../common/Modal";
import { Field, Textarea } from "../common/Input";
import Badge from "../common/Badge";
import { getAiSettingsStatus } from "../../services/settingsService";
import {
  draftToPayload,
  generateQuestions,
  type Difficulty,
  type GeneratedQuestion,
} from "../../services/aiQuestionService";
import { DIFFICULTIES, QUESTION_TYPES } from "../../utils/constants";
import type { Question, QuestionType } from "../../types";

const LANGUAGES = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "Bahasa Inggris" },
] as const;

export type GenerateLanguage = (typeof LANGUAGES)[number]["value"];

export default function AiGenerateModal({
  open,
  onClose,
  subjectId,
  subjectName,
  classIds,
  classNames,
  packageId,
  createdBy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  classIds: string[];
  classNames: string[];
  packageId: string;
  createdBy: string;
  onSave: (payloads: Omit<Question, "id" | "createdAt">[]) => Promise<void>;
}) {
  const [topic, setTopic] = useState("");
  const [type, setType] = useState<QuestionType>("multiple_choice");
  const [count, setCount] = useState(1);
  const [optionCount, setOptionCount] = useState(4);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState<GenerateLanguage>("id");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<GeneratedQuestion[] | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setGenerating(false);
    setSaving(false);
    getAiSettingsStatus()
      .then((s) => setHasKey(s.hasApiKey))
      .catch(() => setHasKey(false));
  }, [open]);

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error("Isi topik / bahan soal dulu");
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      toast.error("Jumlah soal harus bilangan bulat lebih dari 0");
      return;
    }
    if (type === "multiple_choice" && (!Number.isInteger(optionCount) || optionCount < 2)) {
      toast.error("Jumlah opsi minimal 2");
      return;
    }
    if (hasKey === false) {
      toast.error("API key Gemini belum diatur — minta admin isi di menu Pengaturan");
      return;
    }
    setGenerating(true);
    setResults(null);
    try {
      const list = await generateQuestions({
        subjectName,
        classNames,
        topic,
        type,
        count,
        difficulty,
        language,
        optionCount: type === "multiple_choice" ? optionCount : undefined,
      });
      setResults(list);
      toast.success(`${list.length} soal berhasil digenerate`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal generate soal");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!results?.length) return;
    setSaving(true);
    try {
      const payloads = results.map((d) =>
        draftToPayload(d, { subjectId, packageId, classIds, createdBy })
      );
      await onSave(payloads);
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = (t: QuestionType) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;
  const diffLabel = (d: Difficulty) => DIFFICULTIES.find((x) => x.value === d)?.label ?? d;

  return (
    <Modal
      open={open}
      wide
      title="Generate soal dengan AI"
      description={`Hasil generate ditinjau dulu, lalu disimpan ke paket ${subjectName}.`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {hasKey === false && (
          <div className="rounded-sm border border-signal/40 bg-signal/5 px-3 py-2 text-xs text-signal">
            API key Gemini belum diatur. Minta admin mengisi API key di menu Pengaturan → Gemini AI.
          </div>
        )}

        <Field
          label="Topik / bahan soal"
          htmlFor="ai-topic"
          hint="Contoh: Sistem pernapasan manusia, UUD 1945 pasal 1–5, hasil pembacaan teks berikut…"
        >
          <Textarea
            id="ai-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Tuliskan topik atau tempel bahan bacaan…"
          />
        </Field>

        <div>
          <span className="label">Jenis soal</span>
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="ai-count">
              Jumlah soal
            </label>
            <input
              id="ai-count"
              className="input"
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="ai-diff">
              Tingkat kesulitan
            </label>
            <select
              id="ai-diff"
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type === "multiple_choice" && (
          <div>
            <label className="label" htmlFor="ai-option-count">
              Jumlah opsi
            </label>
            <input
              id="ai-option-count"
              className="input max-w-xs"
              type="number"
              value={optionCount}
              onChange={(e) => setOptionCount(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-ink-mute">Minimal 2 opsi per soal pilihan ganda.</p>
          </div>
        )}

        <div>
          <span className="label">Bahasa hasil generate</span>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => {
              const on = language === lang.value;
              return (
                <label
                  key={lang.value}
                  className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${
                    on ? "border-ink bg-ink text-paper" : "border-ink-line bg-paper-card text-ink"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setLanguage(lang.value)}
                  />
                  {lang.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-brass" disabled={generating || saving} onClick={handleGenerate}>
            {generating ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" /> Membuat soal…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> {results ? "Generate ulang" : "Generate soal"}
              </>
            )}
          </button>
          {results && (
            <button type="button" className="btn-primary" disabled={saving || generating} onClick={handleSave}>
              <Check className="h-4 w-4" />
              {saving ? "Menyimpan…" : `Simpan ${results.length} soal ke paket`}
            </button>
          )}
        </div>

        {results && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-ink-mute">
              Pratinjau hasil — periksa dulu sebelum disimpan
            </p>
            {results.map((r, i) => (
              <div key={i} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-mute">#{i + 1}</span>
                  <Badge tone="info">{typeLabel(r.type)}</Badge>
                  <Badge>{r.points} poin</Badge>
                  <Badge tone="warning">{diffLabel(r.difficulty)}</Badge>
                </div>
                <p className="text-sm leading-relaxed">{r.text}</p>
                {r.type === "multiple_choice" && r.options && (
                  <ul className="space-y-1 text-sm">
                    {r.options.map((o, oi) => {
                      const correct = oi === r.correctIndex;
                      return (
                        <li
                          key={oi}
                          className={correct ? "font-semibold text-emerald-700" : "text-ink"}
                        >
                          {String.fromCharCode(65 + oi)}. {o}
                          {correct && " ✓"}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {r.type === "true_false" && (
                  <p className="text-sm">
                    Kunci:{" "}
                    <strong>{r.correctAnswer === "true" ? "Benar" : "Salah"}</strong>
                  </p>
                )}
                {r.type === "short_answer" && (
                  <p className="text-sm">
                    Kunci: <strong>{(r.acceptedAnswers ?? []).join(", ")}</strong>
                  </p>
                )}
                {r.type === "essay" && (
                  <p className="text-sm text-ink-mute">
                    Rubrik: {r.rubric}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {!results && !generating && (
          <p className="flex items-center gap-1.5 text-xs text-ink-mute">
            <Wand2 className="h-3.5 w-3.5" /> Klik Generate, tinjau hasilnya, lalu tekan Simpan.
          </p>
        )}
      </div>
    </Modal>
  );
}
