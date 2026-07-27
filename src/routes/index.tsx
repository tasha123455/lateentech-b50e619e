import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const lang = typeof window === "undefined" ? "en" : detectLang();
    throw redirect({ to: `/${lang}`, replace: true });
  },
});
