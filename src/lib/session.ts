import type { AppUser } from "../types";

const KEY = "cbt_session";
const DEVICE_KEY = "cbt_device_id";
export const TTL_MS = 12 * 60 * 60 * 1000;

type StoredSession = AppUser & { exp: number };

export function saveLocalSession(user: AppUser): void {
  const payload: StoredSession = { ...user, exp: Date.now() + TTL_MS };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadLocalSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.uid || !parsed?.exp || parsed.exp < Date.now()) {
      clearLocalSession();
      return null;
    }
    const { exp: _exp, ...user } = parsed;
    return user;
  } catch {
    clearLocalSession();
    return null;
  }
}

export function clearLocalSession(): void {
  localStorage.removeItem(KEY);
}

/** ID stabil per browser — untuk membedakan login device yang sama vs device lain. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}
