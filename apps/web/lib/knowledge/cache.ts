const TTL = 60 * 60 * 1000;
const store = new Map<string, { data: unknown; expiry: number }>();

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  const data = await fetcher();
  store.set(key, { data, expiry: Date.now() + TTL });
  return data;
}

export function invalidateCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
