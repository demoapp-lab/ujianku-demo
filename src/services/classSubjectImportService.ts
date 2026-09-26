import * as XLSX from "xlsx";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface NameImportRow {
  line: number;
  name: string;
  error?: string;
}

export interface NameImportResult {
  success: number;
  failed: { line: number; name: string; message: string }[];
}

const NAME_ALIASES: Record<string, string[]> = {
  name: ["nama", "nama kelas", "kelas", "nama mapel", "mapel", "mata pelajaran", "name"],
};

function colIndex(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.includes(h));
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function guideSheet(title: string, lines: string[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([[title], [""], ...lines.map((l) => [l])]);
  sheet["!cols"] = [{ wch: 110 }];
  return sheet;
}

async function parseNameSheet(
  file: File,
  sheetKeyword: string,
  existing: Set<string>
): Promise<NameImportRow[]> {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.trim().toLowerCase().includes(sheetKeyword)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("File kosong");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const rawHeader = aoa[0];
  if (!rawHeader || rawHeader.length === 0) throw new Error("File tidak memiliki baris header");

  const header = rawHeader.map((h) => String(h).trim().toLowerCase());
  const iName = colIndex(header, NAME_ALIASES.name);
  if (iName < 0) throw new Error('Header tidak sesuai template — kolom "Nama" wajib ada');

  const seen = new Set<string>();
  const rows: NameImportRow[] = [];

  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i];
    const name = cell(raw, iName);
    const line = i + 1;
    if (!name) continue;

    const key = name.toLowerCase();
    const row: NameImportRow = { line, name };

    if (seen.has(key)) row.error = "Duplikat di dalam file";
    else if (existing.has(key)) row.error = "Sudah ada di database";

    seen.add(key);
    rows.push(row);
  }

  if (rows.length === 0) throw new Error("Tidak ada baris data pada file");
  return rows;
}

async function runNameImport(
  rows: NameImportRow[],
  collectionName: string,
  extra: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void
): Promise<NameImportResult> {
  const valid = rows.filter((r) => !r.error);
  const failed: NameImportResult["failed"] = [];
  let success = 0;
  let done = 0;

  for (const row of valid) {
    try {
      await addDoc(collection(db, collectionName), {
        name: row.name,
        ...extra,
        createdAt: serverTimestamp(),
      });
      success++;
    } catch (err) {
      failed.push({
        line: row.line,
        name: row.name,
        message: err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal menyimpan",
      });
    }
    done++;
    onProgress?.(done, valid.length);
  }

  return { success, failed };
}

export function downloadClassTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nama"],
    ["XII IPA 1"],
    ["XII IPA 2"],
    ["XII IPS 1"],
  ]);
  sheet["!cols"] = [{ wch: 24 }];

  const guide = guideSheet("Petunjuk Import Kelas", [
    "1. Isi sheet Kelas — jangan ubah nama kolom pada baris pertama.",
    "2. Kolom wajib: Nama (satu nama kelas per baris).",
    "3. Nama kelas harus unik — tidak boleh sama antar baris atau dengan kelas yang sudah ada.",
    "4. Hapus baris contoh sebelum diisi data sebenarnya.",
    "5. Setelah impor, siswa bisa dipetakan ke kelas ini lewat menu Pengguna.",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Kelas");
  XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
  XLSX.writeFile(wb, "template-import-kelas.xlsx");
}

export function downloadSubjectTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nama Mapel"],
    ["Matematika"],
    ["Bahasa Indonesia"],
    ["IPA Terpadu"],
  ]);
  sheet["!cols"] = [{ wch: 28 }];

  const guide = guideSheet("Petunjuk Import Mata Pelajaran", [
    "1. Isi sheet Mapel — jangan ubah nama kolom pada baris pertama.",
    "2. Kolom wajib: Nama Mapel (satu mapel per baris).",
    "3. Nama mapel harus unik — tidak boleh sama antar baris atau dengan mapel yang sudah ada.",
    "4. Hapus baris contoh sebelum diisi data sebenarnya.",
    "5. Mapel menjadi dasar pembuatan bank soal dan ujian.",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Mapel");
  XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
  XLSX.writeFile(wb, "template-import-mapel.xlsx");
}

export async function parseClassImport(file: File, existing: Set<string>): Promise<NameImportRow[]> {
  return parseNameSheet(file, "kelas", existing);
}

export async function parseSubjectImport(file: File, existing: Set<string>): Promise<NameImportRow[]> {
  return parseNameSheet(file, "mapel", existing);
}

export async function importClasses(
  rows: NameImportRow[],
  onProgress?: (done: number, total: number) => void
): Promise<NameImportResult> {
  return runNameImport(rows, "classes", {}, onProgress);
}

export async function importSubjects(
  rows: NameImportRow[],
  createdBy: string,
  onProgress?: (done: number, total: number) => void
): Promise<NameImportResult> {
  return runNameImport(rows, "subjects", { createdBy }, onProgress);
}
