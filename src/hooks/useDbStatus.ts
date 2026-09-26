import { useEffect, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "../lib/firebase";

export type DbStatus = "checking" | "connected" | "disconnected";

const PING_INTERVAL_MS = 20000;

export function useDbStatus(): DbStatus {
  const [status, setStatus] = useState<DbStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (!navigator.onLine) {
        if (!cancelled) setStatus("disconnected");
        return;
      }
      try {
        await getDocs(query(collection(db, "classes"), limit(1)));
        if (!cancelled) setStatus("connected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    }

    void ping();
    const interval = window.setInterval(() => void ping(), PING_INTERVAL_MS);
    const onOnline = () => void ping();
    const onOffline = () => {
      if (!cancelled) setStatus("disconnected");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return status;
}
