import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { addToQueue, loadQueue, markQueueItem, removeFromQueue } from "../lib/offlineQueue.js";
import { useAuth } from "./AuthContext.jsx";
import { useLedger } from "./LedgerContext.jsx";

// Offline entry and sync for the Collection Clerk (FR 4.9). When there is no connection a delivery is kept on
// this device and sent later. The queue is sent one delivery at a time, oldest first, whenever the browser says
// the network is back, every 30 seconds while anything waits, and when the person asks. Only a lost connection
// stops the run. A delivery the server refuses (for example no price is set) stays in the list with the reason,
// so nobody loses it silently, and the person can send it again or discard it.

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const { user } = useAuth();
  const { reload } = useLedger();
  const userId = user.id;
  const [queue, setQueue] = useState(() => loadQueue(userId));
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(0);
  const running = useRef(false);

  useEffect(() => { setQueue(loadQueue(userId)); }, [userId]);

  const sync = useCallback(async ({ retryRefused = false } = {}) => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      for (const item of loadQueue(userId)) {
        if (item.error && !retryRefused) continue;
        try {
          await api("/deliveries", { method: "POST", body: item.body });
          setQueue(removeFromQueue(userId, item.clientId));
          sent += 1;
        } catch (err) {
          if (err.status == null || err.status === 401) break; // no connection, or signed out: try again later
          setQueue(markQueueItem(userId, item.clientId, err.message));
        }
      }
    } finally {
      running.current = false;
      setSyncing(false);
    }
    if (sent > 0) { setLastSynced(sent); reload(); }
  }, [userId, reload]);

  useEffect(() => {
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [sync]);

  const waiting = queue.filter((x) => !x.error).length;
  useEffect(() => {
    if (queue.length === 0) return undefined;
    sync();
    const timer = setInterval(() => { if (navigator.onLine) sync(); }, 30_000);
    return () => clearInterval(timer);
  }, [queue.length === 0, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a delivery on this device. Returns false if the browser will not store it.
  const enqueue = useCallback((item) => {
    const list = addToQueue(userId, { ...item, savedAt: new Date().toISOString() });
    if (!list) return false;
    setQueue(list);
    return true;
  }, [userId]);

  const discard = useCallback((clientId) => setQueue(removeFromQueue(userId, clientId)), [userId]);
  const retry = useCallback(() => sync({ retryRefused: true }), [sync]);

  const value = useMemo(() => ({
    online, queue, waiting, refused: queue.length - waiting, syncing, lastSynced, enqueue, discard, sync, retry,
  }), [online, queue, waiting, syncing, lastSynced, enqueue, discard, sync, retry]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside OfflineProvider");
  return ctx;
}
