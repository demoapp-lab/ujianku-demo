import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { TTL_MS } from "../lib/session";
import type { AppUser, StudentSession } from "../types";

const col = collection(db, "studentSessions");

function isExpired(data: { expiresAt?: { toDate?: () => Date } | null }): boolean {
  const t = data.expiresAt?.toDate?.()?.getTime() ?? 0;
  return t < Date.now();
}

export async function getActiveStudentSession(uid: string): Promise<StudentSession | null> {
  try {
    const snap = await getDoc(doc(db, "studentSessions", uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Omit<StudentSession, "id">;
    if (isExpired(data)) return null;
    return { id: snap.id, ...data };
  } catch {
    return null;
  }
}

export async function createStudentSession(user: AppUser, deviceId: string): Promise<void> {
  await setDoc(doc(db, "studentSessions", user.uid), {
    uid: user.uid,
    name: user.name,
    email: user.email,
    ...(user.classId ? { classId: user.classId } : {}),
    userAgent: navigator.userAgent,
    deviceId,
    loggedInAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + TTL_MS),
  });
}

export async function deleteStudentSession(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "studentSessions", uid));
  } catch {
    /* sesi mungkin sudah dihapus admin */
  }
}

export async function listStudentSessions(max = 200): Promise<StudentSession[]> {
  const snap = await getDocs(query(col, limit(max)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StudentSession, "id">) }))
    .sort((a, b) => (b.loggedInAt?.toDate?.()?.getTime() ?? 0) - (a.loggedInAt?.toDate?.()?.getTime() ?? 0));
}

export async function resetStudentSession(uid: string): Promise<void> {
  await deleteDoc(doc(db, "studentSessions", uid));
}

export function studentSessionExpired(session: Pick<StudentSession, "expiresAt">): boolean {
  return isExpired(session);
}
