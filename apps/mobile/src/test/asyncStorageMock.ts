/** AsyncStorage en memoria, para poder probar los repositorios fuera de Android. */
const store = new Map<string, string>();

export default {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? (store.get(key) as string) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) store.delete(key);
  },
  async clear(): Promise<void> {
    store.clear();
  },
};
