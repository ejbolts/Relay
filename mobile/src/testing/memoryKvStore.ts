// An in-memory stand-in for expo-sqlite/kv-store in Jest, where SQLite is not available. Use it
// with: jest.mock('expo-sqlite/kv-store', () => jest.requireActual('<path>/testing/memoryKvStore'));

export const memoryKv = new Map<string, string>();

const Storage = {
  getItemSync: (key: string) => memoryKv.get(key) ?? null,
  setItemSync: (key: string, value: string) => {
    memoryKv.set(key, value);
  },
  removeItemSync: (key: string) => memoryKv.delete(key),
  clearSync: () => memoryKv.clear(),
};

export default Storage;
