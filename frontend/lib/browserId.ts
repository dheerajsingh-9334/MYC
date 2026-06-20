// Browser-scoped UUID. Used by the public onboard form to scope its
// draft to a single device so two people using the same invite link
// don't trample each other's work. Persisted in localStorage.

const STORAGE_KEY = 'myc_browser_id';

function genUuid(): string {
  // RFC4122 v4. Use crypto.randomUUID when available.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (older browsers, jsdom)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getBrowserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = genUuid();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage disabled (Safari private mode etc.) — return a
    // session-scoped ID so the app still works; this draft won't
    // survive across sessions but will survive within one.
    return genUuid();
  }
}
