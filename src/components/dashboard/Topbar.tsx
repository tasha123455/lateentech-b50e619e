import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";

type Props = { name: string; subtitle: string; accent: "marketer" | "business"; onMenu?: () => void };

export function Topbar({ name, subtitle, accent }: Props) {
  const tint = accent === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium ${tint}`}>{initials}</div>
        <div>
          <div className="text-sm font-medium text-text-1">{name}</div>
          <div className="text-xs text-text-2">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageToggleButton />
        <NotificationButton />
      </div>
    </div>
  );
}

function LanguageToggleButton() {
  const { lang, toggle } = useLanguage();
  const label = lang === "en" ? "ع" : "EN";
  return (
    <button
      data-no-i18n
      onClick={toggle}
      className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-medium text-text-1"
      aria-label="Toggle language"
      title="Toggle language"
    >
      {label}
    </button>
  );
}

function NotificationButton() {
  return (
    <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface" aria-label="Notifications">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-1"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background" />
    </button>
  );
}

export function SignOutInline() {
  const { signOut } = useAuth();
  return <button onClick={signOut} className="text-xs text-text-2 underline">Sign out</button>;
}
