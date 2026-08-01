import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/en/business/register")({
  head: () => ({ meta: [{ title: "Create account — Business · Wasla" }] }),
  component: () => (
    <AuthCard role="business" backTo="/en/business/signin" logoSize={78}>
      <RegisterForm role="business" />
    </AuthCard>
  ),
});
