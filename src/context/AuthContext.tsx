import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { clearLocalSession, getDeviceId, loadLocalSession, saveLocalSession } from "../lib/session";
import { verifyPassword } from "../lib/password";
import { getSecuritySettings, isUserAgentAllowed } from "../services/settingsService";
import {
  createStudentSession,
  deleteStudentSession,
  getActiveStudentSession,
} from "../services/studentSessionService";
import type { AppUser } from "../types";

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AppUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

function stripSecrets(data: Record<string, unknown>, uid: string): AppUser {
  const { passwordHash: _ph, ...rest } = data;
  return { uid, ...(rest as Omit<AppUser, "uid">) };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [fbReady, setFbReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (fbUser) {
        try {
          const snap = await getDoc(doc(db, "users", fbUser.uid));
          if (snap.exists()) {
            const profile = stripSecrets(snap.data() as Record<string, unknown>, fbUser.uid);
            if (profile.role === "admin") {
              clearLocalSession();
              setUser(profile);
            } else {
              setUser(profile);
            }
          } else {
            setUser(loadLocalSession());
          }
        } catch {
          setUser(loadLocalSession());
        }
      } else {
        setUser(loadLocalSession());
      }
      setFbReady(true);
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshUser = useCallback(async () => {
    const fb = auth.currentUser;
    if (fb) {
      const snap = await getDoc(doc(db, "users", fb.uid));
      if (snap.exists()) {
        setUser(stripSecrets(snap.data() as Record<string, unknown>, fb.uid));
        return;
      }
    }
    setUser(loadLocalSession());
  }, []);

  useEffect(() => {
    if (user?.role !== "student") return;
    let initial = true;
    const unsub = onSnapshot(
      doc(db, "studentSessions", user.uid),
      (snap) => {
        if (!snap.exists()) {
          if (initial) {
            initial = false;
            void createStudentSession(user, getDeviceId()).catch(() => undefined);
            return;
          }
          clearLocalSession();
          setUser(null);
          return;
        }
        initial = false;
        const data = snap.data() as { expiresAt?: { toDate?: () => Date } | null };
        const t = data.expiresAt?.toDate?.()?.getTime() ?? 0;
        if (t < Date.now()) {
          clearLocalSession();
          setUser(null);
        }
      },
      () => {
        /* rules belum terbit / offline — jangan tendang siswa */
      }
    );
    return unsub;
  }, [user]);

  const login = useCallback(async (email: string, password: string): Promise<AppUser> => {
    const emailNorm = email.trim().toLowerCase();
    const snap = await getDocs(query(collection(db, "users"), where("email", "==", emailNorm)));
    if (snap.empty) {
      throw new Error("Email tidak terdaftar");
    }
    const userDoc = snap.docs[0];
    const data = userDoc.data() as Record<string, unknown>;
    const role = data.role as string;

    if (role === "admin") {
      clearLocalSession();
      const cred = await signInWithEmailAndPassword(auth, emailNorm, password);
      const profileSnap = await getDoc(doc(db, "users", cred.user.uid));
      if (!profileSnap.exists()) {
        await signOut(auth);
        throw new Error("Akun admin belum terdaftar di sistem");
      }
      const profile = stripSecrets(profileSnap.data() as Record<string, unknown>, cred.user.uid);
      setUser(profile);
      return profile;
    }

    if (auth.currentUser) {
      await signOut(auth);
    }

    if (role === "student") {
      const security = await getSecuritySettings();
      if (!isUserAgentAllowed(security.allowedUserAgents)) {
        throw new Error("Browser ini tidak diizinkan untuk masuk. Silakan gunakan browser yang ditentukan sekolah.");
      }

      const okPass = await verifyPassword(password, emailNorm, data.passwordHash as string | undefined);
      if (!okPass) {
        throw new Error("Kata sandi salah");
      }

      const profile = stripSecrets(data, userDoc.id);
      const deviceId = getDeviceId();
      const existing = await getActiveStudentSession(profile.uid);

      if (!security.allowMultipleLogin && existing && existing.deviceId !== deviceId) {
        throw new Error(
          "Akun ini sudah login di perangkat lain. Silakan logout di perangkat tersebut (atau minta admin mereset sesi) sebelum login kembali."
        );
      }

      try {
        await createStudentSession(profile, deviceId);
      } catch {
        /* rules belum terbit — login tetap lanjut (fail-open) */
      }

      saveLocalSession(profile);
      setUser(profile);
      return profile;
    }

    const ok = await verifyPassword(password, emailNorm, data.passwordHash as string | undefined);
    if (!ok) {
      throw new Error("Kata sandi salah");
    }
    const profile = stripSecrets(data, userDoc.id);
    saveLocalSession(profile);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    const current = loadLocalSession();
    if (current?.role === "student" && current.uid) {
      await deleteStudentSession(current.uid);
    }
    clearLocalSession();
    if (auth.currentUser) {
      await signOut(auth);
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading: loading || !fbReady, login, logout, refreshUser }),
    [user, loading, fbReady, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}
