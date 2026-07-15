import { useAuth } from "@/auth/AuthContext";

type Props = { open: boolean; onClose: () => void; name: string; subtitle: string };

export function MenuDrawer({ open, onClose, name, subtitle }: Props) {
  const { signOut } = useAuth();
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex">
      <button onClick={onClose} className="absolute inset-0 bg-black/60" aria-label="Close menu" />
      <aside className="absolute right-0 top-0 bottom-0 flex w-[78%] flex-col rounded-l-2xl border-l border-border-strong bg-surface p-6">
        <button onClick={onClose} className="self-end text-text-2">✕</button>
        <div className="mb-8 mt-2 flex items-center gap-2.5 border-b border-border pb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-text-1">{name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="text-sm font-medium text-text-1">{name}</div>
            <div className="text-xs text-text-2">{subtitle}</div>
          </div>
        </div>
        <button onClick={signOut} className="mt-auto rounded-xl border border-border py-3 text-sm text-destructive hover:bg-surface-2">
          Sign out
        </button>
      </aside>
    </div>
  );
}

function MenuItem({ label, tone }: { label: string; tone: "green" | "purple" }) {
  const bg = tone === "green" ? "bg-business-tint" : "bg-marketer-tint";
  return (
    <button className="flex w-full items-center gap-3 border-b border-border py-3.5 text-left">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-1"><circle cx="12" cy="12" r="3"/></svg>
      </span>
      <span className="text-sm text-text-1">{label}</span>
    </button>
  );
}
