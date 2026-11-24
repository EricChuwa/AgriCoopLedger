import { useEffect, useState } from "react";
import { api } from "../api.js";

// Loads one server answer (a page of deliveries, a statement, the dashboard) and loads it again when the
// parameters change or when `version` changes, which the ledger bumps after every saved change.
// Passing path = null waits. An answer that arrives after a newer request was made is thrown away.
export default function useApiData(path, params, version = 0) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: "" });
  const key = JSON.stringify(params ?? {});

  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: "" }); return undefined; }
    let current = true;
    setState((s) => ({ ...s, loading: true }));
    api(path, { params: JSON.parse(key) })
      .then((data) => { if (current) setState({ data, loading: false, error: "" }); })
      .catch((err) => { if (current) setState((s) => ({ data: s.data, loading: false, error: err.message })); });
    return () => { current = false; };
  }, [path, key, version]);

  return state;
}

// Waits until the person stops typing before the value is used to ask the server.
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
