import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/ar/marketer/register")({
  head: () => ({ meta: [{ title: "إنشاء حساب — مسوّق · وصلة" }] }),
  component: () => (
    <AuthCard role="marketer" backTo="/ar/marketer/signin">
      <RegisterForm role="marketer" />
    </AuthCard>
  ),
});
