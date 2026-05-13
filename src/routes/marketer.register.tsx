import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/marketer/register")({
  head: () => ({ meta: [{ title: "Create account — Marketer · Lateen" }] }),
  component: () => (
    <AuthCard role="marketer" backTo="/marketer/signin">
      <RegisterForm role="marketer" />
    </AuthCard>
  ),
});
