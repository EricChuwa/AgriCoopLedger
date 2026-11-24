import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import BrandPanel from "./BrandPanel.jsx";
import Icon from "./Icon.jsx";
import useTheme from "../lib/theme.js";
import "../styles/dark.css";

// Shared frame for the sign in and create account pages. It stays mounted while
// the person switches between them, so only the form changes.
// Pages can call setHideTabs(true) from the outlet context (for example on a success screen).
export default function AuthLayout() {
  const [hideTabs, setHideTabs] = useState(false);
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  // The page behind the frame follows the theme too, so overscroll never flashes the other colour.
  useEffect(() => {
    document.body.style.background = dark ? "#001a1a" : "";
    return () => { document.body.style.background = ""; };
  }, [dark]);

  return (
    <div className={`shell${dark ? " theme-dark" : ""}`}>
      <BrandPanel />
      <main className="panel">
        <button type="button" className="theme-toggle auth-theme" onClick={toggle} aria-pressed={dark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
          <span className="theme-icon" key={dark ? "sun" : "moon"}><Icon name={dark ? "sun" : "moon"} size={20} /></span>
        </button>
        <div className="card">
          {!hideTabs && (
            <nav className="tabs" aria-label="Account">
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/signup">Create account</NavLink>
            </nav>
          )}
          <Outlet context={{ setHideTabs }} />
        </div>
      </main>
    </div>
  );
}
