import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLang } from "@/i18n/langPath";

export const Route = createFileRoute("/p/$id")({
  beforeLoad: ({ params }) => {
    const lang = typeof window === "undefined" ? "en" : detectLang();
    throw redirect({ to: `/${lang}/p/${params.id}`, replace: true });
  },
});
