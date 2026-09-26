import * as XLSX from "xlsx";
import { createUserByAdmin } from "./userService";
import type { ClassData, Role } from "../types";

export interface ImportRow {
  line: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  className: string;
  classId: string;
  error?: string;
}

export interface ImportResult {
  success: number;
  failed: { line: number; email: string; message: string }[];
}

const DEFAULT_PASSWORD = "123456";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_MAP: Record<string, Role> = {
  admin: "admin",
  guru: "teacher",
  teacher: "teacher",
  siswa: "student",
  student: "student",
};

const ALIASES: Record<string, string[]> = {
  name: ["nama", "nama lengkap", "name"],
  email: ["email", "e-mail", "surel"],
  password: ["password", "kata sandi", "sandi"],
  role: ["peran", "role"],
  className: ["kelas", "class"],
};

export function downloadUserTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Nama", "Email", "Password", "Peran", "Kelas"],
    ["Budi Santoso", "budi@sekolah.sch.id", "123456", "guru", ""],
    ["Siti Aminah", "siti@sekolah.sch.id", "123456", "siswa", "XII IPA 1"],
    ["Andi Wijaya", "andi@sekolah.sch.id", "", "siswa", "XII IPA 1"],
    ["Admin Sekolah", "admin@sekolah.sch.id", "123456", "admin", ""],
  ]);
  sheet["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];

  const guide = XLSX.utils.aoa_to_sheet([
    ["Petunjuk Import Pengguna"],
    [""],
    ["1. Isi sheet Pengguna — jangan ubah nama kolom pada baris pertama."],
    ["2. Peran: admin, guru, atau siswa (boleh juga teacher / student)."],
    ["3. Password boleh dikosongkan → default 123456. Jika diisi, minimal 6 karakter."],
    ["4. Kelas hanya untuk siswa; harus persis sama dengan nama kelas yang sudah dibuat di aplikasi."],
    ["5. Email wajib unik — tidak boleh sama antar baris atau dengan akun yang sudah ada."],
    ["6. Hapus baris contoh sebelum diisi data sebenarnya."],
    ["7. Guru & siswa hanya tersimpan di database (bukan Firebase Authentication)."],
  ]);
  guide["!cols"] = [{ wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Pengguna");
  XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
  XLSX.writeFile(wb, "template-import-pengguna.xlsx");
}

function colIndex(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.includes(h));
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

export async function parseUserImport(
  file: File,
  classes: ClassData[],
  existingEmails: Set<string>
): Promise<ImportRow[]> {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "pengguna") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("File kosong");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const rawHeader = aoa[0];
  if (!rawHeader || rawHeader.length === 0) throw new Error("File tidak memiliki baris header");

  const header = rawHeader.map((h) => String(h).trim().toLowerCase());
  const iName = colIndex(header, ALIASES.name);
  const iEmail = colIndex(header, ALIASES.email);
  const iPassword = colIndex(header, ALIASES.password);
  const iRole = colIndex(header, ALIASES.role);
  const iClass = colIndex(header, ALIASES.className);

  if (iName < 0 || iEmail < 0 || iRole < 0) {
    throw new Error('Header tidak sesuai template — minimal kolom "Nama", "Email", "Peran"');
  }

  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];

  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i];
    const name = cell(raw, iName);
    const emailRaw = cell(raw, iEmail);
    const email = emailRaw.toLowerCase();
    const passwordRaw = cell(raw, iPassword);
    const roleRaw = cell(raw, iRole).toLowerCase();
    const className = cell(raw, iClass);
    const line = i + 1;

    if (!name && !emailRaw && !roleRaw && !className) continue;

    const row: ImportRow = {
      line,
      name,
      email,
      password: passwordRaw || DEFAULT_PASSWORD,
      role: ROLE_MAP[roleRaw] ?? "student",
      className,
      classId: "",
    };

    if (!name) row.error = "Nama wajib diisi";
    else if (!email) row.error = "Email wajib diisi";
    else if (!EMAIL_RE.test(email)) row.error = "Format email tidak valid";
    else if (!ROLE_MAP[roleRaw]) row.error = `Peran "${roleRaw}" tidak dikenal (admin/guru/siswa)`;
    else if (row.password.length < 6) row.error = "Password minimal 6 karakter";
    else if (seen.has(email)) row.error = "Email duplikat di dalam file";
    else if (existingEmails.has(email)) row.error = "Email sudah terdaftar";
    else if (row.role === "student" && !className) row.error = "Kelas wajib untuk siswa";
    else if (row.role === "student") {
      const classId = classByName.get(className.toLowerCase());
      if (!classId) row.error = `Kelas "${className}" tidak ditemukan — buat kelas dulu di menu Kelas`;
      else row.classId = classId;
    }

    if (email) seen.add(email);
    rows.push(row);
  }

  if (rows.length === 0) throw new Error("Tidak ada baris data pada file");
  return rows;
}

export async function importUsers(
  rows: ImportRow[],
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult> {
  const valid = rows.filter((r) => !r.error);
  const failed: ImportResult["failed"] = [];
  let success = 0;

  let done = 0;
  for (const row of valid) {
    try {
      await createUserByAdmin({
        email: row.email,
        password: row.password,
        name: row.name,
        role: row.role,
        classId: row.role === "student" ? row.classId : undefined,
      });
      success++;
    } catch (err) {
      failed.push({
        line: row.line,
        email: row.email,
        message: err instanceof Error ? err.message.replace("Firebase: ", "") : "Gagal membuat akun",
      });
    }
    done++;
    onProgress?.(done, valid.length);
  }

  return { success, failed };
}
