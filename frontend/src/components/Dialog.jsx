import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// A modal built on the native <dialog>: it traps focus, closes on Esc, and returns focus
// to the button that opened it. Render it only while it should be open.
export default function Dialog({ title, onClose, children, wide = false, keepOnBackdrop = false }) {
  const ref = useRef(null);
  // The pop up sits in the browser's top layer, outside .app, so it takes the theme from the page when it opens.
  const dark = typeof document !== "undefined" && !!document.querySelector(".app.theme-dark");

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog ref={ref} className={`dialog${wide ? " dialog-wide" : ""}${dark ? " theme-dark" : ""}`} aria-labelledby="dialog-title" onClose={onClose}
      onClick={(e) => { if (!keepOnBackdrop && e.target === ref.current) onClose(); }}>
      <div className="dialog-body">
        <button type="button" className="dialog-x" aria-label="Close" onClick={() => ref.current?.close()}>
          <Icon name="close" size={20} />
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
