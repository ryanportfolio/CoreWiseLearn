import { AVATARS, ACCENTS, avatarFor, accentFor } from '../app/avatar';
import { REWARDS_GAME_ID, sanitizeSavedGames, savedEarnedLists } from '../app/services';

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
  /** Write this tab's changes, then take what other tabs stored: new profiles, names, aliases and progress. */
  refreshProfiles(): void;
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
  // Schema 1 showed each child the animal and colour derived from their name, and
  // children pick their profile by that animal. Keep it; only a later profile whose
  // derived pair is already taken gets a new, distinct one.
  const kept: (Profile | undefined)[] = [];
  const assigned: Profile[] = [];
  for (const old of data.profiles) {
    const avatar = avatarFor(old.name), accent = accentFor(old.name);
    const taken = assigned.some(p => p.avatar === avatar && p.accent === accent);
    const p = taken ? undefined : { ...old, id: id(), avatar, accent };
    kept.push(p);
    if (p) assigned.push(p);
  }
  const profiles = data.profiles.map((old, index) => {
    const existing = kept[index];
    if (existing) return existing;
    const p = { ...old, id: id(), ...identity(assigned) };
    assigned.push(p);
    return p;
  });
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
/** True when a load of this document would neither reject it nor protect it. */
function loadable(doc: SaveData): boolean {
  if (!validProfiles(doc) || doc.schemaVersion !== SCHEMA_VERSION || !validIdentity(doc)) return false;
  let ok = true;
  for (const profile of structuredClone(doc.profiles)) sanitizeSavedGames(profile.games, () => { ok = false; });
  return ok;
}
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** A finished round whose child has not chosen a gift yet. */
function outstanding(round: unknown): boolean {
  return record(round) && round.chosen === '' && Array.isArray(round.choices) && round.choices.length > 0 && round.rewardEnabled === true;
}
const fixedFields = (r: Record<string, unknown>) => Object.entries(r).filter(([k]) => k !== 'chosen' && k !== 'restEntered');
/** The same round, whatever its tab has chosen or shown since: everything fixed when the round ended matches. */
function sameRound(a: unknown, b: unknown): boolean {
  return record(a) && record(b) && equal(fixedFields(a), fixedFields(b));
}
/** A key naming one round: its `id`, or for a round stored before rounds had ids, everything fixed when it ended. */
function roundKey(profileId: string, gameId: string, round: Record<string, unknown>): string {
  const name = typeof round.id === 'string' && round.id ? `id:${round.id}` : `fixed:${JSON.stringify(fixedFields(round))}`;
  return JSON.stringify([profileId, gameId, name]);
}
/**
 * A game's unresolved round (its bag's `pending`) merges as one record, never field by field: one round's chosen
 * gift with another round's offers is no round at all. This tab's change wins, except that a round this tab is
 * done with (gift chosen, round closed, or no gift) never replaces a different round whose gift still waits and
 * that this tab never held (`held`: another tab's round). A round this tab loaded or created is its own to close.
 * The bag holds one round, so of two tabs' waiting gifts the newer is stored; the older tab still offers its own
 * on screen, and its child's choice is saved with the stickers.
 */
function mergeRound(before: unknown, local: unknown, remote: unknown, held: boolean): unknown {
  if (equal(before, local)) return remote;
  if (outstanding(remote) && !outstanding(local) && !sameRound(remote, local) && !held) return remote;
  return local;
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
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const tally = (list: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
    return counts;
  };
  const amount = (value: unknown): number => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
  /**
   * Rewards are earned, never edited, so two tabs playing as the same child must
   * both keep what they earned. `before` is this tab's last persisted bag, `local`
   * its live bag, `merged` the stored bag after the ordinary field merge.
   */
  function mergeRewards(before: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>, merged: Record<string, unknown>): void {
    // Lists: the stored list plus this tab's additions since its last write.
    for (const field of ['stickers', 'seen']) {
      if (!(field in local) && !(field in remote)) continue;
      const result = strings(remote[field]);
      const had = tally(strings(before[field]));
      const have = tally(result);
      for (const [item, n] of tally(strings(local[field]))) {
        if (n <= (had.get(item) ?? 0)) continue;
        // Sticker ids may repeat (the book shows counts); seen ids never do.
        const want = field === 'seen' ? 1 : n;
        for (let i = have.get(item) ?? 0; i < want; i++) result.push(item);
        have.set(item, Math.max(want, have.get(item) ?? 0));
      }
      merged[field] = result;
    }
    // Counts: the stored value plus this tab's change since its last write.
    merged.stars = Math.max(0, amount(remote.stars) + amount(local.stars) - amount(before.stars));
    const rounds: Record<string, number> = {};
    const remoteRounds = record(remote.rounds) ? remote.rounds : {};
    const localRounds = record(local.rounds) ? local.rounds : {};
    const beforeRounds = record(before.rounds) ? before.rounds : {};
    for (const game of new Set([...Object.keys(remoteRounds), ...Object.keys(localRounds)])) {
      rounds[game] = Math.max(0, amount(remoteRounds[game]) + amount(localRounds[game]) - amount(beforeRounds[game]));
    }
    merged.rounds = rounds;
  }
  // Rounds this tab held: the round in a game's bag when the game took the bag (gameData), and every round this tab
  // wrote. Rounds another tab stored reach this tab's bag only through adopt, after the game took its bag, and are
  // not held until a later gameData hands them to the game.
  const heldRounds = new Set<string>();
  function hold(profileId: string, gameId: string, round: unknown): void {
    if (record(round)) heldRounds.add(roundKey(profileId, gameId, round));
  }
  /** Replace each game bag's unresolved round in `merged` (the field merge's result) with mergeRound's. */
  function mergeRounds(before: Profile | undefined, local: Profile, remote: Profile | undefined, merged: Profile): void {
    for (const [gameId, bag] of Object.entries(merged.games)) {
      const mine = local.games[gameId], theirs = remote?.games[gameId];
      if (!mine || !theirs || (!('pending' in mine) && !('pending' in theirs))) continue;
      const was = before?.games[gameId]?.pending;
      if (!equal(was, mine.pending)) hold(local.id, gameId, mine.pending);
      const held = record(theirs.pending) && heldRounds.has(roundKey(local.id, gameId, theirs.pending));
      const round = mergeRound(was, mine.pending, theirs.pending, held);
      if (round === undefined) delete bag.pending; else bag.pending = structuredClone(round);
    }
  }
  const at = (value: unknown, path: readonly string[]): unknown => path.reduce<unknown>((v, k) => (record(v) ? v[k] : undefined), value);
  /**
   * A game's earned lists (registerEarnedLists) only grow: the stored list plus this tab's additions since its last
   * write, each item once. Runs after the field merge, which would keep only one tab's list.
   */
  function mergeEarned(before: Profile | undefined, local: Profile, remote: Profile | undefined, merged: Profile): void {
    for (const [gameId, paths] of savedEarnedLists()) {
      for (const path of paths) {
        const mine = at(local.games[gameId], path), theirs = at(remote?.games[gameId], path);
        const parent = at(merged.games[gameId], path.slice(0, -1));
        if (!path.length || !Array.isArray(mine) || !Array.isArray(theirs) || !record(parent)) continue;
        if (equal(at(before?.games[gameId], path), mine)) continue;
        const result: unknown[] = structuredClone(theirs);
        for (const item of mine) if (!result.includes(item)) result.push(item);
        parent[path[path.length - 1]!] = result;
      }
    }
  }
  function refreshObject(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const field of Object.keys(target)) if (!(field in source)) delete target[field];
    for (const [field, value] of Object.entries(source)) {
      const current = target[field];
      if (record(value) && record(current)) refreshObject(current, value);
      // Keep live arrays too: a scene may hold the sticker list itself.
      else if (Array.isArray(value) && Array.isArray(current)) { if (!equal(current, value)) current.splice(0, current.length, ...structuredClone(value)); }
      else if (!equal(current, value)) target[field] = structuredClone(value);
    }
  }
  // Bags this tab created from defaults, with the defaults they started as. Until
  // the bag is persisted, those defaults stand in for its last persisted state, so
  // an untouched default never overwrites a bag another tab stored meanwhile.
  const createdDefaults = new WeakMap<GameDataBag, GameDataBag>();
  /** The stored document when it is current and readable, else undefined. Never writes. */
  function stored(): SaveData | undefined {
    if (status !== 'ready') return undefined;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      const latest: unknown = JSON.parse(raw);
      return validProfiles(latest) && latest.schemaVersion === SCHEMA_VERSION && validIdentity(latest) ? latest : undefined;
    } catch { return undefined; }
  }
  /** Use the created defaults as the last persisted state of bags another tab has stored since. */
  function persistedView(before: Profile | undefined, local: Profile, remote: Profile | undefined): Profile | undefined {
    if (!before || !remote) return before;
    let view = before;
    for (const [gameId, bag] of Object.entries(local.games)) {
      const defaults = createdDefaults.get(bag);
      if (!defaults || gameId in before.games || !(gameId in remote.games)) continue;
      if (view === before) view = { ...before, games: { ...before.games } };
      view.games[gameId] = defaults;
    }
    return view;
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
        const remote = merged.profiles[index];
        const persisted = persistedView(before, profile, remote);
        const next = mergeChanges(persisted, profile, remote) as Profile;
        mergeRounds(persisted, profile, remote, next);
        mergeEarned(persisted, profile, remote, next);
        const localRewards = profile.games[REWARDS_GAME_ID];
        const remoteRewards = remote?.games[REWARDS_GAME_ID];
        const beforeRewards = persisted?.games[REWARDS_GAME_ID] ?? {};
        if (localRewards && remoteRewards && next.games[REWARDS_GAME_ID] && !equal(beforeRewards, localRewards)) {
          mergeRewards(beforeRewards, localRewards, remoteRewards, next.games[REWARDS_GAME_ID]);
        }
        if (index < 0) merged.profiles.push(next); else merged.profiles[index] = next;
      }
      if (data.activeProfile !== baseline.activeProfile) {
        if (data.activeProfile) merged.activeProfile = data.activeProfile;
        else delete merged.activeProfile;
      }
      if (!merged.profiles.some(p => p.id === merged.activeProfile)) delete merged.activeProfile;
      // Never write what the next load would reject or protect. Keep the stored document and stop saving instead.
      if (!loadable(merged)) {
        status = 'protected';
        console.warn('Merged progress failed validation; the stored progress is kept and this visit will not overwrite it.');
        return;
      }
      localStorage.setItem(key, JSON.stringify(merged));
      adopt(merged);
    }
    catch (error) { status = error instanceof SyntaxError ? 'protected' : 'unavailable'; }
  }
  /** Take `latest` as this tab's persisted state, refreshing changed fields while retaining live profile and game-bag objects. */
  function adopt(latest: SaveData): void {
    const profiles = latest.profiles.map(profile => {
      const existing = data.profiles.find(p => p.id === profile.id);
      if (!existing) return profile;
      // A different stored round replaces the bag's round object rather than rewriting its fields, so a scene
      // holding this tab's own round keeps it intact. The game has not taken that round (see heldRounds), so
      // clearing the bag's round never closes it for the other tab.
      for (const [gameId, bag] of Object.entries(profile.games)) {
        const live = existing.games[gameId];
        if (live && 'pending' in bag && !equal(live.pending, bag.pending)) live.pending = structuredClone(bag.pending);
      }
      refreshObject(existing as unknown as Record<string, unknown>, profile as unknown as Record<string, unknown>);
      return existing;
    });
    data.profiles = profiles;
    // Selection belongs to this tab. Another child's tab may persist its own
    // selection, but cannot redirect a running game's profile or award.
    if (!profiles.some(p => p.id === data.activeProfile)) delete data.activeProfile;
    baseline = structuredClone(data);
  }
  function refreshProfiles(): void {
    flush();
    // Only when every change of this tab is persisted: then the stored document is this tab's state plus others'.
    if (status !== 'ready' || !equal(data, baseline)) return;
    const latest = stored();
    if (!latest) return;
    for (const profile of latest.profiles) sanitizeSavedGames(profile.games, () => store.protect());
    if (status === 'ready') adopt(latest);
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
  /** Add profiles other tabs stored since, as already persisted. Profiles this tab deleted stay deleted. */
  function adoptStoredProfiles(): void {
    for (const p of stored()?.profiles ?? []) {
      if (data.profiles.some(q => q.id === p.id) || baseline.profiles.some(q => q.id === p.id)) continue;
      sanitizeSavedGames(p.games, () => store.protect());
      data.profiles.push(structuredClone(p));
      baseline.profiles.push(structuredClone(p));
    }
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
    refreshProfiles,
    selectProfile(value) {
      if (!normalizeName(value) && !getProfile(value)) return store.createGuestProfile();
      const clean = value.normalize('NFKC').slice(0, 10);
      let profile = getProfile(value) ?? getProfile(clean);
      if (!profile) {
        // Another tab may have created or renamed this child since this tab loaded.
        // Take the stored profiles with their current names and aliases, so the name
        // finds that child by id instead of creating a second one with the same name.
        refreshProfiles();
        profile = getProfile(value) ?? getProfile(clean) ?? create(clean);
      }
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
      if (!profile || !normalizeName(clean)) return false;
      // Another tab may have created or renamed a child to this name since this
      // tab loaded. Check the stored names and aliases too, not just this tab's.
      adoptStoredProfiles();
      const collision = getProfile(clean);
      if (collision && collision.id !== profileId) return false;
      const wanted = normalizeName(clean);
      const deleted = (p: Profile) => baseline.profiles.some(q => q.id === p.id) && !data.profiles.some(q => q.id === p.id);
      if (stored()?.profiles.some(p => p.id !== profileId && !deleted(p) &&
        ((!p.unnamed && normalizeName(p.name) === wanted) || !!p.aliases?.some(a => normalizeName(a) === wanted)))) return false;
      // Keep the old name as an alias: typing it still finds this child, and a
      // configured child renamed here is matched again on the next boot.
      const old = profile.unnamed ? '' : profile.name;
      if (normalizeName(old) && normalizeName(old) !== normalizeName(clean) && !profile.aliases?.some(a => normalizeName(a) === normalizeName(old))) {
        (profile.aliases ??= []).push(old);
      }
      if (profile.aliases) {
        profile.aliases = profile.aliases.filter(a => normalizeName(a) !== normalizeName(clean));
        if (!profile.aliases.length) delete profile.aliases;
      }
      profile.name = clean;
      delete profile.unnamed;
      flush();
      return true;
    },
    seedProfiles(profiles) {
      // Reserve every configured child's real name before assigning aliases.
      // An alias may never absorb a separately configured child's identity.
      // An exact current name always wins; a renamed child is found by its old
      // name only when no configured child holds that profile by current name.
      const seeds = profiles.map(seed => ({ clean: seed.name.normalize('NFKC').slice(0, 10), aliases: seed.aliases ?? [] }))
        .filter(seed => normalizeName(seed.clean));
      const exact = seeds.map(seed => data.profiles.find(p => !p.unnamed && normalizeName(p.name) === normalizeName(seed.clean)));
      const claimed = new Set(exact.filter((p): p is Profile => !!p).map(p => p.id));
      const seeded: { profile: Profile; aliases: string[] }[] = [];
      seeds.forEach((seed, index) => {
        let profile = exact[index];
        if (!profile) {
          const name = normalizeName(seed.clean);
          profile = data.profiles.find(p => !p.unnamed && !claimed.has(p.id) && !!p.aliases?.some(a => normalizeName(a) === name)) ?? create(seed.clean);
          claimed.add(profile.id);
        }
        seeded.push({ profile, aliases: seed.aliases });
      });
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
      if (!bag) {
        // Another tab may have stored this bag since this tab last read or wrote.
        // Take it as this tab's persisted state rather than starting from defaults.
        const latest = stored()?.profiles.find(p => p.id === profile.id)?.games[gameId];
        const persisted = baseline.profiles.find(p => p.id === profile.id);
        if (latest && persisted) {
          sanitizeSavedGames({ [gameId]: latest }, () => store.protect());
          persisted.games[gameId] = structuredClone(latest);
          bag = profile.games[gameId] = latest;
        } else {
          bag = profile.games[gameId] = structuredClone(defaults);
          createdDefaults.set(bag, structuredClone(defaults));
          hold(profile.id, gameId, bag.pending);
          save();
          return bag as T;
        }
      }
      const created = createdDefaults.get(bag);
      for (const k of Object.keys(defaults)) {
        if (k in bag) continue;
        bag[k] = structuredClone(defaults[k]);
        if (created && !(k in created)) created[k] = structuredClone(defaults[k]);
      }
      // The game takes the bag's unresolved round as its own: closing it later wins over storage.
      hold(profile.id, gameId, bag.pending);
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
