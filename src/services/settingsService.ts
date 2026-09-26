import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { AiConfigStatus, GeminiModel, SchoolInfo, SecuritySettings } from "../types";
import { DEFAULT_MAX_VIOLATIONS } from "../utils/constants";

const AI_CONFIG_PATH = "settings/aiConfig";
const SCHOOL_PATH = "settings/school";
const SECURITY_PATH = "settings/security";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface AiConfigDoc {
  geminiApiKey?: string;
  geminiModel?: string;
}

async function readAiConfig(): Promise<AiConfigDoc> {
  const snap = await getDoc(doc(db, AI_CONFIG_PATH));
  return (snap.data() ?? {}) as AiConfigDoc;
}

function friendlyError(err: unknown): Error {
  const code = (err as { code?: string } | null)?.code;
  if (code === "permission-denied") {
    return new Error("Izin ditolak — terbitkan firestore.rules terbaru di Firebase Console");
  }
  return err instanceof Error ? err : new Error("Terjadi kesalahan");
}

function mapGeminiError(status: number, message: string): string {
  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return "API key tidak valid — periksa kembali";
  }
  if (status === 403) return "API key ditolak (403) — cek restrictions di Google AI Studio";
  if (status === 429) return "Kuota Gemini habis (429) — coba lagi nanti";
  return message || `HTTP ${status}`;
}

function stripModelsPrefix(name: string): string {
  return name.replace(/^models\//, "");
}

const NON_TEXT_MODEL = /(tts|image|nano|lyria|transcribe|robotics|computer-use|antigravity|deep-research|omni|veo|embed)/i;

function isTextModel(name: string, displayName: string): boolean {
  return !NON_TEXT_MODEL.test(name) && !NON_TEXT_MODEL.test(displayName);
}

export async function saveAiSettings(apiKey: string, model: string): Promise<void> {
  try {
    await setDoc(
      doc(db, AI_CONFIG_PATH),
      {
        ...(apiKey.trim() ? { geminiApiKey: apiKey.trim() } : {}),
        ...(model.trim() ? { geminiModel: stripModelsPrefix(model.trim()) } : {}),
        updatedBy: auth.currentUser?.uid ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    throw friendlyError(err);
  }
}

export async function getAiSettingsStatus(): Promise<AiConfigStatus> {
  try {
    const d = await readAiConfig();
    return { hasApiKey: Boolean(d.geminiApiKey), model: d.geminiModel ?? null };
  } catch {
    return { hasApiKey: false, model: null };
  }
}

export async function getSchoolInfo(): Promise<SchoolInfo> {
  try {
    const snap = await getDoc(doc(db, SCHOOL_PATH));
    const d = (snap.data() ?? {}) as { schoolName?: string; logoUrl?: string };
    return { schoolName: d.schoolName ?? "", logoUrl: d.logoUrl ?? "" };
  } catch {
    return { schoolName: "", logoUrl: "" };
  }
}

export async function saveSchoolInfo(info: SchoolInfo): Promise<void> {
  try {
    await setDoc(
      doc(db, SCHOOL_PATH),
      {
        schoolName: info.schoolName.trim(),
        logoUrl: info.logoUrl.trim(),
        updatedBy: auth.currentUser?.uid ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    throw friendlyError(err);
  }
}

function normalizeMaxViolations(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : Number(value);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_VIOLATIONS;
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  try {
    const snap = await getDoc(doc(db, SECURITY_PATH));
    const d = (snap.data() ?? {}) as {
      allowedUserAgents?: unknown;
      allowMultipleLogin?: unknown;
      maxViolations?: unknown;
    };
    const list = Array.isArray(d.allowedUserAgents)
      ? d.allowedUserAgents.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
    return {
      allowedUserAgents: list,
      allowMultipleLogin: typeof d.allowMultipleLogin === "boolean" ? d.allowMultipleLogin : true,
      maxViolations: d.maxViolations === undefined ? DEFAULT_MAX_VIOLATIONS : normalizeMaxViolations(d.maxViolations),
    };
  } catch {
    return { allowedUserAgents: [], allowMultipleLogin: true, maxViolations: DEFAULT_MAX_VIOLATIONS };
  }
}

export async function saveSecuritySettings(settings: SecuritySettings): Promise<void> {
  const normalized = [...new Set(settings.allowedUserAgents.map((s) => s.trim()).filter(Boolean))];
  try {
    await setDoc(
      doc(db, SECURITY_PATH),
      {
        allowedUserAgents: normalized,
        allowMultipleLogin: settings.allowMultipleLogin,
        maxViolations: normalizeMaxViolations(settings.maxViolations),
        updatedBy: auth.currentUser?.uid ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    throw friendlyError(err);
  }
}

export function isUserAgentAllowed(allowed: string[], ua: string = navigator.userAgent): boolean {
  if (allowed.length === 0) return true;
  const uaLc = ua.toLowerCase();
  return allowed.some((entry) => entry.trim() !== "" && uaLc.includes(entry.trim().toLowerCase()));
}

async function resolveKey(typedKey?: string): Promise<string> {
  const typed = typedKey?.trim();
  if (typed) return typed;
  try {
    return (await readAiConfig()).geminiApiKey?.trim() ?? "";
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "permission-denied") {
      throw new Error("Izin ditolak — terbitkan firestore.rules terbaru di Firebase Console");
    }
    return "";
  }
}

export async function listGeminiModels(typedKey?: string): Promise<GeminiModel[]> {
  const key = await resolveKey(typedKey);
  if (!key) throw new Error("API key belum diisi — ketik API key lalu klik Muat daftar model");

  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}`);
  } catch {
    throw new Error("Tidak bisa terhubung ke Gemini — cek koneksi internet");
  }

  const json = (await res.json().catch(() => ({}))) as {
    models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(mapGeminiError(res.status, json.error?.message ?? ""));
  }

  return (json.models ?? [])
    .filter(
      (m) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        isTextModel(m.name, m.displayName ?? "")
    )
    .map((m) => {
      const name = stripModelsPrefix(m.name);
      return { name, displayName: m.displayName ?? name };
    });
}

export async function testGeminiConnection(opts?: {
  apiKey?: string;
  model?: string;
}): Promise<{ ok: boolean; message: string }> {
  let key = opts?.apiKey?.trim() ?? "";
  let model = opts?.model?.trim() ?? "";
  if (!key || !model) {
    try {
      const stored = await readAiConfig();
      key = key || stored.geminiApiKey?.trim() || "";
      model = model || stored.geminiModel?.trim() || "";
    } catch {
      /* rules belum terbit — pakai nilai input saja */
    }
  }
  if (!key) return { ok: false, message: "API key belum diisi — ketik API key lalu Simpan/Test" };
  model = stripModelsPrefix(model || "gemini-2.5-flash");

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Balas hanya dengan kata: OK" }] }] }),
      }
    );
    if (res.ok) return { ok: true, message: `Terhubung ke ${model}` };
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, message: mapGeminiError(res.status, json.error?.message ?? "") };
  } catch {
    return { ok: false, message: "Tidak bisa terhubung ke Gemini — cek koneksi internet" };
  }
}

/** Panggil Gemini generateContent dengan konfigurasi AI tersimpan (Settings admin). */
export async function generateText(prompt: string): Promise<string> {
  let key = "";
  let model = "";
  try {
    const stored = await readAiConfig();
    key = stored.geminiApiKey?.trim() ?? "";
    model = stored.geminiModel?.trim() ?? "";
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "permission-denied") {
      throw new Error("Izin ditolak — terbitkan firestore.rules terbaru di Firebase Console");
    }
    throw new Error("Gagal membaca pengaturan AI");
  }
  if (!key) throw new Error("API key Gemini belum diatur — minta admin isi di menu Pengaturan");
  model = stripModelsPrefix(model || "gemini-2.5-flash");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  let json: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  try {
    res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    json = (await res.json().catch((err: unknown) => {
      if ((err as { name?: string } | null)?.name === "AbortError") throw err;
      return {};
    })) as typeof json;
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError") {
      throw new Error("AI tidak merespons (timeout 60 detik) — coba lagi");
    }
    throw new Error("Tidak bisa terhubung ke Gemini — cek koneksi internet");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok || json.error) {
    throw new Error(mapGeminiError(res.status, json.error?.message ?? ""));
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini mengembalikan respons kosong — coba lagi");
  return text;
}
