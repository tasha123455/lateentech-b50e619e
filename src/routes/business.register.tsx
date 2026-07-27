import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";

export const Route = createFileRoute("/business/register")({
  beforeLoad: () => {
    const lang = typeof window === "undefined" ? "en" : detectLang();
    throw redirect({ to: `/${lang}/business/register`, replace: true });
  },
});
