import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (s: Record<string, unknown>) => ({
    prod: typeof s.prod === "string" ? s.prod : undefined,
    order: typeof s.order === "string" ? s.order : undefined,
  }),
  beforeLoad: ({ search }) => {
    const lang = typeof window === "undefined" ? "en" : detectLang();
    throw redirect({ to: `/${lang}/dashboard`, search, replace: true });
  },
});
