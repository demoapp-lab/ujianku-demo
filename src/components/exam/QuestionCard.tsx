import type { AnswerEntry, StudentQuestion } from "../../types";
import QuestionImage from "../common/QuestionImage";

export default function QuestionCard({
  question,
  index,
  total,
  answer,
  onChange,
}: {
  question: StudentQuestion;
  index: number;
  total: number;
  answer?: AnswerEntry;
  onChange: (value: string) => void;
}) {
  const value = answer?.value ?? "";

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-ink-mute">
          Soal {index + 1} / {total}
        </span>
        <span className="font-mono text-xs text-brass">{question.points} poin</span>
      </div>

      <p className="mt-3 text-base leading-relaxed whitespace-pre-wrap">{question.text}</p>

      <QuestionImage
        src={question.imageUrl}
        fileId={question.imageDriveFileId}
        alt={`Gambar soal ${index + 1}`}
        className="mt-4 max-h-72 rounded-sm border border-ink-line"
      />

      <div className="mt-5 space-y-2">
        {question.type === "multiple_choice" &&
          question.options?.map((opt, i) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className={`flex w-full items-start gap-3 rounded-sm border px-4 py-3 text-left text-sm transition-colors ${
                  active ? "border-ink bg-brass-soft/60 font-semibold" : "border-ink-line hover:border-ink"
                }`}
              >
                <span className="font-mono text-xs text-ink-mute">{String.fromCharCode(65 + i)}</span>
                <span>{opt.text}</span>
              </button>
            );
          })}

        {question.type === "true_false" &&
          [
            { id: "true", label: "Benar" },
            { id: "false", label: "Salah" },
          ].map((opt) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className={`flex w-full items-center gap-3 rounded-sm border px-4 py-3 text-left text-sm ${
                  active ? "border-ink bg-brass-soft/60 font-semibold" : "border-ink-line hover:border-ink"
                }`}
              >
                <span className="font-mono text-xs text-ink-mute">{opt.id === "true" ? "T" : "F"}</span>
                {opt.label}
              </button>
            );
          })}

        {question.type === "short_answer" && (
          <input
            className="input"
            placeholder="Ketik jawabanmu…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
          />
        )}

        {question.type === "essay" && (
          <textarea
            className="input min-h-40"
            placeholder="Tulis jawaban esaimu di sini…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
