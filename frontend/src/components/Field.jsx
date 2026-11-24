export function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  );
}

// Label, control, hint and error message wired together for screen readers.
// children receives the props the control needs: id, name and aria attributes.
export default function Field({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        name: id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? "true" : "false",
      })}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      <p className="error" id={`${id}-error`} role="alert">
        {error && (<><ErrorIcon /><span>{error}</span></>)}
      </p>
    </div>
  );
}
