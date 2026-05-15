// localStorage cache for AI translations: lateen_t_<lang> = { english: translated }

const PREFIX = "lateen_t2_";

export type Cache = Record<string, string>;

export function readCache(lang: string): Cache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFIX + lang);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

export function writeCache(lang: string, cache: Cache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + lang, JSON.stringify(cache));
  } catch {
    /* quota — ignore */
  }
}

export function mergeCache(lang: string, additions: Cache) {
  const cur = readCache(lang);
  writeCache(lang, { ...cur, ...additions });
}
