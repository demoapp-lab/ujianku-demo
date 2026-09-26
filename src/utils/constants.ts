import type {
  ExamStatus,
  QuestionType,
  Role,
  SubmissionStatus,
  ViolationType,
} from "../types";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Guru" },
  { value: "student", label: "Siswa" },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  teacher: "Guru",
  student: "Siswa",
};

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

export const QUESTION_TYPES: {
  value: QuestionType;
  label: string;
  hint: string;
}[] = [
  { value: "multiple_choice", label: "Pilihan Ganda", hint: "Beberapa opsi, satu kunci" },
  { value: "true_false", label: "Benar / Salah", hint: "Dua opsi baku" },
  { value: "short_answer", label: "Isian Singkat", hint: "Dicek otomatis ke kunci" },
  { value: "essay", label: "Esai", hint: "Dinilai manual atau AI" },
];

export const EXAM_STATUSES: { value: ExamStatus; label: string }[] = [
  { value: "draft", label: "Draf" },
  { value: "published", label: "Dipublikasikan" },
  { value: "closed", label: "Ditutup" },
];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  in_progress: "Sedang mengerjakan",
  blocked: "Terblokir",
  submitted: "Terkirim",
  pending_grading: "Menunggu koreksi",
  graded: "Selesai dinilai",
};

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  tab_switch: "Pindah tab",
  copy_paste: "Salin / tempel",
  fullscreen_exit: "Keluar fullscreen",
  window_blur: "Jendela kehilangan fokus",
  devtools_open: "DevTools terbuka",
};

export const DIFFICULTIES = [
  { value: "easy", label: "Mudah" },
  { value: "medium", label: "Sedang" },
  { value: "hard", label: "Sulit" },
] as const;

export const PAGE_SIZE = 20;

export const AUTOSAVE_DEBOUNCE_MS = 4000;

/** Default max pelanggaran sebelum siswa terblokir — bisa diganti admin di Pengaturan → Keamanan. */
export const DEFAULT_MAX_VIOLATIONS = 5;

/** Pesan saat siswa terblokir. */
export const BLOCKED_MESSAGE =
  "Statusmu terblokir karena terlalu banyak pelanggaran. Ujian tidak dapat dilanjutkan — minta guru membuka blokir dari halaman monitor ujian.";
