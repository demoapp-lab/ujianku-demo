import { useEffect, useRef, useState } from "react";

/**
 * Hitung mundur berdasar server time + duration menit.
 * Tidak mengandalkan jam client murni: endMs dihitung dari (serverNow + sisa) saat mount.
 */
export function useExamTimer({
  endMs,
  onExpire,
}: {
  endMs: number | null;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    endMs ? Math.max(0, Math.floor((endMs - Date.now()) / 1000)) : 0
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!endMs) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endMs, onExpire]);

  return { remaining, expired: remaining <= 0 };
}
