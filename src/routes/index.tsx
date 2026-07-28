import { createFileRoute } from "@tanstack/react-router";
import { LanguageChooser } from "@/i18n/LanguageChooser";

export const Route = createFileRoute("/")({
  component: RootLanguageChooser,
});

function RootLanguageChooser() {
  return <LanguageChooser />;
}
