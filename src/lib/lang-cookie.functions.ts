import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/**
 * Reads the language preference cookie server-side. Falls back to "en" only
 * when no cookie exists at all.
 */
export const getServerLang = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const raw = getCookie("lateen_lang");
    if (raw === "en" || raw === "ar") return raw;
  } catch {
    /* ignore */
  }
  return "en" as const;
});
