import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/ar/business/register")({
  head: () => ({ meta: [{ title: "إنشاء حساب — تاجر · وصلة" }] }),
  component: () => (
    <AuthCard role="business" backTo="/ar/business/signin" logoSize={78}>
      <RegisterForm role="business" />
    </AuthCard>
  ),
});
