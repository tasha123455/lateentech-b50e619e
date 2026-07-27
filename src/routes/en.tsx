import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LanguageProvider, FloatingLanguageToggle } from "@/i18n/LanguageContext";

export const Route = createFileRoute("/en")({
  component: EnLayout,
});

function EnLayout() {
  return (
    <LanguageProvider lang="en">
      <Outlet />
      <FloatingLanguageToggle />
    </LanguageProvider>
  );
}
