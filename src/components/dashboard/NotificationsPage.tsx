import { useT } from "@/i18n/LanguageContext";

type Notif = { id: string; kind: "ok" | "info" | "warn" | "fail"; title: string; body: string; time: string };

const tone: Record<Notif["kind"], string> = {
  ok: "bg-business-tint text-business",
  info: "bg-marketer-tint text-marketer-foreground",
  warn: "bg-[#3a2a10] text-[#e5b46a]",
  fail: "bg-[#3a1a1a] text-[#e07070]",
};

export function NotificationsPage({ items }: { items: Notif[] }) {
  const t = useT();
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-1">{t("Alerts")}</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((n, i) => (
          <div key={n.id} className={`flex gap-3 p-3.5 ${i < items.length - 1 ? "border-b border-border" : ""}`}>
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs ${tone[n.kind]}`}>•</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-1">{n.title}</div>
              <div className="mt-0.5 text-xs text-text-2">{n.body}</div>
              <div className="mt-1 text-[10px] text-text-3">{n.time} {t("ago")}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
