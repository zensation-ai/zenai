/**
 * Mock for the `electron-store` module used in unit tests.
 * Uses an in-memory Map so tests never touch the filesystem.
 */

class ElectronStoreMock<T extends Record<string, unknown> = Record<string, unknown>> {
  private _map: Map<string, unknown>;
  private _defaults: Partial<T>;

  constructor(options?: { defaults?: Partial<T> }) {
    this._defaults = options?.defaults ?? {};
    this._map = new Map<string, unknown>();
  }

  get<K extends keyof T>(key: K): T[K] {
    if (this._map.has(key as string)) {
      return this._map.get(key as string) as T[K];
    }
    return this._defaults[key] as T[K];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this._map.set(key as string, value);
  }

  has(key: keyof T): boolean {
    return this._map.has(key as string) || key in this._defaults;
  }

  delete(key: keyof T): void {
    this._map.delete(key as string);
  }

  clear(): void {
    this._map.clear();
  }

  get store(): Partial<T> {
    const result: Record<string, unknown> = { ...this._defaults };
    for (const [k, v] of this._map.entries()) {
      result[k] = v;
    }
    return result as Partial<T>;
  }
}

export default ElectronStoreMock;
