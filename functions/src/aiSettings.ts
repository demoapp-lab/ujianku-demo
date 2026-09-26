import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { adminField, db } from "./firebaseAdmin";

async function requireAdmin(auth?: { uid: string }): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Login diperlukan");
  const snap = await db.doc(`users/${auth.uid}`).get();
  if (!snap.exists || snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin only");
  }
}

export const saveAiSettings = onCall(async (request) => {
  await requireAdmin(request.auth);
  const { apiKey, model } = (request.data ?? {}) as { apiKey?: string; model?: string };
  if (!apiKey && !model) throw new HttpsError("invalid-argument", "apiKey atau model wajib");
  await db.doc("settings/aiConfig").set(
    {
      ...(apiKey ? { geminiApiKey: apiKey } : {}),
      ...(model ? { geminiModel: model } : {}),
      updatedBy: request.auth!.uid,
      updatedAt: adminField.serverTimestamp(),
    },
    { merge: true }
  );
  return { success: true };
});

export const getAiSettingsStatus = onCall(async (request) => {
  await requireAdmin(request.auth);
  const snap = await db.doc("settings/aiConfig").get();
  const d = snap.data();
  return { hasApiKey: Boolean(d?.geminiApiKey), model: d?.geminiModel ?? null };
});

export const listGeminiModels = onCall(async (request) => {
  await requireAdmin(request.auth);
  try {
    const snap = await db.doc("settings/aiConfig").get();
    const apiKey = snap.data()?.geminiApiKey;
    if (!apiKey) throw new HttpsError("failed-precondition", "API key belum diatur");

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const json = (await r.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      error?: { message?: string };
    };
    if (json.error) throw new HttpsError("internal", json.error.message ?? "API error");
    const models = (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ name: m.name, displayName: m.displayName ?? m.name }));
    return { models };
  } catch (err) {
    logger.error("listGeminiModels", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err instanceof Error ? err.message : "failed");
  }
});

export const testGeminiConnection = onCall(async (request) => {
  await requireAdmin(request.auth);
  try {
    const snap = await db.doc("settings/aiConfig").get();
    const apiKey = snap.data()?.geminiApiKey;
    const model = snap.data()?.geminiModel ?? "gemini-2.5-flash";
    if (!apiKey) return { ok: false, message: "API key belum disimpan" };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Balas hanya dengan kata: OK" }] }] }),
      }
    );
    if (r.ok) return { ok: true, message: `Terhubung ke ${model}` };
    const j = (await r.json()) as { error?: { message?: string } };
    return { ok: false, message: j.error?.message ?? `HTTP ${r.status}` };
  } catch (err) {
    logger.error("testGeminiConnection", err);
    return { ok: false, message: err instanceof Error ? err.message : "Gagal" };
  }
});
