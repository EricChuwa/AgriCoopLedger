import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AccessDenied from "../pages/AccessDenied.jsx";

// Pages that need a signed-in user.
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

// Pages for people who are not signed in (sign in, create account).
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

// Pages only some roles may open. This hides the page for the wrong role;
// the server must still check the role on every request that changes or returns data.
export function RequireRole({ roles }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? <Outlet /> : <AccessDenied />;
}
