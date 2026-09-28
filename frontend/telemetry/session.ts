const STORAGE_KEY = 'auragen-session-id';
let cachedSessionId: string | undefined;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedSessionId = stored;
      return stored;
    }
    const created = generateId();
    sessionStorage.setItem(STORAGE_KEY, created);
    cachedSessionId = created;
    return created;
  } catch {
    // sessionStorage not available (tests, private mode): one id per page load
    cachedSessionId = generateId();
    return cachedSessionId;
  }
}