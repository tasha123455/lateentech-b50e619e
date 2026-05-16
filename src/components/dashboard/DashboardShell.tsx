import { useState, type ReactNode } from "react";
import { Topbar } from "./Topbar";
import { BottomNav, type Tab } from "./BottomNav";
import { MenuDrawer } from "./MenuDrawer";

type Props = {
  accent: "marketer" | "business";
  name: string;
  subtitle: string;
  pages: Record<Tab, ReactNode>;
};

export function DashboardShell({ accent, name, subtitle, pages }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [menu, setMenu] = useState(false);

  const handleTab = (t: Tab) => {
    if (t === "menu") setMenu(true);
    else setTab(t);
  };

  return (
    <div className="relative mx-auto min-h-[860px] max-w-[420px] bg-background px-5 pt-6 pb-24 rtl:leading-[1.6]">
      <Topbar name={name} subtitle={subtitle} accent={accent} />
      {pages[tab]}
      <BottomNav active={tab} onChange={handleTab} accent={accent} />
      <MenuDrawer open={menu} onClose={() => setMenu(false)} name={name} subtitle={subtitle} />
    </div>
  );
}
