import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";
import { getServerLang } from "@/lib/lang-cookie.functions";

export const Route = createFileRoute("/business/signin")({
  beforeLoad: async () => {
    const lang = typeof window === "undefined" ? await getServerLang() : detectLang();
    throw redirect({ to: `/${lang}/business/signin`, replace: true });
  },
});
