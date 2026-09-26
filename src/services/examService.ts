import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Exam, ExamStatus } from "../types";

const col = collection(db, "exams");

export async function listExamsByTeacher(teacherId: string) {
  const snap = await getDocs(query(col, where("createdBy", "==", teacherId), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, "id">) })) as Exam[];
}

export async function listPublishedExamsForClass(classId: string, now = new Date()) {
  const [byArray, byLegacy] = await Promise.all([
    getDocs(query(col, where("classIds", "array-contains", classId), where("status", "==", "published"))),
    getDocs(query(col, where("classId", "==", classId), where("status", "==", "published"))),
  ]);

  const map = new Map<string, Exam>();
  for (const d of [...byArray.docs, ...byLegacy.docs]) {
    map.set(d.id, { id: d.id, ...(d.data() as Omit<Exam, "id">) });
  }

  return [...map.values()].filter((e) => {
    const end = e.endTime?.toDate?.() as Date | undefined;
    if (!end) return true;
    const grace = 24 * 60 * 60 * 1000;
    return end.getTime() + grace > now.getTime();
  });
}

export async function listExamsByStatus(status: ExamStatus) {
  const snap = await getDocs(query(col, where("status", "==", status)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, "id">) })) as Exam[];
}

export async function getExam(id: string) {
  const snap = await getDoc(doc(db, "exams", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Exam, "id">) } as Exam;
}

export async function createExam(data: Omit<Exam, "id" | "createdAt">) {
  const ref = await addDoc(col, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateExam(id: string, data: Partial<Exam>) {
  await updateDoc(doc(db, "exams", id), data);
}

export async function deleteExam(id: string) {
  await deleteDoc(doc(db, "exams", id));
}

export async function publishExam(id: string) {
  await updateExam(id, { status: "published" });
}
