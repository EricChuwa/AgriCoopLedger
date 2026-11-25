import { useEffect } from "react";

const KEY = "acl.panels";
const OPEN_BY_DEFAULT = new Set(["attn-title", "today-title", "week-title", "balances-title"]);
const PHONE = "(max-width: 899px)";

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function writeState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

// On phones, each dashboard panel folds down to its heading and opens again with a tap, so the long page
// stays short. Only attributes are set on the existing elements, so React keeps owning the markup.
// Desktop and tablet layouts are left alone. The choice is remembered per panel on this device.
export default function useCollapsiblePanels(rootRef, deps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const mq = window.matchMedia(PHONE);
    const state = readState();

    const panels = () => [...root.querySelectorAll(".dpanel, .balances-compact")]
      .map((el) => ({ el, head: el.querySelector(":scope > .panel-head"), id: el.querySelector(":scope > .panel-head h2")?.id }))
      .filter((p) => p.head && p.id);

    const set = (p, open) => {
      p.el.dataset.collapsed = open ? "false" : "true";
      p.head.setAttribute("aria-expanded", String(open));
    };
    const apply = () => {
      panels().forEach((p) => {
        if (!mq.matches) {
          delete p.el.dataset.collapsed; delete p.el.dataset.collapsible;
          ["role", "tabindex", "aria-expanded"].forEach((a) => p.head.removeAttribute(a));
          return;
        }
        p.el.dataset.collapsible = "true";
        p.head.setAttribute("role", "button");
        p.head.setAttribute("tabindex", "0");
        set(p, state[p.id] ?? OPEN_BY_DEFAULT.has(p.id));
      });
    };
    const toggle = (head) => {
      const p = panels().find((x) => x.head === head);
      if (!p || !mq.matches) return;
      const open = p.el.dataset.collapsed === "true";
      set(p, open);
      state[p.id] = open;
      writeState(state);
    };
    const onClick = (e) => {
      const head = e.target.closest?.(".panel-head");
      if (!head || e.target.closest("a, select, input")) return;
      toggle(head);
    };
    const onKey = (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".panel-head[role=button]")) { e.preventDefault(); toggle(e.target); }
    };

    apply();
    mq.addEventListener("change", apply);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => { mq.removeEventListener("change", apply); root.removeEventListener("click", onClick); root.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
