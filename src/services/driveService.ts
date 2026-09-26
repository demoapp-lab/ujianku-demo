/**
 * URL tampil gambar dari Google Drive yang bisa di-render di <img>.
 * Format `lh3.googleusercontent.com/d/{id}` lebih reliable daripada
 * `drive.google.com/uc?export=view` yang sering redirect ke HTML.
 */
export function driveImageUrl(fileId: string): string {
  const id = extractDriveFileId(fileId);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w1600` : "";
}

/** URL buka file di Drive (untuk fallback/tautan saat preview gagal). */
export function driveFileWebUrl(fileId: string): string {
  const id = extractDriveFileId(fileId);
  return id ? `https://drive.google.com/file/d/${id}/view` : "";
}

/**
 * Terima ID file polos atau URL Drive apa pun → ekstrak ID-nya saja.
 * Contoh ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
 */
export function extractDriveFileId(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^[\w-]{10,}$/.test(raw) && !raw.includes("/") && !raw.includes("=")) {
    return raw;
  }
  const fromUrl =
    raw.match(/\/file\/d\/([\w-]+)/)?.[1] ??
    raw.match(/[?&]id=([\w-]+)/)?.[1] ??
    raw.match(/\/d\/([\w-]+)/)?.[1];
  return fromUrl ?? (/^[\w-]+$/.test(raw) ? raw : "");
}
