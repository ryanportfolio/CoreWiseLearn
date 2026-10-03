import { AVATARS, ACCENTS } from '../app/avatar';
import { sanitizeSavedGames } from '../app/services';

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'cwl.v1.save';
const LEGACY_KEY = 'corewise.save';
export type GameDataBag = Record<string, unknown>;
export interface Profile {
  id: string;
  name: string;
  avatar: string;
  accent: string;
  aliases?: string[];
  unnamed?: boolean;
  createdAt: number;
  lastPlayedAt: number;
  games: Record<string, GameDataBag>;
}
export interface SaveData { schemaVersion: number; profiles: Profile[]; activeProfile?: string }
export type Migration = (data: SaveData) => SaveData;
export type SaveStatus = 'ready' | 'unavailable' | 'protected';
export interface SaveStore {
  readonly data: SaveData;
  readonly active: Profile | undefined;
  readonly readOnly: boolean;
  readonly status: SaveStatus;
  /** Preserve the stored document when a game discovers malformed nested fields. */
  protect(): void;
  getProfile(idOrName: string): Profile | undefined;
  selectProfile(idOrName: string): Profile;
  createGuestProfile(): Profile;
  renameProfile(id: string, name: string): boolean;
  seedProfiles(profiles: { name: string; aliases?: string[] }[]): void;
  deleteProfile(idOrName: string): void;
  gameData<T extends GameDataBag>(gameId: string, defaults: T): T;
  save(): void;
  flush(): void;
  reset(): void;
}
export interface SaveOptions { debounceMs?: number; migrations?: Record<number, Migration>; storageKey?: string }
export function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}]/gu, '').replace(/(.)\1{2,}/gu, '$1$1');
}
function emptyData(): SaveData { return { schemaVersion: SCHEMA_VERSION, profiles: [] }; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validProfiles(value: unknown): value is SaveData {
  if (!record(value) || !Number.isInteger(value.schemaVersion) || !Array.isArray(value.profiles)) return false;
  if (value.activeProfile !== undefined && typeof value.activeProfile !== 'string') return false;
  return value.profiles.every((p: unknown) => record(p) && typeof p.name === 'string' &&
    typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) &&
    typeof p.lastPlayedAt === 'number' && Number.isFinite(p.lastPlayedAt) && record(p.games) &&
    Object.values(p.games).every(record) && (p.aliases === undefined || (Array.isArray(p.aliases) && p.aliases.every(a => typeof a === 'string'))));
}
function id(): string { return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function identity(profiles: Profile[]): { avatar: string; accent: string } {
  // Prefer distinct animals and colours, then distinct pairs. Never evict a child.
  for (const avatar of AVATARS) for (const accent of ACCENTS) {
    if (!profiles.some(p => p.avatar === avatar) && !profiles.some(p => p.accent === accent)) return { avatar, accent };
  }
  for (const avatar of AVATARS) for (const accent of ACCENTS) {
    if (!profiles.some(p => p.avatar === avatar && p.accent === accent)) return { avatar, accent };
  }
  const index = profiles.length;
  return { avatar: AVATARS[index % AVATARS.length] ?? 'fox', accent: `hsl(${(index * 137.508) % 360} 70% 65%)` };
}
function upgradeProfiles(data: SaveData): SaveData {
  const profiles: Profile[] = [];
  for (const old of data.profiles) {
    const p = { ...old, id: id(), ...identity(profiles) };
    profiles.push(p);
  }
  const active = profiles.find(p => p.name === data.activeProfile);
  return { ...data, schemaVersion: 2, profiles, ...(active ? { activeProfile: active.id } : {}) };
}
function validIdentity(data: SaveData): boolean {
  const ids = new Set<string>();
  return data.profiles.every(p => {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.avatar !== 'string' || typeof p.accent !== 'string') return false;
    ids.add(p.id);
    return true;
  });
}
export function createSaveStore(options: SaveOptions = {}): SaveStore {
  const key = options.storageKey ?? STORAGE_KEY;
  let status: SaveStatus = 'ready';
  let data = emptyData();
  let timer: number | undefined;
  function backup(raw: string): void {
    localStorage.setItem(`${key}.backup.${Date.now()}.${id()}`, raw);
  }
  try {
    const current = localStorage.getItem(key);
    const legacy = current === null && !options.storageKey ? localStorage.getItem(LEGACY_KEY) : null;
    const raw = current ?? legacy;
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!validProfiles(parsed)) throw new Error('Unrecognized save shape');
        for (const profile of parsed.profiles) sanitizeSavedGames(profile.games, () => { status = 'protected'; });
        if (parsed.schemaVersion > SCHEMA_VERSION) {
          status = 'protected';
          // A detached readable snapshot permits temporary play without touching newer data.
          data = validIdentity(parsed) ? parsed : upgradeProfiles(parsed);
        } else {
          let next = parsed;
          const needsMigration = legacy !== null || parsed.schemaVersion < SCHEMA_VERSION;
          if (needsMigration) backup(raw);
          while (next.schemaVersion < SCHEMA_VERSION) {
            const from = next.schemaVersion;
            const migration = options.migrations?.[from] ?? (from === 1 ? upgradeProfiles : undefined);
            if (!migration) throw new Error(`No migration from ${from}`);
            next = migration(next);
            if (!validProfiles(next) || next.schemaVersion !== from + 1) throw new Error('Invalid migration result');
          }
          if (!validIdentity(next)) throw new Error('Invalid profile identity');
          data = next;
          if (needsMigration && status === 'ready') localStorage.setItem(key, JSON.stringify(data));
        }
      } catch (error) {
        // Never overwrite corrupt, incomplete or unmigratable bytes with an empty save.
        status = 'protected';
        console.warn('Stored progress is protected; this visit will not overwrite it.', error);
      }
    }
  } catch {
    status = 'unavailable';
  }
  // Compare against this tab's last persisted view. A clean stale tab must never
  // write over another tab, and edits to one profile must preserve the others.
  let baseline = structuredClone(data);
  const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  function mergeChanges(before: unknown, local: unknown, remote: unknown): unknown {
    if (equal(before, local)) return structuredClone(remote);
    if (record(before) && record(local) && record(remote)) {
      const result = structuredClone(remote);
      for (const field of new Set([...Object.keys(before), ...Object.keys(local)])) {
        if (equal(before[field], local[field])) continue;
        if (!(field in local)) delete result[field];
        else result[field] = mergeChanges(before[field], local[field], remote[field]);
      }
      return result;
    }
    return structuredClone(local);
  }
  function refreshObject(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const field of Object.keys(target)) if (!(field in source)) delete target[field];
    for (const [field, value] of Object.entries(source)) {
      if (record(value) && record(target[field])) refreshObject(target[field], value);
      else if (!equal(target[field], value)) target[field] = structuredClone(value);
    }
  }
  function write(): void {
    timer = undefined;
    if (status !== 'ready') return;
    if (equal(data, baseline)) return;
    try {
      const raw = localStorage.getItem(key);
      const latest: unknown = raw === null ? emptyData() : JSON.parse(raw);
      if (!validProfiles(latest) || latest.schemaVersion !== SCHEMA_VERSION || !validIdentity(latest)) {
        status = 'protected';
        return;
      }
      for (const profile of latest.profiles) sanitizeSavedGames(profile.games, () => { status = 'protected'; });
      if (status !== 'ready') return;
      const merged = structuredClone(latest);
      for (const old of baseline.profiles) {
        if (!data.profiles.some(p => p.id === old.id)) merged.profiles = merged.profiles.filter(p => p.id !== old.id);
      }
      for (const profile of data.profiles) {
        const before = baseline.profiles.find(p => p.id === profile.id);
        if (equal(before, profile)) continue;
        const index = merged.profiles.findIndex(p => p.id === profile.id);
        // A deletion by another tab wins over an edit to an existing profile.
        if (index < 0 && before) continue;
        const next = mergeChanges(before, profile, merged.profiles[index]) as Profile;
        if (index < 0) merged.profiles.push(next); else merged.profiles[index] = next;
      }
      if (data.activeProfile !== baseline.activeProfile) {
        if (data.activeProfile) merged.activeProfile = data.activeProfile;
        else delete merged.activeProfile;
      }
      if (!merged.profiles.some(p => p.id === merged.activeProfile)) delete merged.activeProfile;
      localStorage.setItem(key, JSON.stringify(merged));
      // Refresh changed fields while retaining live profile and game-bag objects.
      const profiles = merged.profiles.map(profile => {
        const existing = data.profiles.find(p => p.id === profile.id);
        if (!existing) return profile;
        refreshObject(existing as unknown as Record<string, unknown>, profile as unknown as Record<string, unknown>);
        return existing;
      });
      data.profiles = profiles;
      // Selection belongs to this tab. Another child's tab may persist its own
      // selection, but cannot redirect a running game's profile or award.
      if (!profiles.some(p => p.id === data.activeProfile)) delete data.activeProfile;
      baseline = structuredClone(data);
    }
    catch (error) { status = error instanceof SyntaxError ? 'protected' : 'unavailable'; }
  }
  function save(): void {
    if (status !== 'ready' || timer !== undefined) return;
    timer = window.setTimeout(write, options.debounceMs ?? 500);
  }
  function flush(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    write();
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  function getProfile(value: string): Profile | undefined {
    const exactId = data.profiles.find(p => p.id === value);
    if (exactId) return exactId;
    const name = normalizeName(value);
    if (!name) return undefined;
    return data.profiles.find(p => !p.unnamed && normalizeName(p.name) === name) ??
      data.profiles.find(p => p.aliases?.some(a => normalizeName(a) === name));
  }
  function create(name: string, unnamed = false): Profile {
    const now = Date.now();
    const p: Profile = { id: id(), name, ...identity(data.profiles), createdAt: now, lastPlayedAt: now, games: {}, ...(unnamed ? { unnamed: true } : {}) };
    data.profiles.push(p);
    return p;
  }
  const store: SaveStore = {
    get data() { return data; },
    get active() { return data.activeProfile ? getProfile(data.activeProfile) : undefined; },
    get readOnly() { return status !== 'ready'; },
    get status() { return status; },
    protect() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      status = 'protected';
    },
    getProfile,
    selectProfile(value) {
      if (!normalizeName(value) && !getProfile(value)) return store.createGuestProfile();
      const clean = value.normalize('NFKC').slice(0, 10);
      const profile = getProfile(value) ?? getProfile(clean) ?? create(clean);
      profile.lastPlayedAt = Date.now();
      data.activeProfile = profile.id;
      flush();
      return profile;
    },
    createGuestProfile() {
      const profile = create('', true);
      data.activeProfile = profile.id;
      flush();
      return profile;
    },
    renameProfile(profileId, name) {
      const profile = data.profiles.find(p => p.id === profileId);
      const clean = name.normalize('NFKC').slice(0, 10);
      const collision = getProfile(clean);
      if (!profile || !normalizeName(clean) || (collision && collision.id !== profileId)) return false;
      profile.name = clean;
      delete profile.unnamed;
      flush();
      return true;
    },
    seedProfiles(profiles) {
      // Reserve every configured child's real name before assigning aliases.
      // An alias may never absorb a separately configured child's identity.
      const seeded: { profile: Profile; aliases: string[] }[] = [];
      for (const seed of profiles) {
        const clean = seed.name.normalize('NFKC').slice(0, 10);
        if (!normalizeName(clean)) continue;
        const profile = data.profiles.find(p => !p.unnamed && normalizeName(p.name) === normalizeName(clean)) ?? create(clean);
        seeded.push({ profile, aliases: seed.aliases ?? [] });
      }
      for (const { profile, aliases } of seeded) {
        for (const alias of aliases) {
          const collision = getProfile(alias);
          if (!normalizeName(alias) || (collision && collision.id !== profile.id)) continue;
          profile.aliases ??= [];
          if (!profile.aliases.some(a => normalizeName(a) === normalizeName(alias))) profile.aliases.push(alias);
        }
      }
      if (profiles.length) flush();
    },
    deleteProfile(value) {
      const profile = getProfile(value);
      if (!profile) return;
      data.profiles = data.profiles.filter(p => p.id !== profile.id);
      if (data.activeProfile === profile.id) delete data.activeProfile;
      flush();
    },
    gameData<T extends GameDataBag>(gameId: string, defaults: T): T {
      const profile = store.active;
      if (!profile) throw new Error('No active profile; call selectProfile first');
      let bag = profile.games[gameId];
      if (!bag) { bag = structuredClone(defaults); profile.games[gameId] = bag; save(); }
      else for (const k of Object.keys(defaults)) if (!(k in bag)) bag[k] = structuredClone(defaults[k]);
      return bag as T;
    },
    save, flush,
    reset() {
      if (status !== 'ready') return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      try {
        const raw = localStorage.getItem(key);
        if (raw) backup(raw);
        // Write an empty current save so a legacy document is never reimported on reset.
        const next = emptyData();
        localStorage.setItem(key, JSON.stringify(next));
        data = next;
        baseline = structuredClone(next);
      } catch { status = 'unavailable'; }
    },
  };
  return store;
}
