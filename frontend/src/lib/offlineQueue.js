// Deliveries recorded while the connection is down (FR 4.9). They wait in this browser's storage, one list per
// signed-in person, and are sent when the connection returns. Each carries the one-time id it was made with, so
// the server records it once even if the first attempt did reach it (FR 4.8). Storage can be blocked or full,
// so every call is wrapped and a failure to save is reported, never swallowed.

const key = (userId) => `agri-offline-deliveries:${userId}`;

export function loadQueue(userId) {
  try {
    const list = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(userId, list) {
  try {
    if (list.length === 0) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// An item: { clientId, body, label: { farmer, produce, grade, kg, date }, savedAt, error? }
export function addToQueue(userId, item) {
  const list = loadQueue(userId);
  if (!list.some((x) => x.clientId === item.clientId)) list.push(item);
  return save(userId, list) ? list : null; // null: the browser would not keep it
}

export function removeFromQueue(userId, clientId) {
  const list = loadQueue(userId).filter((x) => x.clientId !== clientId);
  save(userId, list);
  return list;
}

export function markQueueItem(userId, clientId, error) {
  const list = loadQueue(userId).map((x) => (x.clientId === clientId ? { ...x, error } : x));
  save(userId, list);
  return list;
}
