/** Operator settings, fetched once before any entry point boots. */
export interface AppConfig {
  uiScale: number;
  masterTrimDb: number;
  keyboardLayout: 'abc' | 'qwerty';
  profiles: { name: string; aliases?: string[] }[];
  playtestLog: false;
  rewardsEnabled: boolean;
  breakAfterSeconds: number;
}
export interface DebugOptions { enabled: boolean; tier?: 0 | 1 | 2; seed: number; timeScale: number }
const defaults: AppConfig = {
  uiScale: 1, masterTrimDb: -6, keyboardLayout: 'abc',
  profiles: [], playtestLog: false, rewardsEnabled: true, breakAfterSeconds: 1200,
};
function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
async function loadConfig(): Promise<AppConfig> {
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'config.json', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { ...defaults };
    const value = await response.json() as Record<string, unknown>;
    return {
      uiScale: number(value.uiScale, 1, 0.75, 2), masterTrimDb: number(value.masterTrimDb, -6, -40, 0),
      keyboardLayout: value.keyboardLayout === 'qwerty' ? 'qwerty' : 'abc',
      profiles: Array.isArray(value.profiles) ? value.profiles.filter((p): p is { name: string; aliases?: string[] } => !!p && typeof p.name === 'string' && (p.aliases === undefined || (Array.isArray(p.aliases) && p.aliases.every((a: unknown) => typeof a === 'string')))) : [],
      playtestLog: false, rewardsEnabled: value.rewardsEnabled !== false,
      breakAfterSeconds: number(value.breakAfterSeconds, 1200, 1, 86400),
    };
  } catch { return { ...defaults }; }
}
export const config = await loadConfig();
export function readDebug(): DebugOptions {
  const query = new URLSearchParams(location.search);
  const enabled = query.has('debug');
  const tier = Number(query.get('tier'));
  return {
    enabled,
    ...(enabled && query.has('tier') && (tier === 0 || tier === 1 || tier === 2) ? { tier } : {}),
    seed: enabled ? number(Number(query.get('seed') ?? 1), 1, 0, 0xffffffff) : 1,
    timeScale: enabled ? number(Number(query.get('timeScale') ?? 1), 1, 0.1, 10) : 1,
  };
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
