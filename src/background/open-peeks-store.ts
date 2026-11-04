import type { PeekSignIn } from "./peek-sign-in.ts";

/**
 * Kept in local storage rather than session storage: copies lent to a Peek are cookies, which can
 * outlive a crash, so the record of them must too.
 */
const OPEN_PEEKS_KEY = "openPeeks";

export async function loadOpenPeeks(): Promise<readonly PeekSignIn[]> {
  const stored = await chrome.storage.local.get(OPEN_PEEKS_KEY);
  const peeks: unknown = stored[OPEN_PEEKS_KEY];
  // Safe: only saveOpenPeeks writes this key, with this extension's own PeekSignIn records.
  return Array.isArray(peeks) ? (peeks as PeekSignIn[]) : [];
}

export async function saveOpenPeeks(peeks: readonly PeekSignIn[]): Promise<void> {
  await chrome.storage.local.set({ [OPEN_PEEKS_KEY]: peeks });
}
