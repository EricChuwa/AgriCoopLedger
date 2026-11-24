import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { BOTTOM_TABS, ROLE_LABEL, navForRole } from "../lib/nav.js";
import { LedgerProvider, useLedger } from "../context/LedgerContext.jsx";
import Icon from "./Icon.jsx";
import useTheme from "../lib/theme.js";
import "../styles/app.css";
import "../styles/polish.css";
import "../styles/dark.css";
import "../styles/print.css";

// The frame around every signed-in page: sidebar on desktop, a drawer on phones.
function Shell() {
  const { user, logout } = useAuth();
  const { coop, status, loadError, reload, corrections } = useLedger();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  // Close the drawer when the page changes, and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = navForRole(user.role);

  const initials = user.full_name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const waiting = user.role === "manager" ? corrections.filter((c) => c.status === "pending").length : 0;
  const tabs = BOTTOM_TABS[user.role] ?? [];

  const handleSignOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className={`app${dark ? " theme-dark" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="app-topbar">
        <button type="button" className="app-menu" aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} size={24} />
        </button>
        <Link className="wordmark" to="/dashboard">Agri<span>Coop</span>Ledger</Link>
      </header>

      {open && <div className="app-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`}>
        <Link className="wordmark app-brand" to="/dashboard">Agri<span>Coop</span>Ledger</Link>

        <nav aria-label="Main">
          {groups.map((group) => (
            <div className="app-group" key={group.id}>
              {group.label && <p className="app-group-label">{group.label}</p>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end ?? false} className="app-link">
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="app-user">
          <p className="app-user-name">{user.full_name}</p>
          <p className="app-user-meta">{ROLE_LABEL[user.role] ?? user.role} at {coop.name}</p>
          <NavLink to="/account" className="app-account">My account</NavLink>
          <button type="button" className="app-signout" onClick={handleSignOut}>
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-body">
      <div className="app-top no-print">
        <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
          <span className="theme-icon" key={dark ? "sun" : "moon"}><Icon name={dark ? "sun" : "moon"} size={20} /></span>
        </button>
        {user.role === "manager" && (
          <Link className="app-bell" to="/corrections"
            aria-label={waiting > 0 ? `${waiting} correction ${waiting === 1 ? "request" : "requests"} waiting` : "Corrections"}>
            <Icon name="bell" size={20} />
            {waiting > 0 && <span className="app-bell-count" aria-hidden="true">{waiting}</span>}
          </Link>
        )}
        <Link className="app-chip" to="/account">
          <span className="app-avatar" aria-hidden="true">{initials}</span>
          <span className="app-chip-text">
            <span className="app-chip-name">{user.full_name}</span>
            <span className="app-chip-role">{ROLE_LABEL[user.role] ?? user.role}</span>
          </span>
        </Link>
      </div>

      <main className="app-main" id="main" tabIndex={-1}>
        {status === "loading" && <p className="empty" role="status">Loading the cooperative's records.</p>}
        {status === "error" && (
          <div className="empty-block">
            <p>{loadError || "Could not load the records."}</p>
            <button className="btn btn-primary" type="button" onClick={reload}>Try again</button>
          </div>
        )}
        {status === "ready" && <div className="page-enter" key={pathname}><Outlet /></div>}
      </main>
      </div>

      <nav className="app-tabs no-print" aria-label="Shortcuts">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end className="app-tab">
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button type="button" className="app-tab" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((o) => !o)}>
          <Icon name="menu" size={22} />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}

export default function AppShell() {
  return (
    <LedgerProvider>
      <Shell />
    </LedgerProvider>
  );
}
