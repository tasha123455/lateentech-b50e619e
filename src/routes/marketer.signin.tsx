import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/SignInForm";

export const Route = createFileRoute("/marketer/signin")({
  head: () => ({ meta: [{ title: "Sign in — Marketer · Lateen" }] }),
  component: () => (
    <AuthCard role="marketer">
      <SignInForm role="marketer" />
    </AuthCard>
  ),
});
