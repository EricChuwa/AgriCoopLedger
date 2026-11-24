import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "./AuthContext.jsx";

// The cooperative's small, shared data (farmers, produce and prices, staff, corrections), loaded from the
// server. Deliveries, payments, statements, reports and the dashboard are NOT loaded here: each screen asks
// the server for just the page or total it needs, and asks again when `version` changes after a saved change.
// The server owns every rule (prices, balances, overpayment, voiding, roles).
//
// Every change function returns { data } on success or { error: { field?, message } } when the
// server refuses, so a form can show the message beside the field that caused it.

const LedgerContext = createContext(null);

const asResult = async (promise) => {
  try {
    return { data: await promise };
  } catch (err) {
    return { error: { field: err.field, message: err.message } };
  }
};

const EMPTY = { coop: null, farmers: [], produce: [], staff: [], corrections: [] };

export function LedgerProvider({ children }) {
  const { user } = useAuth();
  const role = user.role;
  const [state, setState] = useState(EMPTY);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const calls = {
        coop: api("/cooperative"),
        farmers: api("/farmers"),
        produce: api("/produce"),
        staff: role === "manager" ? api("/users") : Promise.resolve([]),
        corrections: role === "manager" || role === "clerk" ? api("/corrections") : Promise.resolve([]),
      };
      const entries = await Promise.all(Object.entries(calls).map(async ([k, p]) => [k, await p]));
      setState(Object.fromEntries(entries));
      setStatus("ready");
      setLoadError("");
      setVersion((v) => v + 1);
    } catch (err) {
      setLoadError(err.message);
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  // Run a change, then reload so every screen shows what the server now holds.
  const change = useCallback(async (promise) => {
    const result = await asResult(promise);
    if (!result.error) await load();
    return result;
  }, [load]);

  const { coop, farmers, produce, staff, corrections } = state;

  const activeFarmers = useMemo(() => farmers.filter((f) => f.is_active), [farmers]);
  const activeProduce = useMemo(() => produce.filter((p) => p.is_active), [produce]);
  const balanceOf = useCallback((farmerId) => farmers.find((f) => f.id === farmerId)?.balance ?? 0, [farmers]);

  // The price in force for a produce type and grade on a date, for the preview slip only.
  // The server works out the real one when the delivery is saved.
  const priceOn = useCallback((produceId, grade, iso) => {
    const item = produce.find((p) => p.id === produceId);
    if (!item) return null;
    const hits = item.prices.filter((p) => p.grade === grade && p.effective_from <= iso);
    hits.sort((a, b) => (a.effective_from === b.effective_from ? b.id - a.id : a.effective_from < b.effective_from ? 1 : -1));
    return hits[0]?.price_per_kg ?? null;
  }, [produce]);

  const actions = useMemo(() => ({
    addFarmer: (body) => change(api("/farmers", { method: "POST", body })),
    updateFarmer: (id, body) => change(api(`/farmers/${id}`, { method: "PATCH", body })),
    setFarmerActive: (id, active) => change(api(`/farmers/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" })),

    addDelivery: (body) => change(api("/deliveries", { method: "POST", body })),
    correctDelivery: (id, body) => change(api(`/deliveries/${id}/correct`, { method: "POST", body })),
    voidDelivery: (id, reason) => change(api(`/deliveries/${id}/void`, { method: "POST", body: { reason } })),
    requestCorrection: (body) => change(api("/corrections", { method: "POST", body })),
    decideCorrection: (id, decision, note) => change(api(`/corrections/${id}/${decision}`, { method: "POST", body: { note: note || "" } })),

    addPayment: (body) => change(api("/payments", { method: "POST", body })),
    voidPayment: (id, reason) => change(api(`/payments/${id}/void`, { method: "POST", body: { reason } })),

    addProduce: (body) => change(api("/produce", { method: "POST", body })),
    setPrice: (produceId, body) => change(api(`/produce/${produceId}/prices`, { method: "POST", body })),
    renameProduce: (id, name) => change(api(`/produce/${id}`, { method: "PATCH", body: { name } })),
    setProduceActive: (id, is_active) => change(api(`/produce/${id}`, { method: "PATCH", body: { is_active } })),

    addStaff: (body) => change(api("/users", { method: "POST", body })),
    updateStaff: (id, body) => change(api(`/users/${id}`, { method: "PATCH", body })),
    approveStaff: (id, role) => change(api(`/users/${id}/approve`, { method: "POST", body: { role } })),
    rejectStaff: (id) => change(api(`/users/${id}/reject`, { method: "POST" })),
    resetStaffPassword: (id) => asResult(api(`/users/${id}/reset-password`, { method: "POST" })),

    updateCoop: (body) => change(api("/cooperative", { method: "PATCH", body })),
  }), [change]);

  const value = useMemo(() => ({
    status, loadError, reload: load, version,
    coop: coop ?? { name: user.cooperative_name, district: "", phone: "" },
    farmers, activeFarmers, produce, activeProduce, staff, corrections,
    balanceOf, priceOn, ...actions,
  }), [status, loadError, load, version, coop, user.cooperative_name, farmers, activeFarmers, produce, activeProduce,
    staff, corrections, balanceOf, priceOn, actions]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used inside LedgerProvider");
  return ctx;
}
