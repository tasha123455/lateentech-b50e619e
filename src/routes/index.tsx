import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { detectLang, storedLang, withLang } from "@/i18n/langPath";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

// The one-time language chooser is handled globally by <LanguageGate />.
// "/" simply forwards to the remembered (or detected) language tree.
function RootRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const lang = storedLang() ?? detectLang();
    navigate({ to: withLang(lang, ""), replace: true });
  }, [navigate]);

  return <div className="flex min-h-dvh items-center justify-center bg-background" />;
}
