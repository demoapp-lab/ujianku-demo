import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { auth, db, adminField } from "./firebaseAdmin";

const DEFAULT_PASSWORD = "123456";

async function requireAdmin(authUid?: string): Promise<void> {
  if (!authUid) throw new HttpsError("unauthenticated", "Login diperlukan");
  const snap = await db.doc(`users/${authUid}`).get();
  if (!snap.exists || snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Hanya admin");
  }
}

function mapAuthError(err: unknown): never {
  const code = String((err as { code?: string })?.code ?? "");
  const map: Record<string, string> = {
    "auth/email-already-exists": "Email sudah terdaftar",
    "auth/invalid-email": "Email tidak valid",
    "auth/weak-password": "Kata sandi minimal 6 karakter",
    "auth/user-not-found": "Pengguna tidak ditemukan",
    "auth/invalid-password": "Kata sandi tidak valid",
    "auth/uid-already-exists": "UID sudah dipakai",
  };
  const msg = map[code] ?? (err instanceof Error ? err.message : "Gagal memproses");
  if (code.includes("already-exists")) {
    throw new HttpsError("already-exists", msg);
  }
  if (code.startsWith("auth/invalid") || code === "auth/weak-password") {
    throw new HttpsError("invalid-argument", msg);
  }
  if (code === "auth/user-not-found") {
    throw new HttpsError("not-found", msg);
  }
  throw new HttpsError("internal", msg);
}

/** Buat akun Auth + dokumen users tanpa mengganti sesi admin yang sedang login. */
export const createUserByAdmin = onCall(async (request) => {
  try {
    await requireAdmin(request.auth?.uid);
    const { email, password, name, role, classId } = (request.data ?? {}) as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
      classId?: string;
    };

    if (!email?.trim() || !password || !name?.trim() || !role) {
      throw new HttpsError("invalid-argument", "email, password, name, role wajib diisi");
    }
    if (!["admin", "teacher", "student"].includes(role)) {
      throw new HttpsError("invalid-argument", "Role tidak valid");
    }
    if (password.length < 6) {
      throw new HttpsError("invalid-argument", "Kata sandi minimal 6 karakter");
    }
    if (role === "student" && !classId) {
      throw new HttpsError("invalid-argument", "Siswa harus punya kelas");
    }

    let uid: string;
    try {
      const user = await auth.createUser({
        email: email.trim(),
        password,
        displayName: name.trim(),
      });
      uid = user.uid;
    } catch (err) {
      logger.error("createUserByAdmin:auth", err);
      mapAuthError(err);
    }

    try {
      await db.doc(`users/${uid}`).set({
        uid,
        name: name.trim(),
        email: email.trim(),
        role,
        classId: role === "student" ? classId : "",
        createdAt: adminField.serverTimestamp(),
      });
    } catch (err) {
      logger.error("createUserByAdmin:firestore", err);
      // rollback Auth agar tidak ada akun yatim
      await auth.deleteUser(uid).catch(() => undefined);
      throw new HttpsError(
        "internal",
        `Gagal menyimpan profil pengguna: ${err instanceof Error ? err.message : "unknown"}`
      );
    }

    return { uid };
  } catch (err) {
    logger.error("createUserByAdmin", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      err instanceof Error ? err.message : "Gagal membuat pengguna"
    );
  }
});

/** Reset password pengguna (admin/guru/siswa) ke password default. */
export const resetUserPassword = onCall(async (request) => {
  try {
    await requireAdmin(request.auth?.uid);
    const uid = (request.data as { uid?: string })?.uid;
    if (!uid) throw new HttpsError("invalid-argument", "uid wajib diisi");
    if (uid === request.auth!.uid) {
      throw new HttpsError("failed-precondition", "Tidak bisa reset password akun sendiri");
    }

    try {
      await auth.updateUser(uid, { password: DEFAULT_PASSWORD });
    } catch (err) {
      logger.error("resetUserPassword:auth", err);
      if ((err as { code?: string }).code === "auth/user-not-found") {
        throw new HttpsError("not-found", "Akun Auth tidak ditemukan untuk uid ini");
      }
      mapAuthError(err);
    }

    return { success: true, defaultPassword: DEFAULT_PASSWORD };
  } catch (err) {
    logger.error("resetUserPassword", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      err instanceof Error ? err.message : "Gagal reset password"
    );
  }
});
