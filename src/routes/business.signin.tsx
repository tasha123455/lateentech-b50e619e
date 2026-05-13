import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/SignInForm";

export const Route = createFileRoute("/business/signin")({
  head: () => ({ meta: [{ title: "Sign in — Business · Lateen" }] }),
  component: () => (
    <AuthCard role="business">
      <SignInForm role="business" />
    </AuthCard>
  ),
});
