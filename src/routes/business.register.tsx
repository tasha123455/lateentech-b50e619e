import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/business/register")({
  head: () => ({ meta: [{ title: "Create account — Business · Lateen" }] }),
  component: () => (
    <AuthCard role="business" backTo="/business/signin">
      <RegisterForm role="business" />
    </AuthCard>
  ),
});
