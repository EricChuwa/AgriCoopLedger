import { useId } from "react";
import Icon from "./Icon.jsx";

// A small "i" that shows a message on hover, keyboard focus, or tap.
export default function InfoTip({ text, label = "More information", className = "" }) {
  const id = useId();
  return (
    <span className={`info-tip ${className}`.trim()}>
      <button type="button" className="info-tip-btn" aria-label={label} aria-describedby={id}>
        <Icon name="info" size={18} />
      </button>
      <span id={id} role="tooltip" className="info-tip-bubble">{text}</span>
    </span>
  );
}
