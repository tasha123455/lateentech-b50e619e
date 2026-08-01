/** Two feeds, one page. The header swaps a title for the tabs it switches
 *  between, each carrying its own waiting count so the feed you are not
 *  looking at can still tell you it needs you. A back button appears only for
 *  the pages the menu opens; the nav-bar pages have nowhere to go back to. */
export function TabBar<K extends string>({
  tabs, tab, onTab, onBack,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  tab: K;
  onTab: (k: K) => void;
  onBack?: () => void;
}) {
  return (
    <div className="adm-tabbar">
      {!!onBack && (
        <button className="adm-back-btn" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <div className="adm-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={"adm-tab" + (tab === t.key ? " on" : "")}
            onClick={() => onTab(t.key)}
          >
            <span className="adm-tab-lbl">{t.label}</span>
            {!!t.count && <span className="adm-tab-count" data-no-i18n>{t.count}</span>}
          </button>
        ))}
      </div>
      {/* Balances the back button so the tabs sit centred on the page. */}
      {!!onBack && <span className="adm-tabbar-pad" aria-hidden="true" />}
    </div>
  );
}
