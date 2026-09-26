import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "teacher" | "student";

export type QuestionType = "multiple_choice" | "short_answer" | "essay" | "true_false";

export type ExamStatus = "draft" | "published" | "closed";

export type SubmissionStatus =
  | "in_progress"
  | "blocked"
  | "submitted"
  | "pending_grading"
  | "graded";

export type ViolationType =
  | "tab_switch"
  | "copy_paste"
  | "fullscreen_exit"
  | "window_blur"
  | "devtools_open";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  classId?: string;
  photoUrl?: string;
  createdAt?: Timestamp;
}

export interface ClassData {
  id: string;
  name: string;
  createdAt?: Timestamp;
}

export interface Subject {
  id: string;
  name: string;
  createdBy: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

/** Paket soal: wadah sebelum menambah soal — dipetakan ke 1 mapel + banyak kelas. */
export interface QuestionPackage {
  id: string;
  subjectId: string;
  classIds: string[];
  createdBy: string;
  createdAt?: Timestamp;
}

export interface Question {
  id: string;
  subjectId: string;
  packageId: string;
  /** Di-denormalisasi dari paket — untuk query bank saat membuat ujian. */
  classIds: string[];
  createdBy: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  imageDriveFileId?: string;
  options?: QuestionOption[];
  correctAnswer?: string;
  acceptedAnswers?: string[];
  rubric?: string;
  points: number;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  createdAt?: Timestamp;
}

/** Soal yang disajikan ke siswa — kunci jawaban sudah dibuang. */
export type StudentQuestion = Omit<Question, "correctAnswer" | "acceptedAnswers" | "rubric">;

export interface Exam {
  id: string;
  title: string;
  subjectId: string;
  /** Banyak kelas. */
  classIds: string[];
  /** @deprecated Ujian lama — satu kelas. */
  classId?: string;
  createdBy: string;
  questionIds: string[];
  duration: number;
  startTime: Timestamp;
  endTime: Timestamp;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultAfterSubmit: boolean;
  status: ExamStatus;
  createdAt?: Timestamp;
}

/** Normalisasi: ujian lama pakai classId tunggal, baru pakai classIds. */
export function examClassIds(exam: Pick<Exam, "classIds" | "classId">): string[] {
  if (exam.classIds?.length) return exam.classIds;
  if (exam.classId) return [exam.classId];
  return [];
}

export interface AnswerEntry {
  value: string;
  autoScore?: number;
  autoFeedback?: string;
  finalScore?: number;
  gradedBy?: "system" | string;
}

export interface Submission {
  id: string;
  examId: string;
  studentId: string;
  answers: Record<string, AnswerEntry>;
  objectiveScore: number;
  essayScore?: number;
  finalScore?: number;
  totalPoints: number;
  status: SubmissionStatus;
  startedAt: Timestamp;
  submittedAt?: Timestamp;
  gradedAt?: Timestamp;
  isFlagged?: boolean;
  /** Jumlah pelanggaran anti-kecurangan (kumulatif; direset saat buka blokir). */
  violationCount?: number;
}

export interface SubmissionLog {
  id: string;
  type: ViolationType;
  timestamp: Timestamp;
}

export interface AiConfigStatus {
  hasApiKey: boolean;
  model: string | null;
}

export interface SchoolInfo {
  schoolName: string;
  logoUrl: string;
}

export interface SecuritySettings {
  allowedUserAgents: string[];
  allowMultipleLogin: boolean;
  /** Jumlah pelanggaran sebelum siswa terblokir. */
  maxViolations: number;
}

export interface StudentSession {
  id: string;
  uid: string;
  name: string;
  email: string;
  classId?: string;
  userAgent: string;
  deviceId: string;
  loggedInAt: Timestamp;
  expiresAt: Timestamp;
}

export interface GeminiModel {
  name: string;
  displayName: string;
}
