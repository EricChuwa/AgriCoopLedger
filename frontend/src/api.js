// Small wrapper around fetch for calls to the FastAPI backend.
// Sends the session cookie and turns every failure into a thrown ApiError with a readable message.

export class ApiError extends Error {
  constructor(message, { status, field } = {}) {
    super(message);
    this.status = status;
    this.field = field; // set when the server says which form field is at fault
  }
}

// Paths where a 401 just means "wrong password" or "not signed in yet", not "your session ended".
const QUIET_401 = ["/auth/login", "/auth/me", "/auth/register"];

export async function api(path, { method = "GET", body, params } = {}) {
  let url = `/api${path}`;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
    if (qs) url += `?${qs}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data && data.detail;
    if (res.status === 401 && !QUIET_401.includes(path)) {
      window.dispatchEvent(new CustomEvent("agri:signed-out", { detail: typeof detail === "string" ? detail : "" }));
    }
    if (typeof detail === "string") throw new ApiError(detail, { status: res.status });
    if (detail && !Array.isArray(detail) && detail.message) {
      throw new ApiError(detail.message, { status: res.status, field: detail.field });
    }
    if (Array.isArray(detail) && detail[0]?.msg) {
      const loc = detail[0].loc?.[detail[0].loc.length - 1];
      throw new ApiError(String(detail[0].msg).replace(/^Value error, /, ""), { status: res.status, field: typeof loc === "string" ? loc : undefined });
    }
    if (res.status >= 500) throw new ApiError("The server had a problem. Try again, and tell the administrator if it keeps happening.", { status: res.status });
    throw new ApiError("Check the form and try again.", { status: res.status });
  }
  return data;
}
