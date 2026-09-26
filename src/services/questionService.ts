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
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Question, QuestionType } from "../types";
import { PAGE_SIZE } from "../utils/constants";

const col = collection(db, "questions");

export async function listQuestions(opts: {
  subjectId?: string;
  packageId?: string;
  classIds?: string[];
  type?: QuestionType;
  cursor?: QueryDocumentSnapshot;
  createdBy?: string;
}) {
  const constraints = [];
  if (opts.packageId) constraints.push(where("packageId", "==", opts.packageId));
  if (opts.subjectId) constraints.push(where("subjectId", "==", opts.subjectId));
  if (opts.classIds?.length) constraints.push(where("classIds", "array-contains-any", opts.classIds));
  if (opts.type) constraints.push(where("type", "==", opts.type));
  if (opts.createdBy) constraints.push(where("createdBy", "==", opts.createdBy));
  constraints.push(orderBy("createdAt", "desc"), limit(PAGE_SIZE));
  if (opts.cursor) constraints.push(startAfter(opts.cursor));

  const snap = await getDocs(query(col, ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, "id">) })) as Question[],
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === PAGE_SIZE,
  };
}

/** Ambil semua soal bank untuk ujian (mapel + kelas) — paginate sampai habis. */
export async function listExamBankQuestions(opts: { subjectId: string; classIds: string[] }, max = 500) {
  const items: Question[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  if (!opts.subjectId || !opts.classIds.length) return items;

  for (;;) {
    const res = await listQuestions({
      subjectId: opts.subjectId,
      classIds: opts.classIds,
      cursor: cursor ?? undefined,
    });
    items.push(...res.items);
    if (!res.hasMore || !res.cursor || items.length >= max) break;
    cursor = res.cursor;
  }
  return items.slice(0, max);
}

export async function getQuestion(id: string) {
  const snap = await getDoc(doc(db, "questions", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Question, "id">) } as Question;
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  const results = await Promise.all(ids.map((id) => getQuestion(id)));
  return results.filter((q): q is Question => q !== null);
}

export async function createQuestion(data: Omit<Question, "id" | "createdAt">) {
  const ref = await addDoc(col, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateQuestion(id: string, data: Partial<Question>) {
  await updateDoc(doc(db, "questions", id), data);
}

export async function deleteQuestion(id: string) {
  await deleteDoc(doc(db, "questions", id));
}
