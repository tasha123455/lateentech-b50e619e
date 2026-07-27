import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/SignInForm";

export const Route = createFileRoute("/ar/business/signin")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — تاجر · وصلة" }] }),
  component: () => (
    <AuthCard role="business">
      <SignInForm role="business" />
    </AuthCard>
  ),
});
