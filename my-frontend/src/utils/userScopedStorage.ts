const ANONYMOUS_SCOPE = 'anonymous';

export function getUserScopedStorageKey(
  baseKey: string,
  userId: string | null
): string {
  return `${baseKey}:${userId ?? ANONYMOUS_SCOPE}`;
}

export function hasStorageValue(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function migrateLegacyStorage(baseKey: string, targetKey: string): void {
  try {
    if (localStorage.getItem(targetKey) !== null) return;

    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue !== null) {
      localStorage.setItem(targetKey, legacyValue);
    }
  } catch {
    // Ignore storage failures so auth can continue in restricted browsers.
  }
}
