import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";

const AuthContext = createContext(null);

const IDLE_MS = 15 * 60 * 1000; // matches the server's 15 minute limit (NFR 13)
const IDLE_MESSAGE = "You were signed out after 15 minutes without activity. Sign in again.";

// Holds the signed-in user for the whole app. The server owns the session cookie and enforces the
// idle limit; this only remembers who it belongs to and signs the screen out when the limit passes.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const lastActive = useRef(Date.now());

  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // The server says the session is over. Only a person who was signed in on this screen is told why:
  // a visitor who was never signed in (or has an old cookie) sees no warning.
  const userRef = useRef(null);
  userRef.current = user;
  useEffect(() => {
    const onSignedOut = (e) => {
      if (!userRef.current) return;
      const reason = e.detail;
      if (reason === IDLE_MESSAGE) setNotice(IDLE_MESSAGE);
      else if (reason && reason !== "Sign in to continue.") setNotice(reason); // for example, account deactivated
      setUser(null);
    };
    window.addEventListener("agri:signed-out", onSignedOut);
    return () => window.removeEventListener("agri:signed-out", onSignedOut);
  }, []);

  // Count activity, and sign out once nothing has happened for 15 minutes.
  useEffect(() => {
    if (!user) return undefined;
    lastActive.current = Date.now();
    const touch = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current >= IDLE_MS) {
        api("/auth/logout", { method: "POST" }).catch(() => {});
        setNotice(IDLE_MESSAGE);
        setUser(null);
      }
    }, 20_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      clearInterval(timer);
    };
  }, [user]);

  const login = useCallback(async (credentials) => {
    const signedIn = await api("/auth/login", { method: "POST", body: credentials });
    setNotice("");
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setNotice("");
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, notice, login, logout }), [user, loading, notice, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
