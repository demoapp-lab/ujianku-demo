import { collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { hashPassword } from "../lib/password";
import type { Role } from "../types";

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const IDP_BASE = "https://identitytoolkit.googleapis.com/v1";

const ERROR_MAP: Record<string, string> = {
  EMAIL_EXISTS: "Email sudah terdaftar",
  INVALID_EMAIL: "Email tidak valid",
  WEAK_PASSWORD: "Kata sandi minimal 6 karakter",
  EMAIL_NOT_FOUND: "Email tidak ditemukan di Firebase Auth",
  OPERATION_NOT_ALLOWED: "Email/password belum diaktifkan di Firebase Console → Authentication",
  INVALID_LOGIN_CREDENTIALS: "Kredensial tidak valid",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Terlalu banyak percobaan, coba lagi nanti",
};

function mapIdpError(raw: string): string {
  const code = raw.trim().split(/[\s:]/)[0] ?? "";
  return ERROR_MAP[code] ?? raw;
}

async function idpRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${IDP_BASE}/${path}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(mapIdpError(msg));
  }
  return data;
}

/**
 * Admin → akun Firebase Auth + dokumen users.
 * Guru/siswa → HANYA dokumen users + password hash (tidak masuk Authentication).
 */
export async function createUserByAdmin(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
  classId?: string;
}): Promise<{ uid: string }> {
  const email = input.email.trim().toLowerCase();
  const { password, name, role, classId } = input;

  if (role === "admin") {
    const created = await idpRequest<{ localId: string }>("accounts:signUp", {
      email,
      password,
      displayName: name,
      returnSecureToken: false,
    });
    const uid = created.localId;
    await setDoc(doc(db, "users", uid), {
      uid,
      name,
      email,
      role,
      classId: "",
      createdAt: serverTimestamp(),
    });
    return { uid };
  }

  const uid = doc(collection(db, "users")).id;
  const passwordHash = await hashPassword(password, email);
  await setDoc(doc(db, "users", uid), {
    uid,
    name,
    email,
    role,
    classId: role === "student" ? (classId ?? "") : "",
    passwordHash,
    createdAt: serverTimestamp(),
  });
  return { uid };
}

/** Hanya admin (Firebase Auth). */
export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean }> {
  await idpRequest("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email: email.trim().toLowerCase(),
  });
  return { success: true };
}

/** Guru/siswa: set hash password baru di Firestore (default 123456). */
export async function resetLocalUserPassword(
  uid: string,
  email: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hashPassword(newPassword, email);
  await updateDoc(doc(db, "users", uid), { passwordHash });
}
