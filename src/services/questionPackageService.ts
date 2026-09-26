import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { QuestionPackage } from "../types";

const col = collection(db, "questionPackages");
const questionsCol = collection(db, "questions");
const BATCH = 400;

export async function listPackages(createdBy?: string) {
  const constraints = createdBy ? [where("createdBy", "==", createdBy)] : [];
  const snap = await getDocs(query(col, ...constraints, orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionPackage, "id">) })) as QuestionPackage[];
}

export async function getPackage(id: string) {
  const snap = await getDoc(doc(db, "questionPackages", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<QuestionPackage, "id">) } as QuestionPackage;
}

export async function createPackage(data: Omit<QuestionPackage, "id" | "createdAt">) {
  const ref = await addDoc(col, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

/** Sinkronkan soal di dalam paket saat subject/class berubah. */
export async function updatePackage(id: string, data: Partial<Omit<QuestionPackage, "id" | "createdAt">>) {
  await updateDoc(doc(db, "questionPackages", id), data);

  if (data.subjectId === undefined && data.classIds === undefined) return;

  const snap = await getDocs(query(questionsCol, where("packageId", "==", id)));
  const patch: Record<string, unknown> = {};
  if (data.subjectId !== undefined) patch.subjectId = data.subjectId;
  if (data.classIds !== undefined) patch.classIds = data.classIds;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH)) batch.update(d.ref, patch);
    await batch.commit();
  }
}

export async function deletePackageCascade(id: string) {
  const snap = await getDocs(query(questionsCol, where("packageId", "==", id)));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH)) batch.delete(d.ref);
    await batch.commit();
  }
  await deleteDoc(doc(db, "questionPackages", id));
}

export async function countQuestionsInPackage(packageId: string): Promise<number> {
  const snap = await getDocs(query(questionsCol, where("packageId", "==", packageId)));
  return snap.size;
}
