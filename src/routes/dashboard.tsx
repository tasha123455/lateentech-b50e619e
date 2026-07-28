import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";
import { getServerLang } from "@/lib/lang-cookie.functions";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (s: Record<string, unknown>) => ({
    prod: typeof s.prod === "string" ? s.prod : undefined,
    order: typeof s.order === "string" ? s.order : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const lang = typeof window === "undefined" ? await getServerLang() : detectLang();
    throw redirect({ to: `/${lang}/dashboard`, search, replace: true });
  },
});
