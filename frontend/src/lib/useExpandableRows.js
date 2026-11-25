import { useEffect } from "react";

const PHONE = "(max-width: 760px)";
const ROW = ".table-scroll > .table:not(.statement) > tbody > tr";

// On phones, table rows are small cards showing only the name and the key fact (status, or the amount).
// Tapping a card opens the rest of its details underneath, and tapping again closes it.
// Only attributes are set on the rows React already draws, so React keeps owning the markup.
export default function useExpandableRows(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const mq = window.matchMedia(PHONE);
    const eligible = (tr) => tr.matches(ROW) && !tr.querySelector("input, select, textarea") && !tr.querySelector("td[colspan]");

    const mark = () => {
      root.querySelectorAll(ROW).forEach((tr) => {
        if (!eligible(tr)) return;
        if (mq.matches) {
          if (!tr.hasAttribute("tabindex")) tr.setAttribute("tabindex", "0");
          if (!tr.hasAttribute("aria-expanded")) tr.setAttribute("aria-expanded", "false");
        } else {
          tr.removeAttribute("tabindex"); tr.removeAttribute("aria-expanded"); delete tr.dataset.open;
        }
      });
    };
    const toggle = (tr) => {
      const open = tr.dataset.open !== "true";
      tr.dataset.open = String(open);
      tr.setAttribute("aria-expanded", String(open));
    };
    const onClick = (e) => {
      if (!mq.matches) return;
      const tr = e.target.closest?.("tr");
      if (!tr || !eligible(tr) || e.target.closest("a, button, input, select, textarea, label")) return;
      toggle(tr);
    };
    const onKey = (e) => {
      if (!mq.matches || (e.key !== "Enter" && e.key !== " ") || e.target.tagName !== "TR" || !eligible(e.target)) return;
      e.preventDefault(); toggle(e.target);
    };

    mark();
    const obs = new MutationObserver(mark);
    obs.observe(root, { childList: true, subtree: true });
    mq.addEventListener("change", mark);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => { obs.disconnect(); mq.removeEventListener("change", mark); root.removeEventListener("click", onClick); root.removeEventListener("keydown", onKey); };
  }, [rootRef]);
}
