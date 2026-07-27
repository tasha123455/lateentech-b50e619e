import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LanguageProvider, FloatingLanguageToggle } from "@/i18n/LanguageContext";

export const Route = createFileRoute("/ar")({
  component: ArLayout,
});

function ArLayout() {
  return (
    <LanguageProvider lang="ar">
      <Outlet />
      <FloatingLanguageToggle />
    </LanguageProvider>
  );
}
