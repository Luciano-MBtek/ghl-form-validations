// Simple in-memory TTL cache
type CacheEntry<T> = { value: T; expiresAt: number };

const cacheStore = new Map<string, CacheEntry<any>>();

export function getCache<T = any>(key: string): T | undefined {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCache<T = any>(key: string, value: T, ttlMs: number): void {
  cacheStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCacheKey(key: string): void {
  cacheStore.delete(key);
}

export function getCacheStats(): { size: number } {
  return { size: cacheStore.size };
}
