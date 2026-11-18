// Optional, opt-in storage on this device (the browser's localStorage).
// Nothing is saved unless the visitor ticks "Remember on this device", and
// "Forget" removes it. Every call is wrapped: storage can be full, disabled or
// blocked (private windows, strict settings), and the app must keep working.

const PREFIX = "ai-resume-builder:";

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(key, fallback = null) {
  try {
    const raw = store()?.getItem(PREFIX + key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    store()?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    // nothing to do
  }
}
