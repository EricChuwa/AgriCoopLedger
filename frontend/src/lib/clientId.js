// One random id per form submission. The server records a delivery or payment only once for each id,
// so a double click or a retry after a lost response cannot create a duplicate.
export function newClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
