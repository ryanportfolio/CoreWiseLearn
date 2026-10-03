/**
 * Versioned save data in localStorage.
 *
 * Layout: one JSON document with a schemaVersion, a list of profiles keyed by
 * name, and per profile a bag of per-game data. Games read and write their
 * own bag and never touch each other's. Saves are debounced so a game can
 * call save() every frame without hammering storage.
 */

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'corewise.save';

export type GameDataBag = Record<string, unknown>;

export interface Profile {
  name: string;
  createdAt: number;
  lastPlayedAt: number;
  /** Keyed by game id. */
  games: Record<string, GameDataBag>;
}

export interface SaveData {
  schemaVersion: number;
  profiles: Profile[];
  /** Name of the profile that was active when the hub was last used. */
  activeProfile?: string;
}

/** Called once per version step; receives data at version `from` and returns it at `from + 1`. */
export type Migration = (data: SaveData) => SaveData;

export interface SaveStore {
  readonly data: SaveData;
  /** Profile currently selected, if any. */
  readonly active: Profile | undefined;
  getProfile(name: string): Profile | undefined;
  /** Create the profile if missing, mark it active, return it. */
  selectProfile(name: string): Profile;
  deleteProfile(name: string): void;
  /** Per-game bag for the active profile. Created empty on first access. */
  gameData<T extends GameDataBag>(gameId: string, defaults: T): T;
  /** Schedule a write. Collapses repeated calls within the debounce window. */
  save(): void;
  /** Write immediately (use on pagehide). */
  flush(): void;
  /** Throw away everything, including storage. */
  reset(): void;
}

export interface SaveOptions {
  /** Debounce window in milliseconds. Default 500. */
  debounceMs?: number;
  /** Map of migrations keyed by the version they upgrade FROM. */
  migrations?: Record<number, Migration>;
  storageKey?: string;
}

function emptyData(): SaveData {
  return { schemaVersion: SCHEMA_VERSION, profiles: [] };
}

function migrate(raw: unknown, migrations: Record<number, Migration>): SaveData {
  if (!raw || typeof raw !== 'object') return emptyData();
  let data = raw as SaveData;
  if (typeof data.schemaVersion !== 'number' || !Array.isArray(data.profiles)) return emptyData();
  if (data.schemaVersion > SCHEMA_VERSION) {
    // Written by a newer build. Keep it readable rather than destroy it.
    console.warn(`Save data is version ${data.schemaVersion}, newer than ${SCHEMA_VERSION}; using as is.`);
    return data;
  }
  while (data.schemaVersion < SCHEMA_VERSION) {
    const step = migrations[data.schemaVersion];
    if (!step) {
      console.warn(`No migration from save version ${data.schemaVersion}; starting fresh.`);
      return emptyData();
    }
    const from = data.schemaVersion;
    data = step(data);
    if (data.schemaVersion !== from + 1) data.schemaVersion = from + 1;
  }
  return data;
}

export function createSaveStore(options: SaveOptions = {}): SaveStore {
  const debounceMs = options.debounceMs ?? 500;
  const migrations = options.migrations ?? {};
  const key = options.storageKey ?? STORAGE_KEY;

  let data: SaveData;
  try {
    const text = localStorage.getItem(key);
    data = migrate(text ? JSON.parse(text) : undefined, migrations);
  } catch {
    data = emptyData();
  }

  let timer: number | undefined;

  function write(): void {
    timer = undefined;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.warn('Save failed', err);
    }
  }

  function save(): void {
    if (timer !== undefined) return;
    timer = window.setTimeout(write, debounceMs);
  }

  function flush(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    write();
  }

  window.addEventListener('pagehide', flush);

  function getProfile(name: string): Profile | undefined {
    return data.profiles.find((p) => p.name === name);
  }

  const store: SaveStore = {
    get data() {
      return data;
    },
    get active() {
      return data.activeProfile ? getProfile(data.activeProfile) : undefined;
    },
    getProfile,
    selectProfile(name) {
      let p = getProfile(name);
      const now = Date.now();
      if (!p) {
        p = { name, createdAt: now, lastPlayedAt: now, games: {} };
        data.profiles.push(p);
      }
      p.lastPlayedAt = now;
      data.activeProfile = name;
      save();
      return p;
    },
    deleteProfile(name) {
      data.profiles = data.profiles.filter((p) => p.name !== name);
      if (data.activeProfile === name) delete data.activeProfile;
      save();
    },
    gameData<T extends GameDataBag>(gameId: string, defaults: T): T {
      const profile = store.active;
      if (!profile) throw new Error('No active profile; call selectProfile first');
      let bag = profile.games[gameId];
      if (!bag) {
        bag = { ...defaults };
        profile.games[gameId] = bag;
        save();
      } else {
        // Fill in keys added since this bag was first written.
        for (const k of Object.keys(defaults)) if (!(k in bag)) bag[k] = defaults[k];
      }
      return bag as T;
    },
    save,
    flush,
    reset() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      data = emptyData();
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
  return store;
}
