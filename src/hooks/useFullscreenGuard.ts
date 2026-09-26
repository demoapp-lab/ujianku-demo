import { useCallback, useEffect, useRef, useState } from "react";
import { addViolationLog } from "../services/resultService";
import type { ViolationType } from "../types";
import { DEFAULT_MAX_VIOLATIONS } from "../utils/constants";

/**
 * Anti-kecurangan: fullscreen, tab switch, copy/paste, beforeunload.
 * Setiap pelanggaran dicatat ke submissions/{id}/logs dan menghitung violationCount.
 * Saat hitungan mencapai maxViolations → onBlocked (status siswa jadi "blocked").
 */
export function useFullscreenGuard({
  active,
  submissionId,
  initialCount = 0,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
  onViolation,
  onBlocked,
}: {
  active: boolean;
  submissionId: string | null;
  /** Lanjutkan hitungan pelanggaran dari sesi sebelumnya (mis. setelah refresh). */
  initialCount?: number;
  /** Max pelanggaran sebelum siswa terblokir (dari Pengaturan → Keamanan). */
  maxViolations?: number;
  onViolation?: (count: number, type: ViolationType) => void;
  onBlocked?: () => void;
}) {
  const countRef = useRef(initialCount);
  const [warning, setWarning] = useState<string | null>(null);
  const [supported] = useState(() => typeof document !== "undefined");

  useEffect(() => {
    if (initialCount > countRef.current) countRef.current = initialCount;
  }, [initialCount]);

  // Hitungan tersimpan sudah mencapai max (mis. admin menurunkan batas) → blokir.
  useEffect(() => {
    if (active && countRef.current >= maxViolations) onBlocked?.();
  }, [active, maxViolations, initialCount, onBlocked]);

  const log = useCallback(
    async (type: ViolationType) => {
      if (!submissionId || !active) return;
      countRef.current += 1;
      if (type === "fullscreen_exit") setWarning("Kamu keluar dari mode layar penuh.");
      const count = countRef.current;
      onViolation?.(count, type);
      if (count >= maxViolations) onBlocked?.();
      try {
        await addViolationLog(submissionId, type, count);
      } catch {
        /* offline — akan hilang, bukan fatal */
      }
    },
    [submissionId, active, onViolation, onBlocked, maxViolations]
  );

  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const backToFullscreen = useCallback(() => {
    enterFullscreen();
    setWarning(null);
  }, [enterFullscreen]);

  useEffect(() => {
    if (!active || !supported) return;

    const onFsChange = () => {
      if (!document.fullscreenElement) {
        void log("fullscreen_exit");
      } else {
        setWarning(null);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void log("tab_switch");
      }
    };
    const onBlur = () => {
      void log("window_blur");
    };
    const onContext = (e: Event) => e.preventDefault();
    const onCopy = (e: Event) => {
      e.preventDefault();
      void log("copy_paste");
    };
    const onPaste = (e: Event) => {
      e.preventDefault();
      void log("copy_paste");
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active, supported, log]);

  return { warning, setWarning, enterFullscreen, backToFullscreen, report: log, violations: countRef };
}
