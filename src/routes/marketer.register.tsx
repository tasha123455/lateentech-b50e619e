import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";

export const Route = createFileRoute("/marketer/register")({
  beforeLoad: () => {
    const lang = typeof window === "undefined" ? "en" : detectLang();
    throw redirect({ to: `/${lang}/marketer/register`, replace: true });
  },
});
