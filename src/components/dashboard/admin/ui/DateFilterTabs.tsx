import { useEffect, useRef, useState } from "react";

import type { DateSelection } from "../lib/types";

type RangeName = "daily" | "monthly" | "yearly";
const RANGE_KEY: Record<RangeName, keyof DateSelection> = { daily: "day", monthly: "month", yearly: "year" };

export type DateFilterClasses = {
  tabs: string;
  tab: string;
  list: string;
  item: string;
  chev: string;
};

/** The Home page uses the .range-* classes, the Users page the .bd-range-*
    ones; everything else about the two filters is identical. */
/* HOME_CLASSES used to point at the home page's own pasted-design classes.
   That design is gone, and so are its styles — everything uses USERS_CLASSES. */
export const USERS_CLASSES: DateFilterClasses = {
  tabs: "bd-range-tabs", tab: "bd-range-tab", list: "bd-dropdown-list", item: "bd-dd-item", chev: "bd-chev",
};

export type DateFilterLabels = {
  all: string;
  daily: string;
  monthly: string;
  yearly: string;
  clear: string;
};

export const EN_LABELS: DateFilterLabels = {
  all: "All time", daily: "Day", monthly: "Month", yearly: "Year", clear: "Clear selection",
};
export const AR_LABELS: DateFilterLabels = {
  all: "كل الوقت", daily: "يوم", monthly: "شهر", yearly: "سنة", clear: "إلغاء التحديد",
};

/** Three dropdown tabs (Day / Month / Year) whose values combine with AND
    logic, plus an "All time" reset tab. */
export function DateFilterTabs({
  selected, onChange, classes, labels, dayItems, monthItems, yearItems,
}: {
  selected: DateSelection;
  onChange: (next: DateSelection) => void;
  classes: DateFilterClasses;
  labels: DateFilterLabels;
  dayItems: Array<{ key: string; label: string }>;
  monthItems: Array<{ key: string; label: string }>;
  yearItems: Array<{ key: string; label: string }>;
}) {
  const [open, setOpen] = useState<RangeName | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // A tap outside the tabs closes whichever dropdown is showing.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("." + classes.tab) || target?.closest("." + classes.list)) return;
      setOpen(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, classes.tab, classes.list]);

  const anySelected = !!(selected.day || selected.month || selected.year);

  const pick = (range: RangeName, value: string | null) => {
    onChange({ ...selected, [RANGE_KEY[range]]: value });
    setOpen(null);
  };

  const tab = (range: RangeName) => {
    const value = selected[RANGE_KEY[range]];
    return (
      <div
        className={classes.tab + (value ? " active" : "") + (open === range ? " open" : "")}
        data-range={range}
        onClick={(e) => { e.stopPropagation(); setOpen((cur) => (cur === range ? null : range)); }}
      >
        {value || labels[range]} <span className={classes.chev}>▾</span>
      </div>
    );
  };

  const dropdown = (range: RangeName, items: Array<{ key: string; label: string }>) => (
    <div className={classes.list + (open === range ? " open" : "")}>
      <div className={classes.item + " clear"} onClick={(e) => { e.stopPropagation(); pick(range, null); }}>
        {labels.clear}
      </div>
      {items.map((it) => (
        <div key={it.key} className={classes.item} onClick={(e) => { e.stopPropagation(); pick(range, it.key); }}>
          {it.label}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={rootRef}>
      <div className={classes.tabs}>
        <div
          className={classes.tab + (!anySelected ? " active" : "")}
          data-range="all"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(null);
            onChange({ day: null, month: null, year: null });
          }}
        >
          {labels.all}
        </div>
        {tab("daily")}
        {tab("monthly")}
        {tab("yearly")}
      </div>
      {dropdown("daily", dayItems)}
      {dropdown("monthly", monthItems)}
      {dropdown("yearly", yearItems)}
    </div>
  );
}

export const buildYearItems = () => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y].map((v) => ({ key: String(v), label: String(v) }));
};
