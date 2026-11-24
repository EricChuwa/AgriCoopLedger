import { ErrorIcon } from "./Field.jsx";

// Form-level error, for problems that belong to no single field (for example wrong credentials).
export default function Alert({ children }) {
  if (!children) return null;
  return (
    <div className="alert" role="alert">
      <ErrorIcon />
      <span>{children}</span>
    </div>
  );
}
