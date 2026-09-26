import * as XLSX from "xlsx";
import type { Question, QuestionOption, QuestionType } from "../types";

export interface ImportQuestionContext {
  subjectId: string;
  packageId: string;
  classIds: string[];
  createdBy: string;
}

export interface ImportQuestionRow {
  line: number;
  type: QuestionType | "";
  text: string;
  payload?: Omit<Question, "id" | "createdAt">;
  error?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES = {
  type: ["tipe", "jenis", "jenis soal", "tipe soal", "type"].map(norm),
  text: ["soal", "teks soal", "pertanyaan", "question"].map(norm),
  kunci: ["kunci", "kunci jawaban", "jawaban", "jawaban benar", "answer"].map(norm),
  diterima: ["jawaban diterima", "alternatif jawaban", "varian jawaban"].map(norm),
  rubrik: ["rubrik", "kunci esai", "rubrik jawaban"].map(norm),
  poin: ["poin", "points", "skor"].map(norm),
  kesulitan: ["kesulitan", "tingkat kesulitan", "difficulty"].map(norm),
  opsi: [
    ["opsi a", "a"],
    ["opsi b", "b"],
    ["opsi c", "c"],
    ["opsi d", "d"],
    ["opsi e", "e"],
  ].map((arr) => arr.map(norm)),
};

const TYPE_MAP: Record<string, QuestionType> = {
  pilihanganda: "multiple_choice",
  pilihan: "multiple_choice",
  pg: "multiple_choice",
  multiplechoice: "multiple_choice",
  benarsalah: "true_false",
  benarsalh: "true_false",
  truefalse: "true_false",
  tf: "true_false",
  isiansingkat: "short_answer",
  isian: "short_answer",
  singkat: "short_answer",
  shortanswer: "short_answer",
  esai: "essay",
  essay: "essay",
};

const DIFF_MAP: Record<string, "easy" | "medium" | "hard"> = {
  mudah: "easy",
  easy: "easy",
  sedang: "medium",
  normal: "medium",
  medium: "medium",
  sulit: "hard",
  keras: "hard",
  hard: "hard",
};

const TF_MAP: Record<string, "true" | "false"> = {
  benar: "true",
  salah: "false",
  true: "true",
  false: "false",
  ya: "true",
  tidak: "false",
  "1": "true",
  "0": "false",
};

const newOptionId = () => Math.random().toString(36).slice(2, 9);

export function downloadQuestionTemplate(): void {
  const header = [
    "Tipe",
    "Soal",
    "Opsi A",
    "Opsi B",
    "Opsi C",
    "Opsi D",
    "Opsi E",
    "Kunci",
    "Jawaban Diterima",
    "Rubrik",
    "Poin",
    "Kesulitan",
  ];
  const sheet = XLSX.utils.aoa_to_sheet([
    header,
    [
      "Pilihan Ganda",
      "Ibu kota Negara Indonesia adalah …",
      "Bandung",
      "Jakarta",
      "Surabaya",
      "Medan",
      "",
      "B",
      "",
      "",
      10,
      "Mudah",
    ],
    ["Benar / Salah", "Jakarta adalah ibu kota Negara Indonesia.", "", "", "", "", "", "Benar", "", "", 10, "Mudah"],
    [
      "Isian Singkat",
      "Presiden pertama Republik Indonesia adalah ….",
      "",
      "",
      "",
      "",
      "",
      "Soekarno",
      "Soekarno, Ir. Soekarno",
      "",
      10,
      "Sedang",
    ],
    [
      "Esai",
      "Jelaskan makna Proklamasi Kemerdekaan Indonesia!",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Menyebutkan waktu, pelaku, dan makna proklamasi",
      10,
      "Sulit",
    ],
  ]);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 52 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 30 },
    { wch: 44 },
    { wch: 6 },
    { wch: 12 },
  ];

  const guide = XLSX.utils.aoa_to_sheet([
    ["Petunjuk Import Soal dari Excel"],
    [""],
    ['1. Isi sheet "Soal" — jangan ubah nama kolom pada baris pertama.'],
    ["2. Tipe: Pilihan Ganda, Benar / Salah, Isian Singkat, atau Esai."],
    ["3. Pilihan Ganda: isi Opsi A–E (minimal 2, maksimal 5), lalu isi Kunci dengan huruf opsi (A/B/C/D/E) atau teks opsi persis."],
    ['4. Benar / Salah: kosongkan kolom opsi, isi Kunci dengan "Benar" atau "Salah".'],
    ['5. Isian Singkat: isi Kunci dengan jawaban yang benar. Kolom "Jawaban Diterima" (varian dipisah koma) untuk jawaban lain yang juga diterima.'],
    ["6. Esai: kolom Rubrik wajib diisi (kunci penilaian manual/AI)."],
    ["7. Poin: angka lebih dari 0 (kosong = 10). Kesulitan: Mudah / Sedang / Sulit (kosong = Sedang)."],
    ["8. Baris contoh boleh langsung diimpor untuk mencoba, atau diganti dengan soal sendiri."],
    ["9. Baris yang tidak valid akan dilewati saat import."],
  ]);
  guide["!cols"] = [{ wch: 120 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Soal");
  XLSX.utils.book_append_sheet(wb, guide, "Petunjuk");
  XLSX.writeFile(wb, "template-import-soal.xlsx");
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

type BuiltRow = Pick<ImportQuestionRow, "payload"> & { error?: string };

function buildRow(
  raw: unknown[],
  cols: {
    iType: number;
    iText: number;
    iKunci: number;
    iDiterima: number;
    iRubrik: number;
    iOpsi: number[];
    iPoin: number;
    iKes: number;
  },
  ctx: ImportQuestionContext
): BuiltRow {
  const typeRaw = cell(raw, cols.iType);
  const text = cell(raw, cols.iText);
  const type = TYPE_MAP[norm(typeRaw)] ?? "";

  if (!typeRaw) return { error: "Tipe soal wajib diisi" };
  if (!type) {
    return {
      error: `Tipe "${typeRaw}" tidak dikenal (Pilihan Ganda / Benar-Salah / Isian Singkat / Esai)`,
    };
  }
  if (!text) return { error: "Teks soal wajib diisi" };

  let points = 10;
  const poinRaw = cell(raw, cols.iPoin);
  if (poinRaw) {
    const n = Number(poinRaw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return { error: `Poin "${poinRaw}" tidak valid` };
    points = Math.max(1, Math.round(n));
  }

  const kesRaw = cell(raw, cols.iKes);
  const difficulty = DIFF_MAP[norm(kesRaw)] ?? "medium";
  if (kesRaw && !DIFF_MAP[norm(kesRaw)]) {
    return { error: `Kesulitan "${kesRaw}" tidak dikenal (Mudah / Sedang / Sulit)` };
  }

  const kunci = cell(raw, cols.iKunci);

  const payload: Omit<Question, "id" | "createdAt"> = {
    subjectId: ctx.subjectId,
    packageId: ctx.packageId,
    classIds: ctx.classIds,
    createdBy: ctx.createdBy,
    type,
    text,
    points,
    difficulty,
    imageUrl: "",
    imageDriveFileId: "",
  };

  if (type === "multiple_choice") {
    const all = cols.iOpsi.map((idx, j) => ({
      letter: String.fromCharCode(65 + j),
      text: cell(raw, idx),
    }));
    const opts = all.filter((o) => o.text);
    if (opts.length < 2) return { error: "Minimal 2 opsi jawaban (isi Opsi A dan Opsi B)" };
    if (!kunci) return { error: 'Kunci wajib diisi (huruf opsi "A"/"B"/"C"/"D"/"E" atau teks opsi)' };

    let chosenIdx: number;
    if (/^[a-e]$/i.test(kunci)) {
      const letter = kunci.toUpperCase();
      const i = all.findIndex((o) => o.letter === letter);
      if (i < 0 || !all[i].text) return { error: `Kunci ${letter} menunjuk opsi kosong` };
      chosenIdx = i;
    } else {
      const i = all.findIndex((o) => o.text && o.text.toLowerCase() === kunci.toLowerCase());
      if (i < 0) return { error: `Kunci "${kunci}" tidak cocok dengan opsi manapun` };
      chosenIdx = i;
    }

    const options: QuestionOption[] = opts.map((o) => ({ id: newOptionId(), text: o.text }));
    payload.options = options;
    payload.correctAnswer = options[opts.findIndex((o) => o.letter === all[chosenIdx].letter)]?.id ?? "";
    return { payload };
  }

  if (type === "true_false") {
    const val = TF_MAP[norm(kunci)];
    if (!kunci) return { error: 'Kunci wajib diisi ("Benar" atau "Salah")' };
    if (!val) return { error: `Kunci "${kunci}" tidak dikenal (Benar / Salah)` };
    payload.options = [
      { id: "true", text: "Benar" },
      { id: "false", text: "Salah" },
    ];
    payload.correctAnswer = val;
    return { payload };
  }

  if (type === "short_answer") {
    const variants = [
      ...(kunci ? [kunci] : []),
      ...cell(raw, cols.iDiterima)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    const accepted = variants.filter((v, i) => variants.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
    if (!accepted.length) return { error: "Isi kolom Kunci atau Jawaban Diterima" };
    payload.acceptedAnswers = accepted;
    payload.correctAnswer = accepted[0];
    return { payload };
  }

  const rubrik = cell(raw, cols.iRubrik) || kunci;
  if (!rubrik) return { error: "Rubrik wajib diisi untuk soal esai" };
  payload.rubric = rubrik;
  return { payload };
}

export async function parseQuestionImport(
  file: File,
  ctx: ImportQuestionContext
): Promise<ImportQuestionRow[]> {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "soal") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("File kosong");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (aoa.length === 0) throw new Error("File tidak memiliki baris header");

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const found = (aoa[i] ?? []).some((c) => ALIASES.type.includes(norm(String(c ?? ""))));
    if (found) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error('Header tidak sesuai template — kolom "Tipe" tidak ditemukan');

  const header = (aoa[headerIdx] ?? []).map((c) => norm(String(c ?? "")));
  const find = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));

  const iType = find(ALIASES.type);
  const iText = find(ALIASES.text);
  const iKunci = find(ALIASES.kunci);
  const iDiterima = find(ALIASES.diterima);
  const iRubrik = find(ALIASES.rubrik);
  const iOpsi = ALIASES.opsi.map((a) => find(a));
  const iPoin = find(ALIASES.poin);
  const iKes = find(ALIASES.kesulitan);

  if (iType < 0 || iText < 0) {
    throw new Error('Header tidak sesuai template — minimal kolom "Tipe" dan "Soal"');
  }

  const rows: ImportQuestionRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const typeRaw = cell(raw, iType);
    const text = cell(raw, iText);
    if (!typeRaw && !text) continue;

    const line = i + 1;
    const built = buildRow(raw, { iType, iText, iKunci, iDiterima, iRubrik, iOpsi, iPoin, iKes }, ctx);
    rows.push({
      line,
      type: built.payload?.type ?? TYPE_MAP[norm(typeRaw)] ?? "",
      text,
      payload: built.payload,
      error: built.error,
    });
  }

  if (rows.length === 0) throw new Error("Tidak ada baris data pada file");
  return rows;
}
