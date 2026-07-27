import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/en/marketer/register")({
  head: () => ({ meta: [{ title: "Create account — Marketer · Wasla" }] }),
  component: () => (
    <AuthCard role="marketer" backTo="/en/marketer/signin">
      <RegisterForm role="marketer" />
    </AuthCard>
  ),
});
