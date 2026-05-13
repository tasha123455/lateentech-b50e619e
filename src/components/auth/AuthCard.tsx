import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";

type Props = {
  role: "marketer" | "business";
  children: ReactNode;
  backTo?: string;
};

export function AuthCard({ role, children, backTo = "/" }: Props) {
  const tint = role === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const label = role === "marketer" ? "Marketer" : "Business";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <Link to={backTo} className="mb-4 inline-block text-xs text-text-2 hover:text-text-1">‹ Back</Link>
        <div className="mb-5 flex items-center gap-2">
          <LateenLogo size={34} />
          <span className="font-serif text-lg text-text-1">Lateen</span>
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${tint}`}>{label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
