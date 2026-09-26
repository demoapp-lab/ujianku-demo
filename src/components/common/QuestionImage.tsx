import { useState } from "react";
import { driveFileWebUrl } from "../../services/driveService";

/**
 * Render gambar soal dengan:
 * - `referrerPolicy="no-referrer"` — gambar Drive (lh3.googleusercontent.com)
 *   kadang diblokir kalau request membawa referrer halaman aplikasi.
 * - rantai fallback URL (lh3 → thumbnail Drive → uc?export=view).
 * - pesan error yang jelas kalau semua URL gagal (biasanya akses Drive privat).
 */
export default function QuestionImage({
  src,
  fileId,
  alt,
  className = "",
}: {
  src?: string;
  fileId?: string;
  alt: string;
  className?: string;
}) {
  const candidates = [
    (src ?? "").trim(),
    fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600` : "",
    fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : "",
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);

  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const [prevKey, setPrevKey] = useState(`${src ?? ""}|${fileId ?? ""}`);

  const key = `${src ?? ""}|${fileId ?? ""}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setStep(0);
    setFailed(false);
  }

  if (candidates.length === 0) return null;

  if (failed || step >= candidates.length) {
    return (
      <div className={`rounded-sm border border-signal/40 bg-signal-soft p-3 text-xs text-signal ${className}`}>
        <p className="font-semibold">Gambar tidak bisa dimuat.</p>
        <p className="mt-1">
          Pastikan file berupa gambar dan akses Google Drive: <strong>Siapa saja yang memiliki link → Pelihat</strong>.
        </p>
        {fileId && (
          <a
            href={driveFileWebUrl(fileId)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-semibold underline"
          >
            Buka di Drive
          </a>
        )}
      </div>
    );
  }

  return (
    <img
      key={candidates[step]}
      src={candidates[step]}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={className}
      onLoad={() => setFailed(false)}
      onError={() => setStep((s) => s + 1)}
    />
  );
}
