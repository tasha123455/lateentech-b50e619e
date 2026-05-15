import { useT } from "@/i18n/LanguageContext";

type Tab = "home" | "products" | "alerts" | "menu";
type Props = { active: Tab; onChange: (t: Tab) => void; accent: "marketer" | "business" };

const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home", icon: <Icon path="M3 12 12 3l9 9M5 10v10h14V10" /> },
  { id: "products", label: "Products", icon: <Icon path="M3 7h18M3 12h18M3 17h18" /> },
  { id: "alerts", label: "Alerts", icon: <Icon path="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /> },
  { id: "menu", label: "Menu", icon: <Icon path="M4 6h16M4 12h16M4 18h16" /> },
];

export function BottomNav({ active, onChange, accent }: Props) {
  const activeColor = accent === "marketer" ? "text-marketer-foreground" : "text-business";
  const t = useT();
  return (
    <nav className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-[#1a1a1a] px-4 pt-2.5 pb-4">
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} className={`flex flex-col items-center gap-1 ${isActive ? activeColor : "text-text-2"}`}>
            <span className={isActive ? activeColor : "text-text-2"}>{it.icon}</span>
            <span className={`text-[10px] ${isActive ? "font-medium" : ""}`}>{t(it.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Icon({ path }: { path: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export type { Tab };
