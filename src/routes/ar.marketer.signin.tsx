import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/SignInForm";

export const Route = createFileRoute("/ar/marketer/signin")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — مسوّق · وصلة" }] }),
  component: () => (
    <AuthCard role="marketer">
      <SignInForm role="marketer" />
    </AuthCard>
  ),
});
