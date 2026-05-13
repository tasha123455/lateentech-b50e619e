import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LanguagePicker } from "@/i18n/LanguagePicker";

export const Route = createFileRoute("/language")({
  head: () => ({
    meta: [
      { title: "Choose your language — Lateen" },
      { name: "description", content: "Pick the language you want to use Lateen in." },
    ],
  }),
  component: LanguagePage,
});

function LanguagePage() {
  const nav = useNavigate();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <LanguagePicker onPicked={() => nav({ to: "/" })} />
    </main>
  );
}
